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

## 2026-08-10

### D-009 — Implement the approved docked DetailPanel contract

- Classification: product decision confirmed in the audit remediation brief.
- Decision: above 1380px an open `DetailPanel` owns a real 408px grid track; at or below 1380px it remains the managed modal drawer.
- Reason: the previous desktop absolute-position override left a zero-width grid track and covered workspace content.
- Affected files: `src/styles/experience.css`, `DESIGN.md`, responsive/state documentation, focused shell test.
- Visual impact: intentional desktop composition fix; the main workspace narrows instead of being occluded.
- Compatibility impact: drawer semantics, focus handling, and the 408px dimension are unchanged.

### D-010 — Make the breakpoint manifest auditable

- Classification: governance correction.
- Decision: `breakpoints.ts` is the canonical numeric manifest; CSS `--bp-*` values and path-scoped exceptions are mirrors validated by the audit.
- Reason: a new 600px threshold, stale 1040px assistant registration, and an unscoped 1280px entry showed that four hand-maintained registries could drift silently.
- Affected files: breakpoint manifest/tests, token mirrors, exception registry, governance audit and responsive documentation.
- Visual impact: none; existing thresholds are classified without moving them.
- Compatibility impact: stale exception paths and missing owner/migration/review metadata now fail governance.

### D-011 — Treat six themes and active component APIs as documentation truth

- Classification: autonomous documentation correction.
- Decision: `tokens.css` owns semantic theme values; DESIGN frontmatter is a default Cobalt snapshot. Component documentation records the active Button, Select, Modal, Badge, EmptyState, Checkbox and DetailPanel contracts.
- Reason: the previous single-palette values and component dimensions contradicted runtime and could not serve QA or handoff.
- Affected files: `DESIGN.md`, `PRODUCT.md`, UI/design-system documentation and inventories.
- Visual impact: none.
- Compatibility impact: none; obsolete claims are removed rather than changing components to match them.

### D-012 — Promote density and reduced motion to token modes

- Classification: autonomous governance correction.
- Decision: density overrides live beside the row-height tokens; reduced motion shortens named durations and explicitly removes continuous decorative motion instead of applying a second universal selector.
- Reason: late feature overrides and blanket `*` rules obscured which feedback should remain visible.
- Affected files: `src/styles/tokens.css`, `src/styles/experience.css`, governance and design documentation.
- Visual impact: density values remain unchanged; reduced motion preserves state feedback with minimal duration.
- Compatibility impact: the preference provider resolves both OS and user choice into `data-motion`; the legacy universal `app-shell.css` catch-all was removed in the same wave.

### D-013 — Enforce inline-style exceptions per dynamic property

- Classification: governance correction.
- Decision: a registered inline-style path is not a whole-file suppression. Each entry declares `allowedProperties`, and only non-literal runtime values matching that contract are exempt.
- Reason: the former path-only registry hid static padding, typography, radii, surfaces, and layout when a file also contained legitimate dynamic geometry.
- Affected files: design-system audit/helper test, exception registry, baseline v2, governance documentation.
- Visual impact: none.
- Compatibility impact: the audit reports the total style-object inventory separately from violating objects and properties; per-file property ratchets block hidden regressions.

### D-014 — Move Goals static presentation into its existing stylesheet

- Classification: autonomous implementation correction under the existing visual contract.
- Decision: `GoalWorkspaceViews` and `GoalDialogs` retain inline styles only for progress and user-selected accent CSS custom properties; static color, typography, layout, radius, border, and motion live in `goals.css`.
- Reason: the files used 74 literal style objects and 25 arbitrary typography utilities despite having an established feature stylesheet and semantic token scale.
- Affected files: Goals workspace/dialog JSX, `src/styles/goals.css`, granular exception registry.
- Visual impact: intended values and interactions are preserved; state colors now resolve through six-theme semantic tokens.
- Compatibility impact: form state, draft protection, data persistence, and component APIs are unchanged.

### D-015 — Remove zero-consumer UI aliases instead of preserving phantom APIs

- Classification: governance cleanup.
- Decision: retain only used `uiColors`, `uiLayers`, and `uiShadows` transports; remove eight unused token groups and the unused `ContextSidebar` alias. `ModuleSidebar` remains canonical.
- Reason: a public export without a production consumer falsely implies a supported contract and creates documentation drift.
- Affected files: UI barrel, `tokens.ts`, Shell exports, component inventory and design documentation.
- Visual impact: none.
- Compatibility impact: proven zero-consumer exports are removed from the internal public barrel.

### D-016 — Make cross-module visual drift a zero-baseline failure

- Classification: governance correction following the cross-module consistency audit.
- Decision: scan feature CSS for off-scale radii, protected `.ui-*` overrides, global-token shadowing,
  and literal local control heights; scan primary CTA icons against the 13px/1.7 grammar.
- Reason: the previous audit could remain green while feature CSS replaced the geometry of shared
  controls, which was the main blind spot identified in DS-14.
- Affected files: source audit/parser tests, governance runner, baseline v3, contracts and migration registry.
- Visual impact: none; this decision measures current code and blocks new drift.
- Compatibility impact: current exact declarations are visible as expiring migration debt, not
  hidden in baseline allowances. Stable override hooks remain explicit contracts.

## 2026-08-12

### D-017 — Use one planning and quick-create interaction contract

- Classification: cross-module consistency correction.
- Decision: Tasks and Work compose quick entry with `QuickComposer` and `PropertyMenu`; date/time surfaces use `DatePicker` and `TimePicker`; anchored menus and nested scheduler layers use `AnchoredPopover`.
- Priority controls in Tasks, Work, Affairs and Goals use the same `PriorityIcon` grammar in quick menus and full selects.
- Reason: the previous feature-local pickers, portals, row heights, icon grammar, and collision logic made the same task properties behave differently in each module.
- Affected areas: Tasks, Calendar, Work, Affairs, Health, Sport, Travel, shared UI and the half-hour time option source.
- Visual impact: intentional alignment of field density, popup silhouettes, focus behavior, menu rows, date calendars, and time entry.
- Compatibility impact: existing persisted values remain strings in the same date/time formats; native time entry still accepts any valid minute.

### D-018 — Keep persisted taxonomy colours in one versioned data palette

- Classification: data/design-system boundary correction.
- Decision: `taxonomyPalette.ts` is the only raw-colour source outside theme tokens. Tasks, Work, Goals and demo data consume its named entries and legacy normalization table.
- Reason: persisted category colours are data and cannot be replaced with status tokens, but duplicating their hex values across modules created multiple sources of truth.
- Visual impact: none for current values; old saved palette values normalize deterministically.
- Compatibility impact: no workspace schema change is required.

### D-019 — Use canonical destructive and binary-setting controls

- Classification: accessibility and interaction correction.
- Decision: destructive decisions use `ConfirmDialog`; binary settings use `Switch`; form/completion choices use `Checkbox`. Feature code no longer implements its own focus, Escape, native-checkbox, or confirmation shell.
- Reason: equal decisions must expose equal keyboard, focus-return, role, disabled and copy structure.
- Visual impact: destructive footers and switches now share their canonical geometry and state styling.
- Compatibility impact: event handlers and stored boolean values are unchanged.

### D-020 — Make route ownership and command handoff exhaustive

- Classification: product-contract correction.
- Decision: every routed leaf belongs to exactly one module, including `/travel/...`; the route audit is exhaustive; Command Center passes only capabilities declared by each action and every consumer removes all handoff parameters after use.
- Reason: route fallbacks and orphaned `godzina` query parameters made global creation and help/navigation context inconsistent.
- Visual impact: none.
- Compatibility impact: legacy redirects remain explicit and tested.

### D-021 — Preserve Calendar task detail as a documented contextual variant

- Classification: product layout decision.
- Decision: Calendar reuses the same task-detail content and controls but keeps its intentionally positioned contextual dialog instead of the docked workspace `DetailPanel` shell.
- Reason: Calendar needs to retain the visible time grid and selected occurrence context; forcing a 408px workspace track would change that interaction rather than improve token consistency.
- Visual impact: no layout change; shared content, controls, focus and dialog semantics remain governed.
- Compatibility impact: none.
