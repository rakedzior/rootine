-- Rootine sync-v3 transport layer (B03).
--
-- The transport uses rootine_sync_records as a compatibility seam: it has the
-- same ownership/revision/tombstone semantics as B02 domain records while
-- allowing the RPC contract to remain stable as domain adapters are added.
-- B02's normalized schema is additive; adapters can materialize these records
-- without changing the RPC/Edge contract (see docs/data-sync-contract.md).

create table if not exists public.rootine_devices (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  device_id text not null check (device_id ~ '^ios_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  platform text not null default 'ios' check (platform in ('ios', 'web', 'android', 'other')),
  app_version text check (app_version is null or char_length(app_version) between 1 and 80),
  apns_environment text check (apns_environment is null or apns_environment in ('sandbox', 'production')),
  push_token text,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  revision bigint not null default 1 check (revision > 0),
  unique (user_id, device_id),
  unique (user_id, id)
);

create index if not exists rootine_devices_user_last_seen_idx
  on public.rootine_devices (user_id, last_seen_at desc);

create table if not exists public.rootine_sync_records (
  user_id uuid not null references auth.users (id) on delete cascade,
  entity text not null check (char_length(entity) between 1 and 80),
  entity_id text not null check (char_length(entity_id) between 1 and 180),
  payload jsonb not null default '{}'::jsonb,
  revision bigint not null default 1 check (revision > 0),
  deleted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, entity, entity_id),
  check (jsonb_typeof(payload) = 'object'),
  check (payload->>'user_id' is null or payload->>'user_id' = user_id::text)
);

create index if not exists rootine_sync_records_user_updated_idx
  on public.rootine_sync_records (user_id, updated_at desc);
create index if not exists rootine_sync_records_user_entity_idx
  on public.rootine_sync_records (user_id, entity, entity_id);

create table if not exists public.rootine_sync_changes (
  change_cursor bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  entity text not null check (char_length(entity) between 1 and 100),
  entity_id text not null check (char_length(entity_id) between 1 and 180),
  operation text not null check (operation in ('upsert', 'delete')),
  revision bigint not null check (revision > 0),
  device_id text,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  foreign key (user_id, device_id)
    references public.rootine_devices (user_id, device_id)
    on delete cascade
);

create index if not exists rootine_sync_changes_user_cursor_idx
  on public.rootine_sync_changes (user_id, change_cursor);

create table if not exists public.rootine_sync_operations (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  operation_id text not null check (char_length(operation_id) between 1 and 180),
  device_id text,
  entity text not null check (char_length(entity) between 1 and 100),
  entity_id text not null check (char_length(entity_id) between 1 and 180),
  kind text not null check (kind in ('upsert', 'delete')),
  base_revision bigint not null default 0 check (base_revision >= 0),
  payload jsonb not null default '{}'::jsonb,
  command_hash text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'applied', 'already_applied', 'conflict', 'invalid')),
  result jsonb not null default '{}'::jsonb check (jsonb_typeof(result) = 'object'),
  applied_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  revision bigint not null default 1 check (revision > 0),
  unique (user_id, operation_id),
  unique (user_id, id),
  foreign key (user_id, device_id)
    references public.rootine_devices (user_id, device_id)
    on delete cascade,
  check (expires_at is null or expires_at > created_at),
  check (applied_at is null or applied_at >= created_at)
);

create index if not exists rootine_sync_operations_expiry_idx
  on public.rootine_sync_operations (expires_at);

-- B02's operation ledger does not need the private fingerprint to expose it
-- through its contract. Add it forward-compatibly when B02 was applied first.
alter table public.rootine_sync_operations
  add column if not exists command_hash text;
update public.rootine_sync_operations
set command_hash = ''
where command_hash is null;
alter table public.rootine_sync_operations
  alter column command_hash set default '';
alter table public.rootine_sync_operations
  alter column command_hash set not null;

create table if not exists public.rootine_sync_cursors (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  device_id text not null,
  last_cursor bigint not null default 0 check (last_cursor >= 0),
  oldest_available_cursor bigint not null default 0 check (oldest_available_cursor >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  revision bigint not null default 1 check (revision > 0),
  unique (user_id, device_id),
  unique (user_id, id),
  foreign key (user_id, device_id)
    references public.rootine_devices (user_id, device_id)
    on delete cascade,
  check (oldest_available_cursor <= last_cursor or last_cursor = 0)
);

create table if not exists public.rootine_sync_revisions (
  user_id uuid not null references auth.users (id) on delete cascade,
  entity text not null,
  entity_id text not null,
  revision bigint not null check (revision > 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  recorded_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, entity, entity_id, revision)
);

create index if not exists rootine_sync_revisions_user_recorded_idx
  on public.rootine_sync_revisions (user_id, recorded_at desc);

comment on table public.rootine_sync_changes is
  'Append-only B03 outbox. Cursor order is global; reads are filtered by user_id.';
comment on table public.rootine_sync_operations is
  'Idempotency ledger. Retain at least 90 days so offline retries remain safe.';
comment on table public.rootine_sync_records is
  'B03 compatibility seam for B02 normalized domain adapters; includes tombstones.';

alter table public.rootine_devices enable row level security;
alter table public.rootine_sync_records enable row level security;
alter table public.rootine_sync_changes enable row level security;
alter table public.rootine_sync_operations enable row level security;
alter table public.rootine_sync_cursors enable row level security;
alter table public.rootine_sync_revisions enable row level security;

revoke all on table public.rootine_devices from anon, authenticated;
revoke all on table public.rootine_sync_records from anon, authenticated;
revoke all on table public.rootine_sync_changes from anon, authenticated;
revoke all on table public.rootine_sync_operations from anon, authenticated;
revoke all on table public.rootine_sync_cursors from anon, authenticated;
revoke all on table public.rootine_sync_revisions from anon, authenticated;

-- The outbox is safe to read through its owner-scoped RLS policy. Clients
-- still cannot insert, update, or delete it; the RPC remains the write path.
grant select on table public.rootine_sync_changes to authenticated;
drop policy if exists rootine_sync_changes_select on public.rootine_sync_changes;
create policy rootine_sync_changes_select
  on public.rootine_sync_changes
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- The RPCs below are security-definer and enforce ownership explicitly.  No
-- direct table grant is needed by mobile clients.

create or replace function public.rootine_sync_allowed_entity(p_entity text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select lower(trim(coalesce(p_entity, ''))) = any (array[
    'task', 'task_list', 'task_tag', 'task_schedule', 'task_completion',
    'task_comment', 'task_summary_note', 'habit', 'habit_schedule',
    'habit_completion', 'habit_pause_period', 'note_list', 'note', 'note_tag',
    'note_checklist_item', 'nutrition_day', 'nutrition_entry', 'nutrition_goal',
    'nutrition_profile', 'nutrition_weight_measurement', 'nutrition_custom_meal',
    'nutrition_custom_meal_ingredient', 'sport_exercise', 'sport_template',
    'sport_template_section', 'sport_template_item', 'sport_cycle',
    'sport_cycle_workout', 'sport_session', 'sport_session_set', 'sport_history',
    'sport_outcome', 'goal', 'goal_milestone', 'goal_progress_entry', 'goal_note',
    'goal_category', 'work_company', 'work_project', 'work_task',
    'work_focus_session', 'trip', 'trip_itinerary_item', 'trip_booking',
    'trip_budget_item', 'trip_document', 'trip_packing_item', 'health_checkin',
    'health_reminder', 'health_visit', 'health_test', 'health_prescription',
    'health_vaccination', 'affair_matter', 'payment', 'subscription', 'document',
    'vehicle', 'vehicle_service_item', 'jdg_period', 'jdg_checklist_item'
  ]);
$$;

revoke all on function public.rootine_sync_allowed_entity(text) from public;
grant execute on function public.rootine_sync_allowed_entity(text) to authenticated;

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
  -- Notification permission may be unavailable on iOS. APNs metadata is
  -- optional, but a supplied environment and token must arrive as a pair.
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

create or replace function public.rootine_sync_device_is_authorized(
  p_user_id uuid,
  p_device_id text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.rootine_devices devices
    where devices.user_id = p_user_id
      and devices.device_id = trim(coalesce(p_device_id, ''))
      and devices.device_id ~ '^ios_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and devices.revoked_at is null
      and devices.deleted_at is null
  );
$$;

revoke all on function public.rootine_sync_device_is_authorized(uuid, text) from public;

create or replace function public.rootine_sync_bootstrap(p_device_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_device_id text := nullif(trim(p_device_id), '');
  server_cursor bigint;
  next_cursor bigint;
  changes jsonb;
  has_more boolean;
begin
  if current_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if not public.rootine_sync_device_is_authorized(current_user_id, normalized_device_id) then
    return jsonb_build_object(
      'contract_version', 3,
      'error', 'unauthorized'
    );
  end if;

  select coalesce(max(sync_changes.change_cursor), 0)
  into server_cursor
  from public.rootine_sync_changes sync_changes
  where sync_changes.user_id = current_user_id;

  select coalesce(jsonb_agg(change_page.item order by (change_page.item->>'cursor')::bigint), '[]'::jsonb),
         count(*) > 500
  into changes, has_more
  from (
    select jsonb_build_object(
      'cursor', latest.change_cursor,
      'entity', latest.entity,
      'entity_id', latest.entity_id,
      'operation', latest.operation,
      'record', case when latest.operation = 'delete'
        then latest.payload || jsonb_build_object('deleted_at', coalesce(latest.deleted_at::text, latest.payload->>'deleted_at'))
        else latest.payload end
    ) as item
    from (
      select distinct on (sync_changes.entity, sync_changes.entity_id) sync_changes.*
      from public.rootine_sync_changes sync_changes
      where sync_changes.user_id = current_user_id
      order by sync_changes.entity, sync_changes.entity_id, sync_changes.change_cursor desc
    ) latest
    order by latest.change_cursor
    limit 501
  ) change_page;

  if has_more then
    select ((changes->(jsonb_array_length(changes) - 2))->>'cursor')::bigint into next_cursor;
    changes := changes - (jsonb_array_length(changes) - 1);
  else
    next_cursor := coalesce(
      ((changes->(jsonb_array_length(changes) - 1))->>'cursor')::bigint,
      0
    );
  end if;

  insert into public.rootine_sync_cursors (user_id, device_id, last_cursor, updated_at)
  values (current_user_id, normalized_device_id, next_cursor, timezone('utc', now()))
  on conflict (user_id, device_id) do update set
    last_cursor = greatest(public.rootine_sync_cursors.last_cursor, excluded.last_cursor),
    updated_at = excluded.updated_at;

  return jsonb_build_object(
    'contract_version', 3,
    'server_cursor', server_cursor,
    'next_cursor', next_cursor,
    'has_more', has_more,
    'changes', changes
  );
end;
$$;

revoke all on function public.rootine_sync_bootstrap(text) from public;
grant execute on function public.rootine_sync_bootstrap(text) to authenticated;

create or replace function public.rootine_sync_pull(
  p_cursor bigint,
  p_limit integer,
  p_device_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_device_id text := nullif(trim(p_device_id), '');
  requested_cursor bigint := coalesce(p_cursor, 0);
  requested_limit integer := least(greatest(coalesce(p_limit, 500), 1), 500);
  oldest_cursor bigint;
  latest_cursor bigint;
  next_cursor bigint;
  retention_floor bigint;
  changes jsonb;
  has_more boolean;
begin
  if current_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_cursor is null or p_cursor < 0 or p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Invalid cursor or limit.' using errcode = '22023';
  end if;
  if not public.rootine_sync_device_is_authorized(current_user_id, normalized_device_id) then
    return jsonb_build_object(
      'contract_version', 3,
      'error', 'unauthorized'
    );
  end if;

  select coalesce(max(sync_changes.change_cursor), requested_cursor)
  into latest_cursor
  from public.rootine_sync_changes sync_changes
  where sync_changes.user_id = current_user_id;

  select coalesce(max(sync_cursor.oldest_available_cursor), 0)
  into retention_floor
  from public.rootine_sync_cursors sync_cursor
  where sync_cursor.user_id = current_user_id
    and sync_cursor.device_id = normalized_device_id;
  -- A global identity cursor has gaps between users.  The first cursor owned
  -- by this user is therefore not an expiry boundary: cursor 0 must remain a
  -- valid request even when another account consumed earlier identities.
  oldest_cursor := retention_floor;

  if oldest_cursor > 0 and requested_cursor < oldest_cursor - 1 then
    return jsonb_build_object(
      'contract_version', 3,
      'error', 'cursor_expired'
    );
  end if;

  select coalesce(jsonb_agg(change_page.item order by (change_page.item->>'cursor')::bigint), '[]'::jsonb),
         count(*) > requested_limit
  into changes, has_more
  from (
    select jsonb_build_object(
      'cursor', sync_changes.change_cursor,
      'entity', sync_changes.entity,
      'entity_id', sync_changes.entity_id,
      'operation', sync_changes.operation,
      'record', case when sync_changes.operation = 'delete'
        then sync_changes.payload || jsonb_build_object('deleted_at', coalesce(sync_changes.deleted_at::text, sync_changes.payload->>'deleted_at'))
        else sync_changes.payload end
    ) as item
    from public.rootine_sync_changes sync_changes
    where sync_changes.user_id = current_user_id
      and sync_changes.change_cursor > requested_cursor
    order by sync_changes.change_cursor
    limit requested_limit + 1
  ) change_page;

  if has_more then
    select ((changes->(jsonb_array_length(changes) - 2))->>'cursor')::bigint into next_cursor;
    changes := changes - (jsonb_array_length(changes) - 1);
  else
    next_cursor := coalesce(
      ((changes->(jsonb_array_length(changes) - 1))->>'cursor')::bigint,
      requested_cursor
    );
  end if;

  insert into public.rootine_sync_cursors (user_id, device_id, last_cursor, updated_at)
  values (current_user_id, normalized_device_id, next_cursor, timezone('utc', now()))
  on conflict (user_id, device_id) do update set
    last_cursor = greatest(public.rootine_sync_cursors.last_cursor, excluded.last_cursor),
    updated_at = excluded.updated_at;

  return jsonb_build_object(
    'contract_version', 3,
    'from_cursor', requested_cursor,
    'next_cursor', next_cursor,
    'has_more', has_more,
    'changes', changes
  );
end;
$$;

revoke all on function public.rootine_sync_pull(bigint, integer, text) from public;
grant execute on function public.rootine_sync_pull(bigint, integer, text) to authenticated;

create or replace function public.rootine_sync_push(
  p_device_id text,
  p_commands jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
<<sync_push>>
declare
  current_user_id uuid := auth.uid();
  normalized_device_id text := nullif(trim(p_device_id), '');
  command jsonb;
  result jsonb;
  results jsonb := '[]'::jsonb;
  command_count integer;
  current_cursor bigint;
  operation_id text;
  command_hash text;
  inserted_operation_id text;
  previous_operation public.rootine_sync_operations%rowtype;
  entity_name text;
  entity_id_value text;
  requested_kind text;
  kind_value text;
  base_revision_value bigint;
  payload_value jsonb;
  current_record public.rootine_sync_records%rowtype;
  new_record public.rootine_sync_records%rowtype;
  change_cursor bigint;
  now_utc timestamptz;
begin
  if current_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_commands is null or jsonb_typeof(p_commands) <> 'array' then
    raise exception 'Commands must be an array.' using errcode = '22023';
  end if;
  command_count := jsonb_array_length(p_commands);
  if command_count < 1 or command_count > 100 then
    raise exception 'Command batch is too large.' using errcode = '22023';
  end if;
  if pg_column_size(p_commands) > 1024 * 1024 then
    raise exception 'Command batch is too large.' using errcode = '22023';
  end if;

  if not public.rootine_sync_device_is_authorized(current_user_id, normalized_device_id) then
    for command in select value from jsonb_array_elements(p_commands) loop
      results := results || jsonb_build_array(jsonb_build_object(
        'operation_id', nullif(trim(command->>'operation_id'), ''),
        'status', 'unauthorized'
      ));
    end loop;
    return jsonb_build_object(
      'contract_version', 3,
      'server_cursor', coalesce((select max(change_cursor) from public.rootine_sync_changes where user_id = current_user_id), 0),
      'error', 'unauthorized',
      'results', results
    );
  end if;

  for command in select value from jsonb_array_elements(p_commands) loop
    operation_id := nullif(trim(command->>'operation_id'), '');
    entity_name := lower(trim(coalesce(command->>'entity', '')));
    entity_id_value := nullif(trim(command->>'entity_id'), '');
    requested_kind := lower(trim(coalesce(command->>'kind', '')));
    kind_value := requested_kind;
    payload_value := command->'payload';
    base_revision_value := null;
    if jsonb_typeof(command->'base_revision') = 'number'
      and command->>'base_revision' ~ '^[0-9]+$'
      and char_length(command->>'base_revision') <= 18 then
      base_revision_value := (command->>'base_revision')::bigint;
    end if;
    command_hash := md5(convert_to(command::text, 'utf8'));

    -- A malformed command still receives an idempotency record when it has a
    -- usable operation ID, so a retry cannot turn invalid input into a write.
    if operation_id is null
      or operation_id !~ '^op3_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or command->>'operation_id' <> operation_id then
      results := results || jsonb_build_array(jsonb_build_object(
        'operation_id', operation_id,
        'status', 'invalid',
        'error', 'Invalid sync command'
      ));
      continue;
    end if;

    select * into previous_operation
    from public.rootine_sync_operations operations
    where operations.user_id = current_user_id
      and operations.operation_id = operation_id
    for update;

    if found and previous_operation.expires_at <= timezone('utc', now()) then
      delete from public.rootine_sync_operations operations
      where operations.user_id = current_user_id
        and operations.operation_id = operation_id;
      found := false;
    end if;

    if found then
      if previous_operation.command_hash <> command_hash then
        result := jsonb_build_object(
          'operation_id', operation_id,
          'status', 'invalid',
          'error', 'Operation ID was already used for another command'
        );
      else
        result := jsonb_build_object(
          'operation_id', operation_id,
          'status', 'already_applied'
        ) || coalesce(previous_operation.result - 'status', '{}'::jsonb);
      end if;
      results := results || jsonb_build_array(result);
      continue;
    end if;

    now_utc := timezone('utc', now());
    inserted_operation_id := null;
    insert into public.rootine_sync_operations (
      user_id, operation_id, device_id, entity, entity_id, kind, base_revision,
      payload, command_hash, status, result, applied_at, expires_at, created_at, updated_at
    ) values (
      current_user_id, operation_id, normalized_device_id,
      left(coalesce(nullif(entity_name, ''), 'invalid'), 100),
      left(coalesce(entity_id_value, 'invalid'), 180),
      case when kind_value = 'delete' then 'delete' else 'upsert' end,
      coalesce(base_revision_value, 0), coalesce(payload_value, '{}'::jsonb), command_hash,
      'pending', jsonb_build_object('operation_id', operation_id, 'status', 'pending'),
      null, now_utc + interval '90 days', now_utc, now_utc
    ) on conflict (user_id, operation_id) do nothing
    returning operation_id into inserted_operation_id;

    if inserted_operation_id is null then
      select * into previous_operation
      from public.rootine_sync_operations operations
      where operations.user_id = current_user_id
        and operations.operation_id = operation_id
      for update;
      if previous_operation.command_hash <> command_hash then
        result := jsonb_build_object(
          'operation_id', operation_id,
          'status', 'invalid',
          'error', 'Operation ID was already used for another command'
        );
      else
        result := jsonb_build_object(
          'operation_id', operation_id,
          'status', 'already_applied'
        ) || coalesce(previous_operation.result - 'status', '{}'::jsonb);
      end if;
      results := results || jsonb_build_array(result);
      continue;
    end if;

    -- The row just inserted has the placeholder result.  Existing rows are
    -- returned above; do not short-circuit the first attempt here.

    begin
      if not public.rootine_sync_allowed_entity(entity_name)
        or command->>'entity' <> entity_name
        or entity_id_value is null or char_length(entity_id_value) > 180
        or command->>'kind' <> requested_kind
        or requested_kind not in ('upsert', 'delete')
        or base_revision_value is null or base_revision_value < 0
        or (kind_value = 'delete' and payload_value is not null)
        or (kind_value <> 'delete' and (payload_value is null or jsonb_typeof(payload_value) <> 'object'))
        or (payload_value is not null and pg_column_size(payload_value) > 512 * 1024)
        or (jsonb_typeof(payload_value) = 'object' and payload_value->>'user_id' is not null
          and payload_value->>'user_id' <> current_user_id::text) then
        raise exception 'Invalid sync command.' using errcode = '22023';
      end if;

      -- Serialize the same logical record even when it does not exist yet.
      -- Without this lock two concurrent creates could race on the primary key
      -- and be reported as a generic invalid command instead of a conflict.
      perform pg_advisory_xact_lock(hashtextextended(
        current_user_id::text || ':' || entity_name || ':' || entity_id_value,
        0
      ));

      select * into current_record
      from public.rootine_sync_records records
      where records.user_id = current_user_id
        and records.entity = entity_name
        and records.entity_id = entity_id_value
      for update;

      if found and (base_revision_value = 0 or current_record.revision <> base_revision_value) then
        result := jsonb_build_object(
          'operation_id', operation_id,
          'status', 'conflict',
          'entity', entity_name,
          'entity_id', entity_id_value,
          'server_revision', current_record.revision,
          'server_record', jsonb_build_object(
            'entity', current_record.entity,
            'entity_id', current_record.entity_id,
            'revision', current_record.revision,
            'record', current_record.payload,
            'deleted_at', current_record.deleted_at,
            'updated_at', current_record.updated_at
          )
        );
      elsif not found and base_revision_value <> 0 then
        result := jsonb_build_object(
          'operation_id', operation_id,
          'status', 'conflict',
          'entity', entity_name,
          'entity_id', entity_id_value,
          'server_revision', 0,
          'server_record', null
        );
      else
        now_utc := timezone('utc', now());
        if found then
          new_record := current_record;
          new_record.payload := coalesce(payload_value, current_record.payload);
          new_record.revision := current_record.revision + 1;
          new_record.deleted_at := case when kind_value = 'delete' then now_utc else null end;
          new_record.updated_at := now_utc;
          update public.rootine_sync_records
          set payload = new_record.payload,
              revision = new_record.revision,
              deleted_at = new_record.deleted_at,
              updated_at = now_utc
          where user_id = current_user_id and entity = entity_name and entity_id = entity_id_value;
        else
          new_record.user_id := current_user_id;
          new_record.entity := entity_name;
          new_record.entity_id := entity_id_value;
          new_record.payload := coalesce(payload_value, '{}'::jsonb);
          new_record.revision := 1;
          new_record.deleted_at := case when kind_value = 'delete' then now_utc else null end;
          new_record.created_at := now_utc;
          new_record.updated_at := now_utc;
          insert into public.rootine_sync_records (
            user_id, entity, entity_id, payload, revision, deleted_at, created_at, updated_at
          ) values (
            new_record.user_id, new_record.entity, new_record.entity_id, new_record.payload,
            new_record.revision, new_record.deleted_at, new_record.created_at, new_record.updated_at
          );
        end if;

        insert into public.rootine_sync_revisions (
          user_id, entity, entity_id, revision, payload, recorded_at
        ) values (
          current_user_id, entity_name, entity_id_value, new_record.revision,
          new_record.payload, now_utc
        );
        insert into public.rootine_sync_changes (
          user_id, entity, entity_id, operation, revision, device_id, payload, created_at, updated_at, deleted_at
        ) values (
          current_user_id, entity_name, entity_id_value,
          case when kind_value = 'delete' then 'delete' else 'upsert' end,
          new_record.revision,
          normalized_device_id,
          new_record.payload,
          now_utc,
          now_utc,
          new_record.deleted_at
        ) returning change_cursor into change_cursor;

        result := jsonb_build_object(
          'operation_id', operation_id,
          'status', 'applied',
          'entity', entity_name,
          'entity_id', entity_id_value,
          'revision', new_record.revision,
          'cursor', change_cursor
        );
      end if;
    exception when others then
      -- Do not return SQL details, table names, or payloads to the client.
      result := jsonb_build_object(
        'operation_id', operation_id,
        'status', 'invalid',
        'error', 'Invalid sync command'
      );
    end;

    update public.rootine_sync_operations as operations
    set result = sync_push.result,
        entity = left(coalesce(nullif(sync_push.entity_name, ''), 'invalid'), 100),
        entity_id = left(coalesce(sync_push.entity_id_value, 'invalid'), 180),
        kind = case when sync_push.kind_value = 'delete' then 'delete' else 'upsert' end,
        command_hash = sync_push.command_hash,
        status = coalesce(sync_push.result->>'status', 'invalid'),
        payload = coalesce(sync_push.payload_value, '{}'::jsonb),
        base_revision = coalesce(sync_push.base_revision_value, 0),
        applied_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
    where operations.user_id = current_user_id
      and operations.operation_id = sync_push.operation_id;
    results := results || jsonb_build_array(result);
  end loop;

  select coalesce(max(changes.change_cursor), 0)
  into current_cursor
  from public.rootine_sync_changes changes
  where changes.user_id = current_user_id;
  update public.rootine_sync_cursors
  set last_cursor = greatest(last_cursor, current_cursor), updated_at = timezone('utc', now())
  where user_id = current_user_id and device_id = normalized_device_id;

  return jsonb_build_object(
    'contract_version', 3,
    'server_cursor', current_cursor,
    'results', results
  );
end;
$$;

revoke all on function public.rootine_sync_push(text, jsonb) from public;
grant execute on function public.rootine_sync_push(text, jsonb) to authenticated;

-- Keep operation history bounded without making cleanup part of a client
-- request.  A deployment can schedule this statement after the 90-day
-- retention window; deleting old operations never deletes outbox tombstones.
comment on column public.rootine_sync_operations.expires_at is
  'Delete after expiry only once all supported clients have passed the retention window.';
