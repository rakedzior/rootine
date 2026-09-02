-- pgTAP contract tests for the B04 boundary. These tests are metadata-only so
-- they can run on a clean database without creating auth users or snapshots.
begin;

select plan(11);

select ok(
  to_regclass('public.rootine_workspace_backfill_records') is not null,
  'deterministic adapter records table exists'
);
select ok(
  to_regclass('public.rootine_workspace_snapshot_materializations') is not null,
  'generated snapshot materialization ledger exists'
);
select ok(
  to_regclass('public.rootine_workspace_revisions') is not null
    and to_regclass('public.rootine_migration_quarantine') is not null
    and to_regclass('public.rootine_sync_reconciliation_log') is not null,
  'B04 reuses the B02 revision, quarantine and reconciliation tables'
);
select is(
  (select count(*)::integer
   from information_schema.columns
   where table_schema = 'public'
     and table_name = 'rootine_workspace_backfill_records'
     and column_name = any (array['user_id', 'storage_key', 'source_revision', 'adapter_version', 'entity', 'entity_id', 'source_path', 'payload', 'deleted_at', 'run_id'])),
  10,
  'record boundary exposes ownership, identity, tombstone and source provenance'
);
select is(
  (select count(*)::integer
   from information_schema.columns
   where table_schema = 'public'
     and table_name = 'rootine_workspace_revisions'
     and column_name = any (array['adapter_version', 'source_content_hash', 'canonical_hash', 'canonical_payload', 'record_count', 'quarantined_count', 'status', 'run_id', 'committed_at'])),
  9,
  'revision manifest columns are additive to B02'
);
select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'rootine_workspace_revisions'
      and column_name = 'status'
      and column_default like '%migrated%'
  ),
  'B04 revision status is present on the merged B02 table'
);
select is(
  (select count(*)::integer
   from information_schema.columns
   where table_schema = 'public'
     and table_name = 'rootine_migration_quarantine'
     and column_name = any (array['run_id', 'source_revision', 'adapter_version', 'record_id', 'source_path', 'details', 'resolved_at'])),
  7,
  'quarantine preserves record id, reason path and resolution state'
);
select ok(
  to_regprocedure('public.rootine_backfill_commit(uuid,text,bigint,integer,text,text,jsonb,jsonb,jsonb,jsonb,text,text,jsonb)') is not null,
  'relational commit RPC has an explicit versioned boundary'
);
select ok(
  to_regprocedure('public.rootine_materialize_legacy_snapshot(uuid,text,bigint,integer)') is not null,
  'materialization RPC exists separately from relational commit'
);
select ok(
  not has_table_privilege('authenticated', 'public.rootine_workspace_backfill_records', 'INSERT')
    and not has_table_privilege('authenticated', 'public.rootine_workspace_snapshot_materializations', 'UPDATE'),
  'authenticated clients cannot mutate backfill or generated snapshots directly'
);
select ok(
  to_regclass('public.rootine_workspace_snapshots') is not null
    and not exists (
      select 1
      from pg_trigger
      where tgrelid = 'public.rootine_workspace_snapshots'::regclass
        and tgname like 'rootine_backfill%'
    ),
  'legacy source table remains present and has no destructive B04 trigger'
);

select * from finish();
rollback;
