-- B09 — authenticated iOS installation registry.
--
-- B02 already creates public.rootine_devices and B11 reads its push_token
-- column. This migration is deliberately additive: it works on that schema,
-- keeps the existing five-argument B03 RPC return type (jsonb), and adds a
-- six-argument metadata RPC for the iOS permission-state contract.

create table if not exists public.rootine_devices (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  device_id text not null check (char_length(device_id) between 1 and 180),
  platform text not null default 'ios' check (platform in ('ios', 'web', 'android', 'other')),
  app_version text,
  apns_environment text,
  -- B02/B11 name this field push_token. Keep it server-only and never expose
  -- it through either mobile RPC response.
  push_token text,
  permission_state text not null default 'unknown',
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  revision bigint not null default 1,
  unique (user_id, device_id),
  unique (user_id, id)
);

-- B02/B11 may already have every column below. These ALTERs let a clean
-- checkout with either earlier migration apply this file without rewriting
-- existing device rows or changing the public token column name.
alter table public.rootine_devices add column if not exists permission_state text default 'unknown';
alter table public.rootine_devices add column if not exists revoked_reason text;
alter table public.rootine_devices add column if not exists deleted_at timestamptz;
alter table public.rootine_devices add column if not exists revision bigint default 1;

-- B11's standalone table made push_token NOT NULL, but a denied/not-yet-
-- authorized installation must be representable without a token.
alter table public.rootine_devices alter column push_token drop not null;

-- B11 used `restricted`, while iOS reports ephemeral/not_determined/unknown.
-- Preserve the legacy value for old rows but accept the complete B09 state set.
alter table public.rootine_devices drop constraint if exists rootine_devices_permission_state_check;
alter table public.rootine_devices add constraint rootine_devices_permission_state_check
  check (permission_state is null or permission_state in (
    'not_determined', 'denied', 'authorized', 'provisional', 'ephemeral', 'unknown', 'restricted'
  ));
alter table public.rootine_devices alter column permission_state set default 'not_determined';

create unique index if not exists rootine_devices_user_device_uidx
  on public.rootine_devices (user_id, device_id);
create index if not exists rootine_devices_active_idx
  on public.rootine_devices (user_id, apns_environment, last_seen_at desc)
  where revoked_at is null and deleted_at is null;
create index if not exists rootine_devices_push_lookup_idx
  on public.rootine_devices (user_id, apns_environment, last_seen_at desc)
  where revoked_at is null and deleted_at is null and push_token is not null;

alter table public.rootine_devices enable row level security;

-- A mobile client never selects the registry: APNs tokens are server-only.
-- The ownership policy is retained as defense in depth if a future migration
-- grants a narrow metadata operation.
revoke all on table public.rootine_devices from public, anon, authenticated;
grant select, insert, update, delete on table public.rootine_devices to service_role;
drop policy if exists rootine_devices_select on public.rootine_devices;
drop policy if exists "Users can access their own device metadata" on public.rootine_devices;
create policy "Users can access their own device metadata"
  on public.rootine_devices
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- B09's iOS contract. The response intentionally omits id, push_token,
-- revoked_reason and all other worker-only fields.
create or replace function public.rootine_register_device(
  p_device_id text,
  p_platform text,
  p_app_version text,
  p_apns_environment text,
  p_push_token text,
  p_permission_state text
)
returns table (
  device_id text,
  platform text,
  app_version text,
  apns_environment text,
  permission_state text,
  last_seen_at timestamptz,
  revoked_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_platform text := lower(trim(coalesce(p_platform, '')));
  normalized_environment text := lower(trim(coalesce(p_apns_environment, '')));
  normalized_permission text := lower(trim(coalesce(p_permission_state, 'not_determined')));
  normalized_device_id text := trim(coalesce(p_device_id, ''));
  normalized_app_version text := trim(coalesce(p_app_version, ''));
  normalized_push_token text := nullif(trim(coalesce(p_push_token, '')), '');
  current_row public.rootine_devices%rowtype;
  now_utc timestamptz := timezone('utc', now());
begin
  if current_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  -- New clients send ios_<uuidv4>. A bare UUIDv4 is accepted only for an
  -- already-installed legacy Keychain value so the same row is refreshed
  -- instead of creating a second active installation during migration.
  if normalized_device_id !~ '^ios_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and normalized_device_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'Invalid device id.' using errcode = '22023';
  end if;
  if normalized_platform <> 'ios' then
    raise exception 'Only iOS devices are supported.' using errcode = '22023';
  end if;
  if normalized_app_version = '' or char_length(normalized_app_version) > 64 then
    raise exception 'Invalid app version.' using errcode = '22023';
  end if;
  if normalized_environment not in ('sandbox', 'production') then
    raise exception 'Invalid APNs environment.' using errcode = '22023';
  end if;
  if normalized_permission not in ('not_determined', 'denied', 'authorized', 'provisional', 'ephemeral', 'unknown') then
    raise exception 'Invalid notification permission state.' using errcode = '22023';
  end if;
  if normalized_push_token is not null and (
    char_length(normalized_push_token) > 4096
    or normalized_push_token ~ '[[:space:]]'
  ) then
    raise exception 'Invalid APNs token.' using errcode = '22023';
  end if;

  -- Expire stale installations for the account, while allowing the current
  -- stable Keychain device_id to check in again and clear its own revoke.
  update public.rootine_devices
  set revoked_at = coalesce(revoked_at, now_utc),
      revoked_reason = coalesce(revoked_reason, 'inactive'),
      push_token = null,
      permission_state = 'unknown',
      updated_at = now_utc
  where user_id = current_user_id
    and revoked_at is null
    and device_id <> normalized_device_id
    and coalesce(last_seen_at, created_at) < now_utc - interval '90 days';

  insert into public.rootine_devices as devices (
    user_id,
    device_id,
    platform,
    app_version,
    apns_environment,
    push_token,
    permission_state,
    last_seen_at,
    revoked_at,
    revoked_reason,
    deleted_at,
    updated_at
  )
  values (
    current_user_id,
    normalized_device_id,
    normalized_platform,
    normalized_app_version,
    normalized_environment,
    case when normalized_permission = 'denied' then null else normalized_push_token end,
    normalized_permission,
    now_utc,
    null,
    null,
    null,
    now_utc
  )
  on conflict (user_id, device_id) do update set
    platform = excluded.platform,
    app_version = excluded.app_version,
    apns_environment = excluded.apns_environment,
    -- Null on an authorized check-in preserves the previous token while the
    -- asynchronous APNs callback is still in flight. Denial always clears it.
    push_token = case
      when excluded.permission_state = 'denied' then null
      when excluded.push_token is not null then excluded.push_token
      else devices.push_token
    end,
    permission_state = excluded.permission_state,
    last_seen_at = excluded.last_seen_at,
    revoked_at = null,
    revoked_reason = null,
    deleted_at = null,
    updated_at = excluded.updated_at
  returning devices.* into current_row;

  -- B03 sync authorization expects a cursor for every registered device.
  insert into public.rootine_sync_cursors (user_id, device_id, last_cursor, updated_at)
  values (current_user_id, normalized_device_id, 0, now_utc)
  on conflict (user_id, device_id) do nothing;

  return query select
    current_row.device_id,
    current_row.platform,
    current_row.app_version,
    current_row.apns_environment,
    current_row.permission_state,
    current_row.last_seen_at,
    current_row.revoked_at;
end;
$$;

-- B03 owns the five-argument `rootine_register_device(...)->jsonb` RPC.
-- B09 intentionally does not redefine it: PostgreSQL cannot replace a
-- function with a different return type, and B03's final v3 body must remain
-- the owner of that compatibility surface.
revoke all on function public.rootine_register_device(text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.rootine_register_device(text, text, text, text, text, text) to authenticated;

create or replace function public.rootine_revoke_device(
  p_device_id text,
  p_reason text default 'sign_out'
)
returns table (
  device_id text,
  revoked_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_device_id text := trim(coalesce(p_device_id, ''));
  normalized_reason text := trim(coalesce(p_reason, 'sign_out'));
  now_utc timestamptz := timezone('utc', now());
  current_row public.rootine_devices%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if normalized_device_id = '' or char_length(normalized_device_id) > 180 then
    raise exception 'Invalid device id.' using errcode = '22023';
  end if;
  if normalized_reason = '' or char_length(normalized_reason) > 80 then
    raise exception 'Invalid revoke reason.' using errcode = '22023';
  end if;

  update public.rootine_devices
  set revoked_at = coalesce(revoked_at, now_utc),
      revoked_reason = normalized_reason,
      push_token = null,
      permission_state = 'denied',
      updated_at = now_utc
  where user_id = current_user_id
    and device_id = normalized_device_id
  returning rootine_devices.* into current_row;

  if found then
    return query select current_row.device_id, current_row.revoked_at;
  end if;
end;
$$;

revoke all on function public.rootine_revoke_device(text, text) from public, anon, authenticated;
grant execute on function public.rootine_revoke_device(text, text) to authenticated;

-- B11 may use this worker-only view, while its current worker continues to
-- query the same push_token column directly. Only eligible, recently seen,
-- non-revoked installations are exposed to service_role.
create or replace view public.rootine_active_devices as
select
  user_id,
  device_id,
  platform,
  app_version,
  apns_environment,
  push_token,
  permission_state,
  last_seen_at
from public.rootine_devices
where revoked_at is null
  and deleted_at is null
  and push_token is not null
  and permission_state in ('authorized', 'provisional', 'ephemeral')
  and coalesce(last_seen_at, created_at) >= timezone('utc', now()) - interval '90 days';

revoke all on public.rootine_active_devices from public, anon, authenticated;
grant select on public.rootine_active_devices to service_role;

comment on table public.rootine_devices is
  'One server-side record per authenticated Rootine installation; push_token is private worker data.';
comment on column public.rootine_devices.push_token is
  'Sensitive APNs provider token. Never return it from an RPC or expose it to mobile clients.';
comment on function public.rootine_register_device(text, text, text, text, text, text) is
  'Idempotently registers one authenticated iOS installation; returns metadata only and keeps push_token private.';
comment on function public.rootine_revoke_device(text, text) is
  'Revokes one authenticated iOS installation and removes its push_token.';
