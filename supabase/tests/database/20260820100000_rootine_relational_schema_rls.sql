-- pgTAP contract tests for the normalized schema.  They are intentionally
-- metadata-focused: data-bearing cross-user scenarios belong to B03 RPC tests
-- so this file can run on a freshly reset database without seed users.
begin;

select plan(12);

select is(
  (select count(*)::integer
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and c.relname = any (array[
       'rootine_profiles', 'rootine_devices', 'rootine_sync_cursors',
       'rootine_sync_operations', 'rootine_sync_changes',
       'rootine_workspace_revisions', 'rootine_workspace_snapshots_legacy',
       'rootine_migration_quarantine', 'rootine_sync_reconciliation_log',
       'tasks', 'task_lists', 'task_tags', 'task_tag_links', 'task_schedules',
       'task_completions', 'task_comments', 'task_summary_notes', 'habits',
       'habit_schedules', 'habit_completions', 'habit_pause_periods',
       'note_lists', 'notes', 'note_tags', 'note_tag_links',
       'note_checklist_items', 'nutrition_days', 'nutrition_entries',
       'nutrition_goals', 'nutrition_profiles', 'nutrition_weight_measurements',
       'nutrition_custom_meals', 'nutrition_custom_meal_ingredients',
       'sport_exercises', 'sport_templates', 'sport_template_sections',
       'sport_template_items', 'sport_cycles', 'sport_cycle_workouts',
       'sport_sessions', 'sport_session_sets', 'sport_history', 'sport_outcomes',
       'goal_categories', 'goals', 'goal_milestones', 'goal_progress_entries',
       'goal_notes', 'work_companies', 'work_projects', 'work_tasks',
       'work_focus_sessions', 'trips', 'trip_itinerary_items', 'trip_bookings',
       'trip_budget_items', 'trip_documents', 'trip_packing_items',
       'health_checkins', 'health_reminders', 'health_visits', 'health_tests',
       'health_prescriptions', 'health_vaccinations', 'affair_matters',
       'payments', 'subscriptions', 'documents', 'vehicles',
       'vehicle_service_items', 'jdg_periods', 'jdg_checklist_items'
     ])
  ),
  72,
  'all infrastructure and domain tables exist'
);

select is(
  (select count(*)::integer
   from information_schema.columns
   where table_schema = 'public'
     and table_name in (
       'tasks', 'habits', 'notes', 'nutrition_days', 'sport_sessions', 'goals',
       'work_projects', 'trips', 'health_checkins', 'affair_matters',
       'payments', 'documents', 'vehicles', 'jdg_periods'
     )
     and column_name in ('id', 'user_id', 'created_at', 'updated_at', 'deleted_at', 'revision')
  ),
  90,
  'domain tables expose the common ownership and sync columns'
);

select is(
  (select count(*)::integer
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname in (
       'rootine_profiles', 'rootine_devices', 'rootine_sync_cursors',
       'rootine_sync_operations', 'rootine_sync_changes',
       'rootine_workspace_revisions', 'rootine_workspace_snapshots_legacy',
       'rootine_migration_quarantine', 'rootine_sync_reconciliation_log',
       'tasks', 'task_lists', 'task_tags', 'task_tag_links', 'task_schedules',
       'task_completions', 'task_comments', 'task_summary_notes', 'habits',
       'habit_schedules', 'habit_completions', 'habit_pause_periods',
       'note_lists', 'notes', 'note_tags', 'note_tag_links',
       'note_checklist_items', 'nutrition_days', 'nutrition_entries',
       'nutrition_goals', 'nutrition_profiles', 'nutrition_weight_measurements',
       'nutrition_custom_meals', 'nutrition_custom_meal_ingredients',
       'sport_exercises', 'sport_templates', 'sport_template_sections',
       'sport_template_items', 'sport_cycles', 'sport_cycle_workouts',
       'sport_sessions', 'sport_session_sets', 'sport_history', 'sport_outcomes',
       'goal_categories', 'goals', 'goal_milestones', 'goal_progress_entries',
       'goal_notes', 'work_companies', 'work_projects', 'work_tasks',
       'work_focus_sessions', 'trips', 'trip_itinerary_items', 'trip_bookings',
       'trip_budget_items', 'trip_documents', 'trip_packing_items',
       'health_checkins', 'health_reminders', 'health_visits', 'health_tests',
       'health_prescriptions', 'health_vaccinations', 'affair_matters',
       'payments', 'subscriptions', 'documents', 'vehicles',
       'vehicle_service_items', 'jdg_periods', 'jdg_checklist_items'
     )
     and c.relrowsecurity
  ),
  72,
  'RLS is enabled for every private table'
);

select is(
  (select count(*)::integer
   from pg_policies
   where schemaname = 'public'
     and policyname like '%_select'
     and tablename <> 'rootine_sync_changes'
  ),
  71,
  'every private table has an authenticated owner-scoped read policy'
);

select is(
  (select count(*)::integer
   from pg_constraint
   where connamespace = 'public'::regnamespace
     and contype = 'f'
     and pg_get_constraintdef(oid) like '%(user_id, %'
  ),
  47,
  'relation foreign keys include user ownership in their key'
);

select ok(
  not has_table_privilege('authenticated', 'public.tasks', 'INSERT'),
  'authenticated cannot directly insert domain rows'
);
select ok(
  not has_table_privilege('authenticated', 'public.tasks', 'UPDATE'),
  'authenticated cannot directly update domain rows'
);
select ok(
  not has_table_privilege('authenticated', 'public.tasks', 'DELETE'),
  'authenticated cannot directly delete domain rows'
);

select ok(
  has_table_privilege('authenticated', 'public.tasks', 'SELECT'),
  'authenticated can read through RLS'
);
select ok(
  has_table_privilege('authenticated', 'public.rootine_sync_changes', 'SELECT'),
  'authenticated can read the own-user outbox through RLS'
);
select ok(
  to_regclass('public.rootine_sync_cursor_bounds') is not null,
  'cursor bounds expose the oldest and latest available cursor'
);
select ok(
  to_regprocedure('public.rootine_apply_workspace_snapshot(text,jsonb,text,bigint)') is not null,
  'legacy CAS function remains available'
);

select * from finish();
rollback;
