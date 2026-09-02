-- B09 contract checks. Run with `supabase test db` after the migrations.
-- Runtime cross-user calls should additionally be exercised by the staging
-- smoke suite with two authenticated JWTs; this file stays data-free and
-- never creates test users or APNs credentials.

begin;
select plan(11);

select has_table('public', 'rootine_devices', 'device registry table exists');
select has_column('public', 'rootine_devices', 'device_id', 'device id is present');
select has_column('public', 'rootine_devices', 'app_version', 'app version is present');
select has_column('public', 'rootine_devices', 'apns_environment', 'APNs environment is present');
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

select * from finish();
rollback;
