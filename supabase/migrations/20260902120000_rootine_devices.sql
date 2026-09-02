-- B09 — authenticated iOS installation registry.
--
-- The APNs token is intentionally kept in a server-only column. There is no
-- grant or RLS policy that lets an authenticated client select the table; the
-- two security-definer RPCs return metadata only. B03/mobile-sync can call
-- these RPCs without changing this storage contract.

create table if not exists public.rootine_devices (
  user_id uuid not null references auth.users (id) on delete cascade,
  device_id text not null check (char_length(device_id) between 1 and 200),
  platform text not null check (platform = 'ios'),
  app_version text not null check (char_length(app_version) between 1 and 64),
  apns_environment text not null check (apns_environment in ('sandbox', 'production')),
  -- Never expose this column to authenticated/anon roles. Only an APNs
  -- worker running with service-role access may read it.
  apns_token text check (apns_token is null or char_length(apns_token) between 1 and 512),
  permission_state text not null default 'not_determined' check (
    permission_state in ('not_determined', 'denied', 'authorized', 'provisional', 'ephemeral', 'unknown')
  ),
  last_seen_at timestamptz not null default timezone('utc', now()),
  revoked_at timestamptz,
  revoked_reason text check (revoked_reason is null or char_length(revoked_reason) between 1 and 80),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, device_id)
);

comment on table public.rootine_devices is
  'One server-side record per authenticated Rootine iOS installation. APNs tokens are private worker data.';
comment on column public.rootine_devices.apns_token is
  'Sensitive APNs provider token. Never return it from an RPC or expose it through PostgREST.';
comment on column public.rootine_devices.device_id is
  'Stable installation identifier generated in the iOS Keychain; it is not the auth user id.';

create index if not exists rootine_devices_active_idx
  on public.rootine_devices (user_id, last_seen_at desc)
  where revoked_at is null;

create index if not exists rootine_devices_push_lookup_idx
  on public.rootine_devices (user_id, apns_environment, last_seen_at desc)
  where revoked_at is null and apns_token is not null;

alter table public.rootine_devices enable row level security;

-- Do not grant table access to a mobile client. RLS remains enabled as a
-- second boundary for accidental grants and service-role workers bypass it.
revoke all on table public.rootine_devices from public, anon, authenticated;
grant select, insert, update, delete on table public.rootine_devices to service_role;

-- Keep an ownership policy even though authenticated has no table grants. If
-- a future migration intentionally grants a narrow metadata operation, the
-- policy still prevents cross-user reads or writes.
drop policy if exists "Users can access their own device metadata" on public.rootine_devices;
create policy "Users can access their own device metadata"
  on public.rootine_devices
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.rootine_devices_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists rootine_devices_updated_at on public.rootine_devices;
create trigger rootine_devices_updated_at
before update on public.rootine_devices
for each row execute function public.rootine_devices_set_updated_at();

revoke all on function public.rootine_devices_set_updated_at() from public, anon, authenticated;
grant execute on function public.rootine_devices_set_updated_at() to service_role;

create or replace function public.rootine_register_device(
  p_device_id text,
  p_platform text,
  p_app_version text,
  p_apns_environment text,
  p_push_token text,
  p_permission_state text default 'not_determined'
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
  current_row public.rootine_devices%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if normalized_device_id = '' or char_length(normalized_device_id) > 200 then
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
  if p_push_token is not null and (
    char_length(p_push_token) = 0
    or char_length(p_push_token) > 512
    or p_push_token ~ '[[:space:]]'
  ) then
    raise exception 'Invalid APNs token.' using errcode = '22023';
  end if;

  -- A device that has not checked in for the retention window must not remain
  -- eligible for pushes. A future check-in can create a fresh registration
  -- with the same stable device id and explicitly clear revoked_at.
  update public.rootine_devices
  set revoked_at = coalesce(revoked_at, timezone('utc', now())),
      revoked_reason = coalesce(revoked_reason, 'inactive'),
      apns_token = null,
      permission_state = 'unknown'
  where user_id = current_user_id
    and revoked_at is null
    and device_id <> normalized_device_id
    and last_seen_at < timezone('utc', now()) - interval '90 days';

  insert into public.rootine_devices as devices (
    user_id,
    device_id,
    platform,
    app_version,
    apns_environment,
    apns_token,
    permission_state,
    last_seen_at,
    revoked_at,
    revoked_reason
  )
  values (
    current_user_id,
    normalized_device_id,
    normalized_platform,
    normalized_app_version,
    normalized_environment,
    case when normalized_permission = 'denied' then null else p_push_token end,
    normalized_permission,
    timezone('utc', now()),
    null,
    null
  )
  on conflict (user_id, device_id) do update set
    platform = excluded.platform,
    app_version = excluded.app_version,
    apns_environment = excluded.apns_environment,
    -- A denied permission explicitly removes the old token. During the
    -- initial authorized check-in the callback may not have delivered a new
    -- token yet, so a null token otherwise preserves the last known token.
    apns_token = case
      when excluded.permission_state = 'denied' then null
      when excluded.apns_token is not null then excluded.apns_token
      else devices.apns_token
    end,
    permission_state = excluded.permission_state,
    last_seen_at = excluded.last_seen_at,
    revoked_at = null,
    revoked_reason = null
  returning devices.* into current_row;

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

-- B03's first contract predates permission_state. Keep a five-argument
-- overload so an older mobile-sync implementation can delegate safely.
create or replace function public.rootine_register_device(
  p_device_id text,
  p_platform text,
  p_app_version text,
  p_apns_environment text,
  p_push_token text
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
language sql
security definer
set search_path = public
as $$
  select * from public.rootine_register_device(
    p_device_id,
    p_platform,
    p_app_version,
    p_apns_environment,
    p_push_token,
    'not_determined'
  );
$$;

revoke all on function public.rootine_register_device(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.rootine_register_device(text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.rootine_register_device(text, text, text, text, text) to authenticated;
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
  current_row public.rootine_devices%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if normalized_device_id = '' or char_length(normalized_device_id) > 200 then
    raise exception 'Invalid device id.' using errcode = '22023';
  end if;
  if normalized_reason = '' or char_length(normalized_reason) > 80 then
    raise exception 'Invalid revoke reason.' using errcode = '22023';
  end if;

  update public.rootine_devices as devices
  set revoked_at = coalesce(devices.revoked_at, timezone('utc', now())),
      revoked_reason = normalized_reason,
      apns_token = null,
      permission_state = 'denied'
  where devices.user_id = current_user_id
    and devices.device_id = normalized_device_id
  returning devices.* into current_row;

  if found then
    return query select current_row.device_id, current_row.revoked_at;
  end if;
end;
$$;

revoke all on function public.rootine_revoke_device(text, text) from public, anon, authenticated;
grant execute on function public.rootine_revoke_device(text, text) to authenticated;

-- The APNs worker (B11) may query this view with service-role credentials.
-- Authenticated clients cannot select it, and only eligible devices are
-- present: an unrevoked, recently seen installation with permission and a
-- token. The token never crosses the mobile RPC response boundary.
create or replace view public.rootine_active_devices as
select
  user_id,
  device_id,
  platform,
  app_version,
  apns_environment,
  apns_token,
  permission_state,
  last_seen_at
from public.rootine_devices
where revoked_at is null
  and apns_token is not null
  and permission_state in ('authorized', 'provisional', 'ephemeral')
  and last_seen_at >= timezone('utc', now()) - interval '90 days';

revoke all on public.rootine_active_devices from public, anon, authenticated;
grant select on public.rootine_active_devices to service_role;

comment on function public.rootine_register_device(text, text, text, text, text, text) is
  'Idempotently registers one authenticated iOS installation; returns metadata only and keeps APNs token private.';
comment on function public.rootine_revoke_device(text, text) is
  'Revokes one authenticated iOS installation and removes its APNs token.';
