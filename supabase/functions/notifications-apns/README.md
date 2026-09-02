# Notifications APNs worker

This is a protected one-job replay/diagnostic endpoint. It accepts
`POST {"job_id":"..."}` with `x-notifications-worker-secret`, claims that job
with the same atomic lock as the scheduler, sends to active B09 devices, and
finalizes the delivery/retry status.

Use `notifications-scheduler` for normal cron delivery. Configure APNs
credentials only as Supabase Function secrets; see
[`docs/notifications-server.md`](../../../docs/notifications-server.md).
