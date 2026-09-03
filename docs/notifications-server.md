# Server notifications (tasks and habits)

This pipeline is the server half of the task/habit reminder contract. B10 may
schedule the same occurrence locally, but both paths use the same
`dedupe_key`. The server never sends a job that has passed `expires_at`.

## Database contract

- `rootine_notification_preferences` stores account opt-in, per-kind opt-in,
  profile timezone and quiet hours. `notifications_enabled=false` is the
  account kill switch; jobs remain available for audit/recovery.
- `rootine_notification_rules` belongs to exactly one `task` or `habit`. The
  trigger checks `user_id` ownership when B02's `tasks`/`habits` tables are
  present. This is intentionally conditional because B09/B10 can be merged
  after B11 without rewriting this migration.
- `rootine_notification_jobs` stores one occurrence and has a unique
  `(user_id, dedupe_key)`. B10 can call
  `rootine_enqueue_notification_job(...)`; updates/deletes should call
  `rootine_cancel_notification_jobs_for_entity(...)` or deactivate the rule.
- `rootine_notification_deliveries` stores only provider outcome metadata per
  `(job_id, device_id)`. It never stores notification payloads or APNs tokens.
- `rootine_notification_health` exposes aggregate queue lag/failure/expiry
  metrics for the scheduler and operations. Failed and expired terminal jobs
  create an operational alert row; the scheduler records an aggregate
  `outbox_lag` alert when the configured lag threshold is exceeded.

The scheduler calls:

1. `rootine_claim_notification_jobs(p_limit, p_lock_owner, p_job_id)`.
   `FOR UPDATE SKIP LOCKED` reserves jobs atomically; a stale processing lock
   is reclaimable after five minutes.
2. APNs for active `rootine_devices` rows with `authorized`, `provisional` or
   `ephemeral` permission, a non-null token, no revoke/delete marker, and a
   recent check-in (90 days). `unknown` and stale installations are never
   sent to.
3. `rootine_finalize_notification_job(...)`, which writes deliveries and
   applies exponential backoff (up to five attempts by default). A 410 or
   `Unregistered` response calls the owner-scoped
   `rootine_revoke_notification_device(device_id, user_id)` RPC.
4. `rootine_notification_retention('90 days')` for delivery history.

Quiet-hours claims are deferred to the next local quiet-hours end using the
preference timezone. DST conversion uses Postgres `AT TIME ZONE`, while the
occurrence's original `scheduled_for` and dedupe identity remain unchanged.

## Edge Functions

Deploy both functions:

```text
supabase functions deploy notifications-scheduler
supabase functions deploy notifications-apns
```

Configure these server-only secrets in Supabase Functions (never in the web
bundle, iOS app, or repository):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NOTIFICATIONS_WORKER_SECRET`
- `APNS_KEY_ID`
- `APNS_TEAM_ID`
- `APNS_BUNDLE_ID` (or `APNS_TOPIC`)
- `APNS_PRIVATE_KEY` (the Apple `.p8` key, with newlines preserved or escaped)
- optional `NOTIFICATIONS_ENABLED=false` kill switch
- optional `NOTIFICATIONS_LAG_ALERT_SECONDS` (default `300`)

The scheduler endpoint is `POST /functions/v1/notifications-scheduler` with
`x-notifications-worker-secret` and an optional JSON body such as
`{"limit":50}`. Configure Supabase Cron or an equivalent trusted cron to call
it once per minute. `notifications-apns` is a one-job endpoint for controlled
replay/testing and uses the same lock and provider code.

APNs environments come from B09's `rootine_devices.apns_environment` column:
`sandbox` uses `api.sandbox.push.apple.com`, and `production` uses
`api.push.apple.com`. Provider response mapping is:

| APNs result | Job behavior |
| --- | --- |
| 200 | `delivered` |
| 410 / `Unregistered` / `BadDeviceToken` | `unregistered`, revoke device, no retry |
| 408 / 425 / 429 / 5xx / network timeout | bounded retry with jittered exponential backoff |
| other 4xx | terminal `failed` |

The functions return stable, redacted errors. Logs contain aggregate health
metrics only; never log payloads, tokens, JWTs, private keys, or account data.

## Payload and deep-link boundary

The worker forwards only the APNs alert fields (`title`, `subtitle`, `body`,
`sound`, `badge`) and the optional `rootine_deep_link` custom key. Arbitrary
payload keys—including account IDs, access tokens, notes and financial or
health content—are stripped before the provider call. A deep link must match
the internal opaque-ID form
`rootine://notification/{task|habit}/{opaque-id}?date=YYYY-MM-DD`; external
URLs, free-form query parameters and user-derived dedupe keys are rejected.
The iOS delegate validates this envelope again before posting
`rootineNotificationDeepLinkDidReceive` to the app. The current shell may
subscribe to that event to select the relevant task/habit screen.

## Rollback and account deletion

Set `NOTIFICATIONS_ENABLED=false` before rollback. This prevents new claims and
provider calls but preserves jobs and delivery history. Account deletion is
handled by the existing `delete-account` function and the `ON DELETE CASCADE`
foreign keys remove preferences, rules, jobs, deliveries, alerts and device
rows together.
