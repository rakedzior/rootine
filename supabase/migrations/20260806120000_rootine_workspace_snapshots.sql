-- Rootine stores each existing local workspace as one JSON document. Keeping the
-- document boundary intact lets the browser keep its current domain model while
-- Supabase becomes the durable, per-user source of truth.
create table if not exists public.rootine_workspace_snapshots (
  user_id uuid not null references auth.users (id) on delete cascade,
  storage_key text not null check (char_length(storage_key) between 1 and 180),
  payload jsonb not null,
  content_hash text not null check (char_length(content_hash) between 1 and 160),
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, storage_key)
);

comment on table public.rootine_workspace_snapshots is
  'Per-user Rootine workspace and preference snapshots synchronized from the browser.';

create index if not exists rootine_workspace_snapshots_user_updated_idx
  on public.rootine_workspace_snapshots (user_id, updated_at desc);

alter table public.rootine_workspace_snapshots enable row level security;

revoke all on table public.rootine_workspace_snapshots from anon;
grant select, insert, update, delete on table public.rootine_workspace_snapshots to authenticated;

drop policy if exists "Users can read their own Rootine snapshots" on public.rootine_workspace_snapshots;
create policy "Users can read their own Rootine snapshots"
  on public.rootine_workspace_snapshots
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own Rootine snapshots" on public.rootine_workspace_snapshots;
create policy "Users can create their own Rootine snapshots"
  on public.rootine_workspace_snapshots
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own Rootine snapshots" on public.rootine_workspace_snapshots;
create policy "Users can update their own Rootine snapshots"
  on public.rootine_workspace_snapshots
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own Rootine snapshots" on public.rootine_workspace_snapshots;
create policy "Users can delete their own Rootine snapshots"
  on public.rootine_workspace_snapshots
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.rootine_workspace_snapshots_bump_revision()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.revision := old.revision + 1;
  return new;
end;
$$;

drop trigger if exists rootine_workspace_snapshots_revision on public.rootine_workspace_snapshots;
create trigger rootine_workspace_snapshots_revision
  before update on public.rootine_workspace_snapshots
  for each row
  execute function public.rootine_workspace_snapshots_bump_revision();
