# Rootine iOS

Native SwiftUI foundation for the Rootine MVP. The project deliberately targets iOS 16 and Swift 5.7 so it remains editable with Xcode 14.2 on macOS Monterey.

## Open on the Mac

1. Copy `Rootine/Config/Secrets.xcconfig.example` to `Rootine/Config/Secrets.xcconfig`.
2. Fill in the production Supabase URL, publishable key, and deployed web backend URL.
3. Open `Rootine/Rootine.xcodeproj` in Xcode 14.2.
4. Select the `Rootine` scheme and an iOS 16.2 simulator.

`Secrets.xcconfig` is ignored by Git. Never put a service-role key in an iOS build.

## What this stage contains

- Xcode target and the accepted four-tab navigation contract, without premature product screens.
- Dark semantic design tokens and native navigation patterns.
- `Codable` models for tasks, nutrition, notes, normalized products, and sync payloads.
- Atomic file persistence, Data Protection, Keychain session storage, and a persistent mutation queue.
- A complete native account entry flow: email sign-in and self-registration,
  confirmation resend, password recovery, Google OAuth through
  `ASWebAuthenticationSession`, and native Sign in with Apple.
- Session refresh, OAuth/recovery deep links, Keychain persistence, and explicit
  online/offline bootstrap states.
- A neutral authenticated diagnostic surface proving configuration and bootstrap
  wiring until the separately approved `Dzisiaj` screen replaces it.
- Contract tests that decode the exact fixtures used by the web client.

Full Realtime, barcode camera UI, contextual quick capture, and the complete
feature screens belong to separately approved implementation slices. They are
intentionally not represented by dead buttons or improvised forms in this build.

## Account configuration

The native callback is `rootine://auth-callback`. Add that exact redirect URL to
the Supabase Auth allowlist. Registration stays visibly unavailable until real
`ROOTINE_TERMS_URL` and `ROOTINE_PRIVACY_URL` values are supplied; the app never
ships dead legal links.
