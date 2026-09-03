# Rootine diagnostics and support runbook

This boundary is intentionally vendor-neutral. Web, Edge Functions and iOS
record the same small set of technical outcomes and aggregate health counters;
they do not select a telemetry vendor, network destination, alerting system or
account-level analytics profile.

## Data boundary

- Events are allow-listed (`auth_outcome`, `sync_operation`,
  `realtime_health`, `qr_scan`, `notification_delivery`,
  `materializer_quarantine`, `device_health`, `crash`, `support_export`).
- Only technical status, stable error classes, bounded durations, correlation
  IDs, operation IDs and bounded counts are retained. Payloads, workspace
  records, auth headers, access tokens, APNs tokens, barcode values, QR text,
  notification content and free-form notes are excluded.
- Each event is capped at 4 KiB; an in-process ring keeps at most 64 events and
  a support export is capped at 64 KiB. A sink is optional and disabled unless
  an adapter explicitly opts in (`ROOTINE_DIAGNOSTICS_LOGGING=true` only emits
  the already-redacted event to the host logger).
- iOS exposes `AppEnvironment.exportDiagnostics()` and the web boundary
  exposes `rootineObservability.exportDiagnostics()`. The export is a support
  artifact, not an automatic upload.

## Health signals

| Signal | Counter examples | First owner | Suggested review trigger |
| --- | --- | --- | --- |
| Auth | `auth_success`, `auth_failure` | client owner | failure rate changes after a release |
| Sync | pull/push success/failure, retry, conflict, cursor expiry, unauthorized | sync owner | repeated retries, cursor expiry, or conflict on the same operation |
| Realtime | connected, reconnect, failure | mobile owner | reconnect loop or sustained degraded status |
| QR/barcode | detected, success, failure | nutrition owner | scan failures reproduce on supported camera devices |
| APNs/device | delivery, retry, unregistered, registration failure | notifications owner | unregistered spike or delivery backlog |
| Materializer/crash | quarantine and captured crash counters | backend/mobile owner | any new quarantine class or crash regression |

These are starting review thresholds, not production alert policies. A release
owner should select concrete thresholds and an approved destination before
enabling an operational sink.

## Incident workflow

1. Ask the user for the support export and the approximate time of the issue.
   Never ask them to paste a token, QR value, notification body or workspace
   record.
2. Use the support ID and any correlation/operation IDs to compare one client
   operation with the redacted Edge log. Search by stable outcome/error class,
   not by payload text.
3. For sync degradation, preserve the local queue and recovery copies. Check
   authorization, cursor expiry, retry and conflict counters before retrying.
4. For notifications, check aggregate delivery/unregistered/retry counters and
   the existing notification health view. Do not inspect or export APNs tokens.
5. If rollback is required, first disable `normalized_read_enabled`, then
   `normalized_sync_enabled`. For notification incidents disable the existing
   `notifications_enabled` flag or set `NOTIFICATIONS_ENABLED=false`; neither
   action deletes local data or the sync queue.
6. Record the release, environment, support ID, stable error class and chosen
   rollback flag in the approved incident system once one is provided.

## Explicit omissions

This implementation does not choose a production telemetry/crash vendor,
define legal consent or privacy notice text, set a retention period, configure
an external alert destination, assign on-call escalation, or store diagnostics
outside the process/support export. Those decisions require product, legal,
security and operations owners before production activation.
