-- Server-side notification pipeline for task and habit reminders.
--
-- B09 owns the device-registration client contract and B10 owns local
-- notification scheduling.  This migration deliberately keeps their boundary
-- small: a job is a server-side occurrence with the same dedupe_key as the
-- local request, while rootine_devices is read only by the worker.  The
-- conditional device table below lets this migration be applied on a clean
-- checkout before B09 is merged; B09 can use the table without a data rewrite.

create table if not exists public.rootine_devices (
  user_id uuid not null references auth.users (id) on delete cascade,
  device_id text not null check (char_length(device_id) between 1 and 180),
  platform text not null default 'ios' check (platform in ('ios')),
  app_version text not null default 'unknown' check (char_length(app_version) between 1 and 80),
  apns_environment text not null check (apns_environment in ('sandbox', 'production')),
  push_token text not null check (char_length(push_token) between 32 and 512),
  permission_state text not null default 'unknown'
    check (permission_state in ('unknown', 'authorized', 'provisional', 'denied', 'restricted')),
  last_seen_at timestamptz not null default timezone('utc', now()),
  revoked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (device_id)
);

-- These clauses are intentionally idempotent for the B09 migration, which may
-- create rootine_devices first on an integrated branch.
alter table public.rootine_devices add column if not exists user_id uuid;
alter table public.rootine_devices add column if not exists device_id text;
alter table public.rootine_devices add column if not exists platform text default 'ios';
alter table public.rootine_devices add column if not exists app_version text default 'unknown';
alter table public.rootine_devices add column if not exists apns_environment text;
alter table public.rootine_devices add column if not exists push_token text;
alter table public.rootine_devices add column if not exists permission_state text default 'unknown';
alter table public.rootine_devices add column if not exists last_seen_at timestamptz default timezone('utc', now());
alter table public.rootine_devices add column if not exists revoked_at timestamptz;
alter table public.rootine_devices add column if not exists created_at timestamptz default timezone('utc', now());
alter table public.rootine_devices add column if not exists updated_at timestamptz default timezone('utc', now());

create unique index if not exists rootine_devices_user_device_uidx
  on public.rootine_devices (user_id, device_id);
create index if not exists rootine_devices_active_idx
  on public.rootine_devices (user_id, apns_environment, last_seen_at desc)
  where revoked_at is null;

alter table public.rootine_devices enable row level security;
revoke all on table public.rootine_devices from anon, authenticated;

create table if not exists public.rootine_notification_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  notifications_enabled boolean not null default true,
  task_notifications_enabled boolean not null default true,
  habit_notifications_enabled boolean not null default true,
  timezone text not null default 'UTC',
  quiet_hours_start time,
  quiet_hours_end time,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (char_length(timezone) between 1 and 80),
  check ((quiet_hours_start is null) = (quiet_hours_end is null))
);

comment on table public.rootine_notification_preferences is
  'Per-account notification opt-in, timezone and quiet hours. No notification content is stored here.';

create table if not exists public.rootine_notification_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  entity_type text not null check (entity_type in ('task', 'habit')),
  task_id text,
  habit_id text,
  notification_type text not null default 'reminder'
    check (char_length(notification_type) between 1 and 80),
  local_time time not null,
  timezone text not null default 'UTC',
  offset_minutes integer not null default 0 check (offset_minutes between -10080 and 10080),
  schedule jsonb not null default '{}'::jsonb
    check (jsonb_typeof(schedule) = 'object'),
  active boolean not null default true,
  valid_from date,
  valid_until date,
  cancelled_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, id),
  check (
    (entity_type = 'task' and task_id is not null and habit_id is null)
    or (entity_type = 'habit' and habit_id is not null and task_id is null)
  ),
  check ((task_id is null or char_length(task_id) between 1 and 180)
    and (habit_id is null or char_length(habit_id) between 1 and 180)),
  check (char_length(timezone) between 1 and 80),
  check (valid_until is null or valid_from is null or valid_until >= valid_from)
);

comment on table public.rootine_notification_rules is
  'Task/habit reminder rules. Entity ownership is checked by a trigger when B02 task/habit tables are present.';

create index if not exists rootine_notification_rules_user_active_idx
  on public.rootine_notification_rules (user_id, active, updated_at desc);
create index if not exists rootine_notification_rules_task_idx
  on public.rootine_notification_rules (user_id, task_id)
  where task_id is not null;
create index if not exists rootine_notification_rules_habit_idx
  on public.rootine_notification_rules (user_id, habit_id)
  where habit_id is not null;

create table if not exists public.rootine_notification_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  rule_id uuid,
  entity_type text not null check (entity_type in ('task', 'habit')),
  entity_id text not null check (char_length(entity_id) between 1 and 180),
  notification_type text not null default 'reminder'
    check (char_length(notification_type) between 1 and 80),
  occurrence_id text not null check (char_length(occurrence_id) between 1 and 180),
  dedupe_key text not null check (char_length(dedupe_key) between 1 and 512),
  scheduled_for timestamptz not null,
  expires_at timestamptz not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 16384),
  device_id text,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'delivered', 'failed', 'expired', 'cancelled')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 10),
  next_attempt_at timestamptz not null default timezone('utc', now()),
  locked_at timestamptz,
  lock_owner text,
  last_attempt_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 512),
  last_provider_response_code integer,
  cancelled_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, dedupe_key),
  foreign key (rule_id)
    references public.rootine_notification_rules (id)
    on delete set null,
  check (expires_at > scheduled_for),
  check ((status = 'processing') = (locked_at is not null and lock_owner is not null)),
  check (status <> 'delivered' or delivered_at is not null),
  check (status <> 'cancelled' or cancelled_at is not null)
);

comment on table public.rootine_notification_jobs is
  'Dedupe-safe task/habit occurrences. The worker claims rows before it calls APNs.';

create index if not exists rootine_notification_jobs_due_idx
  on public.rootine_notification_jobs (status, next_attempt_at, scheduled_for)
  where status in ('pending', 'processing');
create index if not exists rootine_notification_jobs_user_due_idx
  on public.rootine_notification_jobs (user_id, scheduled_for desc);
create index if not exists rootine_notification_jobs_rule_future_idx
  on public.rootine_notification_jobs (user_id, rule_id, scheduled_for)
  where status in ('pending', 'processing');

create table if not exists public.rootine_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  job_id uuid not null references public.rootine_notification_jobs (id) on delete cascade,
  device_id text not null,
  dedupe_key text not null,
  provider text not null default 'apns' check (provider in ('apns')),
  status text not null check (status in ('delivered', 'failed', 'expired', 'unregistered')),
  retryable boolean not null default false,
  provider_response_code integer,
  provider_reason text check (provider_reason is null or char_length(provider_reason) <= 255),
  attempted_at timestamptz not null default timezone('utc', now()),
  delivered_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  check (status <> 'delivered' or delivered_at is not null),
  unique (job_id, device_id),
  unique (user_id, dedupe_key, device_id)
);

comment on table public.rootine_notification_deliveries is
  'Redacted APNs outcome/audit rows. Payloads and device tokens never enter this table.';

create index if not exists rootine_notification_deliveries_retention_idx
  on public.rootine_notification_deliveries (created_at, status);
create index if not exists rootine_notification_deliveries_user_idx
  on public.rootine_notification_deliveries (user_id, created_at desc);

create table if not exists public.rootine_notification_alerts (
  id uuid primary key default gen_random_uuid(),
  alert_type text not null check (alert_type in ('failed', 'expired', 'outbox_lag')),
  job_id uuid references public.rootine_notification_jobs (id) on delete set null,
  observed_at timestamptz not null default timezone('utc', now()),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  acknowledged_at timestamptz,
  unique (alert_type, job_id)
);

comment on table public.rootine_notification_alerts is
  'Operational signals only; metadata is aggregate/redacted and must not contain notification content.';

create unique index if not exists rootine_notification_alerts_outbox_lag_uidx
  on public.rootine_notification_alerts (alert_type)
  where alert_type = 'outbox_lag' and job_id is null;

-- Keep server-managed timestamps consistent for all notification tables.
create or replace function public.rootine_notification_touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists rootine_notification_preferences_touch on public.rootine_notification_preferences;
create trigger rootine_notification_preferences_touch
  before update on public.rootine_notification_preferences
  for each row execute function public.rootine_notification_touch_updated_at();
drop trigger if exists rootine_notification_rules_touch on public.rootine_notification_rules;
create trigger rootine_notification_rules_touch
  before update on public.rootine_notification_rules
  for each row execute function public.rootine_notification_touch_updated_at();
drop trigger if exists rootine_notification_jobs_touch on public.rootine_notification_jobs;
create trigger rootine_notification_jobs_touch
  before update on public.rootine_notification_jobs
  for each row execute function public.rootine_notification_touch_updated_at();

create or replace function public.rootine_notification_set_expiry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- B10 may omit expires_at when it creates a server occurrence. A one-hour
  -- delivery window prevents an offline device from receiving an old alert.
  if new.expires_at is null then
    new.expires_at := new.scheduled_for + interval '1 hour';
  end if;
  if new.expires_at <= new.scheduled_for then
    raise exception 'Notification expiry must be after scheduled_for.' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists rootine_notification_jobs_expiry on public.rootine_notification_jobs;
create trigger rootine_notification_jobs_expiry
  before insert or update of scheduled_for, expires_at on public.rootine_notification_jobs
  for each row execute function public.rootine_notification_set_expiry();

create or replace function public.rootine_validate_notification_rule_entity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_table text;
  target_id text;
  owner_id text;
  found_target boolean;
begin
  if new.entity_type = 'task' then
    target_table := 'tasks';
    target_id := new.task_id;
  else
    target_table := 'habits';
    target_id := new.habit_id;
  end if;

  -- B02 supplies these tables. Allow the B11 migration to land first, but
  -- once a table exists the owner check is mandatory and cannot be bypassed
  -- by a direct insert or update.
  if to_regclass('public.' || target_table) is null then
    return new;
  end if;

  execute format(
    'select exists (select 1 from public.%I where id::text = $1 and user_id::text = $2)',
    target_table
  ) into found_target using target_id, new.user_id::text;
  if not found_target then
    raise foreign_key_violation using message = format('Notification rule %s does not own %s %s', new.id, new.entity_type, target_id);
  end if;
  return new;
end;
$$;

drop trigger if exists rootine_notification_rules_entity_owner on public.rootine_notification_rules;
create trigger rootine_notification_rules_entity_owner
  before insert or update of user_id, entity_type, task_id, habit_id
  on public.rootine_notification_rules
  for each row execute function public.rootine_validate_notification_rule_entity();

-- B02 currently allows stable UUID/string identifiers. When its tables expose
-- text identifiers (the native workspace uses integer-looking strings) and a
-- typed unique (user_id, id) key, add ownership-safe composite FKs. Never use
-- an FK on the entity id alone: the same id may exist under another account.
-- If a later schema chooses uuid/int, the trigger remains the portable
-- ownership guard and B02 can add a typed composite FK in a forward migration.
do $$
declare
  tasks_table regclass;
  habits_table regclass;
  tasks_user_id_attnum smallint;
  tasks_id_attnum smallint;
  habits_user_id_attnum smallint;
  habits_id_attnum smallint;
begin
  tasks_table := to_regclass('public.tasks');
  habits_table := to_regclass('public.habits');
  alter table public.rootine_notification_rules
    drop constraint if exists rootine_notification_rules_task_fk;
  alter table public.rootine_notification_rules
    drop constraint if exists rootine_notification_rules_habit_fk;

  if tasks_table is not null
     and exists (
       select 1 from pg_attribute a
       where a.attrelid = tasks_table
         and a.attname = 'user_id' and not a.attisdropped
         and format_type(a.atttypid, a.atttypmod) = 'uuid'
     )
     and exists (
       select 1 from pg_attribute a
       where a.attrelid = tasks_table
         and a.attname = 'id' and not a.attisdropped
         and format_type(a.atttypid, a.atttypmod) = 'text'
     ) then
    select attnum into tasks_user_id_attnum from pg_attribute
    where attrelid = tasks_table and attname = 'user_id' and not attisdropped;
    select attnum into tasks_id_attnum from pg_attribute
    where attrelid = tasks_table and attname = 'id' and not attisdropped;
    if exists (
      select 1 from pg_constraint c
      where c.conrelid = tasks_table
        and c.contype in ('p', 'u')
        and c.conkey = array[tasks_user_id_attnum, tasks_id_attnum]::smallint[]
    ) then
      begin
        alter table public.rootine_notification_rules
          add constraint rootine_notification_rules_task_fk
          foreign key (user_id, task_id)
          references public.tasks (user_id, id) on delete cascade;
      exception when duplicate_object then null;
      end;
    end if;
  end if;
  if habits_table is not null
     and exists (
       select 1 from pg_attribute a
       where a.attrelid = habits_table
         and a.attname = 'user_id' and not a.attisdropped
         and format_type(a.atttypid, a.atttypmod) = 'uuid'
     )
     and exists (
       select 1 from pg_attribute a
       where a.attrelid = habits_table
         and a.attname = 'id' and not a.attisdropped
         and format_type(a.atttypid, a.atttypmod) = 'text'
     ) then
    select attnum into habits_user_id_attnum from pg_attribute
    where attrelid = habits_table and attname = 'user_id' and not attisdropped;
    select attnum into habits_id_attnum from pg_attribute
    where attrelid = habits_table and attname = 'id' and not attisdropped;
    if exists (
      select 1 from pg_constraint c
      where c.conrelid = habits_table
        and c.contype in ('p', 'u')
        and c.conkey = array[habits_user_id_attnum, habits_id_attnum]::smallint[]
    ) then
      begin
        alter table public.rootine_notification_rules
          add constraint rootine_notification_rules_habit_fk
          foreign key (user_id, habit_id)
          references public.habits (user_id, id) on delete cascade;
      exception when duplicate_object then null;
      end;
    end if;
  end if;
end;
$$;

-- Unscoped entity-id FKs are intentionally absent; the composite FK above is
-- supplemented by rootine_validate_notification_rule_entity().

create or replace function public.rootine_cancel_notification_jobs_for_rule()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update public.rootine_notification_jobs
    set status = 'cancelled', cancelled_at = coalesce(cancelled_at, timezone('utc', now())),
        locked_at = null, lock_owner = null
    where user_id = old.user_id
      and rule_id = old.id
      and status in ('pending', 'processing')
      and scheduled_for >= timezone('utc', now());
  elsif not new.active or new.cancelled_at is not null then
    update public.rootine_notification_jobs
    set status = 'cancelled', cancelled_at = coalesce(cancelled_at, timezone('utc', now())),
        locked_at = null, lock_owner = null
    where user_id = coalesce(new.user_id, old.user_id)
      and rule_id = coalesce(new.id, old.id)
      and status in ('pending', 'processing')
      and scheduled_for >= timezone('utc', now());
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists rootine_notification_rules_cancel_jobs on public.rootine_notification_rules;
create trigger rootine_notification_rules_cancel_jobs
  after update of active, cancelled_at or delete on public.rootine_notification_rules
  for each row execute function public.rootine_cancel_notification_jobs_for_rule();

create or replace function public.rootine_validate_notification_job_rule()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rule_row public.rootine_notification_rules%rowtype;
begin
  if new.rule_id is null then
    return new;
  end if;
  select * into rule_row
  from public.rootine_notification_rules
  where id = new.rule_id;
  if not found
     or rule_row.user_id <> new.user_id
     or rule_row.entity_type <> new.entity_type
     or (new.entity_type = 'task' and rule_row.task_id <> new.entity_id)
     or (new.entity_type = 'habit' and rule_row.habit_id <> new.entity_id) then
    raise foreign_key_violation using message = 'Notification job entity is not owned by its rule.';
  end if;
  return new;
end;
$$;

drop trigger if exists rootine_notification_jobs_rule_owner on public.rootine_notification_jobs;
create trigger rootine_notification_jobs_rule_owner
  before insert or update of user_id, rule_id, entity_type, entity_id
  on public.rootine_notification_jobs
  for each row execute function public.rootine_validate_notification_job_rule();

create or replace function public.rootine_notification_is_quiet_hours(
  p_at timestamptz,
  p_timezone text,
  p_quiet_start time,
  p_quiet_end time
)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  local_time time;
begin
  if p_quiet_start is null or p_quiet_end is null or p_quiet_start = p_quiet_end then
    return false;
  end if;
  local_time := (p_at at time zone p_timezone)::time;
  if p_quiet_start < p_quiet_end then
    return local_time >= p_quiet_start and local_time < p_quiet_end;
  end if;
  return local_time >= p_quiet_start or local_time < p_quiet_end;
end;
$$;

create or replace function public.rootine_notification_quiet_hours_end(
  p_at timestamptz,
  p_timezone text,
  p_quiet_start time,
  p_quiet_end time
)
returns timestamptz
language plpgsql
immutable
set search_path = public
as $$
declare
  local_date date;
  local_time time;
  end_date date;
begin
  if not public.rootine_notification_is_quiet_hours(p_at, p_timezone, p_quiet_start, p_quiet_end) then
    return null;
  end if;
  local_date := (p_at at time zone p_timezone)::date;
  local_time := (p_at at time zone p_timezone)::time;
  end_date := local_date;
  if p_quiet_start > p_quiet_end and local_time >= p_quiet_start then
    end_date := local_date + 1;
  end if;
  return (end_date + p_quiet_end)::timestamp at time zone p_timezone;
end;
$$;

create or replace function public.rootine_enqueue_notification_job(
  p_rule_id uuid,
  p_entity_type text,
  p_entity_id text,
  p_occurrence_id text,
  p_dedupe_key text,
  p_scheduled_for timestamptz,
  p_payload jsonb,
  p_device_id text default null,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  existing_id uuid;
  rule_row public.rootine_notification_rules%rowtype;
  notifications_enabled boolean;
  type_enabled boolean;
  expires_at_value timestamptz := coalesce(p_expires_at, p_scheduled_for + interval '1 hour');
begin
  if current_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_entity_type is null or p_entity_type not in ('task', 'habit') or p_entity_id is null or p_occurrence_id is null then
    raise exception 'Invalid notification entity.' using errcode = '22023';
  end if;
  if p_scheduled_for is null then
    raise exception 'Notification scheduled_for is required.' using errcode = '22023';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or pg_column_size(p_payload) > 16384 then
    raise exception 'Notification payload is invalid.' using errcode = '22023';
  end if;
  if expires_at_value <= p_scheduled_for then
    raise exception 'Notification expiry must be after scheduled_for.' using errcode = '22023';
  end if;

  select * into rule_row
  from public.rootine_notification_rules
  where id = p_rule_id and user_id = current_user_id
    and active and cancelled_at is null
    and entity_type = p_entity_type
    and ((p_entity_type = 'task' and task_id = p_entity_id)
      or (p_entity_type = 'habit' and habit_id = p_entity_id));
  if not found then
    raise foreign_key_violation using message = 'Notification rule is not owned by the current account.';
  end if;

  select coalesce(notifications_enabled, true),
         case when p_entity_type = 'task'
           then coalesce(task_notifications_enabled, true)
           else coalesce(habit_notifications_enabled, true)
         end
  into notifications_enabled, type_enabled
  from public.rootine_notification_preferences
  where user_id = current_user_id;
  if not coalesce(notifications_enabled, true) or not coalesce(type_enabled, true) then
    return null;
  end if;

  if p_device_id is not null and not exists (
    select 1 from public.rootine_devices
    where user_id = current_user_id
      and device_id = p_device_id
      and revoked_at is null
      and deleted_at is null
      and push_token is not null
      and permission_state in ('authorized', 'provisional', 'ephemeral')
      and coalesce(last_seen_at, created_at) >= timezone('utc', now()) - interval '90 days'
  ) then
    raise foreign_key_violation using message = 'Notification device is not active for the current account.';
  end if;

  insert into public.rootine_notification_jobs (
    user_id, rule_id, entity_type, entity_id, notification_type, occurrence_id,
    dedupe_key, scheduled_for, expires_at, payload, device_id
  ) values (
    current_user_id, p_rule_id, p_entity_type, p_entity_id, rule_row.notification_type,
    p_occurrence_id, p_dedupe_key, p_scheduled_for, expires_at_value, p_payload, p_device_id
  )
  on conflict (user_id, dedupe_key) do nothing
  returning id into existing_id;

  if existing_id is not null then
    return existing_id;
  end if;
  select id into existing_id from public.rootine_notification_jobs
  where user_id = current_user_id and dedupe_key = p_dedupe_key;
  return existing_id;
end;
$$;

create or replace function public.rootine_save_notification_preferences(
  p_notifications_enabled boolean default true,
  p_task_notifications_enabled boolean default true,
  p_habit_notifications_enabled boolean default true,
  p_timezone text default 'UTC',
  p_quiet_hours_start time default null,
  p_quiet_hours_end time default null
)
returns public.rootine_notification_preferences
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  preferences public.rootine_notification_preferences%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_timezone is null or not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'Invalid notification timezone.' using errcode = '22023';
  end if;
  if (p_quiet_hours_start is null) <> (p_quiet_hours_end is null) then
    raise exception 'Quiet hours require both a start and an end.' using errcode = '22023';
  end if;
  insert into public.rootine_notification_preferences (
    user_id, notifications_enabled, task_notifications_enabled,
    habit_notifications_enabled, timezone, quiet_hours_start, quiet_hours_end
  ) values (
    current_user_id, coalesce(p_notifications_enabled, true),
    coalesce(p_task_notifications_enabled, true), coalesce(p_habit_notifications_enabled, true),
    p_timezone, p_quiet_hours_start, p_quiet_hours_end
  )
  on conflict (user_id) do update set
    notifications_enabled = excluded.notifications_enabled,
    task_notifications_enabled = excluded.task_notifications_enabled,
    habit_notifications_enabled = excluded.habit_notifications_enabled,
    timezone = excluded.timezone,
    quiet_hours_start = excluded.quiet_hours_start,
    quiet_hours_end = excluded.quiet_hours_end
  returning * into preferences;
  return preferences;
end;
$$;

create or replace function public.rootine_upsert_notification_rule(
  p_rule_id uuid default null,
  p_entity_type text default null,
  p_entity_id text default null,
  p_local_time time default null,
  p_timezone text default 'UTC',
  p_offset_minutes integer default 0,
  p_schedule jsonb default '{}'::jsonb,
  p_notification_type text default 'reminder',
  p_active boolean default true,
  p_valid_from date default null,
  p_valid_until date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  saved_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_entity_type is null or p_entity_type not in ('task', 'habit') or p_entity_id is null or p_local_time is null then
    raise exception 'Invalid notification rule.' using errcode = '22023';
  end if;
  if p_timezone is null or not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'Invalid notification timezone.' using errcode = '22023';
  end if;
  if p_rule_id is null then
    insert into public.rootine_notification_rules (
      user_id, entity_type, task_id, habit_id, notification_type, local_time,
      timezone, offset_minutes, schedule, active, valid_from, valid_until
    ) values (
      current_user_id, p_entity_type,
      case when p_entity_type = 'task' then p_entity_id end,
      case when p_entity_type = 'habit' then p_entity_id end,
      p_notification_type, p_local_time, p_timezone, p_offset_minutes,
      coalesce(p_schedule, '{}'::jsonb), coalesce(p_active, true), p_valid_from, p_valid_until
    ) returning id into saved_id;
  else
    update public.rootine_notification_rules
    set entity_type = p_entity_type,
        task_id = case when p_entity_type = 'task' then p_entity_id end,
        habit_id = case when p_entity_type = 'habit' then p_entity_id end,
        notification_type = p_notification_type,
        local_time = p_local_time,
        timezone = p_timezone,
        offset_minutes = p_offset_minutes,
        schedule = coalesce(p_schedule, '{}'::jsonb),
        active = coalesce(p_active, true),
        valid_from = p_valid_from,
        valid_until = p_valid_until,
        cancelled_at = case when coalesce(p_active, true) then null else coalesce(cancelled_at, timezone('utc', now())) end
    where id = p_rule_id and user_id = current_user_id
    returning id into saved_id;
    if saved_id is null then
      raise foreign_key_violation using message = 'Notification rule is not owned by the current account.';
    end if;
  end if;
  return saved_id;
end;
$$;

create or replace function public.rootine_delete_notification_rule(p_rule_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  changed integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  update public.rootine_notification_rules
  set active = false, cancelled_at = coalesce(cancelled_at, timezone('utc', now()))
  where id = p_rule_id and user_id = auth.uid();
  get diagnostics changed = row_count;
  return changed > 0;
end;
$$;

create or replace function public.rootine_cancel_notification_jobs_for_entity(
  p_entity_type text,
  p_entity_id text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  changed integer;
begin
  if current_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_entity_type is null or p_entity_type not in ('task', 'habit') or p_entity_id is null then
    raise exception 'Invalid notification entity.' using errcode = '22023';
  end if;
  update public.rootine_notification_jobs
  set status = 'cancelled', cancelled_at = coalesce(cancelled_at, timezone('utc', now())),
      locked_at = null, lock_owner = null
  where user_id = current_user_id and entity_type = p_entity_type and entity_id = p_entity_id
    and status in ('pending', 'processing')
    and scheduled_for >= timezone('utc', now());
  get diagnostics changed = row_count;
  return changed;
end;
$$;

-- Claiming is the only scheduler reservation path. FOR UPDATE SKIP LOCKED plus
-- the lock_owner predicate makes concurrent cron invocations disjoint.
create or replace function public.rootine_claim_notification_jobs(
  p_limit integer,
  p_lock_owner text,
  p_job_id uuid default null
)
returns setof public.rootine_notification_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  current_time_utc timestamptz := timezone('utc', now());
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'Notification claim limit must be between 1 and 100.' using errcode = '22023';
  end if;
  if p_lock_owner is null or char_length(p_lock_owner) not between 8 and 180 then
    raise exception 'Notification lock owner is required.' using errcode = '22023';
  end if;

  with exhausted as (
    update public.rootine_notification_jobs
    set status = 'failed', locked_at = null, lock_owner = null,
        last_error = 'Notification retry limit reached'
    where attempt_count >= max_attempts
      and (status = 'pending'
        or (status = 'processing' and locked_at < current_time_utc - interval '5 minutes'))
    returning id, attempt_count
  )
  insert into public.rootine_notification_alerts (alert_type, job_id, metadata)
  select 'failed', id, jsonb_build_object('attempt_count', attempt_count, 'provider', 'apns')
  from exhausted
  on conflict (alert_type, job_id) do nothing;

  -- Expiry is performed in the same transaction as claim. A job that spent
  -- the night offline is therefore never handed to the APNs provider.
  with expired as (
    update public.rootine_notification_jobs
    set status = 'expired', locked_at = null, lock_owner = null,
        last_error = 'Notification occurrence expired'
    where status in ('pending', 'processing')
      and expires_at <= current_time_utc
      and (status = 'pending' or locked_at < current_time_utc - interval '5 minutes')
    returning id
  )
  insert into public.rootine_notification_alerts (alert_type, job_id, metadata)
  select 'expired', id, jsonb_build_object('provider', 'apns')
  from expired
  on conflict (alert_type, job_id) do nothing;

  -- Quiet hours defer the attempt to the local end of the quiet period. The
  -- job keeps its original scheduled_for and dedupe key.
  update public.rootine_notification_jobs jobs
  set next_attempt_at = greatest(
    coalesce(next_attempt_at, current_time_utc),
    public.rootine_notification_quiet_hours_end(
      current_time_utc, coalesce(preferences.timezone, 'UTC'),
      preferences.quiet_hours_start, preferences.quiet_hours_end
    )
  )
  from public.rootine_notification_preferences preferences
  where jobs.user_id = preferences.user_id
    and jobs.status = 'pending'
    and jobs.scheduled_for <= current_time_utc
    and jobs.next_attempt_at <= current_time_utc
    and jobs.expires_at > current_time_utc
    and public.rootine_notification_is_quiet_hours(
      current_time_utc, coalesce(preferences.timezone, 'UTC'),
      preferences.quiet_hours_start, preferences.quiet_hours_end
    );

  return query
  with candidates as (
    select jobs.id
    from public.rootine_notification_jobs jobs
    left join public.rootine_notification_preferences preferences
      on preferences.user_id = jobs.user_id
    where (
        jobs.status = 'pending'
        or (jobs.status = 'processing' and jobs.locked_at < current_time_utc - interval '5 minutes')
      )
      and jobs.scheduled_for <= current_time_utc
      and jobs.expires_at > current_time_utc
      and jobs.next_attempt_at <= current_time_utc
      and jobs.attempt_count < jobs.max_attempts
      and coalesce(preferences.notifications_enabled, true)
      and case jobs.entity_type
        when 'task' then coalesce(preferences.task_notifications_enabled, true)
        when 'habit' then coalesce(preferences.habit_notifications_enabled, true)
        else false
      end
      and (p_job_id is null or jobs.id = p_job_id)
    order by jobs.scheduled_for, jobs.id
    for update of jobs skip locked
    limit p_limit
  ), claimed as (
    update public.rootine_notification_jobs jobs
    set status = 'processing', locked_at = current_time_utc, lock_owner = p_lock_owner,
        attempt_count = jobs.attempt_count + 1,
        last_attempt_at = current_time_utc
    from candidates
    where jobs.id = candidates.id
    returning jobs.*
  )
  select * from claimed;
end;
$$;

create or replace function public.rootine_finalize_notification_job(
  p_job_id uuid,
  p_lock_owner text,
  p_outcome text,
  p_deliveries jsonb default '[]'::jsonb,
  p_error text default null
)
returns public.rootine_notification_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  job_row public.rootine_notification_jobs%rowtype;
  delivery jsonb;
  delivery_status text;
  delivery_device_id text;
  delivery_code integer;
  delivery_reason text;
  delivery_retryable boolean;
  next_delay_seconds numeric;
begin
  if p_outcome not in ('delivered', 'retry', 'failed', 'expired') then
    raise exception 'Invalid notification outcome.' using errcode = '22023';
  end if;
  if p_deliveries is null or jsonb_typeof(p_deliveries) <> 'array' then
    raise exception 'Notification deliveries must be an array.' using errcode = '22023';
  end if;

  select * into job_row
  from public.rootine_notification_jobs
  where id = p_job_id and status = 'processing' and lock_owner = p_lock_owner
  for update;
  if not found then
    raise exception 'Notification job is not owned by this worker.' using errcode = '55000';
  end if;

  if job_row.expires_at <= timezone('utc', now()) then
    p_outcome := 'expired';
    p_error := 'Notification occurrence expired';
    p_deliveries := '[]'::jsonb;
  end if;

  for delivery in select value from jsonb_array_elements(p_deliveries) loop
    delivery_device_id := nullif(delivery ->> 'device_id', '');
    delivery_status := delivery ->> 'status';
    delivery_code := nullif(delivery ->> 'provider_response_code', '')::integer;
    delivery_reason := nullif(left(delivery ->> 'provider_reason', 255), '');
    delivery_retryable := coalesce((delivery ->> 'retryable')::boolean, false);
    if delivery_device_id is null or delivery_status not in ('delivered', 'failed', 'expired', 'unregistered') then
      raise exception 'Invalid notification delivery result.' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.rootine_devices
      where user_id = job_row.user_id and device_id = delivery_device_id
    ) then
      raise exception 'Notification delivery device is not owned by the job account.' using errcode = '42501';
    end if;
    if job_row.device_id is not null and delivery_device_id <> job_row.device_id then
      raise exception 'Notification delivery device does not match the targeted job.' using errcode = '22023';
    end if;
    insert into public.rootine_notification_deliveries (
      user_id, job_id, device_id, dedupe_key, status, retryable,
      provider_response_code, provider_reason, delivered_at
    ) values (
      job_row.user_id, job_row.id, delivery_device_id, job_row.dedupe_key,
      delivery_status, delivery_retryable, delivery_code, delivery_reason,
      case when delivery_status = 'delivered' then timezone('utc', now()) end
    )
    on conflict (job_id, device_id) do update set
      status = case when rootine_notification_deliveries.status = 'delivered'
        then rootine_notification_deliveries.status else excluded.status end,
      retryable = case when rootine_notification_deliveries.status = 'delivered'
        then rootine_notification_deliveries.retryable else excluded.retryable end,
      provider_response_code = case when rootine_notification_deliveries.status = 'delivered'
        then rootine_notification_deliveries.provider_response_code else excluded.provider_response_code end,
      provider_reason = case when rootine_notification_deliveries.status = 'delivered'
        then rootine_notification_deliveries.provider_reason else excluded.provider_reason end,
      delivered_at = case when rootine_notification_deliveries.status = 'delivered'
        then rootine_notification_deliveries.delivered_at else excluded.delivered_at end;
  end loop;

  if p_outcome = 'delivered' then
    update public.rootine_notification_jobs
    set status = 'delivered', delivered_at = timezone('utc', now()),
        locked_at = null, lock_owner = null, last_error = null
    where id = job_row.id;
  elsif p_outcome = 'retry' and job_row.attempt_count < job_row.max_attempts then
    next_delay_seconds := least(
      3600::numeric,
      power(2::numeric, greatest(job_row.attempt_count - 1, 0)) + floor(random() * 30)
    );
    update public.rootine_notification_jobs
    set status = 'pending', next_attempt_at = timezone('utc', now()) + make_interval(secs => next_delay_seconds::integer),
        locked_at = null, lock_owner = null, last_error = left(coalesce(p_error, 'Retryable APNs response'), 512)
    where id = job_row.id;
  elsif p_outcome = 'expired' then
    update public.rootine_notification_jobs
    set status = 'expired', locked_at = null, lock_owner = null,
        last_error = left(coalesce(p_error, 'Notification occurrence expired'), 512)
    where id = job_row.id;
  else
    update public.rootine_notification_jobs
    set status = 'failed', locked_at = null, lock_owner = null,
        last_error = left(coalesce(p_error, 'Non-retryable APNs response'), 512)
    where id = job_row.id;
  end if;

  if p_outcome in ('failed', 'expired') or (p_outcome = 'retry' and job_row.attempt_count >= job_row.max_attempts) then
    insert into public.rootine_notification_alerts (alert_type, job_id, metadata)
    values (
      case when p_outcome = 'expired' then 'expired' else 'failed' end,
      job_row.id,
      jsonb_build_object('attempt_count', job_row.attempt_count, 'provider', 'apns')
    ) on conflict (alert_type, job_id) do nothing;
  end if;

  select * into job_row from public.rootine_notification_jobs where id = p_job_id;
  return job_row;
end;
$$;

-- Revocation is always scoped to the owning account. Device IDs are unique per
-- user, not globally, so a provider response for one account must never
-- disable another account's installation.
drop function if exists public.rootine_revoke_notification_device(text);
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
  update public.rootine_devices
  set revoked_at = coalesce(revoked_at, timezone('utc', now())),
      push_token = null,
      apns_environment = null,
      permission_state = 'unknown',
      updated_at = timezone('utc', now())
  where user_id = p_user_id and device_id = p_device_id and revoked_at is null;
  get diagnostics changed = row_count;
  return changed > 0;
end;
$$;

create or replace function public.rootine_notification_retention(
  p_retention interval default interval '90 days'
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  removed bigint;
begin
  if p_retention is null or p_retention < interval '7 days' then
    raise exception 'Notification retention must be at least seven days.' using errcode = '22023';
  end if;
  delete from public.rootine_notification_deliveries
  where created_at < timezone('utc', now()) - p_retention
    and status in ('delivered', 'failed', 'expired');
  get diagnostics removed = row_count;
  return removed;
end;
$$;

create or replace view public.rootine_notification_health as
select
  count(*) filter (where status in ('pending', 'processing'))::bigint as queued_jobs,
  count(*) filter (where status = 'failed' and updated_at >= timezone('utc', now()) - interval '24 hours')::bigint as failed_last_24h,
  count(*) filter (where status = 'expired' and updated_at >= timezone('utc', now()) - interval '24 hours')::bigint as expired_last_24h,
  extract(epoch from (timezone('utc', now()) - min(scheduled_for) filter (where status = 'pending')))::bigint as oldest_pending_lag_seconds
from public.rootine_notification_jobs;

create or replace function public.rootine_record_notification_health_alert(
  p_queued_jobs bigint,
  p_failed_last_24h bigint,
  p_expired_last_24h bigint,
  p_oldest_pending_lag_seconds bigint,
  p_lag_threshold_seconds bigint default 300
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if greatest(
    coalesce(p_oldest_pending_lag_seconds, 0) - coalesce(p_lag_threshold_seconds, 300),
    coalesce(p_failed_last_24h, 0), coalesce(p_expired_last_24h, 0)
  ) <= 0 then
    return false;
  end if;
  insert into public.rootine_notification_alerts (alert_type, metadata)
  values (
    'outbox_lag',
    jsonb_build_object(
      'queued_jobs', coalesce(p_queued_jobs, 0),
      'failed_last_24h', coalesce(p_failed_last_24h, 0),
      'expired_last_24h', coalesce(p_expired_last_24h, 0),
      'oldest_pending_lag_seconds', coalesce(p_oldest_pending_lag_seconds, 0)
    )
  )
  on conflict (alert_type) where (alert_type = 'outbox_lag' and job_id is null)
  do update set metadata = excluded.metadata, observed_at = timezone('utc', now());
  return true;
end;
$$;

-- Clients may inspect their own preferences/rules/jobs/delivery status, but
-- only server functions can create/cancel jobs or read device tokens.
alter table public.rootine_notification_preferences enable row level security;
alter table public.rootine_notification_rules enable row level security;
alter table public.rootine_notification_jobs enable row level security;
alter table public.rootine_notification_deliveries enable row level security;
alter table public.rootine_notification_alerts enable row level security;

revoke all on table public.rootine_notification_preferences,
  public.rootine_notification_rules,
  public.rootine_notification_jobs,
  public.rootine_notification_deliveries,
  public.rootine_notification_alerts from anon;
grant select on table public.rootine_notification_preferences,
  public.rootine_notification_rules,
  public.rootine_notification_jobs,
  public.rootine_notification_deliveries to authenticated;
revoke insert, update on table public.rootine_notification_preferences from authenticated;

drop policy if exists rootine_notification_preferences_owner on public.rootine_notification_preferences;
create policy rootine_notification_preferences_owner
  on public.rootine_notification_preferences for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists rootine_notification_rules_owner on public.rootine_notification_rules;
create policy rootine_notification_rules_owner
  on public.rootine_notification_rules for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists rootine_notification_jobs_owner on public.rootine_notification_jobs;
create policy rootine_notification_jobs_owner
  on public.rootine_notification_jobs for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists rootine_notification_deliveries_owner on public.rootine_notification_deliveries;
create policy rootine_notification_deliveries_owner
  on public.rootine_notification_deliveries for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.rootine_notification_alerts from authenticated;

revoke all on function public.rootine_claim_notification_jobs(integer, text, uuid) from public, anon, authenticated;
grant execute on function public.rootine_claim_notification_jobs(integer, text, uuid) to service_role;
revoke all on function public.rootine_finalize_notification_job(uuid, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.rootine_finalize_notification_job(uuid, text, text, jsonb, text) to service_role;
revoke all on function public.rootine_revoke_notification_device(text, uuid) from public, anon, authenticated;
grant execute on function public.rootine_revoke_notification_device(text, uuid) to service_role;
revoke all on function public.rootine_notification_retention(interval) from public, anon, authenticated;
grant execute on function public.rootine_notification_retention(interval) to service_role;
revoke all on function public.rootine_record_notification_health_alert(bigint, bigint, bigint, bigint, bigint) from public, anon, authenticated;
grant execute on function public.rootine_record_notification_health_alert(bigint, bigint, bigint, bigint, bigint) to service_role;
revoke all on function public.rootine_enqueue_notification_job(uuid, text, text, text, text, timestamptz, jsonb, text, timestamptz) from public, anon;
grant execute on function public.rootine_enqueue_notification_job(uuid, text, text, text, text, timestamptz, jsonb, text, timestamptz) to authenticated;
revoke all on function public.rootine_save_notification_preferences(boolean, boolean, boolean, text, time, time) from public, anon;
grant execute on function public.rootine_save_notification_preferences(boolean, boolean, boolean, text, time, time) to authenticated;
revoke all on function public.rootine_upsert_notification_rule(uuid, text, text, time, text, integer, jsonb, text, boolean, date, date) from public, anon;
grant execute on function public.rootine_upsert_notification_rule(uuid, text, text, time, text, integer, jsonb, text, boolean, date, date) to authenticated;
revoke all on function public.rootine_delete_notification_rule(uuid) from public, anon;
grant execute on function public.rootine_delete_notification_rule(uuid) to authenticated;
revoke all on function public.rootine_cancel_notification_jobs_for_entity(text, text) from public, anon;
grant execute on function public.rootine_cancel_notification_jobs_for_entity(text, text) to authenticated;

grant select on public.rootine_notification_health to service_role;

comment on function public.rootine_claim_notification_jobs(integer, text, uuid) is
  'Atomically claims due, non-expired jobs with FOR UPDATE SKIP LOCKED. Scheduler workers must use a unique lock owner.';
comment on function public.rootine_finalize_notification_job(uuid, text, text, jsonb, text) is
  'Writes redacted APNs delivery outcomes and applies bounded retry/backoff or terminal status.';
