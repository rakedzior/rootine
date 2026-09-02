-- B04: deterministic, non-destructive legacy snapshot backfill.
--
-- B02 is now present on main and owns the shared revision/quarantine/log
-- tables. The B04 record table is an add-only compatibility boundary that B03
-- and future B06 RPCs can consume. No statement in this migration deletes or
-- updates rootine_workspace_snapshots.

create table if not exists public.rootine_workspace_backfill_records (
  user_id uuid not null references auth.users (id) on delete cascade,
  storage_key text not null check (char_length(storage_key) between 1 and 180),
  source_revision bigint not null check (source_revision > 0),
  adapter_version integer not null check (adapter_version > 0),
  entity text not null check (char_length(entity) between 1 and 160),
  entity_id text not null check (char_length(entity_id) between 1 and 320),
  source_path text not null check (char_length(source_path) between 1 and 1_024),
  payload jsonb not null,
  deleted_at timestamptz,
  run_id text not null check (char_length(run_id) between 1 and 320),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, storage_key, source_revision, adapter_version, entity, entity_id)
);

create index if not exists rootine_workspace_backfill_records_user_entity_idx
  on public.rootine_workspace_backfill_records (user_id, entity, entity_id);

-- B02 owns these three shared tables. Add only B04 columns so this migration
-- stays compatible with both the pre-B02 branch and the merged schema. The
-- source revision continues to use B02's positive `revision` constraint.
alter table public.rootine_workspace_revisions
  add column if not exists adapter_version integer,
  add column if not exists source_content_hash text,
  add column if not exists canonical_hash text,
  add column if not exists canonical_payload jsonb,
  add column if not exists record_count integer default 0,
  add column if not exists quarantined_count integer default 0,
  add column if not exists status text not null default 'migrated'
    check (status in ('migrated', 'quarantined', 'different')),
  add column if not exists run_id text,
  add column if not exists committed_at timestamptz;

alter table public.rootine_migration_quarantine
  add column if not exists run_id text,
  add column if not exists source_revision bigint,
  add column if not exists adapter_version integer,
  add column if not exists record_id text,
  add column if not exists source_path text,
  add column if not exists details text,
  add column if not exists resolved_at timestamptz;

alter table public.rootine_sync_reconciliation_log
  add column if not exists source_revision bigint,
  add column if not exists adapter_version integer,
  add column if not exists diff jsonb default '[]'::jsonb,
  add column if not exists report jsonb default '{}'::jsonb,
  add column if not exists run_id text;

create unique index if not exists rootine_workspace_revisions_b04_key_idx
  on public.rootine_workspace_revisions (user_id, storage_key, revision, adapter_version)
  where adapter_version is not null;
create index if not exists rootine_workspace_revisions_user_key_idx
  on public.rootine_workspace_revisions (user_id, storage_key, revision desc);
create index if not exists rootine_migration_quarantine_user_open_idx
  on public.rootine_migration_quarantine (user_id, created_at desc)
  where status = 'pending';
create unique index if not exists rootine_migration_quarantine_b04_key_idx
  on public.rootine_migration_quarantine (
    user_id,
    storage_key,
    source_revision,
    coalesce(record_id, ''),
    reason,
    coalesce(source_path, '')
  )
  where source_revision is not null;
create unique index if not exists rootine_sync_reconciliation_b04_key_idx
  on public.rootine_sync_reconciliation_log (user_id, storage_key, source_revision, adapter_version)
  where source_revision is not null and adapter_version is not null;
create index if not exists rootine_sync_reconciliation_log_user_status_idx
  on public.rootine_sync_reconciliation_log (user_id, status, created_at desc);

create table if not exists public.rootine_workspace_snapshot_materializations (
  user_id uuid not null references auth.users (id) on delete cascade,
  storage_key text not null check (char_length(storage_key) between 1 and 180),
  source_revision bigint not null check (source_revision > 0),
  adapter_version integer not null check (adapter_version > 0),
  relational_revision_id text references public.rootine_workspace_revisions (id) on delete restrict,
  generated_payload jsonb not null,
  canonical_hash text not null check (char_length(canonical_hash) between 1 and 320),
  status text not null default 'pending' check (status in ('pending', 'materialized', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  committed_at timestamptz not null default timezone('utc', now()),
  materialized_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, storage_key, source_revision, adapter_version)
);

create index if not exists rootine_workspace_snapshot_materializations_pending_idx
  on public.rootine_workspace_snapshot_materializations (user_id, status, committed_at);

comment on table public.rootine_workspace_backfill_records is
  'Deterministic B04 adapter output. B02 domain RPCs may consume this boundary; it never replaces legacy snapshots.';
comment on table public.rootine_migration_quarantine is
  'Malformed, unknown or ambiguous legacy records retained for operator review.';
comment on table public.rootine_workspace_revisions is
  'Immutable adapter manifest/revision history for each source snapshot.';
comment on table public.rootine_workspace_snapshot_materializations is
  'Generated compatibility snapshots. The source rootine_workspace_snapshots row is intentionally untouched by B04.';

alter table public.rootine_workspace_backfill_records enable row level security;
alter table public.rootine_migration_quarantine enable row level security;
alter table public.rootine_workspace_revisions enable row level security;
alter table public.rootine_sync_reconciliation_log enable row level security;
alter table public.rootine_workspace_snapshot_materializations enable row level security;

revoke all on table public.rootine_workspace_backfill_records from anon, authenticated;
revoke all on table public.rootine_migration_quarantine from anon, authenticated;
revoke all on table public.rootine_workspace_revisions from anon, authenticated;
revoke all on table public.rootine_sync_reconciliation_log from anon, authenticated;
revoke all on table public.rootine_workspace_snapshot_materializations from anon, authenticated;

grant select on table public.rootine_workspace_backfill_records to authenticated;
grant select on table public.rootine_migration_quarantine to authenticated;
grant select on table public.rootine_workspace_revisions to authenticated;
grant select on table public.rootine_sync_reconciliation_log to authenticated;
grant select on table public.rootine_workspace_snapshot_materializations to authenticated;

drop policy if exists "Users can read their backfill records" on public.rootine_workspace_backfill_records;
create policy "Users can read their backfill records"
  on public.rootine_workspace_backfill_records for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their migration quarantine" on public.rootine_migration_quarantine;
create policy "Users can read their migration quarantine"
  on public.rootine_migration_quarantine for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their workspace revisions" on public.rootine_workspace_revisions;
create policy "Users can read their workspace revisions"
  on public.rootine_workspace_revisions for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their reconciliation log" on public.rootine_sync_reconciliation_log;
create policy "Users can read their reconciliation log"
  on public.rootine_sync_reconciliation_log for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their snapshot materializations" on public.rootine_workspace_snapshot_materializations;
create policy "Users can read their snapshot materializations"
  on public.rootine_workspace_snapshot_materializations for select to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.rootine_backfill_commit(
  p_user_id uuid,
  p_storage_key text,
  p_source_revision bigint,
  p_adapter_version integer,
  p_source_content_hash text,
  p_canonical_hash text,
  p_canonical_payload jsonb,
  p_records jsonb,
  p_quarantine jsonb,
  p_manifest jsonb,
  p_status text,
  p_run_id text,
  p_diff jsonb default '[]'::jsonb
)
  returns table (
  relational_revision_id text,
  processed_records integer,
  processed_quarantine integer,
  materialization_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  revision_id text;
  record_count integer := 0;
  quarantine_count integer := 0;
begin
  if p_user_id is null then
    raise exception 'Backfill user is required.' using errcode = '22023';
  end if;
  if p_storage_key is null or char_length(p_storage_key) not between 1 and 180 then
    raise exception 'Invalid storage key.' using errcode = '22023';
  end if;
  if p_source_revision is null or p_source_revision < 1 then
    raise exception 'Invalid source revision.' using errcode = '22023';
  end if;
  if p_adapter_version is null or p_adapter_version < 1 then
    raise exception 'Invalid adapter version.' using errcode = '22023';
  end if;
  if p_canonical_payload is null or jsonb_typeof(p_canonical_payload) is null then
    raise exception 'Canonical payload is required.' using errcode = '22023';
  end if;
  if p_canonical_hash is null or char_length(p_canonical_hash) not between 1 and 320 then
    raise exception 'Canonical hash is required.' using errcode = '22023';
  end if;
  if p_records is null or jsonb_typeof(p_records) <> 'array' then
    raise exception 'Backfill records must be a JSON array.' using errcode = '22023';
  end if;
  if p_quarantine is null or jsonb_typeof(p_quarantine) <> 'array' then
    raise exception 'Quarantine entries must be a JSON array.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_quarantine) as item
    where jsonb_typeof(item) <> 'object'
      or nullif(item ->> 'reason', '') is null
  ) then
    raise exception 'Backfill contains an invalid quarantine entry.' using errcode = '22023';
  end if;
  if p_status not in ('migrated', 'quarantined', 'different') then
    raise exception 'Invalid backfill status.' using errcode = '22023';
  end if;
  if p_run_id is null or char_length(p_run_id) not between 1 and 320 then
    raise exception 'Backfill run id is required.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_records) as item
    where jsonb_typeof(item) <> 'object'
      or nullif(item ->> 'entity', '') is null
      or nullif(item ->> 'entityId', '') is null
      or nullif(item ->> 'sourcePath', '') is null
      or jsonb_typeof(item -> 'payload') <> 'object'
  ) then
    raise exception 'Backfill contains an invalid relational record.' using errcode = '22023';
  end if;

  insert into public.rootine_workspace_revisions as revisions (
    user_id, storage_key, revision, adapter_version, source_content_hash,
    canonical_hash, manifest, payload, canonical_payload, record_count,
    quarantined_count, status, run_id, committed_at
  )
  values (
    p_user_id, p_storage_key, p_source_revision, p_adapter_version,
    p_source_content_hash, p_canonical_hash, coalesce(p_manifest, '{}'::jsonb),
    p_canonical_payload, p_canonical_payload, jsonb_array_length(p_records), jsonb_array_length(p_quarantine),
    p_status, p_run_id, timezone('utc', now())
  )
  on conflict (user_id, storage_key, revision) do nothing
  returning revisions.id into revision_id;

  if revision_id is null then
    -- B02 installs a revision trigger that increments revision on UPDATE. Do
    -- not update an existing row on retry; the immutable key is enough for an
    -- idempotent backfill and avoids silently moving the source revision.
    select revisions.id
    into revision_id
    from public.rootine_workspace_revisions as revisions
    where revisions.user_id = p_user_id
      and revisions.storage_key = p_storage_key
      and revisions.revision = p_source_revision;
  end if;

  insert into public.rootine_workspace_backfill_records as records (
    user_id, storage_key, source_revision, adapter_version, entity, entity_id,
    source_path, payload, deleted_at, run_id, updated_at
  )
  select
    p_user_id,
    p_storage_key,
    p_source_revision,
    p_adapter_version,
    item ->> 'entity',
    item ->> 'entityId',
    item ->> 'sourcePath',
    item -> 'payload',
    nullif(item ->> 'deletedAt', '')::timestamptz,
    p_run_id,
    timezone('utc', now())
  from jsonb_array_elements(p_records) as item
  on conflict (user_id, storage_key, source_revision, adapter_version, entity, entity_id) do update set
    source_path = excluded.source_path,
    payload = excluded.payload,
    deleted_at = excluded.deleted_at,
    run_id = excluded.run_id,
    updated_at = excluded.updated_at;
  get diagnostics record_count = row_count;

  insert into public.rootine_migration_quarantine as quarantine (
    user_id, run_id, storage_key, source_revision, adapter_version, record_id,
    reason, source_path, details, payload
  )
  select
    p_user_id,
    p_run_id,
    p_storage_key,
    p_source_revision,
    p_adapter_version,
    nullif(item ->> 'recordId', ''),
    item ->> 'reason',
    coalesce(nullif(item ->> 'path', ''), '/'),
    item ->> 'details',
    item -> 'payload'
  from jsonb_array_elements(p_quarantine) as item
  on conflict do nothing;
  get diagnostics quarantine_count = row_count;

  insert into public.rootine_sync_reconciliation_log as reconciliation (
    user_id, storage_key, source_revision, adapter_version,
    legacy_hash, relational_hash, status, diff, report, run_id
  )
  values (
    p_user_id, p_storage_key, p_source_revision, p_adapter_version,
    p_canonical_hash, null, p_status, coalesce(p_diff, '[]'::jsonb),
    coalesce(p_manifest, '{}'::jsonb), p_run_id
  )
  on conflict (user_id, storage_key, source_revision, adapter_version) where source_revision is not null and adapter_version is not null do update set
    legacy_hash = excluded.legacy_hash,
    status = excluded.status,
    diff = excluded.diff,
    report = excluded.report,
    run_id = excluded.run_id,
    updated_at = timezone('utc', now());

  insert into public.rootine_workspace_snapshot_materializations as materializations (
    user_id, storage_key, source_revision, adapter_version, relational_revision_id,
    generated_payload, canonical_hash, status, attempt_count, committed_at, updated_at
  )
  values (
    p_user_id, p_storage_key, p_source_revision, p_adapter_version, revision_id,
    p_canonical_payload, p_canonical_hash, 'pending', 0, timezone('utc', now()), timezone('utc', now())
  )
  on conflict (user_id, storage_key, source_revision, adapter_version) do update set
    relational_revision_id = excluded.relational_revision_id,
    generated_payload = excluded.generated_payload,
    canonical_hash = excluded.canonical_hash,
    status = 'pending',
    last_error = null,
    updated_at = timezone('utc', now());

  return query select revision_id, record_count, quarantine_count, 'pending'::text;
end;
$$;

create or replace function public.rootine_materialize_legacy_snapshot(
  p_user_id uuid,
  p_storage_key text,
  p_source_revision bigint,
  p_adapter_version integer
)
returns table (
  storage_key text,
  source_revision bigint,
  generated_payload jsonb,
  canonical_hash text,
  materialized_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.rootine_workspace_revisions
    where user_id = p_user_id
      and storage_key = p_storage_key
      and revision = p_source_revision
      and adapter_version = p_adapter_version
  ) then
    raise exception 'Relational backfill commit is required before materialization.' using errcode = '23503';
  end if;

  -- This is a generated compatibility copy. A later B06 bridge may apply it
  -- through rootine_apply_workspace_snapshot with CAS; B04 itself never
  -- updates rootine_workspace_snapshots.
  return query
  update public.rootine_workspace_snapshot_materializations as materializations
  set status = 'materialized',
      attempt_count = materializations.attempt_count + 1,
      materialized_at = timezone('utc', now()),
      updated_at = timezone('utc', now()),
      last_error = null
  where materializations.user_id = p_user_id
    and materializations.storage_key = p_storage_key
    and materializations.source_revision = p_source_revision
    and materializations.adapter_version = p_adapter_version
  returning materializations.storage_key,
    materializations.source_revision,
    materializations.generated_payload,
    materializations.canonical_hash,
    materializations.materialized_at;
end;
$$;

revoke all on function public.rootine_backfill_commit(uuid, text, bigint, integer, text, text, jsonb, jsonb, jsonb, jsonb, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.rootine_backfill_commit(uuid, text, bigint, integer, text, text, jsonb, jsonb, jsonb, jsonb, text, text, jsonb) to service_role;
revoke all on function public.rootine_materialize_legacy_snapshot(uuid, text, bigint, integer) from public, anon, authenticated;
grant execute on function public.rootine_materialize_legacy_snapshot(uuid, text, bigint, integer) to service_role;

comment on function public.rootine_backfill_commit(uuid, text, bigint, integer, text, text, jsonb, jsonb, jsonb, jsonb, text, text, jsonb) is
  'Atomically commits deterministic B04 records, quarantine, revision and pending generated snapshot. It never mutates legacy source.';
comment on function public.rootine_materialize_legacy_snapshot(uuid, text, bigint, integer) is
  'Marks the generated compatibility copy materialized after rootine_backfill_commit. Applying it to the legacy source belongs to B06 CAS bridge.';
