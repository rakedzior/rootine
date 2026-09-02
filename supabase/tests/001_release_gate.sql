-- B12 release-gate assertions for the currently shipped snapshot/CAS layer.
--
-- These tests intentionally inspect grants and policies through pg_catalog. The
-- test role must not be able to bypass RLS, and no private fixture payloads are
-- inserted into the database. The normalized B02/B03 contract is asserted by
-- 002_sync_v3_contract.sql in the same `supabase test db` invocation.
begin;

select plan(12);

select ok(
  to_regclass('public.rootine_workspace_snapshots') is not null,
  'workspace snapshot table exists'
);

select ok(
  exists (
    select 1
    from pg_class
    where oid = 'public.rootine_workspace_snapshots'::regclass
      and relrowsecurity
  ),
  'workspace snapshot table has RLS enabled'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.rootine_workspace_snapshots'::regclass
      and contype = 'p'
      and pg_get_constraintdef(oid) like '%(user_id, storage_key)%'
  ),
  'snapshot ownership and storage key form the primary key'
);

select ok(
  to_regclass('public.rootine_workspace_snapshots_user_updated_idx') is not null,
  'snapshot pull index exists'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'rootine_workspace_snapshots'
      and policyname = 'Users can read their own Rootine snapshots'
      and roles = array['authenticated']::name[]
      and qual::text like '%auth.uid%'
  ),
  'authenticated reads are scoped to auth.uid'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'rootine_workspace_snapshots'
      and policyname = 'Users can create their own Rootine snapshots'
      and with_check::text like '%auth.uid%'
  ),
  'authenticated inserts are scoped to auth.uid'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'rootine_workspace_snapshots'
      and policyname = 'Users can update their own Rootine snapshots'
      and qual::text like '%auth.uid%'
      and with_check::text like '%auth.uid%'
  ),
  'authenticated updates are scoped to auth.uid'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'rootine_workspace_snapshots'
      and policyname = 'Users can delete their own Rootine snapshots'
      and qual::text like '%auth.uid%'
  ),
  'authenticated deletes are scoped to auth.uid'
);

select ok(
  to_regprocedure('public.rootine_apply_workspace_snapshot(text,jsonb,text,bigint)') is not null,
  'compare-and-swap function exists'
);

select ok(
  exists (
    select 1
    from information_schema.routine_privileges
    where specific_schema = 'public'
      and routine_name = 'rootine_apply_workspace_snapshot'
      and grantee = 'authenticated'
      and privilege_type = 'EXECUTE'
  ),
  'authenticated can execute the compare-and-swap function'
);

select ok(
  not exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'rootine_workspace_snapshots'
      and grantee = 'authenticated'
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
  ),
  'authenticated direct writes are revoked'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.rootine_workspace_snapshots'::regclass
      and tgname = 'rootine_workspace_snapshots_revision'
      and not tgisinternal
  ),
  'snapshot revision trigger exists'
);

select * from finish();
rollback;
