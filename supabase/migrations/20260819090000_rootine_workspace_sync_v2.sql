-- Cross-device synchronization contract for web and future native clients.
--
-- Writes are compare-and-swap operations. A client may update a workspace only
-- when the revision it last read is still current. Concurrent edits therefore
-- become an explicit conflict instead of a silent last-writer-wins overwrite.

create or replace function public.rootine_apply_workspace_snapshot(
  p_storage_key text,
  p_payload jsonb,
  p_content_hash text,
  p_expected_revision bigint
)
returns table (
  applied boolean,
  storage_key text,
  payload jsonb,
  content_hash text,
  revision bigint,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_row public.rootine_workspace_snapshots%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if p_storage_key is null or char_length(p_storage_key) not between 1 and 180 then
    raise exception 'Invalid storage key.' using errcode = '22023';
  end if;

  if p_payload is null then
    raise exception 'Payload is required.' using errcode = '22023';
  end if;

  if p_content_hash is null or char_length(p_content_hash) not between 1 and 160 then
    raise exception 'Invalid content hash.' using errcode = '22023';
  end if;

  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'Expected revision cannot be negative.' using errcode = '22023';
  end if;

  if p_expected_revision = 0 then
    insert into public.rootine_workspace_snapshots as snapshots (
      user_id,
      storage_key,
      payload,
      content_hash,
      revision,
      updated_at
    )
    values (
      current_user_id,
      p_storage_key,
      p_payload,
      p_content_hash,
      1,
      timezone('utc', now())
    )
    on conflict (user_id, storage_key) do nothing
    returning snapshots.* into current_row;

    if found then
      return query select
        true,
        current_row.storage_key,
        current_row.payload,
        current_row.content_hash,
        current_row.revision,
        current_row.updated_at;
      return;
    end if;
  else
    update public.rootine_workspace_snapshots as snapshots
    set
      payload = p_payload,
      content_hash = p_content_hash,
      updated_at = timezone('utc', now())
    where snapshots.user_id = current_user_id
      and snapshots.storage_key = p_storage_key
      and snapshots.revision = p_expected_revision
    returning snapshots.* into current_row;

    if found then
      return query select
        true,
        current_row.storage_key,
        current_row.payload,
        current_row.content_hash,
        current_row.revision,
        current_row.updated_at;
      return;
    end if;
  end if;

  select snapshots.*
  into current_row
  from public.rootine_workspace_snapshots as snapshots
  where snapshots.user_id = current_user_id
    and snapshots.storage_key = p_storage_key;

  if not found then
    -- The row disappeared between the failed write and the conflict read.
    -- Returning revision zero lets the client retry this as a create.
    return query select
      false,
      p_storage_key,
      '{}'::jsonb,
      '',
      0::bigint,
      timezone('utc', now());
    return;
  end if;

  return query select
    false,
    current_row.storage_key,
    current_row.payload,
    current_row.content_hash,
    current_row.revision,
    current_row.updated_at;
end;
$$;

revoke all on function public.rootine_apply_workspace_snapshot(text, jsonb, text, bigint) from public;
grant execute on function public.rootine_apply_workspace_snapshot(text, jsonb, text, bigint) to authenticated;

-- All writes must pass through the compare-and-swap function above. Keeping
-- direct SELECT access preserves hydration and Realtime while closing the
-- last-writer-wins path exposed by the first migration.
revoke insert, update, delete on table public.rootine_workspace_snapshots from authenticated;

-- Supabase Realtime uses this publication. The guarded block is safe both on
-- hosted Supabase and in environments where the publication is absent.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.rootine_workspace_snapshots;
    exception
      when duplicate_object then null;
    end;
  end if;
end;
$$;

comment on function public.rootine_apply_workspace_snapshot(text, jsonb, text, bigint) is
  'Atomically creates or updates one Rootine workspace when the expected revision is current.';
