---
version: 1
slug: "src-app-pages-podroze-tsx"
primary_target: "src/app/pages/Podroze.tsx"
related_targets: ["src/app/data/travelWorkspace.ts","src/styles/travel.css"]
---

# Podróże

- Scope and mode: global Routine module for planning and maintaining trips; Operate.
- Audience and job: a small set of users needs to scan upcoming travel, open one journey, and close preparation gaps without switching tools.
- Primary task: select a trip, then maintain its day plan, bookings, budget, documents, and preparation list.
- Content and constraints: local-only MVP, Polish UI, realistic demonstration data, validated `localStorage`, no account, sync, or file upload.
- Direction: an operational trip dossier with a compact departure board and a five-part readiness ledger; it rejects a decorative destination gallery.
- Memorable moment: the readiness strip turns the whole trip into five explicit, navigable gaps and names the next action.
- Unresolved: future backend attachment storage, shared travelers, currency conversion, and calendar/task integration.
