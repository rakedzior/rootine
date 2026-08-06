---
version: 1
slug: "src-app-pages-cele-tsx"
primary_target: "src/app/pages/Cele.tsx"
related_targets: ["src/app/goals/GoalWorkspaceViews.tsx","src/app/goals/goalViewState.ts","src/styles/goals.css"]
---

# Cele

- Scope: the goals workspace, its local navigation, goal views, and route-specific styles.
- Mode: Operate.
- Audience and job: one person translating longer-term goals into small, visible actions without losing access to the full goal structure.
- Primary task: start from the next actionable step for every active goal, complete it, and open a specific goal when deeper planning is needed.
- Content: next steps, active and archived goals, milestones, progress, deadlines, areas, risk states, empty states, and goal detail views.
- Direction: a quiet, list-first workspace that shares the visual grammar of Zadania. `Następne kroki` is the default view. The local rail is split into `Przegląd`, `Moje cele`, and `Pozostałe`; selecting a goal opens its work directly. A remembered global `1 krok / 2 kroki` control changes how much future work is exposed without adding per-goal complexity.
- Memorable moment: the default screen shows one honest next action per goal, with the second step available as a deliberate global reveal.
- Constraints: Polish copy, compact Rootine system, semantic color only as local accents, no team ownership or project-management reporting.
- Unresolved: cross-module synchronization between goal milestones and global Zadania or Kalendarz.
