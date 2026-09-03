-- Database integration hardening for the merged B01-B12 migration chain.
--
-- This migration is deliberately additive. It does not rewrite existing
-- rows, change the sync RPC response shape, or enable any rollout flag. The
-- retention function is a service-role maintenance boundary; normal clients
-- remain unable to mutate sync or notification tables directly.

-- Keep the two accepted installation identifiers explicit at the database
-- boundary. B09 accepts a bare UUID only for legacy Keychain installations;
-- new iOS clients use the ios_<uuidv4> form owned by B03/B09.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.rootine_devices'::regclass
      and conname = 'rootine_devices_device_id_format_check'
  ) then
    alter table public.rootine_devices
      add constraint rootine_devices_device_id_format_check
      check (
        device_id ~ '^ios_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        or device_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      ) not valid;
  end if;
end;
$$;

-- APNs tokens are opaque provider values. Keep the shape constraint aligned
-- with the six-argument B09 RPC while allowing existing rows to be cleaned up
-- by the worker rather than making this migration fail on historical data.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.rootine_devices'::regclass
      and conname = 'rootine_devices_push_token_shape_check'
  ) then
    alter table public.rootine_devices
      add constraint rootine_devices_push_token_shape_check
      check (push_token is null or (char_length(push_token) <= 4096 and push_token !~ '[[:space:]]')) not valid;
  end if;
end;
$$;

-- A targeted notification job belongs to one of the same user's devices.
-- SET NULL preserves a scheduled occurrence if an operator removes a device;
-- fan-out jobs (device_id IS NULL) are unaffected. NOT VALID keeps an upgrade
-- safe for historical rows while enforcing new inserts and updates.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.rootine_notification_jobs'::regclass
      and conname = 'rootine_notification_jobs_user_device_fk'
  ) then
    alter table public.rootine_notification_jobs
      add constraint rootine_notification_jobs_user_device_fk
      foreign key (user_id, device_id)
      references public.rootine_devices (user_id, device_id)
      on delete set null (device_id)
      not valid;
  end if;
end;
$$;

-- Delivery rows are retained as redacted audit data, but a worker must never
-- be able to record a device under another account. The trigger is intentionally
-- separate from the job FK because fan-out jobs do not carry a device_id.
create or replace function public.rootine_validate_notification_delivery_device()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.rootine_devices devices
    where devices.user_id = new.user_id
      and devices.device_id = new.device_id
  ) then
    raise foreign_key_violation using message = 'Notification delivery device is not owned by the job account.';
  end if;
  return new;
end;
$$;

drop trigger if exists rootine_notification_deliveries_device_owner
  on public.rootine_notification_deliveries;
create trigger rootine_notification_deliveries_device_owner
  before insert or update of user_id, device_id
  on public.rootine_notification_deliveries
  for each row execute function public.rootine_validate_notification_delivery_device();

revoke all on function public.rootine_validate_notification_delivery_device() from public, anon, authenticated;

-- The existing indexes are user-leading because normal pulls are scoped to an
-- account. These timestamp-leading indexes keep scheduled retention bounded
-- when the worker compacts all accounts in one transaction.
create index if not exists rootine_sync_revisions_retention_idx
  on public.rootine_sync_revisions (recorded_at, user_id);
create index if not exists rootine_workspace_revisions_retention_idx
  on public.rootine_workspace_revisions (created_at, user_id);
create index if not exists rootine_snapshot_materializations_retention_idx
  on public.rootine_workspace_snapshot_materializations (updated_at, status);

-- Compact server-owned history and advance each device's explicit expiry
-- boundary before removing outbox rows. Passing NULL uses the configured
-- default policy. A caller must retain at least seven days; the seeded policy
-- remains 90 days and is the value used by normal maintenance. The policy's
-- outbox, tombstone and revision windows are kept separate; an explicit
-- p_retention is an operator override for all three windows.
create or replace function public.rootine_sync_retention(
  p_retention interval default null
)
returns table (
  deleted_changes bigint,
  deleted_operations bigint,
  deleted_revisions bigint,
  deleted_workspace_revisions bigint,
  retention_cutoff timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  outbox_retention interval;
  tombstone_retention interval;
  revision_retention interval;
  outbox_cutoff timestamptz;
  tombstone_cutoff timestamptz;
  revision_cutoff timestamptz;
begin
  select
    coalesce(p_retention, policy.outbox_retention),
    coalesce(p_retention, policy.tombstone_retention),
    coalesce(p_retention, policy.revision_retention)
  into outbox_retention, tombstone_retention, revision_retention
  from public.rootine_sync_retention_policy policy
  where policy.policy_name = 'default';

  if outbox_retention is null
    or tombstone_retention is null
    or revision_retention is null
    or outbox_retention < interval '7 days'
    or tombstone_retention < interval '7 days'
    or revision_retention < interval '7 days' then
    raise exception 'Sync retention must be at least seven days.' using errcode = '22023';
  end if;
  outbox_cutoff := timezone('utc', now()) - outbox_retention;
  tombstone_cutoff := timezone('utc', now()) - tombstone_retention;
  revision_cutoff := timezone('utc', now()) - revision_retention;

  -- For each account, retain the first cursor that will remain after this
  -- run. If every row is compacted, the next cursor after the old maximum is
  -- used. Pull can then return cursor_expired instead of silently skipping a
  -- deleted range.
  update public.rootine_sync_cursors as cursors
  set oldest_available_cursor = greatest(cursors.oldest_available_cursor, floors.first_available_cursor),
      -- The B02 cursor check requires oldest_available_cursor <= last_cursor
      -- once a device has advanced. A fully compacted range therefore moves
      -- the server-side acknowledgement to the next cursor as well.
      last_cursor = case
        when cursors.last_cursor > 0
          then greatest(cursors.last_cursor, floors.first_available_cursor)
        else cursors.last_cursor
      end
  from (
    select
      cursors_inner.id,
      coalesce(
        (
          select min(changes.change_cursor)
          from public.rootine_sync_changes changes
          where changes.user_id = cursors_inner.user_id
            and not (
              (changes.operation = 'delete' and changes.created_at < tombstone_cutoff)
              or (changes.operation <> 'delete' and changes.created_at < outbox_cutoff)
            )
        ),
        (
          select max(changes.change_cursor) + 1
          from public.rootine_sync_changes changes
          where changes.user_id = cursors_inner.user_id
            and (
              (changes.operation = 'delete' and changes.created_at < tombstone_cutoff)
              or (changes.operation <> 'delete' and changes.created_at < outbox_cutoff)
            )
        ),
        cursors_inner.oldest_available_cursor
      ) as first_available_cursor
    from public.rootine_sync_cursors cursors_inner
    where exists (
      select 1
      from public.rootine_sync_changes changes
      where changes.user_id = cursors_inner.user_id
        and (
          (changes.operation = 'delete' and changes.created_at < tombstone_cutoff)
          or (changes.operation <> 'delete' and changes.created_at < outbox_cutoff)
        )
    )
  ) floors
  where floors.id = cursors.id
    and floors.first_available_cursor > cursors.oldest_available_cursor;

  delete from public.rootine_sync_changes
  where (operation = 'delete' and created_at < tombstone_cutoff)
     or (operation <> 'delete' and created_at < outbox_cutoff);
  get diagnostics deleted_changes = row_count;

  delete from public.rootine_sync_operations
  where created_at < outbox_cutoff
    and (expires_at is null or expires_at <= timezone('utc', now()));
  get diagnostics deleted_operations = row_count;

  delete from public.rootine_sync_revisions
  where recorded_at < revision_cutoff;
  get diagnostics deleted_revisions = row_count;

  -- Pending materializations are recovery work and must survive. Terminal
  -- ledger rows follow the revision-retention window so they do not pin every
  -- historical workspace revision indefinitely.
  delete from public.rootine_workspace_snapshot_materializations
  where updated_at < revision_cutoff
    and status in ('materialized', 'failed');

  -- B04 materialization ledgers retain an FK to their source revision. Keep
  -- any revision still referenced by that ledger; it can be compacted after
  -- the corresponding materialization ledger is retired by its own policy.
  delete from public.rootine_workspace_revisions revisions
  where revisions.created_at < revision_cutoff
    and not exists (
      select 1
      from public.rootine_workspace_snapshot_materializations materializations
      where materializations.relational_revision_id = revisions.id
    );
  get diagnostics deleted_workspace_revisions = row_count;

  return query select
    deleted_changes,
    deleted_operations,
    deleted_revisions,
    deleted_workspace_revisions,
    outbox_cutoff;
end;
$$;

revoke all on function public.rootine_sync_retention(interval) from public, anon, authenticated;
grant execute on function public.rootine_sync_retention(interval) to service_role;

comment on function public.rootine_sync_retention(interval) is
  'Service-role maintenance: advances per-device cursor expiry boundaries and compacts sync history without touching current records or legacy snapshots.';
