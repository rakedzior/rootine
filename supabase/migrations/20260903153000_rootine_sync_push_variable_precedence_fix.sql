-- The first conflict fix used column precedence, which made an ambiguous
-- comparison such as operations.operation_id = operation_id compare the
-- column to itself. The push implementation intentionally uses its local
-- operation_id value on the right-hand side, so recompile it with variable
-- precedence while retaining the exact deployed function body.

do $migration$
declare
  function_source text;
begin
  select pg_get_functiondef('public.rootine_sync_push(text, jsonb)'::regprocedure)
    into function_source;
  if position('#variable_conflict use_column' in function_source) = 0 then
    raise exception 'Expected column-precedence sync push definition was not found.';
  end if;
  function_source := replace(function_source, '#variable_conflict use_column', '#variable_conflict use_variable');
  execute function_source;
end;
$migration$;
