# Rootine iOS

Native SwiftUI foundation for the Rootine MVP. The project targets iOS 26.0+ and Swift 6.2 for Xcode 26.3.

## Open on the Mac

1. Copy `Rootine/Config/Secrets.xcconfig.example` to `Rootine/Config/Secrets.xcconfig`.
2. Fill in the production Supabase URL, publishable key, and deployed web backend URL.
3. Open `Rootine/Rootine.xcodeproj` in Xcode 26.3.
4. Select the `Rootine` scheme and the installed iOS 26.x simulator runtime. The current verified simulator destination is iPhone 17 Pro on iOS 26.3; the physical iPhone target remains unchanged.

`Secrets.xcconfig` is ignored by Git. Never put a service-role key in an iOS build.

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
- A native `Więcej` hub with animated module tiles, account/sync sheet, and
  sign-out action, plus functional surfaces for Notes, Sport, Goals, Work,
  Travel, and Health. Their Codable snapshots are persisted locally and
  queued through the same offline/CAS sync engine as the core tabs.
- Contract tests that decode the exact fixtures used by the web client.

Full Realtime, barcode camera UI, and contextual quick capture belong to
separately approved implementation slices. The additional module actions are
available in the native preview with local sample data and file-backed
snapshots, ready for the final server-side domain schema migration.

## Account configuration

The native callback is `rootine://auth-callback`. Add that exact redirect URL to
the Supabase Auth allowlist. Registration stays visibly unavailable until real
`ROOTINE_TERMS_URL` and `ROOTINE_PRIVACY_URL` values are supplied; the app never
ships dead legal links.
