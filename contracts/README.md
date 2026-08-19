# Rootine cross-platform contracts

This directory is the versioned boundary shared by the web client, the iOS client, and the Supabase backend.

## Rules

- `manifest.json` is the registry of synchronized documents and backend operations.
- `schemas/` describes the JSON written under each `storage_key` and returned by the product API.
- `fixtures/` contains deterministic, non-demo examples accepted by both clients.
- A domain payload always carries its own integer `version`.
- A schema or fixture change that is not backward compatible requires a domain version bump and deterministic migration in every client.
- Snapshot writes use `rootine_apply_workspace_snapshot` with an expected server revision. Clients never write the snapshot table directly.
- Dates use `YYYY-MM-DD`, clock times use local `HH:mm`, and timestamps use ISO 8601 with an explicit offset.

The web test `crossPlatformContracts.test.ts` verifies that the fixtures are accepted by the current web domain validators. The iOS test target decodes the same files with Swift `Codable` models.
