-- The push function has a local operation_id variable and SQL references to
-- operation_id. Compile it with PostgreSQL's column-preferred PL/pgSQL
-- conflict policy so INSERT ... RETURNING and related statements cannot be
-- rejected as ambiguous (42702).

alter function public.rootine_sync_push(text, jsonb)
  set plpgsql.variable_conflict = 'use_column';

