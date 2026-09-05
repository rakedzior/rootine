# Rootine iOS

Native SwiftUI foundation for the Rootine MVP. The project targets iOS 26.0+ and Swift 6.2 for Xcode 26.3.

## Open on the Mac

1. Copy `Rootine/Config/Secrets.xcconfig.example` to `Rootine/Config/Secrets.xcconfig`.
2. Fill in values for the selected environment; never add a service-role key.
3. Select the matching `Development`, `Staging`, or `Production` build configuration in Xcode (each is explicitly bound to its xcconfig; all rollout flags default to `NO`).
4. Open `Rootine/Rootine.xcodeproj` in Xcode 26.3.
5. Select the `Rootine` scheme and the installed iOS 26.x simulator runtime. The current verified simulator destination is iPhone 17 Pro on iOS 26.3; the physical iPhone target remains unchanged.

`Secrets.xcconfig` is ignored by Git. Never put a service-role key in an iOS build.

The shared `Rootine` scheme runs/tests with `Development` and archives with
`Production`. CI builds all three named configurations explicitly; use
`-configuration Staging` for a staging build. The legacy `Debug` and `Release`
names remain as compatibility aliases for development and production.

## What this stage contains

- Xcode target and the native five-tab navigation contract: Today, Tasks,
  Calendar, Nutrition, and More.
- Dark semantic design tokens and native navigation patterns.
- `Codable` models for tasks, nutrition, notes, normalized products, and sync payloads.
- Atomic file persistence, Data Protection, Keychain session storage, and a persistent mutation queue.
- A complete native account entry flow: email sign-in and self-registration,
  confirmation resend, password recovery, Google OAuth through
  `ASWebAuthenticationSession`, and native Sign in with Apple.
- Session refresh, OAuth/recovery deep links, Keychain persistence, and explicit
  online/offline bootstrap states.
- Strict callback and Apple identity-token protocol validation, deterministic
  auth-client mocks, and account provider linking/unlinking with ownership and
  last-identity guards.
- An initial native `Dzisiaj` screen with day progress, timed queue, overdue
  attention, task/habit completion, nutrition totals, and notes activity.
- An initial native `Zadania` screen with smart-view filters, overdue and
  completed groups, task completion, and adding tasks with date/time/priority.
- Native task details with editing, soft-delete/restore, and a dedicated habit
  mode with daily/weekly/interval schedules, add/edit/delete/completion flows.
- A first functional calendar day view backed by the same task workspace and a
  global add action for tasks and habits.
- A native `Odżywianie` day view with calorie/macro progress, water tracking,
  meal sections, animated add-entry sheet, and swipe-to-delete entries.
- A native `Więcej` hub with animated module tiles, account/sync sheet, data
  export and recovery center, settings/help/legal surfaces, and functional
  Notes, Sport, Goals, Work, Travel, Health, and Pozostałe/Sprawy modules.
  Their Codable snapshots are persisted locally and queued through the same
  offline/CAS sync engine as the core tabs.
- Notes support local-first CRUD, archive, folders, checklists, pinning, and
  search/filter/sort. Native Notes intentionally does not implement binary
  attachment storage or a provider/upload contract; opaque web attachment
  descriptors remain preserved in the canonical shadow for later support.
  If normalized per-row revisions are unavailable, Notes falls back to the
  existing aggregate queue; the v1 aggregate contract has no local tombstone
  field, so normalized delete commands are preferred whenever CAS metadata is
  available.
- A nutrition quick-capture flow with a local product catalog, manual fallback,
  camera barcode scanning (when permission is granted), saved meals, weight
  measurements, editable goals, and undo-safe deletion.
- Foreground session refresh plus a dependency-free 30-second polling safety net
  that accepts newer remote revisions when there is no local pending edit;
  concurrent edits remain visible as conflicts instead of being overwritten.
- Contract tests that decode the exact fixtures used by the web client.

The compact Quick Add composer creates tasks and habits. Nutrition records are
created from the nutrition tab so meal, date, barcode, and macro context are
never lost. Server-side domain migrations can extend the same versioned models
without invalidating existing local snapshots.

## Account configuration

The native callback is `rootine://auth-callback`. Add that exact redirect URL to
the Supabase Auth allowlist. In `Development` and `Staging`, registration can
be exercised with clearly labelled local informational documents bundled in
the app. `Production` still keeps registration unavailable until real
`ROOTINE_TERMS_URL` and `ROOTINE_PRIVACY_URL` values are supplied; the app
never ships dead legal links. The local Development build also exposes a
test-account entry in the native sign-in screen; it uses deterministic preview
data only and never creates a server account.

The server is authoritative for `normalized_sync_enabled`,
`normalized_read_enabled`, and `notifications_enabled`. Bundle values are safe
defaults for bootstrapping and diagnostics only; account-scoped rollout is
documented in [`docs/staging-runbook.md`](../docs/staging-runbook.md).

Release validation is documented in [`docs/ios-release-gate.md`](../docs/ios-release-gate.md).
The local-storage boundary, account isolation, lifecycle cleanup, and explicit
security omissions are documented in [`docs/ios-secure-storage.md`](../docs/ios-secure-storage.md).
The protected workflow runs executable `xcodebuild test`, SQL/RLS and Edge
contract gates, then the isolated staging sync smoke before a TestFlight build.

## Today aggregation benchmark

Run the fixed 2,000-task XCTest benchmark on an available iOS Simulator:

```sh
./scripts/ios-today-aggregation-benchmark.sh
```

The runner explicitly selects `iphonesimulator`, builds the test bundle, runs
only `testLargeAccountAggregationIsMeasured`, and writes the full log and
`.xcresult` paths. Set `DESTINATION` to select another simulator and
`BENCHMARK_TIMEOUT_SECONDS` to bound a stalled CoreSimulator/testmanager run.
The Development configuration pins the iOS SDK so `TEST_HOST` resolves inside
`Development-iphonesimulator` instead of the non-existent macOS path.

Production Apple/Google credentials, provider-console settings, and redirect
allowlists are intentionally not committed or configured by this repository.
