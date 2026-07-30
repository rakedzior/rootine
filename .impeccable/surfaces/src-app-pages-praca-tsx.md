---
version: 1
slug: "src-app-pages-praca-tsx"
primary_target: "src/app/pages/Praca.tsx"
related_targets: ["src/app/data/workWorkspace.ts","src/styles/work.css"]
---

# Praca

- Scope: `src/app/pages/Praca.tsx` with its local workspace model and route-specific styles.
- Visitor mode: Operate.
- Audience and job: one person scanning and organizing work across several companies and projects without team-management overhead.
- Primary task: start from the all-company overview or select a project directly from the company tree, then create, edit, complete, nest, move, search, and delete tasks.
- Content and states: company overview, expanded/collapsed company-project tree, upcoming and important tasks, active projects, recursive tasks, progress, priorities, due dates, project statuses, empty states, local-save failure, and destructive confirmations.
- Constraints: local-only MVP, Polish copy, arbitrary task depth, at most two simultaneous sidebars including the global app navigation, companies expanded by default, desktop-first density, usable mobile selectors, no assignees, comments, permissions, workload, or reporting.
- Direction: a two-navigation-layer personal workspace in Rootine's graphite workshop system. Overview is the default main screen. The local rail is a collapsible company → project tree; selecting a project opens its task outline directly in the canvas.
- Memorable moment: every company opens like a compact folder, exposing all assigned projects without adding another navigation surface.
- Unresolved: future backend migration and whether work tasks should later synchronize with the global Zadania and Kalendarz modules.
