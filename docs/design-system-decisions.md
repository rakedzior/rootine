# Design-system decision log

This log records material implementation decisions made while applying the design-system roadmap. It is intentionally short and append-only during a migration batch.

## 2026-08-06

### D-001 — Public UI documentation follows the active component API

- Classification: autonomous.
- Decision: remove obsolete `ModuleShell` title/subtitle/actions props from the README skeleton and document the source-of-truth hierarchy.
- Reason: the active `ModuleShell` contract already rejects those props; the old example contradicted the public API.
- Affected files: `src/app/ui/README.md`.
- Visual impact: none.
- Compatibility impact: documentation only.
- Verification: typecheck and lint baseline passed.

### D-002 — Route heading inventory follows active `ContentHeader` usage

- Classification: autonomous.
- Decision: route audit metadata will report the active route heading as `h1` rather than `none`.
- Reason: active route implementations use `ContentHeader headingLevel={1}` and the README explicitly requires one route-level heading.
- Affected files: `src/app/routes.ts`.
- Visual impact: none; metadata only.
- Compatibility impact: none.
- Verification: route architecture and typecheck checks.

### D-003 — Confirm the canonical workspace panel dimensions

- Classification: product decision confirmed.
- Decision: the current rendered layout is canonical: the context sidebar is 220px and the detail panel is 408px.
- Reason: the active rendered layout was explicitly confirmed.
- Affected files: `DESIGN.md`, `src/styles/tokens.css`, `docs/design-system-decisions.md`.
- Visual impact: none; the documentation now matches the active token values.
- Compatibility impact: no UI change.
- Status: resolved.

### D-004 — Name existing component motion timings

- Classification: autonomous.
- Decision: preserve 140ms workout-card, 150ms toggle, 500ms progress, 700ms slow-progress, and 160ms disclosure timings as named tokens.
- Reason: these values express repeated interaction intent and can be governed without changing output.
- Affected files: `src/styles/tokens.css`, `src/styles/task-habits.css`, `src/styles/tasks.css`, `src/styles/today.css`, `src/styles/sport.css`, `src/app/ui/tokens.ts`.
- Visual impact: none; durations are unchanged.
- Compatibility impact: CSS-only token indirection.
- Verification: design-system audit, CSS lint, typecheck.

### D-005 — Keep domain-specific progress bars local

- Classification: autonomous under preserved-output policy.
- Decision: extend the shared `ProgressBar` for bounded values and spoken value text; keep chart bars, data-taxonomy bars, and feature-specific geometry in their modules.
- Reason: those local bars carry different scales, labels, colors, or composition and forcing them into the simple contract would change semantics or layout.
- Affected files: `src/app/ui/components/ProgressBar.tsx`, `src/app/ui/components/ProgressBar.test.tsx`, `docs/design-system-visualization.md`.
- Visual impact: none for existing consumers; the shared contract gains opt-in capability.
- Compatibility impact: additive props only.
- Verification: focused UI tests, typecheck, lint, CSS lint.

### D-006 — Preserve the synthetic unlisted-category color

- Classification: autonomous under preserved-output policy.
- Decision: expose `#8793A1` as a stable semantic token for the synthetic `Bez listy` category.
- Reason: the value is taxonomy presentation, not a UI status; keeping it stable avoids theme-driven drift while removing the route-level literal.
- Affected files: `src/styles/tokens.css`, `src/app/ui/tokens.ts`, `src/app/pages/tasks/TaskSummaryReport.tsx`.
- Visual impact: none.
- Compatibility impact: token indirection only.
- Verification: design-system audit, CSS lint, full check.

### D-007 — Own Playwright server lifecycle outside the Windows webServer killer

- Classification: autonomous test-infrastructure fix.
- Decision: start the Vite server in global setup and stop that exact child with Node process termination in global teardown.
- Reason: Playwright's Windows `webServer` cleanup invokes `taskkill /T /F`; on this runner it blocks after the browser tests have completed, leaving assertions green but the command unable to exit.
- Affected files: `playwright.config.ts`, `playwright.global-setup.ts`, `playwright.global-teardown.ts`.
- Visual impact: none.
- Compatibility impact: test lifecycle only; assertions, coverage, retries, and test timeout thresholds are unchanged.
- Verification: isolated Playwright route test starts and stops the server cleanly.

### D-008 — Commit focused visual-regression baselines for the refactor

- Classification: autonomous under explicit follow-up authorization.
- Decision: keep deterministic Playwright screenshot baselines for the refactored overlay, progress, detail-panel, goal-dialog, and work-menu states at the canonical desktop and mobile viewports.
- Reason: these states are the highest-risk visual surfaces identified in the review, and a named baseline makes later changes reviewable instead of silently updating snapshots.
- Affected files: `e2e/design-system-visual.spec.ts`, `e2e/design-system-visual.spec.ts-snapshots/`, `docs/design-system-visualization.md`.
- Visual impact: none beyond recording the current rendered output as the intentional baseline; the reviewed states showed no difference from the current UI.
- Compatibility impact: test coverage only; no production layout or component behavior changed.
- Verification: baseline generation was explicit, then the same desktop and mobile suites passed without snapshot-update mode.
