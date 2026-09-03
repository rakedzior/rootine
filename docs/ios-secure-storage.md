---
title: iOS secure local storage
---

# iOS secure local storage

This is the Step 19 boundary for the native app. It protects local account
data without changing the workspace or sync model.

## What is stored where

- Session access/refresh tokens are stored only in the Keychain. Items are
  `ThisDeviceOnly`, are not synchronizable through iCloud Keychain, and are
  discarded when their JSON or required fields are invalid.
- The installation/device identifier is a separate Keychain item. A valid
  `ios_<lowercase UUIDv4>` value survives logout and reinstall so APNs device
  registration remains stable. A legacy bare UUID is accepted during the
  existing server migration; malformed values are replaced.
- Workspace snapshots, pending mutations, canonical shadows, normalized read
  state, recovery copies, cursors, operation logs, and conflicts live under
  Application Support in account-scoped directories. Normal UUID account IDs
  retain their existing directory component so an upgrade cannot strand an
  offline cache; unsafe IDs are sanitized and receive a stable hash suffix.
- Files and their containing directories use iOS Data Protection
  (`completeUntilFirstUserAuthentication`). Atomic replacement reapplies the
  attribute to the new inode.
- Notification preferences and rollout flags are small UserDefaults values
  keyed by a one-way account/environment namespace. They never contain
  tokens or workspace records.

## Lifecycle and recovery

Logout clears the Keychain session, stops realtime/background work, purges the
shared URL cache, cancels only the current account's local notifications, and
clears in-memory workspace state. Account workspace files remain available for
the next authenticated login; use “Usuń dane lokalne i wyloguj” to remove the
current account's local files as well. Device identity intentionally remains so
the installation can be re-registered without creating a duplicate device.

Account switching creates a fresh account-scoped store and reloads that
account's preferences. It cannot address another account's files by path;
new preference and notification namespaces are one-way SHA-256 values. Legacy
raw UserDefaults keys are read as a compatibility fallback and retained
read-only; new writes never add more raw-key data.

Malformed workspace and operation/conflict cache files are quarantined inside
the protected account container and the active cache starts empty. A malformed
cursor is deleted and reported so the sync layer can perform a controlled
bootstrap. Recovery diagnostics are support-only and are never accepted as an
import source. Recovery archives are written before an import and the existing
batch transaction restores both workspace files and the pending queue after an
interrupted import.

Authenticated HTTP requests use an ephemeral, cookie-free `URLSession`,
`no-store`/`no-cache` headers, and ignore the URL cache. Notification request metadata contains only a one-way occurrence
fingerprint; account IDs, entity IDs, task text, and raw dedupe keys are not
persisted in OS notification metadata. Lock-screen task/habit details remain
opt-in and default to generic copy.

## Explicit omissions

Step 19 does not add a biometric/app lock. It would change the launch and
recovery UX and requires product approval. It also does not introduce an
irreversible migration: legacy device IDs and UserDefaults values remain
readable, normal UUID storage paths remain compatible, and malformed data is
quarantined or reset rather than silently rewritten.

The existing authenticated account-delete transport remains available to the
account service but is not invoked by local logout/data deletion. A destructive
server-account deletion flow needs explicit confirmation and product approval.
