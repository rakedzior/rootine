-- B02/B03 contract gate. These assertions intentionally fail until the
-- normalized schema and sync RPC migrations are integrated into this branch.
-- Keeping the contract here prevents a release from silently falling back to
-- legacy snapshots while the CI scaffolding is already present.
begin;

select plan(16);

select ok(to_regclass('public.rootine_profiles') is not null, 'normalized profile table exists');
select ok(to_regclass('public.rootine_devices') is not null, 'device registry table exists');
select ok(to_regclass('public.rootine_sync_cursors') is not null, 'sync cursor table exists');
select ok(to_regclass('public.rootine_sync_operations') is not null, 'sync operation idempotency table exists');
select ok(to_regclass('public.rootine_sync_changes') is not null, 'sync outbox table exists');
select ok(to_regclass('public.rootine_sync_records') is not null, 'sync compatibility record table exists');
select ok(to_regclass('public.rootine_workspace_revisions') is not null, 'workspace revision history exists');
select ok(to_regclass('public.rootine_migration_quarantine') is not null, 'migration quarantine exists');
select ok(to_regclass('public.rootine_sync_reconciliation_log') is not null, 'reconciliation log exists');

select ok(to_regprocedure('public.rootine_sync_bootstrap(text)') is not null, 'bootstrap RPC exists');
select ok(to_regprocedure('public.rootine_sync_pull(bigint,integer,text)') is not null, 'pull RPC exists');
select ok(to_regprocedure('public.rootine_sync_push(text,jsonb)') is not null, 'push RPC exists');
select ok(to_regprocedure('public.rootine_register_device(text,text,text,text,text)') is not null, 'device registration RPC exists');

select ok(
  exists (
    select 1
    from pg_class
    where relname = 'rootine_sync_changes'
      and relnamespace = 'public'::regnamespace
      and relrowsecurity
  ),
  'sync outbox has RLS enabled'
);

select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'rootine_sync_changes'
      and indexdef like '%user_id%'
  ),
  'sync outbox has a user ownership index'
);

select ok(
  exists (
    select 1
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'rootine_sync_push'
      and prosecdef
  ),
  'push RPC is a security-definer transaction boundary'
);

select * from finish();
rollback;
