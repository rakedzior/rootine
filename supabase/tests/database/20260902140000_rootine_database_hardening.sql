-- pgTAP checks for the additive B01-B12 database integration hardening.
-- Runtime retention behavior and cross-account delivery attempts belong in the
-- staging smoke gate, where disposable auth users can be provisioned safely.
begin;

select plan(12);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.rootine_devices'::regclass
      and conname = 'rootine_devices_device_id_format_check'
      and pg_get_constraintdef(oid) like '%ios_%'
      and not convalidated
  ),
  'device identity accepts only v3 ids or legacy UUID ids'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.rootine_devices'::regclass
      and conname = 'rootine_devices_push_token_shape_check'
  ),
  'APNs token shape is bounded at the database boundary'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.rootine_notification_jobs'::regclass
      and conname = 'rootine_notification_jobs_user_device_fk'
      and pg_get_constraintdef(oid) like '%(user_id, device_id)%'
  ),
  'targeted notification jobs retain composite device ownership'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.rootine_notification_deliveries'::regclass
      and tgname = 'rootine_notification_deliveries_device_owner'
      and not tgisinternal
  ),
  'delivery audit rows enforce device ownership'
);

select ok(
  to_regprocedure('public.rootine_validate_notification_delivery_device()') is not null,
  'delivery ownership trigger function exists'
);

select ok(
  to_regprocedure('public.rootine_sync_retention(interval)') is not null,
  'sync retention maintenance RPC exists'
);

select ok(
  has_function_privilege('service_role', 'public.rootine_sync_retention(interval)', 'EXECUTE'),
  'only the service role can execute sync retention maintenance'
);

select ok(
  not has_function_privilege('authenticated', 'public.rootine_sync_retention(interval)', 'EXECUTE'),
  'authenticated clients cannot execute sync retention maintenance'
);

select ok(
  to_regclass('public.rootine_sync_revisions_retention_idx') is not null,
  'revision history has a timestamp-leading retention index'
);

select ok(
  to_regclass('public.rootine_workspace_revisions_retention_idx') is not null,
  'workspace revision history has a timestamp-leading retention index'
);

select ok(
  to_regclass('public.rootine_snapshot_materializations_retention_idx') is not null,
  'terminal materialization ledgers have a retention index'
);

select ok(
  pg_get_functiondef(to_regprocedure('public.rootine_sync_retention(interval)')) like '%oldest_available_cursor%'
    and not (pg_get_functiondef(to_regprocedure('public.rootine_sync_retention(interval)')) like '%cursor_expired%'),
  'retention advances explicit cursor boundaries without embedding client errors'
);

select * from finish();
rollback;
