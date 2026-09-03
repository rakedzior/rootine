-- With variable-precedence compilation, the operation_id token in the
-- ON CONFLICT target is interpreted as the local variable. Use the existing
-- named unique constraint instead, keeping all comparisons with the local
-- operation ID intact and preserving atomic idempotency.

do $migration$
declare
  function_source text;
begin
  select pg_get_functiondef('public.rootine_sync_push(text, jsonb)'::regprocedure)
    into function_source;
  if position('on conflict (user_id, operation_id) do nothing' in lower(function_source)) = 0 then
    raise exception 'Expected sync push conflict target was not found.';
  end if;
  function_source := regexp_replace(
    function_source,
    'on conflict \(user_id, operation_id\) do nothing',
    'on conflict on constraint rootine_sync_operations_user_id_operation_id_key do nothing',
    1,
    1,
    'i'
  );
  execute function_source;
end;
$migration$;
