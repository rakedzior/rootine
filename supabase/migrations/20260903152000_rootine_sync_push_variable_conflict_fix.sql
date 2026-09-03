-- The push function has a local operation_id variable and SQL references to
-- operation_id. Recompile its existing definition with PostgreSQL's
-- column-preferred PL/pgSQL conflict policy so INSERT ... RETURNING and
-- related statements cannot be rejected as ambiguous (42702). A DO block
-- preserves the exact current function body while adding only the compiler
-- directive; migration roles cannot ALTER this GUC directly.

do $migration$
declare
  function_source text;
  original_source text;
begin
  select pg_get_functiondef('public.rootine_sync_push(text, jsonb)'::regprocedure)
    into function_source;
  original_source := function_source;
  function_source := replace(
    function_source,
    'AS $function$',
    'AS $function$' || chr(10) || '#variable_conflict use_column' || chr(10)
  );
  if function_source = original_source then
    raise exception 'Could not locate the PL/pgSQL function body for sync push.';
  end if;
  execute function_source;
end;
$migration$;
