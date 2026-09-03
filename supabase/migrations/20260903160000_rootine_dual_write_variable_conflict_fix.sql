-- The dual-write bridge exposes `operation_id` as an OUT column and also
-- queries rootine_sync_operations.operation_id. PostgreSQL otherwise raises
-- 42702 when the function is called because the identifier is ambiguous.
-- Recompile the existing function with column precedence; every intentional
-- local value is already carried by a named variable (uid/op_id/source).

do $migration$
declare
  function_source text;
  original_source text;
begin
  select pg_get_functiondef(
    'public.rootine_dual_write_workspace_snapshot(text, jsonb, text, bigint, text, text, text, bigint)'::regprocedure
  ) into function_source;
  original_source := function_source;
  function_source := replace(
    function_source,
    'AS $function$',
    'AS $function$' || chr(10) || '#variable_conflict use_column' || chr(10)
  );
  if function_source = original_source then
    raise exception 'Could not locate the dual-write bridge function body.';
  end if;
  execute function_source;
end;
$migration$;
