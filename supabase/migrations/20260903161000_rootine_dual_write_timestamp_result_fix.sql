-- `timezone('utc', now())` returns timestamp without time zone when given a
-- timestamptz. The dual-write bridge contract returns timestamptz, so its
-- RETURN QUERY branches must use the original now() value instead.

do $migration$
declare
  function_source text;
  original_source text;
begin
  select pg_get_functiondef(
    'public.rootine_dual_write_workspace_snapshot(text, jsonb, text, bigint, text, text, text, bigint)'::regprocedure
  ) into function_source;
  original_source := function_source;
  function_source := replace(function_source, 'timezone(''utc'', now())', 'now()');
  if function_source = original_source then
    raise exception 'Could not locate the dual-write timestamp expression.';
  end if;
  execute function_source;
end;
$migration$;
