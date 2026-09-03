-- Forward-only correction for device RPCs applied by the 20260902 migrations.
--
-- PostgreSQL treats OUT/RETURNS TABLE names as PL/pgSQL variables.  The
-- original UPDATE statements used unqualified revoked_at references, which
-- makes registration/revocation fail with 42702 once the function is called.
-- Keep the already-applied migrations immutable and replace only the affected
-- function bodies here.

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
  normalized_environment text := nullif(lower(trim(coalesce(p_apns_environment, ''))), '');
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
  if normalized_environment is not null
    and normalized_environment not in ('sandbox', 'production') then
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
  if normalized_permission in ('not_determined', 'denied', 'unknown')
    and (normalized_environment is not null or normalized_push_token is not null) then
    raise exception 'APNs values require notification authorization.' using errcode = '22023';
  end if;
  if normalized_push_token is not null and normalized_environment is null then
    raise exception 'APNs environment is required with a push token.' using errcode = '22023';
  end if;

  update public.rootine_devices as stale
  set revoked_at = coalesce(stale.revoked_at, now_utc),
      revoked_reason = coalesce(stale.revoked_reason, 'inactive'),
      push_token = null,
      permission_state = 'unknown',
      updated_at = now_utc
  where stale.user_id = current_user_id
    and stale.revoked_at is null
    and stale.device_id <> normalized_device_id
    and coalesce(stale.last_seen_at, stale.created_at) < now_utc - interval '90 days';

  insert into public.rootine_devices as devices (
    user_id, device_id, platform, app_version, apns_environment, push_token,
    permission_state, last_seen_at, revoked_at, revoked_reason, deleted_at, updated_at
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
    push_token = case
      when excluded.permission_state in ('not_determined', 'denied', 'unknown') then null
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

  update public.rootine_devices as revoked
  set revoked_at = coalesce(revoked.revoked_at, now_utc),
      revoked_reason = normalized_reason,
      push_token = null,
      apns_environment = null,
      permission_state = 'denied',
      updated_at = now_utc
  where revoked.user_id = current_user_id
    and revoked.device_id = normalized_device_id
  returning revoked.* into current_row;

  if found then
    return query select current_row.device_id, current_row.revoked_at;
  end if;
end;
$$;

create or replace function public.rootine_revoke_notification_device(
  p_device_id text,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  changed integer;
begin
  if p_device_id is null or p_user_id is null then
    return false;
  end if;
  update public.rootine_devices as revoked
  set revoked_at = coalesce(revoked.revoked_at, timezone('utc', now())),
      push_token = null,
      apns_environment = null,
      permission_state = 'unknown',
      updated_at = timezone('utc', now())
  where revoked.user_id = p_user_id
    and revoked.device_id = p_device_id
    and revoked.revoked_at is null;
  get diagnostics changed = row_count;
  return changed > 0;
end;
$$;

