-- B03 integration guard for the B09 device-registry migration.
--
-- B09 adds a six-argument permission-state RPC and currently also defines the
-- legacy five-argument overload. Migration ordering runs B09 after the B03
-- transport migration, so reassert the public five-argument transport body
-- after B09. The six-argument B09 RPC remains available to its worker path.

create or replace function public.rootine_register_device(
  p_device_id text,
  p_platform text,
  p_app_version text,
  p_apns_environment text default null,
  p_push_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_device_id text := nullif(trim(p_device_id), '');
  normalized_platform text := lower(trim(coalesce(p_platform, '')));
  normalized_version text := nullif(trim(p_app_version), '');
  normalized_environment text := nullif(lower(trim(coalesce(p_apns_environment, ''))), '');
  normalized_push_token text := nullif(trim(coalesce(p_push_token, '')), '');
  now_utc timestamptz := timezone('utc', now());
begin
  if current_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if normalized_device_id is null
    or p_device_id is distinct from normalized_device_id
    or normalized_device_id !~ '^ios_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or normalized_version is null or char_length(normalized_version) > 40
    or normalized_platform <> 'ios'
    or p_platform is distinct from normalized_platform then
    raise exception 'Invalid device registration.' using errcode = '22023';
  end if;
  -- APNs values are optional when notification permission is unavailable,
  -- but a supplied environment and token must arrive as a pair.
  if (p_apns_environment is null) <> (p_push_token is null) then
    raise exception 'APNs environment and push token must be supplied together.' using errcode = '22023';
  end if;
  if p_apns_environment is not null and (
    normalized_environment is null
    or normalized_environment not in ('sandbox', 'production')
    or p_apns_environment is distinct from normalized_environment
  ) then
    raise exception 'Invalid APNs environment.' using errcode = '22023';
  end if;
  if p_push_token is not null and (normalized_push_token is null or char_length(normalized_push_token) > 512) then
    raise exception 'Invalid push token.' using errcode = '22023';
  end if;

  insert into public.rootine_devices as devices (
    user_id, device_id, platform, app_version, apns_environment, push_token,
    last_seen_at, revoked_at, created_at, updated_at
  ) values (
    current_user_id, normalized_device_id, normalized_platform, normalized_version,
    normalized_environment, normalized_push_token, now_utc, null, now_utc, now_utc
  )
  on conflict (user_id, device_id) do update set
    platform = excluded.platform,
    app_version = excluded.app_version,
    apns_environment = excluded.apns_environment,
    push_token = excluded.push_token,
    last_seen_at = excluded.last_seen_at,
    revoked_at = null,
    updated_at = excluded.updated_at;

  insert into public.rootine_sync_cursors (user_id, device_id, last_cursor, updated_at)
  values (current_user_id, normalized_device_id, 0, now_utc)
  on conflict (user_id, device_id) do nothing;

  return jsonb_build_object(
    'contract_version', 3,
    'device_id', normalized_device_id,
    'registered_at', now_utc
  );
end;
$$;

revoke all on function public.rootine_register_device(text, text, text, text, text) from public;
grant execute on function public.rootine_register_device(text, text, text, text, text) to authenticated;
