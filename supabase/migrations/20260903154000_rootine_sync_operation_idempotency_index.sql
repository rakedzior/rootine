-- Existing installations may already contain rootine_sync_operations from a
-- legacy migration. CREATE TABLE IF NOT EXISTS does not add constraints to
-- that table, but sync push relies on this conflict target for atomic
-- idempotency. The index is additive and also backs the existing contract.

create unique index if not exists rootine_sync_operations_user_operation_uidx
  on public.rootine_sync_operations (user_id, operation_id);

