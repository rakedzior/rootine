# Rootine iOS — Praca i skupienie

Step 12 extends the native Work projection over the existing v3 workspace
contract. Companies, projects, work tasks, priorities, focus history, and
totals are local-first and use deterministic IDs for retry-safe mutations.

Focus elapsed time is derived from the persisted ISO start timestamp. The
marker remains durable while the app is backgrounded; foreground and
background-refresh transitions validate it without fabricating a completed
session. Pausing records the elapsed segment and a durable paused-session
marker; resuming starts a new segment, while stopping clears any paused state.
Every segment has a stable ID derived from its start timestamp, so retries do
not double-count history.

The native projection accepts legacy compact v1 snapshots. Those snapshots
only own focus fields, so their first write cannot delete canonical companies,
projects, or tasks. Full projections validate references, remove malformed
duplicates deterministically, and merge known fields onto the canonical shadow
to preserve fields that iOS does not surface.

Live Activities, widgets, and Dynamic Island integration are intentionally out
of scope for this step and were not added.
