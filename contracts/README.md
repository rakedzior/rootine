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

## Backfill contract

`manifest.json.backfill.adapters` is the complete, explicit registry used by
B04. Every adapter has a parser version, source domain, current payload version,
fixture and relational table boundary. Values not owned by a domain are marked
`web-only` and are retained as opaque records instead of being silently dropped.

The backfill canonicalizer sorts object keys, normalizes identifiers, timestamps,
currencies and tombstones, and ignores array order only at paths declared by the
adapter. Unknown keys, unsupported versions, malformed records and ID collisions
are written to `rootine_migration_quarantine`. The source snapshot remains
read-only; the generated compatibility copy is materialized only after the
relational revision commit.

The web test `crossPlatformContracts.test.ts` verifies that the fixtures are accepted by the current web domain validators. The iOS test target decodes the same files with Swift `Codable` models.
