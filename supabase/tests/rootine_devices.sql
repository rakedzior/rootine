-- B09 contract checks. Run with `supabase test db` after the migrations.
-- Runtime cross-user calls should additionally be exercised by the staging
-- smoke suite with two authenticated JWTs; this file stays data-free and
-- never creates test users or APNs credentials.
-- The compatibility assertions at the end model the B02/B11 schema: the
-- worker token column is push_token and, when present, B03's five-argument
-- function remains a jsonb contract. B09 intentionally does not create or
-- replace that earlier dependency.

begin;
select plan(19);

select has_table('public', 'rootine_devices', 'device registry table exists');
select has_column('public', 'rootine_devices', 'id', 'B02 device id primary key is retained');
select has_column('public', 'rootine_devices', 'device_id', 'device id is present');
select has_column('public', 'rootine_devices', 'app_version', 'app version is present');
select has_column('public', 'rootine_devices', 'apns_environment', 'APNs environment is present');
select has_column('public', 'rootine_devices', 'push_token', 'B02/B11 push token column is retained');
select ok(
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'rootine_devices'
      and column_name = 'apns_token'
  ),
  'B09 does not introduce a parallel apns_token column'
);
select has_column('public', 'rootine_devices', 'permission_state', 'permission state is present');
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.rootine_devices'::regclass
      and conname = 'rootine_devices_permission_state_check'
      and pg_get_constraintdef(oid) like '%ephemeral%'
      and pg_get_constraintdef(oid) like '%restricted%'
  ),
  'B11 permission states are extended without dropping restricted compatibility'
);
select has_column('public', 'rootine_devices', 'last_seen_at', 'last seen timestamp is present');
select has_column('public', 'rootine_devices', 'revoked_at', 'revoke timestamp is present');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.rootine_devices'::regclass),
  'device table has RLS enabled'
);
select ok(
  not has_table_privilege('authenticated', 'public.rootine_devices', 'SELECT'),
  'authenticated clients cannot select APNs tokens'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.rootine_register_device(text,text,text,text,text,text)',
    'EXECUTE'
  ),
  'authenticated clients can execute six-argument registration RPC'
);
select ok(
  to_regprocedure('public.rootine_register_device(text,text,text,text,text)') is null
    or pg_get_function_result(to_regprocedure('public.rootine_register_device(text,text,text,text,text)')) = 'jsonb',
  'B09 leaves the B03 five-argument jsonb RPC unchanged when present'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.rootine_revoke_device(text,text)',
    'EXECUTE'
  ),
  'authenticated clients can execute revoke RPC'
);
select ok(
  not has_table_privilege('authenticated', 'public.rootine_active_devices', 'SELECT'),
  'authenticated clients cannot select worker view'
);
select has_column('public', 'rootine_active_devices', 'push_token', 'worker view reads B11 push_token');
select ok(
  to_regprocedure('public.rootine_revoke_notification_device(text)') is not null,
  'B11 notification revoke RPC remains available to the worker'
);

select * from finish();
rollback;
