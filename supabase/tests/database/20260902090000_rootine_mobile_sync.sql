-- pgTAP contract checks for the B03 transport boundary.
--
-- Data-bearing idempotency/CAS scenarios require an auth.users fixture and
-- are exercised by the RPC integration suite in environments with Postgres.
-- These metadata checks keep the migration safe to run on a fresh database.
begin;

select plan(21);

select ok(
  to_regclass('public.rootine_sync_records') is not null,
  'B03 compatibility record seam exists'
);
select ok(
  to_regclass('public.rootine_sync_revisions') is not null,
  'revision history exists'
);
select ok(
  to_regprocedure('public.rootine_register_device(text,text,text,text,text)') is not null,
  'device registration RPC exists'
);
select ok(
  to_regprocedure('public.rootine_sync_bootstrap(text)') is not null,
  'bootstrap RPC exists'
);
select ok(
  to_regprocedure('public.rootine_sync_pull(bigint,integer,text)') is not null,
  'pull RPC exists'
);
select ok(
  to_regprocedure('public.rootine_sync_push(text,jsonb)') is not null,
  'push RPC exists'
);
select ok(
  has_table_privilege('authenticated', 'public.rootine_sync_changes', 'SELECT'),
  'authenticated can read the owner-scoped outbox'
);
select ok(
  not has_table_privilege('authenticated', 'public.rootine_sync_changes', 'INSERT'),
  'authenticated cannot append outbox rows directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.rootine_sync_operations', 'INSERT'),
  'authenticated cannot insert operation ledger rows directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.rootine_sync_records', 'UPDATE'),
  'authenticated cannot mutate compatibility records directly'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.rootine_sync_records'::regclass),
  'compatibility records have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.rootine_sync_operations'::regclass),
  'operation ledger has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.rootine_sync_cursors'::regclass),
  'cursor table has RLS enabled'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.rootine_sync_changes'::regclass
      and pg_get_constraintdef(oid) like '%operation%'
      and pg_get_constraintdef(oid) like '%upsert%'
      and pg_get_constraintdef(oid) like '%delete%'
  ),
  'outbox operation is constrained to upsert/delete'
);
select ok(
  exists (
    select 1
    from pg_index
    where indrelid = 'public.rootine_sync_operations'::regclass
      and indisunique
      and pg_get_indexdef(indexrelid) like '%operation_id%'
  ),
  'operation ID is unique for idempotency'
);
select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.rootine_sync_changes'::regclass
      and tgname = 'rootine_sync_changes_append_only'
  ),
  'outbox append-only guard exists'
);
select ok(
  pg_get_functiondef(to_regprocedure('public.rootine_sync_bootstrap(text)')) like '%limit 501%'
    and pg_get_functiondef(to_regprocedure('public.rootine_sync_bootstrap(text)')) like '%has_more%',
  'bootstrap is bounded and reports pagination'
);
select ok(
  pg_get_functiondef(to_regprocedure('public.rootine_sync_pull(bigint,integer,text)')) like '%limit requested_limit + 1%'
    and pg_get_functiondef(to_regprocedure('public.rootine_sync_pull(bigint,integer,text)')) like '%cursor_expired%',
  'pull is bounded and handles cursor expiry'
);
select ok(
  pg_get_functiondef(to_regprocedure('public.rootine_sync_push(text,jsonb)')) like '%already_applied%'
    and pg_get_functiondef(to_regprocedure('public.rootine_sync_push(text,jsonb)')) like '%server_revision%',
  'push contains idempotency and conflict paths'
);
select ok(
  pg_get_functiondef(to_regprocedure('public.rootine_sync_push(text,jsonb)')) like '%deleted_at%'
    and pg_get_functiondef(to_regprocedure('public.rootine_sync_push(text,jsonb)')) like '%rootine_sync_revisions%',
  'push records tombstones and revision history'
);
select ok(
  strpos(
    pg_get_functiondef(to_regprocedure('public.rootine_register_device(text,text,text,text,text)')),
    $$'contract_version', 3$$
  ) > 0,
  'five-argument registration RPC remains the v3 transport body after device registry migrations'
);

select * from finish();
rollback;
