-- Rootine normalized domain schema (sync-v3 foundation).
--
-- This migration is intentionally additive.  The legacy
-- rootine_workspace_snapshots table and its CAS function are left untouched;
-- B03/B04 will use the tables below when their RPCs and materializers land.
-- Domain writes are deliberately not granted to authenticated clients.  The
-- sync RPC is the future write boundary and will run as a tightly scoped
-- security-definer function.

create table if not exists public.rootine_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  timezone text not null default 'UTC' check (char_length(timezone) between 1 and 100),
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  revision bigint not null default 1 check (revision > 0)
);

create table if not exists public.rootine_devices (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  device_id text not null check (char_length(device_id) between 1 and 180),
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
  unique (user_id, id),
  check (revoked_at is null or revoked_at >= created_at)
);

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
  status text not null default 'pending'
    check (status in ('pending', 'applied', 'already_applied', 'conflict', 'invalid')),
  result jsonb not null default '{}'::jsonb,
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

create table if not exists public.rootine_sync_changes (
  change_cursor bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  entity text not null check (char_length(entity) between 1 and 100),
  entity_id text not null check (char_length(entity_id) between 1 and 180),
  operation text not null check (operation in ('upsert', 'delete')),
  revision bigint not null check (revision > 0),
  device_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  unique (user_id, change_cursor),
  foreign key (user_id, device_id)
    references public.rootine_devices (user_id, device_id)
    on delete cascade
);

create table if not exists public.rootine_workspace_revisions (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  storage_key text not null check (char_length(storage_key) between 1 and 180),
  revision bigint not null check (revision > 0),
  payload jsonb not null,
  manifest jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  unique (user_id, id),
  unique (user_id, storage_key, revision)
);

create table if not exists public.rootine_workspace_snapshots_legacy (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  storage_key text not null check (char_length(storage_key) between 1 and 180),
  payload jsonb not null,
  content_hash text not null check (char_length(content_hash) between 1 and 160),
  source_updated_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  revision bigint not null default 1 check (revision > 0),
  unique (user_id, id),
  unique (user_id, storage_key)
);

create table if not exists public.rootine_migration_quarantine (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  storage_key text not null check (char_length(storage_key) between 1 and 180),
  reason text not null check (char_length(reason) between 1 and 500),
  payload jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'reviewed', 'migrated', 'rejected')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  revision bigint not null default 1 check (revision > 0),
  unique (user_id, id)
);

create table if not exists public.rootine_sync_reconciliation_log (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  storage_key text not null check (char_length(storage_key) between 1 and 180),
  entity text,
  entity_id text,
  status text not null default 'different'
    check (status in ('matched', 'migrated', 'different', 'quarantined', 'missing_relational', 'missing_legacy', 'error')),
  legacy_hash text,
  relational_hash text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  revision bigint not null default 1 check (revision > 0),
  unique (user_id, id)
);

-- Retention is data, rather than an undocumented scheduler default, so B03/B04
-- can use the same policy when deciding cursor expiry and safe compaction.
create table if not exists public.rootine_sync_retention_policy (
  policy_name text primary key check (policy_name = 'default'),
  outbox_retention interval not null default interval '90 days' check (outbox_retention > interval '0'),
  tombstone_retention interval not null default interval '90 days' check (tombstone_retention > interval '0'),
  revision_retention interval not null default interval '90 days' check (revision_retention > interval '0'),
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.rootine_sync_retention_policy (policy_name)
values ('default')
on conflict (policy_name) do nothing;

-- Tasks and habits ---------------------------------------------------------
create table if not exists public.tasks (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text,
  text text,
  description text,
  status text default 'open' check (status in ('open', 'in_progress', 'completed', 'cancelled', 'archived')),
  priority text default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  list_id text,
  due_date date,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  revision bigint not null default 1 check (revision > 0),
  unique (user_id, id)
);

create table if not exists public.task_lists (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 180),
  color text,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id)
);

create table if not exists public.task_tags (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 120),
  color text,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id)
);

create table if not exists public.task_tag_links (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  task_id text not null,
  tag_id text not null,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id), unique (user_id, task_id, tag_id),
  foreign key (user_id, task_id) references public.tasks (user_id, id) on delete cascade,
  foreign key (user_id, tag_id) references public.task_tags (user_id, id) on delete cascade
);

create table if not exists public.task_schedules (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  task_id text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text,
  recurrence text,
  reminder_minutes integer check (reminder_minutes is null or reminder_minutes >= 0),
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id),
  foreign key (user_id, task_id) references public.tasks (user_id, id) on delete cascade,
  check (ends_at is null or starts_at is null or ends_at >= starts_at)
);

create table if not exists public.task_completions (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  task_id text not null,
  completed_on date not null,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id), unique (user_id, task_id, completed_on),
  foreign key (user_id, task_id) references public.tasks (user_id, id) on delete cascade
);

create table if not exists public.task_comments (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  task_id text not null,
  body text not null,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id),
  foreign key (user_id, task_id) references public.tasks (user_id, id) on delete cascade
);

create table if not exists public.task_summary_notes (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  task_id text,
  body text not null,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id),
  foreign key (user_id, task_id) references public.tasks (user_id, id) on delete cascade
);

create table if not exists public.habits (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 180),
  description text,
  priority text default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  color text,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id)
);

create table if not exists public.habit_schedules (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  habit_id text not null,
  schedule_type text not null default 'daily' check (schedule_type in ('daily', 'weekly', 'monthly', 'custom')),
  starts_on date not null default current_date,
  ends_on date,
  timezone text,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id),
  foreign key (user_id, habit_id) references public.habits (user_id, id) on delete cascade,
  check (ends_on is null or ends_on >= starts_on)
);

create table if not exists public.habit_completions (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  habit_id text not null,
  completed_on date not null,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id), unique (user_id, habit_id, completed_on),
  foreign key (user_id, habit_id) references public.habits (user_id, id) on delete cascade
);

create table if not exists public.habit_pause_periods (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  habit_id text not null,
  starts_on date not null,
  ends_on date,
  reason text,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id),
  foreign key (user_id, habit_id) references public.habits (user_id, id) on delete cascade,
  check (ends_on is null or ends_on >= starts_on)
);

-- Notes --------------------------------------------------------------------
create table if not exists public.note_lists (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 180),
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id)
);

create table if not exists public.notes (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  list_id text,
  title text not null check (char_length(title) between 1 and 500),
  body text not null default '',
  kind text default 'text' check (kind in ('text', 'checklist', 'journal', 'markdown')),
  color text,
  pinned boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id),
  foreign key (user_id, list_id) references public.note_lists (user_id, id) on delete cascade
);

create table if not exists public.note_tags (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 120),
  color text,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id)
);

create table if not exists public.note_tag_links (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  note_id text not null,
  tag_id text not null,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id), unique (user_id, note_id, tag_id),
  foreign key (user_id, note_id) references public.notes (user_id, id) on delete cascade,
  foreign key (user_id, tag_id) references public.note_tags (user_id, id) on delete cascade
);

create table if not exists public.note_checklist_items (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  note_id text not null,
  position integer not null default 0 check (position >= 0),
  text text not null,
  checked boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id),
  foreign key (user_id, note_id) references public.notes (user_id, id) on delete cascade
);

-- Nutrition ---------------------------------------------------------------
create table if not exists public.nutrition_days (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  water_ml integer not null default 0 check (water_ml >= 0),
  source text default 'user' check (source in ('user', 'import', 'system')),
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id), unique (user_id, day)
);

create table if not exists public.nutrition_entries (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  day_id text not null,
  meal text,
  name text not null check (char_length(name) between 1 and 500),
  amount numeric(12,3) check (amount is null or amount > 0),
  unit text,
  calories numeric(12,3) not null default 0 check (calories >= 0),
  protein_g numeric(12,3) not null default 0 check (protein_g >= 0),
  carbs_g numeric(12,3) not null default 0 check (carbs_g >= 0),
  fat_g numeric(12,3) not null default 0 check (fat_g >= 0),
  catalog_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id),
  foreign key (user_id, day_id) references public.nutrition_days (user_id, id) on delete cascade
);

create table if not exists public.nutrition_goals (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  calories numeric(12,3) check (calories is null or calories >= 0), protein_g numeric(12,3) check (protein_g is null or protein_g >= 0), carbs_g numeric(12,3) check (carbs_g is null or carbs_g >= 0), fat_g numeric(12,3) check (fat_g is null or fat_g >= 0), water_ml integer check (water_ml is null or water_ml >= 0),
  effective_from date,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id)
);

create table if not exists public.nutrition_profiles (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  equation_variant text check (equation_variant is null or equation_variant in ('male', 'female', 'custom')),
  age integer check (age is null or age between 1 and 130),
  weight_kg numeric(7,3) check (weight_kg is null or weight_kg > 0),
  height_cm numeric(7,3) check (height_cm is null or height_cm > 0),
  work_activity text,
  diet_adjustment_mode text check (diet_adjustment_mode is null or diet_adjustment_mode in ('percent', 'calories', 'none')),
  diet_adjustment_value numeric(10,3),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id)
);

create table if not exists public.nutrition_weight_measurements (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  measured_on date not null,
  weight_kg numeric(7,3) not null check (weight_kg > 0),
  note text,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id)
);

create table if not exists public.nutrition_custom_meals (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 500),
  servings numeric(10,3) not null default 1 check (servings > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id)
);

create table if not exists public.nutrition_custom_meal_ingredients (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  meal_id text not null,
  name text not null check (char_length(name) between 1 and 500),
  amount numeric(12,3) not null check (amount > 0),
  unit text,
  calories numeric(12,3) not null default 0 check (calories >= 0),
  protein_g numeric(12,3) not null default 0 check (protein_g >= 0),
  carbs_g numeric(12,3) not null default 0 check (carbs_g >= 0),
  fat_g numeric(12,3) not null default 0 check (fat_g >= 0),
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id),
  foreign key (user_id, meal_id) references public.nutrition_custom_meals (user_id, id) on delete cascade
);

-- Sport -------------------------------------------------------------------
create table if not exists public.sport_exercises (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 180),
  muscle_group text,
  equipment text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id)
);

create table if not exists public.sport_templates (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 180),
  description text,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id)
);

create table if not exists public.sport_template_sections (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  template_id text not null,
  name text not null check (char_length(name) between 1 and 180),
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id),
  foreign key (user_id, template_id) references public.sport_templates (user_id, id) on delete cascade
);

create table if not exists public.sport_template_items (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  section_id text not null,
  exercise_id text,
  position integer not null default 0 check (position >= 0),
  sets integer check (sets is null or sets > 0),
  reps integer check (reps is null or reps > 0),
  rest_seconds integer check (rest_seconds is null or rest_seconds >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id),
  foreign key (user_id, section_id) references public.sport_template_sections (user_id, id) on delete cascade,
  foreign key (user_id, exercise_id) references public.sport_exercises (user_id, id) on delete cascade
);

create table if not exists public.sport_cycles (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 180),
  starts_on date,
  ends_on date,
  status text default 'planned' check (status in ('planned', 'active', 'completed', 'archived')),
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id), check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create table if not exists public.sport_cycle_workouts (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  cycle_id text not null,
  template_id text,
  scheduled_on date,
  status text default 'planned' check (status in ('planned', 'completed', 'skipped', 'cancelled')),
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id),
  foreign key (user_id, cycle_id) references public.sport_cycles (user_id, id) on delete cascade,
  foreign key (user_id, template_id) references public.sport_templates (user_id, id) on delete cascade
);

create table if not exists public.sport_sessions (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  cycle_workout_id text,
  started_at timestamptz,
  ended_at timestamptz,
  notes text,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id),
  foreign key (user_id, cycle_workout_id) references public.sport_cycle_workouts (user_id, id) on delete cascade,
  check (ended_at is null or started_at is null or ended_at >= started_at)
);

create table if not exists public.sport_session_sets (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id text not null,
  exercise_id text,
  set_number integer not null check (set_number > 0),
  reps integer check (reps is null or reps > 0),
  weight_kg numeric(10,3) check (weight_kg is null or weight_kg >= 0),
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  completed boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id), unique (user_id, session_id, set_number),
  foreign key (user_id, session_id) references public.sport_sessions (user_id, id) on delete cascade,
  foreign key (user_id, exercise_id) references public.sport_exercises (user_id, id) on delete cascade
);

create table if not exists public.sport_history (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  exercise_id text,
  occurred_on date not null,
  best_weight_kg numeric(10,3) check (best_weight_kg is null or best_weight_kg >= 0),
  best_reps integer check (best_reps is null or best_reps > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id),
  foreign key (user_id, exercise_id) references public.sport_exercises (user_id, id) on delete cascade
);

create table if not exists public.sport_outcomes (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id text,
  outcome text not null check (char_length(outcome) between 1 and 500),
  score numeric(12,3) check (score is null or score >= 0),
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id),
  foreign key (user_id, session_id) references public.sport_sessions (user_id, id) on delete cascade
);

-- Goals -------------------------------------------------------------------
create table if not exists public.goal_categories (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 180), color text, icon_key text,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id)
);

create table if not exists public.goals (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  category_id text,
  title text not null check (char_length(title) between 1 and 500),
  description text,
  status text default 'active' check (status in ('active', 'completed', 'paused', 'archived', 'cancelled')),
  health text check (health is null or health in ('ontrack', 'atrisk', 'offtrack', 'unknown')),
  priority text check (priority is null or priority in ('low', 'medium', 'high', 'urgent')),
  start_date date,
  due_date date,
  progress_mode text check (progress_mode is null or progress_mode in ('manual', 'milestones', 'numeric')),
  initial_value numeric(14,3),
  target_value numeric(14,3),
  manual_progress numeric(14,3) check (manual_progress is null or manual_progress >= 0),
  note text,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id),
  foreign key (user_id, category_id) references public.goal_categories (user_id, id) on delete cascade,
  check (due_date is null or start_date is null or due_date >= start_date),
  check (target_value is null or initial_value is null or target_value >= initial_value)
);

create table if not exists public.goal_milestones (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  goal_id text not null,
  title text not null check (char_length(title) between 1 and 500), due_date date, done boolean not null default false, weight numeric(12,3) not null default 1 check (weight > 0),
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id),
  foreign key (user_id, goal_id) references public.goals (user_id, id) on delete cascade
);

create table if not exists public.goal_progress_entries (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  goal_id text not null,
  entry_date date not null,
  value numeric(14,3) not null,
  note text,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id),
  foreign key (user_id, goal_id) references public.goals (user_id, id) on delete cascade
);

create table if not exists public.goal_notes (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  goal_id text not null,
  body text not null,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id),
  foreign key (user_id, goal_id) references public.goals (user_id, id) on delete cascade
);

-- Work --------------------------------------------------------------------
create table if not exists public.work_companies (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 300), website text, archived boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id)
);

create table if not exists public.work_projects (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  company_id text,
  name text not null check (char_length(name) between 1 and 300), description text, status text default 'active' check (status in ('active', 'completed', 'archived', 'paused')),
  start_date date, due_date date,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id),
  foreign key (user_id, company_id) references public.work_companies (user_id, id) on delete cascade,
  check (due_date is null or start_date is null or due_date >= start_date)
);

create table if not exists public.work_tasks (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id text,
  company_id text,
  title text not null check (char_length(title) between 1 and 500), status text default 'open' check (status in ('open', 'in_progress', 'completed', 'cancelled')), priority text check (priority is null or priority in ('low', 'medium', 'high', 'urgent')), due_date date,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id),
  foreign key (user_id, project_id) references public.work_projects (user_id, id) on delete cascade,
  foreign key (user_id, company_id) references public.work_companies (user_id, id) on delete cascade
);

create table if not exists public.work_focus_sessions (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id text, task_id text,
  started_at timestamptz not null, ended_at timestamptz, duration_minutes integer check (duration_minutes is null or duration_minutes >= 0), note text,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id),
  foreign key (user_id, project_id) references public.work_projects (user_id, id) on delete cascade,
  foreign key (user_id, task_id) references public.work_tasks (user_id, id) on delete cascade,
  check (ended_at is null or ended_at >= started_at)
);

-- Travel ------------------------------------------------------------------
create table if not exists public.trips (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 300), destination text, status text default 'planning' check (status in ('planning', 'ready', 'ongoing', 'completed', 'archived', 'cancelled')),
  start_date date, end_date date, base_currency char(3) default 'PLN' check (base_currency ~ '^[A-Z]{3}$'), note text, archived_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id), check (end_date is null or start_date is null or end_date >= start_date)
);

create table if not exists public.trip_itinerary_items (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  trip_id text not null, date date, starts_at timestamptz, ends_at timestamptz, title text not null check (char_length(title) between 1 and 500), location text, kind text, note text, reserved boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id), foreign key (user_id, trip_id) references public.trips (user_id, id) on delete cascade, check (ends_at is null or starts_at is null or ends_at >= starts_at)
);

create table if not exists public.trip_bookings (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  trip_id text not null, provider text, booking_reference text, status text default 'planned' check (status in ('planned', 'booked', 'cancelled', 'completed')), amount_minor bigint check (amount_minor is null or amount_minor >= 0), currency_code char(3) check (currency_code is null or currency_code ~ '^[A-Z]{3}$'), starts_at timestamptz, ends_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id), foreign key (user_id, trip_id) references public.trips (user_id, id) on delete cascade, check (ends_at is null or starts_at is null or ends_at >= starts_at)
);

create table if not exists public.trip_budget_items (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  trip_id text not null, category text, label text not null check (char_length(label) between 1 and 300), planned_minor bigint check (planned_minor is null or planned_minor >= 0), actual_minor bigint check (actual_minor is null or actual_minor >= 0), currency_code char(3) not null check (currency_code ~ '^[A-Z]{3}$'), paid boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id), foreign key (user_id, trip_id) references public.trips (user_id, id) on delete cascade
);

create table if not exists public.trip_documents (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  trip_id text not null, name text not null check (char_length(name) between 1 and 500), owner text, status text default 'ready' check (status in ('pending', 'ready', 'expired', 'archived')), expires_at timestamptz, storage_path text, note text,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id), foreign key (user_id, trip_id) references public.trips (user_id, id) on delete cascade
);

create table if not exists public.trip_packing_items (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  trip_id text not null, label text not null check (char_length(label) between 1 and 300), quantity integer not null default 1 check (quantity > 0), packed boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id), foreign key (user_id, trip_id) references public.trips (user_id, id) on delete cascade
);

-- Health ------------------------------------------------------------------
create table if not exists public.health_checkins (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  checkin_date date not null, mood integer check (mood is null or mood between 1 and 10), energy integer check (energy is null or energy between 1 and 10), note text,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id)
);

create table if not exists public.health_reminders (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300), remind_at timestamptz, recurrence text, active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id)
);

create table if not exists public.health_visits (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text, visit_at timestamptz not null, reason text, notes text, status text default 'planned' check (status in ('planned', 'completed', 'cancelled')),
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id)
);

create table if not exists public.health_tests (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  test_type text not null check (char_length(test_type) between 1 and 180), tested_at timestamptz not null, value numeric(14,4), unit text, reference_range text, note text,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id)
);

create table if not exists public.health_prescriptions (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  medication text not null check (char_length(medication) between 1 and 300), dosage text, starts_on date, ends_on date, active boolean not null default true, note text,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id), check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create table if not exists public.health_vaccinations (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  vaccine text not null check (char_length(vaccine) between 1 and 300), administered_on date not null, expires_on date, provider text, lot_number text,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id), check (expires_on is null or expires_on >= administered_on)
);

-- Affairs, finance and JDG -------------------------------------------------
create table if not exists public.affair_matters (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 500), description text, status text default 'open' check (status in ('open', 'in_progress', 'completed', 'archived', 'cancelled')), due_date date, priority text check (priority is null or priority in ('low', 'medium', 'high', 'urgent')),
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id)
);

create table if not exists public.payments (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  matter_id text, subscription_id text, description text, amount_minor bigint not null check (amount_minor >= 0), currency_code char(3) not null check (currency_code ~ '^[A-Z]{3}$'), paid_at timestamptz, status text default 'pending' check (status in ('pending', 'paid', 'failed', 'refunded', 'cancelled')),
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id),
  foreign key (user_id, matter_id) references public.affair_matters (user_id, id) on delete cascade
);

create table if not exists public.subscriptions (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 300), provider text, amount_minor bigint not null check (amount_minor >= 0), currency_code char(3) not null check (currency_code ~ '^[A-Z]{3}$'), cadence text check (cadence is null or cadence in ('weekly', 'monthly', 'quarterly', 'yearly', 'custom')), next_due_on date, status text default 'active' check (status in ('active', 'paused', 'cancelled', 'expired')),
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id)
);

create table if not exists public.documents (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 500), document_type text, status text default 'active' check (status in ('active', 'archived', 'expired')), expires_at timestamptz, storage_path text, note text,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id)
);

create table if not exists public.vehicles (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  make text, model text, registration_number text, vin text, year integer check (year is null or year between 1886 and 2200),
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id)
);

create table if not exists public.vehicle_service_items (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  vehicle_id text not null, service_type text not null check (char_length(service_type) between 1 and 180), serviced_on date not null, next_due_on date, mileage integer check (mileage is null or mileage >= 0), amount_minor bigint check (amount_minor is null or amount_minor >= 0), currency_code char(3) check (currency_code is null or currency_code ~ '^[A-Z]{3}$'), note text,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id), foreign key (user_id, vehicle_id) references public.vehicles (user_id, id) on delete cascade, check (next_due_on is null or next_due_on >= serviced_on)
);

create table if not exists public.jdg_periods (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  period_start date not null, period_end date not null, status text default 'open' check (status in ('open', 'submitted', 'closed', 'archived')), revenue_minor bigint check (revenue_minor is null or revenue_minor >= 0), costs_minor bigint check (costs_minor is null or costs_minor >= 0), currency_code char(3) default 'PLN' check (currency_code ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id), check (period_end >= period_start)
);

create table if not exists public.jdg_checklist_items (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  period_id text not null, label text not null check (char_length(label) between 1 and 500), done boolean not null default false, due_date date,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz, revision bigint not null default 1 check (revision > 0), unique (user_id, id), foreign key (user_id, period_id) references public.jdg_periods (user_id, id) on delete cascade
);

-- A few parent tables are declared after their child for readability.  Add
-- those ownership-checked relations after both sides exist.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tasks_user_list_fk'
      and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks
      add constraint tasks_user_list_fk
      foreign key (user_id, list_id)
      references public.task_lists (user_id, id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'payments_user_subscription_fk'
      and conrelid = 'public.payments'::regclass
  ) then
    alter table public.payments
      add constraint payments_user_subscription_fk
      foreign key (user_id, subscription_id)
      references public.subscriptions (user_id, id)
      on delete cascade;
  end if;
end;
$$;

-- Shared indexes, revision guard, outbox and row-level security ------------
create or replace function public.rootine_relational_revision_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id then
      raise exception 'The owner of a Rootine record cannot change.' using errcode = '42501';
    end if;
    new.created_at := old.created_at;
    new.revision := old.revision + 1;
  end if;
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

create or replace function public.rootine_sync_changes_append_only()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_setting('rootine.sync_compaction', true) is distinct from 'on' then
    raise exception 'rootine_sync_changes is append-only.' using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.rootine_emit_sync_change()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  changed_payload jsonb;
  changed_entity_id text;
begin
  if tg_op = 'DELETE' then
    changed_payload := to_jsonb(old);
  else
    changed_payload := to_jsonb(new);
  end if;
  changed_entity_id := coalesce(changed_payload ->> 'id', changed_payload ->> 'user_id');
  insert into public.rootine_sync_changes (
    user_id, entity, entity_id, operation, revision, device_id, payload, created_at
  ) values (
    (changed_payload ->> 'user_id')::uuid,
    tg_table_name,
    changed_entity_id,
    case when tg_op = 'DELETE' or (changed_payload ->> 'deleted_at') is not null then 'delete' else 'upsert' end,
    (changed_payload ->> 'revision')::bigint,
    nullif(current_setting('rootine.sync_device_id', true), ''),
    case when tg_op = 'DELETE' then jsonb_build_object('id', changed_entity_id, 'deleted_at', timezone('utc', now())) else changed_payload end,
    timezone('utc', now())
  );
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

do $$
declare
  table_name text;
  domain_tables constant text[] := array[
    'rootine_profiles', 'rootine_devices', 'rootine_sync_cursors',
    'rootine_sync_operations', 'rootine_workspace_revisions',
    'rootine_workspace_snapshots_legacy', 'rootine_migration_quarantine',
    'rootine_sync_reconciliation_log', 'tasks', 'task_lists', 'task_tags',
    'task_tag_links', 'task_schedules', 'task_completions', 'task_comments',
    'task_summary_notes', 'habits', 'habit_schedules', 'habit_completions',
    'habit_pause_periods', 'note_lists', 'notes', 'note_tags', 'note_tag_links',
    'note_checklist_items', 'nutrition_days', 'nutrition_entries',
    'nutrition_goals', 'nutrition_profiles', 'nutrition_weight_measurements',
    'nutrition_custom_meals', 'nutrition_custom_meal_ingredients',
    'sport_exercises', 'sport_templates', 'sport_template_sections',
    'sport_template_items', 'sport_cycles', 'sport_cycle_workouts',
    'sport_sessions', 'sport_session_sets', 'sport_history', 'sport_outcomes',
    'goal_categories', 'goals', 'goal_milestones', 'goal_progress_entries',
    'goal_notes', 'work_companies', 'work_projects', 'work_tasks',
    'work_focus_sessions', 'trips', 'trip_itinerary_items', 'trip_bookings',
    'trip_budget_items', 'trip_documents', 'trip_packing_items',
    'health_checkins', 'health_reminders', 'health_visits', 'health_tests',
    'health_prescriptions', 'health_vaccinations', 'affair_matters',
    'payments', 'subscriptions', 'documents', 'vehicles',
    'vehicle_service_items', 'jdg_periods', 'jdg_checklist_items'
  ];
  sync_tables constant text[] := array[
    'rootine_profiles', 'tasks', 'task_lists', 'task_tags', 'task_tag_links',
    'task_schedules', 'task_completions', 'task_comments', 'task_summary_notes',
    'habits', 'habit_schedules', 'habit_completions', 'habit_pause_periods',
    'note_lists', 'notes', 'note_tags', 'note_tag_links', 'note_checklist_items',
    'nutrition_days', 'nutrition_entries', 'nutrition_goals',
    'nutrition_profiles', 'nutrition_weight_measurements',
    'nutrition_custom_meals', 'nutrition_custom_meal_ingredients',
    'sport_exercises', 'sport_templates', 'sport_template_sections',
    'sport_template_items', 'sport_cycles', 'sport_cycle_workouts',
    'sport_sessions', 'sport_session_sets', 'sport_history', 'sport_outcomes',
    'goal_categories', 'goals', 'goal_milestones', 'goal_progress_entries',
    'goal_notes', 'work_companies', 'work_projects', 'work_tasks',
    'work_focus_sessions', 'trips', 'trip_itinerary_items', 'trip_bookings',
    'trip_budget_items', 'trip_documents', 'trip_packing_items',
    'health_checkins', 'health_reminders', 'health_visits', 'health_tests',
    'health_prescriptions', 'health_vaccinations', 'affair_matters',
    'payments', 'subscriptions', 'documents', 'vehicles',
    'vehicle_service_items', 'jdg_periods', 'jdg_checklist_items'
  ];
begin
  foreach table_name in array domain_tables loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_revision_guard', table_name);
    execute format('create trigger %I before update on public.%I for each row execute function public.rootine_relational_revision_guard()', table_name || '_revision_guard', table_name);
    execute format('create index if not exists %I on public.%I (user_id, updated_at desc)', table_name || '_user_updated_idx', table_name);
    execute format('create index if not exists %I on public.%I (user_id, deleted_at) where deleted_at is not null', table_name || '_user_deleted_idx', table_name);
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
    execute format('grant select on table public.%I to authenticated', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_select', table_name);
    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)', table_name || '_select', table_name);
  end loop;

  foreach table_name in array sync_tables loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_sync_change', table_name);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.rootine_emit_sync_change()', table_name || '_sync_change', table_name);
  end loop;

  execute 'drop trigger if exists rootine_sync_changes_append_only on public.rootine_sync_changes';
  -- Account deletion deliberately cascades through the outbox.  Authenticated
  -- clients have no DELETE privilege; the trigger only protects append-only
  -- rows from UPDATE while still allowing the FK account-delete path.
  execute 'create trigger rootine_sync_changes_append_only before update on public.rootine_sync_changes for each row execute function public.rootine_sync_changes_append_only()';
  execute 'alter table public.rootine_sync_changes enable row level security';
  execute 'revoke all on table public.rootine_sync_changes from anon, authenticated';
  execute 'grant select on table public.rootine_sync_changes to authenticated';
  execute 'drop policy if exists rootine_sync_changes_select on public.rootine_sync_changes';
  execute 'create policy rootine_sync_changes_select on public.rootine_sync_changes for select to authenticated using ((select auth.uid()) = user_id)';
end;
$$;

revoke all on table public.rootine_sync_retention_policy from anon, authenticated;

create index if not exists rootine_sync_changes_user_cursor_idx
  on public.rootine_sync_changes (user_id, change_cursor);
create index if not exists rootine_sync_changes_user_created_idx
  on public.rootine_sync_changes (user_id, created_at);
create index if not exists rootine_sync_operations_user_status_idx
  on public.rootine_sync_operations (user_id, status, created_at);
create index if not exists rootine_sync_operations_expires_idx
  on public.rootine_sync_operations (expires_at)
  where expires_at is not null;
create index if not exists rootine_devices_last_seen_idx
  on public.rootine_devices (user_id, last_seen_at desc);
create index if not exists rootine_workspace_revisions_lookup_idx
  on public.rootine_workspace_revisions (user_id, storage_key, revision desc);
create index if not exists rootine_quarantine_status_idx
  on public.rootine_migration_quarantine (user_id, status, created_at);
create index if not exists rootine_reconciliation_status_idx
  on public.rootine_sync_reconciliation_log (user_id, status, created_at);

-- Relation and scheduling indexes are explicit because PostgreSQL does not
-- create an index for a foreign key automatically.
create index if not exists tasks_user_due_idx on public.tasks (user_id, due_date);
create index if not exists tasks_user_list_idx on public.tasks (user_id, list_id);
create index if not exists task_links_user_task_idx on public.task_tag_links (user_id, task_id);
create index if not exists task_links_user_tag_idx on public.task_tag_links (user_id, tag_id);
create index if not exists task_schedules_user_task_idx on public.task_schedules (user_id, task_id);
create index if not exists task_schedules_user_start_idx on public.task_schedules (user_id, starts_at);
create index if not exists task_completions_user_task_idx on public.task_completions (user_id, task_id, completed_on);
create index if not exists task_comments_user_task_idx on public.task_comments (user_id, task_id);
create index if not exists task_notes_user_task_idx on public.task_summary_notes (user_id, task_id);
create index if not exists habit_schedules_user_habit_idx on public.habit_schedules (user_id, habit_id);
create index if not exists habit_completions_user_habit_idx on public.habit_completions (user_id, habit_id, completed_on);
create index if not exists habit_pauses_user_habit_idx on public.habit_pause_periods (user_id, habit_id, starts_on);
create index if not exists notes_user_list_idx on public.notes (user_id, list_id);
create index if not exists note_links_user_note_idx on public.note_tag_links (user_id, note_id);
create index if not exists note_links_user_tag_idx on public.note_tag_links (user_id, tag_id);
create index if not exists note_items_user_note_idx on public.note_checklist_items (user_id, note_id, position);
create index if not exists nutrition_days_user_day_idx on public.nutrition_days (user_id, day);
create index if not exists nutrition_entries_user_day_idx on public.nutrition_entries (user_id, day_id);
create index if not exists nutrition_weights_user_date_idx on public.nutrition_weight_measurements (user_id, measured_on);
create index if not exists nutrition_goals_user_effective_idx on public.nutrition_goals (user_id, effective_from);
create index if not exists nutrition_ingredients_user_meal_idx on public.nutrition_custom_meal_ingredients (user_id, meal_id);
create index if not exists sport_sections_user_template_idx on public.sport_template_sections (user_id, template_id);
create index if not exists sport_items_user_section_idx on public.sport_template_items (user_id, section_id);
create index if not exists sport_items_user_exercise_idx on public.sport_template_items (user_id, exercise_id);
create index if not exists sport_workouts_user_cycle_idx on public.sport_cycle_workouts (user_id, cycle_id, scheduled_on);
create index if not exists sport_workouts_user_template_idx on public.sport_cycle_workouts (user_id, template_id);
create index if not exists sport_sessions_user_workout_idx on public.sport_sessions (user_id, cycle_workout_id);
create index if not exists sport_sessions_user_start_idx on public.sport_sessions (user_id, started_at);
create index if not exists sport_sets_user_session_idx on public.sport_session_sets (user_id, session_id, set_number);
create index if not exists sport_sets_user_exercise_idx on public.sport_session_sets (user_id, exercise_id);
create index if not exists sport_history_user_exercise_idx on public.sport_history (user_id, exercise_id, occurred_on);
create index if not exists sport_outcomes_user_session_idx on public.sport_outcomes (user_id, session_id);
create index if not exists goals_user_category_idx on public.goals (user_id, category_id);
create index if not exists goals_user_due_idx on public.goals (user_id, due_date);
create index if not exists goal_milestones_user_goal_idx on public.goal_milestones (user_id, goal_id, due_date);
create index if not exists goal_progress_user_goal_idx on public.goal_progress_entries (user_id, goal_id, entry_date);
create index if not exists goal_notes_user_goal_idx on public.goal_notes (user_id, goal_id);
create index if not exists work_projects_user_company_idx on public.work_projects (user_id, company_id);
create index if not exists work_tasks_user_project_idx on public.work_tasks (user_id, project_id);
create index if not exists work_tasks_user_company_idx on public.work_tasks (user_id, company_id);
create index if not exists work_tasks_user_due_idx on public.work_tasks (user_id, due_date);
create index if not exists focus_user_project_idx on public.work_focus_sessions (user_id, project_id);
create index if not exists focus_user_task_idx on public.work_focus_sessions (user_id, task_id);
create index if not exists focus_user_start_idx on public.work_focus_sessions (user_id, started_at);
create index if not exists itinerary_user_trip_idx on public.trip_itinerary_items (user_id, trip_id, date);
create index if not exists trips_user_dates_idx on public.trips (user_id, start_date, end_date);
create index if not exists bookings_user_trip_idx on public.trip_bookings (user_id, trip_id, starts_at);
create index if not exists budget_user_trip_idx on public.trip_budget_items (user_id, trip_id);
create index if not exists trip_docs_user_trip_idx on public.trip_documents (user_id, trip_id);
create index if not exists packing_user_trip_idx on public.trip_packing_items (user_id, trip_id);
create index if not exists health_checkins_user_date_idx on public.health_checkins (user_id, checkin_date);
create index if not exists health_reminders_user_at_idx on public.health_reminders (user_id, remind_at);
create index if not exists health_visits_user_at_idx on public.health_visits (user_id, visit_at);
create index if not exists health_tests_user_at_idx on public.health_tests (user_id, tested_at);
create index if not exists health_prescriptions_user_start_idx on public.health_prescriptions (user_id, starts_on);
create index if not exists health_vaccinations_user_date_idx on public.health_vaccinations (user_id, administered_on);
create index if not exists affairs_user_due_idx on public.affair_matters (user_id, due_date);
create index if not exists payments_user_matter_idx on public.payments (user_id, matter_id);
create index if not exists payments_user_subscription_idx on public.payments (user_id, subscription_id);
create index if not exists payments_user_paid_idx on public.payments (user_id, paid_at);
create index if not exists subscriptions_user_due_idx on public.subscriptions (user_id, next_due_on);
create index if not exists documents_user_expiry_idx on public.documents (user_id, expires_at);
create index if not exists service_user_vehicle_idx on public.vehicle_service_items (user_id, vehicle_id, serviced_on);
create index if not exists service_user_next_due_idx on public.vehicle_service_items (user_id, next_due_on);
create index if not exists jdg_periods_user_dates_idx on public.jdg_periods (user_id, period_start, period_end);
create index if not exists jdg_items_user_period_idx on public.jdg_checklist_items (user_id, period_id, due_date);

create or replace view public.rootine_sync_cursor_bounds
with (security_invoker = true)
as
select
  user_id,
  coalesce(min(change_cursor), 0)::bigint as oldest_available_cursor,
  coalesce(max(change_cursor), 0)::bigint as latest_cursor
from public.rootine_sync_changes
group by user_id;

revoke all on public.rootine_sync_cursor_bounds from anon;
grant select on public.rootine_sync_cursor_bounds to authenticated;

comment on table public.rootine_sync_changes is
  'Append-only sync-v3 outbox. Deletes are represented as rows with operation=delete and a tombstone payload; proposed retention is 90 days.';
comment on table public.rootine_workspace_revisions is
  'Revision history retained for recovery and reconciliation. Proposed retention is 90 days after the last safe bootstrap.';
comment on view public.rootine_sync_cursor_bounds is
  'Authoritative oldest and latest cursor currently available per user; clients must not guess cursor expiry.';

revoke all on function public.rootine_relational_revision_guard() from public;
revoke all on function public.rootine_sync_changes_append_only() from public;
revoke all on function public.rootine_emit_sync_change() from public;
