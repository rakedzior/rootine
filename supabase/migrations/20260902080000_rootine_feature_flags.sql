-- B01: server-side feature flags. Defaults are deliberately off. Account
-- values are evaluated for auth.uid() and never trusted from the client body.

create table if not exists public.rootine_feature_flags (
  environment text not null
    check (environment in ('development', 'staging', 'production')),
  scope text not null
    check (scope in ('environment', 'account')),
  user_id uuid references auth.users(id) on delete cascade,
  flag_name text not null
    check (flag_name in (
      'normalized_sync_enabled',
      'normalized_read_enabled',
      'notifications_enabled'
    )),
  enabled boolean not null default false,
  updated_at timestamptz not null default timezone('utc', now())
);

-- A previous staging attempt may have created the table before the migration
-- transaction was recorded. CREATE TABLE IF NOT EXISTS still attempts to
-- reconcile named constraints on some PostgreSQL versions, so add this one
-- explicitly and idempotently.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.rootine_feature_flags'::regclass
      and conname = 'rootine_feature_flags_scope_check'
  ) then
    alter table public.rootine_feature_flags
      add constraint rootine_feature_flags_scope_check check (
        (scope = 'environment' and user_id is null)
        or (scope = 'account' and user_id is not null)
      );
  end if;
end;
$$;

create unique index if not exists rootine_feature_flags_unique_scope
  on public.rootine_feature_flags (
    environment,
    flag_name,
    scope,
    coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create index if not exists rootine_feature_flags_account_lookup
  on public.rootine_feature_flags (environment, user_id, flag_name)
  where scope = 'account';

alter table public.rootine_feature_flags enable row level security;
revoke all on table public.rootine_feature_flags from anon, authenticated;

-- Seed explicit environment defaults so the source is visible in an audit.
-- Account overrides are intentionally not seeded.
insert into public.rootine_feature_flags (environment, scope, flag_name, enabled)
select environments.environment, 'environment', flags.flag_name, false
from (values ('development'), ('staging'), ('production')) as environments(environment)
cross join (values
  ('normalized_sync_enabled'),
  ('normalized_read_enabled'),
  ('notifications_enabled')
) as flags(flag_name)
on conflict do nothing;


create or replace function public.rootine_get_feature_flags(
  p_environment text default 'production'
)
returns table (
  flag_name text,
  enabled boolean,
  source text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if p_environment is null
     or p_environment not in ('development', 'staging', 'production') then
    raise exception 'Invalid environment.' using errcode = '22023';
  end if;

  return query
  with names(flag_name) as (
    values
      ('normalized_sync_enabled'::text),
      ('normalized_read_enabled'::text),
      ('notifications_enabled'::text)
  )
  select
    names.flag_name,
    coalesce(account.enabled, environment.enabled, false),
    case
      when account.flag_name is not null then 'account'
      when environment.flag_name is not null then 'environment'
      else 'default'
    end
  from names
  left join public.rootine_feature_flags as environment
    on environment.flag_name = names.flag_name
   and environment.environment = p_environment
   and environment.scope = 'environment'
   and environment.user_id is null
  left join public.rootine_feature_flags as account
    on account.flag_name = names.flag_name
   and account.environment = p_environment
   and account.scope = 'account'
   and account.user_id = current_user_id
  order by names.flag_name;
end;
$$;

revoke all on function public.rootine_get_feature_flags(text) from public;
grant execute on function public.rootine_get_feature_flags(text) to authenticated;

comment on table public.rootine_feature_flags is
  'B01 rollout flags. Environment defaults are false; account overrides are evaluated with auth.uid().';
comment on function public.rootine_get_feature_flags(text) is
  'Returns all normalized/notification flags with their source for the authenticated account.';
