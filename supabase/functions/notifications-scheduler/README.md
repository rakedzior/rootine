# Notifications scheduler

Trusted cron calls this function once per minute with
`x-notifications-worker-secret`. It atomically claims due jobs through
`rootine_claim_notification_jobs`, delivers them through the shared APNs
provider, records redacted outcomes, and runs delivery retention.

The function uses the service-role key only in the server runtime. Configure
the secrets listed in [`docs/notifications-server.md`](../../../docs/notifications-server.md).
