-- Behavioral RLS checks for the legacy snapshot boundary. The fixture users are
-- synthetic UUIDs and the FK trigger is disabled only inside this rolled-back
-- pgTAP transaction; no auth.users rows or synthetic payloads survive the test.
begin;

select plan(13);

select set_config('session_replication_role', 'replica', true);
insert into public.rootine_workspace_snapshots (
  user_id, storage_key, payload, content_hash, revision
)
values
  ('00000000-0000-0000-0000-000000000001', 'b12-rls-fixture', '{"owner":"a"}'::jsonb, 'hash-a', 1),
  ('00000000-0000-0000-0000-000000000002', 'b12-rls-fixture', '{"owner":"b"}'::jsonb, 'hash-b', 1);

insert into public.rootine_sync_records (user_id, entity, entity_id, payload)
values
  ('00000000-0000-0000-0000-000000000001', 'task', 'b12-normalized-a', '{"owner":"a"}'::jsonb),
  ('00000000-0000-0000-0000-000000000002', 'task', 'b12-normalized-b', '{"owner":"b"}'::jsonb);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select is(
  (select count(*)::integer from public.rootine_workspace_snapshots where storage_key = 'b12-rls-fixture'),
  1,
  'authenticated user A sees only user A snapshot'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select is(
  (select count(*)::integer from public.rootine_workspace_snapshots where storage_key = 'b12-rls-fixture'),
  1,
  'authenticated user B sees only user B snapshot'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$insert into public.rootine_workspace_snapshots (user_id, storage_key, payload, content_hash)
    values ('00000000-0000-0000-0000-000000000001', 'b12-cross-user-write', '{}'::jsonb, 'hash-cross')$$,
  '42501',
  'authenticated cross-user direct insert is denied'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select * from public.rootine_apply_workspace_snapshot('b12-rls-cas', '{"owner":"a"}'::jsonb, 'hash-cas', 0)$$,
  'authenticated user A can use the compare-and-swap function'
);
select is(
  (select count(*)::integer from public.rootine_workspace_snapshots where storage_key = 'b12-rls-cas'),
  1,
  'CAS-created snapshot is visible to its owner'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select is(
  (select count(*)::integer from public.rootine_workspace_snapshots where storage_key = 'b12-rls-cas'),
  0,
  'CAS-created snapshot is hidden from the other user'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select is(
  (select count(*)::integer from public.rootine_sync_records where entity = 'task' and entity_id like 'b12-normalized-%'),
  1,
  'normalized records are scoped to authenticated user A'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select is(
  (select count(*)::integer from public.rootine_sync_records where entity = 'task' and entity_id like 'b12-normalized-%'),
  1,
  'normalized records are scoped to authenticated user B'
);

select throws_ok(
  $$insert into public.rootine_sync_records (user_id, entity, entity_id, payload)
    values ('00000000-0000-0000-0000-000000000001', 'task', 'b12-normalized-cross-user', '{}'::jsonb)$$,
  '42501',
  'authenticated clients cannot write normalized records directly'
);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is(
  (select count(*)::integer from public.rootine_workspace_snapshots where storage_key = 'b12-rls-fixture'),
  0,
  'anonymous users cannot read private snapshots'
);

select is(
  (select count(*)::integer from public.rootine_sync_records where entity_id like 'b12-normalized-%'),
  0,
  'anonymous users cannot read normalized records'
);

select throws_ok(
  $$insert into public.rootine_workspace_snapshots (user_id, storage_key, payload, content_hash)
    values ('00000000-0000-0000-0000-000000000001', 'b12-anon-write', '{}'::jsonb, 'hash-anon')$$,
  '42501',
  'anonymous users cannot write private snapshots'
);

select ok(
  not has_table_privilege('anon', 'public.rootine_workspace_snapshots', 'INSERT'),
  'anonymous role has no direct insert privilege'
);

select * from finish();
rollback;
