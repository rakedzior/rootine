# Rootine full product, UX, design-system, and frontend audit

**Audit date:** 2026-07-28  
**Branch:** `AUDITFULL`  
**Audited revision:** `cb3cad38002be22d5c6a56910360623d0a777461`  
**Mode:** audit only; no application code was changed

## Scope and method

This audit covered the complete routed application, its shared shell and UI library, design tokens, all source CSS, local persistence, major data models, and the primary creation/editing/completion flows. The application was built successfully. Live browser inspection was attempted but unavailable, so visual/responsive conclusions are based on deterministic component/CSS evidence rather than screenshots.

Evidence used:

- Route and navigation inventory.
- Static review of all routed pages and the orphan `Finanse.tsx`.
- Shared-component, focus, ARIA, keyboard, state, date, number, and persistence review.
- Production build and bundle output.
- TypeScript and Stylelint validation.
- Impeccable design/audit guidance and detector output.
- Production build output plus static interaction/responsive-state inspection.

Limitations:

- `Biuro` cannot be inspected because no route, navigation entry, page, or implementation exists.
- `Finanse` cannot be inspected as a product tab because `Finanse.tsx` is not routed or imported. The usable finance and JDG features are under `Sprawy`.
- The local Vite server started successfully, but the connected in-app browser runtime returned no available browser. Runtime coverage is therefore **0 live routes, 0 viewports, 0 screenshots, and no console/hover/focus reproduction**. No runtime claim is made in this report.
- Responsive, overflow, focus, and interaction findings are source-observed predictions and must be confirmed in the post-fix browser acceptance pass.
- Destructive persistence-corruption cases were established from deterministic code paths rather than by damaging the browser profile.
- Geolocation, remote weather, Open Food Facts, offline, and production-host proxy behavior depend on browser permission/network/deployment configuration; these are called out where relevant.

### Actual information architecture

The shipped navigation is:

`Dzisiaj`, `Zadania`, `Kalendarz`, `Odżywianie`, `Sport`, `Praca`, `Cele`, `Sprawy`, `Notatki`, `Podróże`.

Source: `src/app/routes.ts:9-23` and `src/app/layout/Layout.tsx:38-49`.

This differs materially from the audit brief:

- `Biuro` is absent.
- `Finanse` is absent as a route; payments, subscriptions, budget, and JDG are nested inside `Sprawy`.
- `Kalendarz`, `Sprawy`, and `Podróże` exist but were not listed as primary brief areas.

That mismatch is a product decision that must be resolved before visual normalization. Styling an ambiguous module boundary would only make the ambiguity look more finished.

---

## 1. Executive summary

### Scores

| Dimension | Score | Assessment |
|---|---:|---|
| Overall product coherence | **6/10** | The shell is coherent, but module ownership, task models, persistence behavior, and interaction contracts fragment the product. |
| Visual consistency | **6/10** | The graphite foundation is strong; large pages bypass it through local palettes, inline styles, and duplicated controls. |
| Usability | **5/10** | Core flows are rich, but scheduling, form focus, deletion, dirty drafts, and finance recurrence contain trust-breaking behavior. |
| Accessibility | **4/10** | A global focus ring and several good primitives exist, but core forms, comboboxes, grids, drawers, and task controls fail keyboard or naming expectations. |
| Technical quality | **5/10** | Build/type/style checks pass and routes are lazy, but there are no tests or JS linting and several deterministic data-integrity defects. |

**Release judgment:** visually credible beta; not safe to treat as a dependable personal operating system until the Critical findings are fixed and regression-tested.

### Impeccable health profile

| Dimension | 0–4 | Reason |
|---|---:|---|
| Accessibility | 2 | Good global focus styling and partial keyboard primitives; broken modal lifetime, Select naming, grids, labels, and composite rows. |
| Performance | 3 | Reasonable gzip output and lazy JS; all route CSS ships globally and Sport writes on timer ticks. |
| Theming | 2 | A documented token system exists but is bypassed by local palettes, raw values, and semantic colors used as categories. |
| Responsive behavior | 2 | Desktop shell is solid; detail panels become unmanaged overlays and mobile navigation/settings parity is weak. |
| Implementation integrity | 2 | Clean compile, but silent data overwrite, false scheduling affordances, fragmented models, and no regression suite. |
| **Total** | **11/20** | **Acceptable foundation, substantial remediation required.** |

### Strongest aspects

- A recognizable, calm graphite visual direction with a restrained core palette.
- Shared `PageHeader`, `ModuleShell`, toolbar, sidebar, button, card, badge, modal, menu, tabs, and form primitives.
- Consistent top-level route shell and real route-level JavaScript splitting.
- Sport has the clearest planning/execution/review flow, including move feedback and undo.
- Odżywianie is the best resilience model: migration/normalization, explicit corrupt-state recovery, remote-search cancellation, validation, and deletion undo.
- Most modules surface local write failure visibly.
- `npm run typecheck`, `npm run css:lint`, and `npm run build` pass.

### Weakest aspects

- Local data can be replaced by demo/default data after a corrupt or old payload is read.
- Shared modal focus handling can make multi-field dialogs practically unusable.
- Task date UI accepts values that do not persist and can erase an existing time.
- Calendar and Tasks disagree about whether deletion is recoverable.
- The intended IA and the shipped IA disagree, especially around `Praca`, `Biuro`, `Sprawy`, `Finanse`, and JDG.
- Keyboard and screen-reader contracts vary between shared and bespoke controls.
- Large page monoliths and globally loaded CSS make design-system drift increasingly expensive.
- There are no automated tests, no ESLint/React linting, and no route-owned error/loading experience.

### Five most important changes

1. **Make data safe:** introduce a versioned persistence repository with `missing | ok | corrupt`, raw-data quarantine, migrations, app-wide backup/restore, and mutation-gated saving.
2. **Repair shared interaction primitives:** fix `Modal` effect lifetime, rebuild `Select` and date/calendar focus behavior to one APG model, and implement a responsive Drawer.
3. **Resolve IA and domain ownership:** decide whether `Biuro`/`Finanse` are modules or whether `Sprawy` is the canonical combined module; publish redirects and migration copy.
4. **Unify date, recurrence, money, task, deletion, and undo contracts:** remove false task controls until their data model exists; use DST-safe date utilities and month-end recurrence.
5. **Create a regression boundary:** add tests around persistence recovery, form focus, scheduling round trips, recurrence, deletion, keyboard controls, and the top user flows before visual cleanup.

---

## 2. Cross-tab consistency matrix

Legend: **S** strong, **M** mixed, **P** poor, **—** unavailable.

| Area | Layout | Type | Color | Spacing | Components | Hierarchy | Interaction | Product fit |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Dzisiaj | S | S | S | S | S | S | M | S |
| Zadania | M | M | M | M | P | S | P | M |
| Kalendarz | S | M | M | M | P | S | P | S |
| Cele | S | M | M | M | M | M | M | S |
| Sport | S | S | M | S | S | S | M | S |
| Odżywianie | S | S | M | S | S | S | S | S |
| Praca | S | S | M | S | S | S | M | M |
| Sprawy + JDG | S | S | S | S | S | M | M | M |
| Notatki | S | S | S | S | S | S | M | S |
| Podróże | S | S | S | S | S | S | M | M |
| Biuro | — | — | — | — | — | — | — | — |
| Finanse | — | — | — | — | — | — | — | P |

Key interpretation:

- The shared shell makes first impressions more consistent than the underlying implementation.
- `Zadania` and `Cele` are the largest sources of bespoke controls and inline styling.
- `Sport` and `Odżywianie` are the strongest individual product experiences, although each has specific state/semantic defects.
- `Sprawy` is visually coherent but information-architecturally overloaded.
- `Praca` and `Podróże` introduce separate task concepts that do not project into global Tasks/Calendar.

---

## 3. Tab-by-tab audit

### Dzisiaj

**Primary goal:** understand the day, identify what needs attention, and move into the next action.

**Verdict:** the purpose is immediately clear and the active → empty → complete ordering is effective. Completed rows are subdued, but the summary's arithmetic is not a trustworthy representation of the modules beneath it.

What works:

- Consistent page header and compact module register.
- Overdue work is elevated without turning the whole page red.
- Completed modules sort last and visually recede (`src/styles/today.css:272-330`).
- Weather, status, progress, and module links are scannable at desktop width.

Problems:

- Daily regularity goals are always counted as needing attention, even after a progress entry today; nutrition can be “complete” but is excluded from total/completed arithmetic. The ring can therefore say the day is unfinished when the modules disagree (`Dzisiaj.tsx:249-253,455-486`). See **AUD-008**.
- The 26px remaining-count ring is outside the documented type scale and competes with the actual next-action copy (`today.css:70-148`). See **AUD-031**.
- Complete rows apply `opacity: .5` to the whole row, reducing already-muted text more than necessary (`today.css:313-325`). See **AUD-015**.
- “Nowe zadanie” only navigates to `/zadania`; it does not focus quick entry or start creation (`Dzisiaj.tsx:688-695`). See **AUD-032**.
- The page always displays Warsaw weather while the shell independently requests geolocated weather (`Dzisiaj.tsx:671-684`, `todayWeather.ts:23-25,67-100`, `Layout.tsx:245-299`). See **AUD-030**.
- Module visibility/order settings affect navigation, but Dzisiaj keeps a fixed module register, so a hidden or reordered module can remain prominent here (`Layout.tsx:515-582`, `Dzisiaj.tsx:506-638`). See **AUD-054**.

### Zadania

**Primary goal:** capture, prioritize, schedule, complete, and review tasks and habits.

**Verdict:** feature-rich and visually dense, but this is the least trustworthy core module. The task/date flow exposes nonfunctional options, keyboard entry is inconsistent, and the implementation duplicates the shared control system.

What works:

- Tasks and Calendar use one base workspace.
- Smart views, priorities, lists, tags, habits, details, comments, subtasks, summary, trash, and quick entry are all represented.
- Soft deletion creates a recoverable task-trash concept.
- The principal list is dense but scannable on desktop.

Problems:

- Timed tasks initialize the date editor as all-day; confirming can erase their time. Reminder/repeat values are accepted but never stored. Outside click applies changes. See **AUD-003**.
- Trash lists deleted records but provides neither restore nor permanent purge; its completion control is wired to an empty handler (`Zadania.tsx:2730-2743`). See **AUD-053**.
- Quick-entry metadata and submit buttons use `onMouseDown` without `onClick`, so keyboard activation does nothing; the input has no programmatic label or focus ring (`Zadania.tsx:2569-2654`, `app.css:5298-5315`). See **AUD-010**.
- A local `CustomSelect`, `TimePicker`, and `DatePickerPopup` duplicate the shared library and lack a complete keyboard/dialog contract (`Zadania.tsx:246-308,317-405,405-864`). See **AUD-011**.
- Task detail includes a formatting icon button with no name or action (`Zadania.tsx:1269-1271`). See **AUD-050**.
- The file is 2,892 lines with 271 inline style objects. Changes to common controls are expensive and visually drift-prone. See **AUD-020**.
- Role-button task rows contain native buttons. The event guard avoids one duplicate activation, but the composite remains semantically ambiguous (`Zadania.tsx:884-960`). See **AUD-014**.
- Deleting a list/tag leaves stale IDs on tasks; hashtag parsing uses `\w` and misses Polish diacritics (`Zadania.tsx:2015-2021,2082-2109`). See **AUD-037**.
- Informative copy and completed task labels use the disabled token, making them extremely low contrast. See **AUD-015**.

### Kalendarz

**Primary goal:** see scheduled tasks by month, open details, reschedule them, and create a dated item.

**Verdict:** visually clear and correctly connected to the task workspace, but keyboard navigation and deletion semantics are not production-safe.

What works:

- Month hierarchy and event bars are immediately understandable.
- Dragging updates the underlying task date.
- Detail editing reuses the task detail surface.
- The grid maintains a compact desktop presentation.

Problems:

- Calendar deletion permanently removes the shared task, while Zadania sends the same task to trash (`Kalendarz.tsx:256-260`, `Zadania.tsx:2111-2115`). See **AUD-004**.
- All 35–42 cells are Tab stops; there is no row structure, roving tabindex, or arrow navigation (`Kalendarz.tsx:299-351`). See **AUD-012**.
- The detail surface has `role="dialog"` but no focus transfer, Escape, focus restoration, or modal/popover contract (`Kalendarz.tsx:208-219,391-406`). See **AUD-012**.
- Drag has no equivalent keyboard move command in this grid.
- Cells hide overflow and offer no “+N”/agenda path for crowded days (`Kalendarz.tsx:304,363-382`). See **AUD-038**.
- “Nowe wydarzenie” creates a task, the accessible label says “add task,” and new drafts silently receive the `hobby` list/tag (`Kalendarz.tsx:261-266,278-284`). See **AUD-038**.
- A print button exists but there is no print stylesheet. See **AUD-038**.

### Cele

**Primary goal:** understand goal health/progress, add progress, manage milestones, and edit the goal model.

**Verdict:** conceptually complete, but implementation density, color flexibility, and accessibility reduce confidence.

What works:

- Planned, active, paused, completed, archived, and at-risk concepts are present.
- List/grid layouts, detail route, milestones, progress modes, confirmation, undo, and import/export cover the expected lifecycle.
- Advanced fields are collapsed by default rather than forcing every setting into the first view.

Problems:

- Visible form labels are spans rather than associated labels for text, dates, numbers, and notes (`GoalDialogs.tsx:80-87,153-252`). See **AUD-009**.
- The goal card is a role-button containing native status/menu buttons; child key events can bubble and also select the card (`Cele.tsx:721-823`). See **AUD-014**.
- Goal text/action uses `#4772fa` rather than the text-safe blue token; contrast is about 3.3–3.7:1 on the common surfaces. The arbitrary accent setting is stored/mapped but the primary card/detail surfaces do not meaningfully consume it, so it is also a misleading setting (`Cele.tsx:96-103,406,990-1034`, `CelSzczegoly.tsx:30-42,108-124`, `GoalDialogs.tsx:203`). See **AUD-016**.
- Import validation is shallow, applies immediately, creates no backup/preview, and ignores the boolean result in the UI (`goalsStore.tsx:273-285,359-373`, `Cele.tsx:1213-1224`). See **AUD-018**.
- Completed and paused cards retain the same overall surface/emphasis as active cards and rely mainly on the status pill; inactive state is not visible at scan level (`Cele.tsx:733-777`). See **AUD-052**.
- Settings hand-rolls an overlay without dialog semantics, focus management, Escape, or return focus (`Cele.tsx:1397-1404`). See **AUD-027**.
- The page has 1,408 lines and approximately 102 inline style objects; `CelSzczegoly.tsx` compresses 53 inline styles into 141 hard-to-maintain lines. See **AUD-020**.
- The shared Tabs component advertises `aria-controls` panel IDs, but goal-detail content does not create those tabpanels. See **AUD-028**.

### Sport

**Primary goal:** see today's training, manage a weekly/cycle plan, perform a session, and review history.

**Verdict:** the strongest module. Planning, execution, feedback, and review fit one model; remaining problems are state safety, timer scope, and keyboard consistency.

What works:

- Today and weekly schedule are central.
- Disciplines share one coherent template/workout model.
- Overview drag includes an Alt+Arrow keyboard move alternative and visible undo.
- Dirty cycle state is visible; move/autosave notices use status semantics.
- Active-session and history flows have clear separation.

Problems:

- An unsaved cycle draft has no navigation/beforeunload guard (`Sport.tsx:119-140,200-216`). See **AUD-013**.
- The shared modal lifetime defect can make the finish dialog refocus every elapsed timer update. See **AUD-001**.
- Planner week tabs do not implement the same roving keyboard model as shared Tabs, and one planner drag surface lacks an equivalent move command (`SportPlanner.tsx:267-378`). See **AUD-039**.
- Workout deletion from detail is immediate while template deletion has confirmation (`Sport.tsx:366-375,775-795`, `SportPlanner.tsx:500-550,811-815`). See **AUD-039**.
- Rest-timer ticks lift state into the planner and trigger localStorage serialization repeatedly (`SportActiveSession.tsx:346-363,640-651`, `Sport.tsx:168-170,607-611`). See **AUD-024**.
- Sport locally overrides global text colors, making it brighter than adjacent modules (`app.css:832-836`). See **AUD-021**.

### Odżywianie

**Primary goal:** log meals and water quickly while understanding calories, macros, hydration, goals, and adjustments.

**Verdict:** the strongest reliability and data-entry implementation. It remains dense, and “closing” a day does not behave like a lock.

What works:

- Explicit `missing | ok | corrupt` loading, normalization, and non-destructive recovery.
- Debounced/cancelled Open Food Facts search with keyboard suggestions.
- Good table semantics, visible validation, undo after deletion, and localized formatting.
- Meals and day budget remain readable despite high information density.

Problems:

- “Zamknij dzień” is not a real closed state: add/edit/water actions remain active, and the next mutation silently clears `closedAt` (`Odzywanie.tsx:727-740,1176-1180,1223-1249,1310-1345,1427-1434`). See **AUD-040**.
- The goal configuration modal is an 860px dense surface; progressive disclosure should separate essentials from advanced/calculated inputs (`Odzywanie.tsx:1711-1888`). See **AUD-040**.
- The progressbar clamps `aria-valuenow` at the target, hiding overage from assistive technology (`Odzywanie.tsx:1393`). See **AUD-040**.
- The Open Food Facts path relies on a Vite dev/preview proxy; a static production deployment has no documented runtime route (`nutritionCatalog.ts:24,189-194`, `vite.config.ts:5-20`). See **AUD-025**.
- It uses a raw main/toolbar rather than `ModuleShell`, a small structural inconsistency (`Odzywanie.tsx:1169-1202`).

### Praca

**Primary goal:** see companies, projects, work tasks, and items needing attention.

**Verdict:** a good personal work hierarchy, but it is distinct from the brief's implied JDG/payment scope and is not integrated with global Tasks.

What works:

- Company → project → task hierarchy is clear.
- Overview, filtering, search, show-completed, detail, and cascade-delete explanations support scale.
- The shared shell and form primitives are used more consistently than in Tasks/Goals.

Problems:

- Work tasks use a separate schema/store, so they are absent from global Tasks/Calendar. See **AUD-019**.
- Attention/open counts include tasks belonging to paused/completed projects (`Praca.tsx:247-269`). See **AUD-041**.
- Completing a parent cascades descendants without confirm or undo (`Praca.tsx:468-476`). See **AUD-041**.
- Company/project/search/show-completed state resets after leaving the route (`Praca.tsx:131-145`). See **AUD-029**.
- The progress track has an accessible label but no `progressbar` role/value semantics (`Praca.tsx:1001-1004`). See **AUD-041**.
- The modal focus lifetime bug affects its multi-field editor. See **AUD-001**.

### Sprawy and JDG

**Primary goal:** track personal matters, one-time and recurring payments, subscriptions, documents, vehicles, monthly budget, and business obligations.

**Verdict:** visually cohesive but overloaded. It contains most of the missing `Finanse` and expected JDG/office behavior, making the module boundary unclear.

What works:

- Strong ledger and radar hierarchy.
- Payment, subscription, document, vehicle, budget, and JDG views share one context-sidebar pattern.
- Most destructive collection operations use confirmation.
- `Intl.NumberFormat("pl-PL")` is used consistently for money.

Problems:

- Automatic payments/subscriptions never advance; manual month advancement can turn January 31 into March 3 (`Sprawy.tsx:1365-1467`, `affairsWorkspace.ts:593-598`). See **AUD-007**.
- Only `?widok=jdg` initializes from the URL. Changing away from JDG does not update the query, so a remount can return the user to JDG unexpectedly (`Sprawy.tsx:251-255,869-872`). See **AUD-029**.
- “Within 30 days” lacks a lower bound and can include arbitrarily overdue entries (`Sprawy.tsx:480-485,932-934,1134-1138`). See **AUD-042**.
- Controlled budget number inputs turn an empty intermediate value into zero, making correction awkward (`Sprawy.tsx:851-862,1647-1667`). See **AUD-042**.
- JDG hard-codes PIT-28/ZUS/VAT assumptions rather than modelling tax setup (`jdgWorkspace.ts:26-38`). See **AUD-043**.
- “Wyczyść miesiąc” wipes confirmations/timestamps without confirm or undo; custom item deletion is also immediate (`Jdg.tsx:168-187,261-263,343-345`). See **AUD-043**.
- The modal focus lifetime bug affects the primary editors. See **AUD-001**.

### Notatki

**Primary goal:** find, select, read, create, and edit notes and checklists.

**Verdict:** the three-column model uses desktop space well, but unsaved content and collection-management limits make it risky at scale.

What works:

- Clear library/list/editor separation.
- Search, pinned/recent/archive, lists, tags, colors, text/checklists, and explicit save are understandable.
- Note deletion uses confirmation.
- Long content has dedicated scrolling surfaces.

Problems:

- Closing the editor, selecting another note, changing views, or leaving the module can discard an unsaved draft without warning (`Notatki.tsx:208-304,634-636`). See **AUD-013**.
- Lists can be created but not renamed or deleted (`Notatki.tsx:351-371,407-445`). See **AUD-044**.
- Only the top seven tags are shown, with no “all tags” path (`Notatki.tsx:465-474`). See **AUD-044**.
- Search/sort/view selection is not URL-backed and resets on remount (`Notatki.tsx:126-140,383-386`). See **AUD-029**.
- Tag normalization trims but does not case-fold, allowing duplicate logical tags (`Notatki.tsx:105-111`). See **AUD-044**.
- The modal focus lifetime bug affects auxiliary dialogs. See **AUD-001**.

### Podróże

**Primary goal:** plan trips, bookings, itinerary, budget, documents, and trip-specific tasks.

**Verdict:** an excellent route-backed workspace, but its financial validation and siloed tasks weaken trust.

What works:

- Trip IDs and sections are URL-backed.
- Overview, basics, booking, agenda, money, documents, and tasks form a coherent trip lifecycle.
- Subitem deletion is confirmable.
- Empty states and section navigation are strong.

Problems:

- Currency accepts invalid 1–2 character values that can throw in `Intl.NumberFormat`; stay/transport/itinerary dates are not validated against chronology or trip range (`Podroze.tsx:268-274,565-710,1451-1472`). See **AUD-017**.
- Budget totals include only manually entered budget rows, excluding stored stay/transport costs; the relationship is undisclosed and invites double entry (`Podroze.tsx:428-433,645-683`). See **AUD-017**.
- Trip tasks are a third task schema/store and do not enter Tasks/Calendar. See **AUD-019**.
- The trip itself cannot be deleted, only completed. See **AUD-045**.
- The overview CTA “Sprawa” is vague in a travel context (`Podroze.tsx:842-870`). See **AUD-045**.
- The modal focus lifetime bug affects the multi-field editor. See **AUD-001**.

### Biuro

**Primary goal:** unavailable; no implementation exists.

**Verdict:** its purpose cannot be evaluated. The current product splits work hierarchy into `Praca` and administrative/financial/JDG work into `Sprawy`. A separate `Biuro` would duplicate those areas unless its boundary is explicitly defined.

Required decision:

- Either define `Biuro` as a distinct administrative workspace and specify what moves out of `Praca`/`Sprawy`, or remove it from the target IA.
- Do not add a tab solely to match a name; resolve ownership first. See **AUD-005**.

### Finanse

**Primary goal:** unavailable as a routed tab; partial functionality exists in `Sprawy`.

**Verdict:** `src/app/pages/Finanse.tsx` is an unreachable static prototype with hard-coded data and a local palette. “Dodaj transakcję” and transaction-like rows have no handlers (`Finanse.tsx:3-23,35-37,90-103`).

Required decision:

- If finances remain part of `Sprawy`, delete the orphan prototype and rename/copy the module so users understand the relationship.
- If `Finanse` is a first-class module, extract payments/subscriptions/budget from `Sprawy`, add routing/migration, and define whether JDG is a subview or source dimension. See **AUD-005** and **AUD-007**.

---

## 4. Functional and technical findings

### Validation results

| Check | Result |
|---|---|
| `npm run typecheck` | Pass |
| `npm run css:lint` | Pass |
| `npm run build` | Pass — Vite 7.3.6, 1,732 modules |
| Automated tests | None found; no test script |
| ESLint / React lint | No script or configuration |

Production output:

- Base JS: **322.90 kB / 104.27 kB gzip**.
- Global CSS: **260.56 kB / 35.33 kB gzip**.
- Largest lazy chunks: Sport 81.78 kB, Zadania 78.35 kB, Odżywianie 63.46 kB, Sprawy 62.18 kB, Podróże 54.55 kB.

### Data integrity and persistence

The most serious architecture defect is a repeated loader/autosave pattern:

1. Read localStorage.
2. Return demo/default state when the payload is invalid, corrupt, or a different version.
3. Mount the page.
4. Run a save effect immediately.
5. Overwrite the original raw payload with the fallback.

Affected loaders include:

- `taskWorkspace.ts:145-178`
- `notesWorkspace.ts:193-211`
- `workWorkspace.ts:214-234`
- `travelWorkspace.ts:444-460`
- `affairsWorkspace.ts:552-563`
- `jdgWorkspace.ts:98-107`
- `goalsStore.tsx:288-303`
- `sport/plannerModel.ts:493-545`

Representative immediate save effects:

- `Zadania.tsx:1903,1926-1928`
- `Kalendarz.tsx:130,144-148`
- `Notatki.tsx:127,142-144`
- `Praca.tsx:132,147-149`
- `Podroze.tsx:365,379-381`
- `Sprawy.tsx:326,338-340`
- `Jdg.tsx:99,109-111`
- `Sport.tsx:120,168-170`
- `goalsStore.tsx:306-319`

Odżywianie demonstrates the correct contract: return an explicit corrupt state, do not save until mutation, and let the user retry or intentionally reset (`nutritionWorkspace.ts:222-263`, `Odzywanie.tsx:629-635,1183-1197`).

Cross-tab synchronization is also incomplete: `saveTaskWorkspace` dispatches a custom update event, but no consumer listens to it and no module listens to the browser `storage` event. Concurrent tabs can therefore display stale state and later overwrite newer state. See **AUD-051**.

Most workspaces are serialized synchronously as a whole on each committed state mutation; Goal notes in particular can trigger provider persistence on every keystroke. This is acceptable for current demo sizes but creates quota/jank headroom and makes write failure more likely as histories grow. See **AUD-055**.

### Focus and overlay integrity

`Modal` installs its trap and captures prior focus in an effect dependent on `onClose` (`Modal.tsx:33-71`). Page-owned drafts recreate `onClose` on each render. Editing a non-first field therefore cleans up the old effect, restores external focus, reruns the effect, and focuses the first field.

This affects editors in Sprawy, Praca, Podróże, JDG, Notatki, and timer-updated Sport dialogs. The modal's semantics, Escape, wrap, and restoration are otherwise a strong base; its effect must run once per mounted dialog while reading the latest close callback from a ref/effect event.

### Date and recurrence correctness

The application mixes calendar dates with elapsed milliseconds:

- Goal and module countdowns divide milliseconds by 86,400,000.
- Sport cycle-week math uses elapsed days.
- Task shortcuts add exactly 24 hours.
- Goal defaults use UTC `toISOString().slice(0, 10)`.
- Recurring payments use native `setMonth`.

These fail around Warsaw DST and month ends. Example: 2026-03-23 → 2026-03-30 is 167 hours, so floor division produces six days; 2026-01-31 + one month can become 2026-03-03. Use a shared calendar-date type and date-part arithmetic, not duration arithmetic.

### Error and deployment boundaries

- Lazy routes have no app-owned loading fallback or route `errorElement`; unknown routes silently redirect to Today (`routes.ts:4-26`, `App.tsx:5-9`).
- A malformed travel currency can therefore make the route fail without a product recovery surface.
- Open Food Facts uses `/api/openfoodfacts/search`, but only Vite dev/preview declares the proxy (`nutritionCatalog.ts:24,189-194`, `vite.config.ts:5-20`).
- Google Fonts is a remote render dependency in an otherwise local product (`fonts.css:1`).

### Architecture and performance

- Ten source CSS files contain **12,564 physical lines / 273,941 bytes**.
- The generated CSS audit reports **2,366 rules, 2,744 selectors, 38 unique colors, 20 font sizes, 10 shadows, 10 z-index values, 24 media conditions, and 18 `!important` declarations**.
- `main.tsx` imports one `app.css`, which imports every route stylesheet before Tailwind (`app.css:1-10`); JavaScript is route-split but CSS is not.
- Largest page files: Zadania 2,892 lines, Odżywianie 1,978, Sprawy 1,914, Podróże 1,623, Cele 1,408, Praca 1,175.
- Sport timer updates can serialize the full planner state every second.
- Strict TypeScript is enabled, but unused locals/parameters are disabled and there is no ESLint/React Hooks enforcement (`tsconfig.app.json:10,18-19`).

This is maintainability and regression headroom rather than an immediate gzip emergency.

### End-to-end user-flow audit

Step counts below are typical user actions from the relevant module, excluding initial sign-in because the product is local-only and has no authentication flow.

| Flow | Current path and steps | Observed friction/risk | Recommended target |
|---|---|---|---|
| Check everything planned today | Open Dzisiaj → scan balance → scan module register; **1–2 actions** | Fast and clear, but the balance arithmetic disagrees with goal/nutrition module state. | Keep the layout; compute every module through one dated `DayStatus` contract. |
| Complete an item | Dzisiaj → module → completion control; **2 actions**, or **1** inside the module | Completion contracts differ; Calendar delete is permanent, tiny controls and role-button composites weaken keyboard use. | Shared command model with completion, archive/trash, feedback, and undo across entry points. |
| Open item details | Select task/note/goal/work item; **1 action** | Details become unmanaged overlays below 1380px; selection/back behavior varies. | Shared route-aware detail drawer with Escape, focus return, backdrop/inert, and deep-link policy. |
| Create a task | Dzisiaj CTA → Zadania → type/submit; **2–3 actions**, or **1–2** in Zadania | Dzisiaj does not focus creation; metadata controls are mouse-only; submit has no accessible name. | `/zadania?new=1` or navigation state that opens/focuses a labelled shared composer. |
| Edit/schedule a task | Open detail → open date → choose options → OK; **3–6 actions** | Visible reminder/repeat/timezone settings are false affordances; outside click saves; timed tasks can lose time. | Remove unsupported options immediately, then implement a versioned schedule model and explicit Apply/Cancel. |
| Move a task to another date | Drag Calendar item; **1 action**, or open detail/edit date; **3–4** | Grid drag lacks keyboard move/undo and date editor is unsafe. | Keyboard move command, shared date picker, announced result, and undo. |
| Create/edit a goal | Cele → Nowy cel → essentials → submit; **2–8 actions** | Dynamic model is capable, but form labels are not associated and advanced color can break contrast. | Label every control, keep essentials first, constrain accent choices, validate/import through a schema. |
| Plan a workout | Sport → Cycle/overview → add or move → save; **3–5 actions** | Generally strong; planner keyboard behavior and dirty-navigation protection are incomplete. | Preserve current flow, add consistent roving/move controls and a leave guard. |
| Complete a workout | Sport Today → Start → log session → Finish; **3+ actions** | Clear flow, but the finish dialog can refocus on timer ticks. | Fix Modal lifetime; isolate display timers from persisted planner state. |
| Log food | Odżywianie → Add → search/select → quantity → save; **4–5 actions** | Fast and resilient; production proxy contract is undocumented. | Preserve flow; ship a real production endpoint and smoke test. |
| Add water | Odżywianie → amount control; **1 action** | Fast, but remains active after “close day,” contradicting the lock metaphor. | Decide whether close means lock or status; enforce it consistently. |
| Check work obligations | Praca → overview/company/project; **1–3 actions** | Hierarchy is clear, but paused/completed-project tasks pollute attention and do not enter global Tasks. | Project-state filtering plus a shared commitment projection. |
| Manage a payment | Sprawy → payments/subscriptions → add/edit/mark; **3–5 actions** | Automatic items never roll; manual month-end recurrence is wrong; module ownership is unclear. | Central recurrence engine, lifecycle/history, and canonical Finance/Sprawy IA. |
| Create and find a note | Notatki → create/edit/save or search/open; **2–4 actions** | Discovery is good; closing/selecting another item can discard unsaved text. | Autosave drafts or explicit dirty guard with Save/Discard/Cancel. |
| Review monthly finances | Sprawy → Budget → select month; **2–3 actions** | Scannable ledger, but there is no Finanse route and relationships to payments/JDG are implicit. | Decide canonical Finance IA; expose a monthly overview linking budget, actuals, obligations, and JDG. |

---

## 5. Design-system findings

### Effective current system

Source: `src/styles/tokens.css:4-69`.

| Domain | Current contract |
|---|---|
| Fonts | Plus Jakarta Sans; DM Mono for data |
| Type | 9, 10, 11, 12, 13, 16, 22px |
| Spacing | 4, 8, 12, 16, 20, 24, 28px |
| Radius | 3, 6, 8, 12, 16px, pill |
| Graphite surfaces | `#1c1c1c`, `#1e1e1e`, `#222`, `#242424`, `#2a2a2a`, `#2e2e2e`, `#333` |
| Text | `#f0f0f0`, `#a0a0a0`, `#969696`, disabled `#444` |
| Accent | blue `#4772fa`, text blue `#809af4`, strong blue `#3e63da` |
| Semantic | success `#70b89f`, warning `#d4aa68`, danger `#cf777c`, violet `#9b8ce8` |
| Controls | 28px compact, 40px default; 44px coarse-pointer override only for selected shared controls |
| Shell | 204px app sidebar, 250px context sidebar, 370px detail, 70px page header |
| Shadows | floating and modal |
| Motion | 140ms fast, 180ms normal, common ease-out |
| Main breakpoints | 1380, 980, 760, 620px, plus many module-local conditions |

### Objective inconsistencies

1. **Token enforcement, not token absence, is the primary issue.** The base contract is already compact; local page palettes and inline styles bypass it.
2. **Disabled text is used as readable content.** `#444` has only about 1.4–1.6:1 contrast on common graphite surfaces, yet it is used for completed titles, empty-state copy, counters, instructions, and active icons (`tokens.css:21`, `ui.css:329-335`, numerous uses in `Zadania.tsx`).
3. **Goals use action blue as small text.** The design already provides `--color-precision-blue-text`; Goals maps text to the lower-contrast primitive instead.
4. **Semantic colors are category identities.** Nutrition macros, goal/work categories, and note colors reuse success/warning/danger, weakening status meaning.
5. **Sport locally changes global text tokens** (`app.css:832-836`).
6. **Goal accent setting is both unconstrained and largely ineffective.** It permits off-system values, stores them, but primary card/detail surfaces largely ignore them.
7. **Responsive contracts are fragmented.** There are 24 media conditions and no container queries; component behavior depends on page-specific viewport rules.
8. **Elevation/z-index is not named sufficiently.** Ten z-index values and multiple local portals/overlays create collision risk.
9. **Empty-state implementation differs from documentation.** Shared minimum is 176px while the documented system specifies at least 208px (`ui.css:392`, `DESIGN.md:375`).
10. **Micro controls bypass coarse-pointer sizing.** Task checkboxes are 11–17px and many custom icon buttons remain 28–30px.

### Recommended normalized system

Do not redesign the visual language. Freeze and enforce it:

- Keep the existing primitive graphite palette, but expose semantic aliases such as `surface-shell`, `surface-canvas`, `surface-raised`, `surface-input`, `surface-hover`.
- Keep the published type scale, but restrict 9–10px to nonessential labels; use at least 11–12px for instructions, empty-state copy, and actionable metadata.
- Reserve disabled text for genuinely unavailable controls. Use muted/secondary for completed or low-priority readable content.
- Use `precision-blue-text` for small text and `precision-blue`/strong only for borders, fills, larger data, and focus.
- Reserve success/warning/danger for state, not stable categories. Introduce a neutral category palette or use icons/labels before color.
- Keep the 4/8/12/16/20/24/28 spacing and documented radius scale; ban raw near-duplicates such as 10px/15px radii without an explicit component exception.
- Define icon tokens: 12/13px dense, 15/16px default, 18/20px prominent.
- Define named layers: base, sticky, popover, detail-drawer, modal, toast, portal.
- Standardize global breakpoints at 1380/980/760/620 and use container queries inside complex workspaces.

### Shared components to add or consolidate

- `ResponsiveDrawer` / managed `DetailPanel`.
- Non-nested `RecordRow` with dedicated open, complete, and menu controls.
- APG-compliant `DatePicker` and calendar grid.
- `PopoverMenu` that owns trigger naming, initial focus, Escape, outside click, and return focus.
- `ConfirmAction` plus reusable undo toast.
- `MoneyField`, `NumberField`, and localized parsing/formatting.
- `Progress` with visual and ARIA values, including over-target states.
- `StatusBadge` and neutral `CategoryBadge`.
- Mobile primary navigation plus `More`.
- URL-state hook for views, filters, selection, and back-button behavior.
- Versioned storage/recovery repository.

---

## 6. Prioritized issue register

Effort guide: **XS** ≤ half day, **S** 1–2 days, **M** 3–5 days, **L** 1–2 weeks, **XL** multi-week/product-model work.

| ID | Severity | Category | Tab | File/component | Problem | Recommendation | Effort | Scope |
|---|---|---|---|---|---|---|---:|---|
| AUD-001 | **Critical** | Accessibility, Functionality | Global editors | `ui/components/Modal.tsx:33-71`; Sprawy `:591-594,1698-1721`; Praca `:335-338,1047-1069`; Podróże `:556-559,1420-1435`; `SportActiveSession.tsx:640-687` | The focus-trap effect depends on `onClose`. Page-owned drafts recreate that callback on render, so cleanup restores outside focus and the new effect focuses the first field. Multi-field keyboard entry can jump after each change; a timed Sport dialog can jump every second. | Mount the trap once per dialog, read the latest close callback through a ref/effect event, and add focus-stability tests for every editor family. | M | Global |
| AUD-002 | **Critical** | Functionality, Architecture | Global persistence | Loaders in `taskWorkspace.ts:145-178`, `notesWorkspace.ts:193-211`, `workWorkspace.ts:214-234`, `travelWorkspace.ts:444-460`, `affairsWorkspace.ts:552-563`, `jdgWorkspace.ts:98-107`, `goalsStore.tsx:288-303`, `plannerModel.ts:493-545`; page autosaves listed in §4 | Invalid/version-mismatched local data silently becomes demo/default state, then mount autosave overwrites the original raw payload. A recoverable corruption or missing migration becomes permanent data loss. | Shared repository returning explicit missing/ok/corrupt states; quarantine the raw payload, run migrations, block saving fallback until user mutation/reset, and expose restore/export. | L | Global |
| AUD-003 | **Critical** | Functionality, UX | Zadania | `Zadania.tsx:140-154,423-491,665-864,1128-1144,1439-1452,2034-2067`; `taskWorkspace.ts:11-27` | Date UI accepts reminder, repeat, duration, all-day, and timezone settings that the model does not store. Existing timed tasks initialize as `allDay: true`; OK or outside-click can erase their time. The UI claims success for values that disappear after reopen/reload. | Immediately remove/disable unsupported controls. Then add a versioned schedule/recurrence model, correct all-day initialization, explicit Apply/Cancel, migrations, and round-trip tests. | M–L | Tab + shared model |
| AUD-004 | **Critical** | Functionality, Data integrity | Kalendarz, Zadania | `Kalendarz.tsx:256-260`; `Zadania.tsx:2111-2115`; `taskWorkspace.ts:209-213` | Calendar permanently filters out a shared task while Zadania marks it deleted for recoverable trash. The same destructive action has different, one-way outcomes depending on entry point. | Route both through one task command (`trash`, restore, purge), show consistent confirmation/undo, and regression-test both routes. | S | Global task domain |
| AUD-005 | **High** | UX, Content/terminology, Architecture | Global IA, Biuro, Finanse, Sprawy | `routes.ts:9-23`; `Layout.tsx:38-49`; `Finanse.tsx:3-25,35-37,90-103`; `PRODUCT.md` | Brief and product disagree: no Biuro, no routed Finanse, and finance/JDG are inside Sprawy. An unreachable hard-coded Finanse prototype has inactive controls. Users cannot form a stable mental model or access the specified modules. | Decide canonical ownership and naming; migrate data and URLs; add redirects/copy. Delete the orphan or intentionally build it—do not retain two contradictory stories. | L | Global product decision |
| AUD-006 | **High** | Functionality, Architecture | Goals, Sport, Tasks, Sprawy, JDG, Travel | `GoalDialogs.tsx:129-130,219,242`; `Cele.tsx:381-389`; `plannerModel.ts:562-565`; `Sprawy.tsx:278-281`; `Jdg.tsx:90-94`; `Zadania.tsx:522-523` | Local dates are calculated with UTC serialization, exact 24-hour addition, or milliseconds divided by 86,400,000. Warsaw DST produces wrong “tomorrow,” countdown, and cycle-week results. | Central `LocalDate` utilities using date parts/Temporal; ban duration arithmetic for calendar days; add spring/fall DST and midnight tests. | M | Global |
| AUD-007 | **High** | Functionality, Content/terminology | Sprawy/Finanse | `Sprawy.tsx:1365-1467`; `affairsWorkspace.ts:593-598` | Automatic payments/subscriptions never advance and remain overdue. Manual recurrence uses `setMonth`, so January 31 can skip February. Financial status becomes misleading. | Shared recurrence engine with month-end clamping, next-instance/history lifecycle, automatic/manual semantics, and finance regression tests. | M | Finance domain |
| AUD-008 | **High** | Functionality, UX | Dzisiaj | `Dzisiaj.tsx:249-253,417-423,455-486,702-745` | Every active daily-frequency goal remains “attention” even after today’s progress. Nutrition can be complete but never contributes to completed/total. The headline ring can contradict module rows and never reach complete. | Have each module emit a normalized dated status (`total`, `done`, `attention`, `complete`), or rename the top metric so it does not claim full-day completion. | M | Global dashboard contract |
| AUD-009 | **High** | Accessibility | Cele | `GoalDialogs.tsx:80-87,143-151,153-252`; `CelSzczegoly.tsx:124-126` | Goal form “labels” are unassociated spans, leaving text/date/number/note controls unnamed. Several detail icon controls also lack names. Invalid combinations only disable submit without a field explanation. | Use shared labelled fields, forward errors/descriptions, show why submit is blocked, name every icon button, and run axe + keyboard regression tests. | S–M | Tab |
| AUD-010 | **High** | Accessibility, Functionality | Zadania | `Zadania.tsx:2569-2654`; `app.css:5298-5315` | Quick-entry metadata/remove/submit controls are `onMouseDown`-only, so Enter/Space-generated clicks do nothing. The input has only placeholder text and CSS explicitly removes its focus indication. | Use `onClick`, `type="button"`, accessible names, labelled input/form submit, and `:focus-within` ring. Test keyboard-only capture. | S | Tab |
| AUD-011 | **High** | Accessibility, UX | Zadania | `Zadania.tsx:246-308,405-864` | Bespoke Select/date/time controls lack dialog/tab/switch/grid semantics, initial focus, Escape, return focus, and full day/month names. Outside click silently commits despite an OK button; static GMT+2 is seasonally wrong and looks clickable without action. | Replace with shared APG controls; explicit Apply/Cancel; derive timezone; remove decorative fake controls; consolidate all task scheduling UI. | M–L | Tab + shared UI |
| AUD-012 | **High** | Accessibility, Interaction | Kalendarz | `Kalendarz.tsx:299-351,391-406` | Month grid makes 35–42 cells separate Tab stops without rows/headers/roving focus. Detail is labelled dialog but has no focus move, Escape, return focus, or keyboard move command. | Implement APG grid arrow/Home/End/Page navigation, one Tab stop, keyboard move, and managed popover/drawer behavior. | M | Tab + shared calendar |
| AUD-013 | **High** | Functionality, UX | Notatki, Sport | `Notatki.tsx:208-304,634-636`; `Sport.tsx:119-140,200-216` | Closing/selecting another note or leaving can silently drop drafts. Unsaved Sport cycle edits have no route/unload guard. Personal data entry is easy to lose without feedback. | Autosave safe drafts or implement shared dirty-state Save/Discard/Cancel and `beforeunload`/navigation blocking. | M | Shared pattern |
| AUD-014 | **High** | Accessibility, Interaction | Zadania, Cele | `Zadania.tsx:884-960`; `Cele.tsx:721-823` | Role-button rows/cards contain native buttons. In Goals, child key events can also trigger parent selection. Composite semantics and activation targets are ambiguous. | Use semantic list/article containers with an explicit title/open link/button; keep completion/status/menu controls as siblings; remove parent role-button. | M | Shared record-row pattern |
| AUD-015 | **High** | Accessibility, Visual consistency | Cross-tab, especially Zadania/Dzisiaj | `tokens.css:21`; `ui.css:329-335`; `Zadania.tsx:915,1368,1778-1805,2229-2340,2717-2794`; `today.css:313-325` | `#444` disabled text is about 1.4–1.6:1 on common surfaces, yet it renders completed titles, instructions, counters, and empty-state copy. Opacity further erases complete Today rows. | Reserve disabled for unavailable decoration/control state; use muted/secondary for readable completion/metadata; add token-level contrast tests. | M | Global |
| AUD-016 | **High** | Accessibility, Visual consistency, Functionality | Cele | `Cele.tsx:96-103,406,990-1034`; `CelSzczegoly.tsx:30-42,108-124`; `GoalDialogs.tsx:172,203` | Goals use primitive blue for 9–11px text (about 3.3–3.7:1) rather than text-safe blue. The arbitrary accent is stored/mapped but primary card/detail rendering largely ignores it, so the setting is ineffective while permitting off-system values. | Map readable text to `precision-blue-text`; remove the setting or offer a controlled palette and apply it consistently with computed safe foregrounds. | S–M | Tab + token enforcement |
| AUD-017 | **High** | Functionality, Validation | Podróże | `Podroze.tsx:268-274,428-433,565-710,1451-1472` | Invalid 1–2 character currency can throw during render; booking/itinerary dates are not checked for chronology or trip range. Reservation costs are omitted from budget totals, inviting inaccurate totals/double entry. | Validate ISO currency and date ranges before save; use error boundary; link reservations to budget with explicit include/exclude/source handling. | M | Tab |
| AUD-018 | **High** | Functionality, Data integrity | Cele | `goalsStore.tsx:273-285,359-373`; `Cele.tsx:1213-1224` | Goal import validates only shallow shapes, replaces live data immediately, makes no backup/preview, and gives no success/failure feedback. Malformed nested milestones/progress can pass and break later logic. | Full versioned schema validation, migration, preview/diff, automatic backup, explicit confirm, and announced result. | M | Tab + persistence |
| AUD-019 | **High** | Architecture, UX | Zadania, Praca, Podróże | `taskWorkspace.ts:11-27`; `workWorkspace.ts:22-39`; `travelWorkspace.ts:66-95` | Three unrelated task schemas/stores mean work/travel commitments are absent from global Tasks/Calendar and need duplicate completion/date logic. “Task” means different things by route. | Define a common commitment projection/repository with source adapters and contextual metadata; retain domain-specific fields behind adapters. | XL | Global domain model |
| AUD-020 | **High** | Architecture, Visual consistency | Global | Page sizes listed in §4; `app.css:1-10`; local controls in `Zadania.tsx:246-864`; dead duplicate Goals data `Cele.tsx:141-326`; inline-style counts | Monolithic pages, 271 task inline-style objects, route-local controls, dead duplicate data, and all route CSS loaded globally make normalization and regression control progressively harder. | Decompose by domain hook/view/dialog, move repeated patterns into shared primitives, delete dead data, import route CSS from lazy modules, and enforce tokens in review/lint. | L–XL | Global |
| AUD-022 | **High** | Accessibility, Responsiveness | Any route with details | `ui.css:420-434`; `ui/components/Shell.tsx:64-69` | Below 1380px `DetailPanel` becomes an absolute overlay but remains a plain aside—no backdrop/inert background, focus trap, Escape, or return focus. Keyboard can move behind obscuring content. | Replace with a responsive Drawer primitive that changes semantics/behavior with presentation, and regression-test 1440/1280/768 widths. | M | Global |
| AUD-023 | **High** | Architecture, Reliability | Global | `package.json:6-15`; `tsconfig.app.json:10,18-19`; no test files/config | No unit/component/e2e tests and no JS/React linting protect complex local data, focus, date, and recurrence flows. Passing TypeScript cannot detect the observed behavioral failures. | Add ESLint + React Hooks, Vitest/RTL, and Playwright. Start with Critical flows, storage fixtures, keyboard, DST, recurrence, and routing. | L | Global |
| AUD-033 | **High** | Responsiveness, UX | Global mobile shell | `app.css:783-828`; `Layout.tsx:622-624` | Mobile replaces the sidebar with ten horizontally scrolling items, hides scrollbar/overflow affordance, and removes desktop profile/settings access. Later modules and settings are undiscoverable. | Four or five primary destinations plus More; expose profile/settings; auto-scroll active destination; preserve safe-area/coarse-target behavior. | M | Global |
| AUD-034 | **High** | Accessibility, Functionality | Shared Select, all tabs | `ui/components/Select.tsx:154-220,231-265` | The visible combobox uses `aria-activedescendant`, while tabbable button options form a second focus model. Tab can leave it open; Escape/arrows only live on trigger. Explicit ARIA naming is spread onto the hidden `aria-hidden` select, not the visible control. | Implement one APG combobox/listbox model, forward name/description to the trigger, add typeahead, and close/restore on Tab/focusout/Escape. | M | Global |
| AUD-036 | **High** | Architecture, Trust | Global persistence | `Layout.tsx:595-613`; only Goals exposes export/import | The app promises device-local data but has no app-wide backup/restore or recovery center. Browser cleanup, quota failure, or a migration bug can remove the user's operating history. | Versioned full-workspace export/import, pre-import backup, recovery UI, quota visibility, and documented storage policy. | L | Global |
| AUD-021 | **Medium** | Visual consistency | Sport | `app.css:832-836` | Sport locally redefines secondary/muted text to brighter raw values, so tab switching changes the typographic contrast system without semantic reason. | Remove local override; fix unreadable selectors through global semantic roles instead. | XS | Tab/global token |
| AUD-024 | **Medium** | Performance, Architecture | Sport | `SportActiveSession.tsx:346-363,640-651`; `Sport.tsx:168-170,607-611` | Timer ticks update lifted planner state and can serialize the full local workspace every second, rerendering the active-session tree. | Store timer start/pause timestamps, isolate display tick, and persist lifecycle transitions/debounced meaningful edits only. | M | Tab |
| AUD-025 | **Medium** | Functionality, Deployment | Odżywianie | `nutritionCatalog.ts:24,189-194`; `vite.config.ts:5-20` | Food search relies on a Vite dev/preview proxy; a static deployment has no documented `/api/openfoodfacts/search` route and will 404. | Ship a serverless/backend proxy or environment endpoint; document it and run a production smoke test. | M | Deployment/global |
| AUD-026 | **Medium** | Functionality, UX | Routing/global | `routes.ts:4-26`; `App.tsx:5-9` | Lazy routes have no shell-preserving loading state or route-owned error boundary. Unknown URLs silently redirect to Today, masking broken links; chunk/data errors fall to generic behavior. | Add Router fallback, per-route error UI with retry/recovery, and an intentional not-found screen. | S–M | Global |
| AUD-027 | **Medium** | Accessibility, Interaction | Cele and shell popovers | `Cele.tsx:713-821,1211-1225,1397-1404`; `CelSzczegoly.tsx:99`; `Layout.tsx:480-592` | Several menus/settings overlays own no initial focus, Escape/outside contract, focus return, or dialog semantics. Shared Menu arrow support cannot help until focus enters it. | Shared PopoverMenu/SettingsDialog that owns trigger ARIA, focus, dismissal, and collision behavior. | M | Global pattern |
| AUD-028 | **Medium** | Accessibility, Component integrity | Cele; Nutrition analysis | `ui/components/Tabs.tsx:36-56`; `CelSzczegoly.tsx:101-128`; compare `Podroze.tsx:1045` | Shared Tabs always emits `aria-controls="panel-…"`, but several consumers do not create the promised tabpanel/label relationship. Assistive relationships point to missing nodes. | Make Tabs render/provide panel props, require corresponding `role=tabpanel`, and test IDs. | S | Global component |
| AUD-029 | **Medium** | UX, Routing | Sprawy, Notes, Praca, Sport, Goals | `Sprawy.tsx:251-255,869-872`; `Notatki.tsx:126-140`; `Praca.tsx:131-145`; `Sport.tsx:120-128`; `Cele.tsx:1088-1089` | Meaningful subviews/selection/filter state is inconsistently URL-backed. `?widok=jdg` can remain after selecting another view, so remount returns to JDG. Back/refresh behavior varies by tab. | Shared URL-state policy: encode meaningful views/IDs/filter, clear stale parameters, decide which transient state resets. | M | Global |
| AUD-030 | **Medium** | Functionality, Content | Dzisiaj, shell | `todayWeather.ts:23-25,67-100`; `Dzisiaj.tsx:671-684`; `Layout.tsx:245-299` | Dzisiaj always says Warsaw while the shell independently requests geolocation, producing two fetch/cache/permission models and potentially conflicting locations. | One weather/location service and one user preference; display source/permission/fallback consistently. | S–M | Global |
| AUD-031 | **Medium** | UX, Visual consistency | Dzisiaj | `today.css:70-148,313-325`; detector flags `today.css:124` | The 26px counter is outside the type scale and can dominate the next-action copy; full-row 0.5 opacity over-subdues completed content. | Use the 22px headline/data token or a smaller inline value; reduce prominence through surface/border and readable muted text rather than opacity. | S | Tab |
| AUD-032 | **Medium** | UX, Functionality | Dzisiaj → Zadania | `Dzisiaj.tsx:688-695` | “Nowe zadanie” sounds like creation but only routes to Zadania, forcing another discovery/action. | Pass navigation state/query that opens and focuses the task composer, or relabel as “Otwórz zadania.” | XS–S | Cross-tab |
| AUD-035 | **Medium** | Accessibility | Shared DatePicker/Sport | `ui/components/DatePicker.tsx:107-122,146-217`; `SportPlanner.tsx:664` | Popup has 42 tabbable day buttons, no roving focus/arrows/Home/End, and Escape is handled only while focus remains on the trigger. Portal order makes keyboard entry awkward. | APG date-picker grid with initial selected/today focus, full key map, Escape inside popup, and return focus. | M | Shared component |
| AUD-037 | **Medium** | Functionality, Content, Accessibility | Zadania | `Zadania.tsx:2015-2021,2082-2109,2261-2271,2366-2375` | Deleting lists/tags leaves stale task references. Hashtag parsing with `\w` excludes Polish diacritics. Edit/delete actions are hover-only and unnamed, making taxonomy management unreliable by touch/keyboard. | Migrate/remove references with confirmation; use Unicode property escapes and normalized labels; move actions into a labelled always-reachable menu. | S–M | Tab |
| AUD-038 | **Medium** | UX, Functionality, Content | Kalendarz | `Kalendarz.tsx:261-266,278-304,363-382`; no `@media print` | Crowded cells hide events without “+N”/agenda access; “event” creates a task with silent `hobby` defaults; print control has no print layout. | Overflow affordance/agenda, consistent task terminology/default source, and tested print stylesheet—or remove Print. | M | Tab |
| AUD-039 | **Medium** | Accessibility, Interaction | Sport | `SportPlanner.tsx:267-378,500-550,811-815`; `Sport.tsx:366-375,775-795` | Planner week tabs/one drag surface lack the strongest module's own keyboard standard. Workout deletion is immediate while template deletion confirms. | Reuse Tabs/move menu, provide keyboard move, and one deletion confirmation/undo contract. | S–M | Tab |
| AUD-040 | **Medium** | Functionality, Accessibility, UX | Odżywianie | `Odzywanie.tsx:727-740,1176-1180,1223-1249,1310-1345,1393,1427-1434,1711-1888` | “Close day” does not lock inputs and next mutation silently reopens it; ARIA progress hides overage; goal modal is dense. Terminology, state, and control availability conflict. | Define close as true lock or rename it; require explicit reopen; expose actual/target in ARIA; split essential/advanced goal setup. | M | Tab |
| AUD-041 | **Medium** | Functionality, UX, Accessibility | Praca/Dzisiaj | `Praca.tsx:247-269,468-476,1001-1004` | Attention includes tasks from paused/completed projects; parent completion cascades without warning/undo; a visual progress track lacks progressbar semantics. | Filter by active project or label inclusion, confirm/undo cascades, and use shared Progress. | S–M | Tab + dashboard |
| AUD-042 | **Medium** | Functionality, UX | Sprawy | `Sprawy.tsx:480-485,851-862,932-934,1134-1138,1647-1667` | “Within 30 days” has no lower bound, mixing stale overdue items with upcoming; controlled money inputs coerce an empty editing state to zero. | Separate overdue/upcoming ranges; use localized numeric draft strings with validation on blur/submit. | S | Tab |
| AUD-043 | **Medium** | Functionality, Content | JDG | `jdgWorkspace.ts:26-38`; `Jdg.tsx:168-187,261-263,343-345` | Tax checklist assumes PIT-28/ZUS/VAT for everyone. Month reset and custom deletion are immediate without confirm/undo. Wrong assumptions and irreversible cleanup reduce trust. | Configurable tax profile/templates; confirm + undo for month reset and deletions; preserve audit history. | M | Tab/domain |
| AUD-044 | **Medium** | UX, Content | Notatki | `Notatki.tsx:105-111,351-371,407-474` | Lists cannot be renamed/deleted, tags stop at seven without “all,” and case-only tag duplicates are possible. Collections become harder to maintain as data grows. | Complete list CRUD with migration/confirm; searchable all-tags view; normalize/case-fold tags. | M | Tab |
| AUD-045 | **Medium** | UX, Functionality, Content | Podróże | `Podroze.tsx:842-870` and trip actions | Trip subitems can be deleted, but the trip itself can only be completed; overview CTA “Sprawa” is vague. Lifecycle and action wording are incomplete. | Add archive/delete/export with confirmation and restore policy; name CTA for the concrete next object/action. | S | Tab |
| AUD-048 | **Medium** | Visual consistency, Content | Goals, Nutrition, Work, Notes | `Odzywanie.tsx:96-101,1375-1395`; `goalsStore.tsx:12-16`; `Praca.tsx:49`; `notes.css:314-341` | Success/warning/danger colors double as permanent macro/category identities. A green item can mean “protein,” “personal,” or “successful,” weakening semantic honesty. | Neutral/category accent palette; reserve semantic colors for state and pair every state with text/icon. | M | Global |
| AUD-049 | **Medium** | Accessibility, Responsiveness | Tasks and custom controls | `app.css:5154-5190`; custom 28–30px buttons across Zadania/Cele | Completion targets are 11–17px and many custom controls bypass the shared 44px coarse-pointer rule. They are difficult to acquire and inconsistent with touch behavior. | Minimum 24px target/spacing for desktop and 44px coarse-pointer hit area, using pseudo hit zones without increasing visual density. | M | Global component pattern |
| AUD-050 | **Medium** | Functionality, Accessibility | Zadania | `Zadania.tsx:1269-1271` | Task detail renders a formatting icon as an unnamed button with no handler. It advertises an action that cannot be completed and adds a meaningless keyboard stop. | Remove it until implemented, or provide the actual formatting command, accessible name, state, and test. | XS | Tab |
| AUD-051 | **Medium** | Functionality, Architecture | Global local state | `taskWorkspace.ts:181-188`; no listener for `rootine:task-workspace` or `storage` under `src/app` | A task save emits an event that nothing consumes; other stores emit no synchronization contract. Multiple open tabs can stay stale and last-writer-wins can discard changes. | Shared repository subscription using same-tab custom events plus cross-tab `storage`/BroadcastChannel, with updated-at conflict handling. | M | Global |
| AUD-052 | **Medium** | UX, Visual consistency | Cele | `Cele.tsx:721-823`, especially `:733-777` | Completed/paused goals use the same card surface and headline emphasis as active goals; only the status control differentiates them. Large lists do not visually recede inactive work as intended. | Add semantic state class, readable muted title/metadata, reduced accent/progress emphasis, and preserve full emphasis on hover/focus. | S | Tab |
| AUD-053 | **High** | Functionality, UX | Zadania | `Zadania.tsx:2115,2730-2743,2798-2803` | Task delete is soft, but Trash offers no restore or permanent-delete path; its completion callback is empty and detail actions do not establish a trash lifecycle. “Recoverable” deletion is therefore incomplete. | Add restore, permanent delete with confirmation, empty-trash, and trash-specific detail actions; test round trips. | M | Tab + task domain |
| AUD-054 | **Medium** | UX, Architecture | Dzisiaj, shell settings | `Layout.tsx:515-582`; fixed Dzisiaj module register `Dzisiaj.tsx:506-638` | Sidebar settings control module visibility/order, but Dzisiaj composes a fixed register. A hidden/reordered module can remain prominently linked on the dashboard, so preference meaning differs by surface. | One module registry/preferences selector consumed by desktop nav, mobile nav, settings, and Dzisiaj; define whether dashboard visibility follows navigation visibility. | M | Global |
| AUD-055 | **Medium** | Performance, Reliability | Global persistence | `goalsStore.tsx:312-319`; save effects in Notes/Praca/Podróże/Sprawy/Sport; `Sport.tsx:168-170` | Whole workspaces are synchronously JSON-serialized to localStorage on committed state changes; Goal note edits and Sport timer-driven updates can write frequently. Growth increases main-thread and quota risk. | Debounce/batch meaningful changes, isolate timers, monitor quota/error state, and move large normalized histories/blobs to IndexedDB. | L | Global |
| AUD-046 | **Low** | Performance, Offline | Global | `fonts.css:1` | Remote Google Fonts `@import` is render/network/privacy dependent in an otherwise device-local app. Offline or blocked requests alter typography. | Self-host subsetted WOFF2, preload only needed weights, retain system fallback. | S | Global |
| AUD-047 | **Low** | Visual consistency | Shared UI, dead Finanse | `ui.css:392`; `DESIGN.md:375`; detector findings in `Finanse.tsx:42,44,52,57` and `today.css:287` | Empty-state height differs from documented contract; orphan Finanse and a few local radius/type values sit outside the scale. Individually small, collectively evidence of enforcement gaps. | Align docs/component, remove dead prototype, and add style-token lint exceptions only where justified. | XS–S | Global cleanup |

---

## 7. Quick wins

These are high-leverage changes that do not require the full architecture program:

1. Route Calendar deletion through the existing task soft-delete/trash command.
2. Initialize task `allDay` from stored time and remove reminder/repeat/timezone/duration controls until they persist.
3. Change task quick-entry controls from `onMouseDown` to labelled `onClick` buttons and restore focus indication.
4. Move `Modal`'s close callback to a latest-value ref so its trap effect does not restart on every render.
5. Stop using disabled text for completed/readable copy; map Goal small text to `precision-blue-text`.
6. Make Dzisiaj's CTA focus/open the task composer.
7. Filter Praca attention to active projects.
8. Include today's completed regularity entries and nutrition state in Dzisiaj arithmetic.
9. Confirm and offer undo for JDG month reset and immediate workout deletion.
10. Replace Goal settings overlay with shared Modal after the modal fix.
11. Surface Goal import success/failure and take a pre-import backup.
12. Use Unicode-aware hashtag parsing and clean task references when lists/tags are deleted.
13. Remove the Sport text-token override.
14. Add a mobile “More” destination exposing later modules, profile, and settings.
15. Either ship Calendar print CSS or remove the Print action.

---

## 8. Structural improvements

### Persistence and recovery

- One versioned storage adapter for every domain.
- Explicit load state and migrations.
- Raw corrupt-payload quarantine.
- App-wide export/import, pre-import backup, restore, and quota reporting.
- Cross-tab synchronization and conflict policy.

### Product/domain model

- Canonical IA for Praca/Biuro/Sprawy/Finanse/JDG.
- Shared commitment projection for global Today/Tasks/Calendar while retaining domain source.
- One deletion/archive/restore/undo command model.
- Central LocalDate, recurrence, money, and localized number utilities.
- Explicit source labels when a global item originated in Work or Travel.

### Shared UI

- Fix Modal, rebuild Select and DatePicker, and add managed Drawer/PopoverMenu.
- Replace nested interactive cards with RecordRow.
- Shared Progress, MoneyField, status/category badges, confirmation, and undo.
- URL-backed meaningful views and consistent back/refresh behavior.
- Mobile primary navigation plus More.

### Code organization

- Split Zadania, Cele, Sprawy, Podróże, Odżywianie, and Praca into domain state/hooks, view sections, dialogs, and shared records.
- Route-split CSS with the lazy modules.
- Delete orphan Finanse and duplicate static Goals data after IA/data migration.
- Add Storybook-like component states or a local UI fixture route for empty/error/loading/focus/long-content verification.

---

## 9. Recommended implementation sequence

### Phase A — Critical bugs and trust blockers

1. Fix Modal effect lifetime.
2. Prevent corrupt-store overwrite and preserve raw recovery payloads.
3. Fix/remove unsafe task scheduling controls and timed-task round trips.
4. Unify Calendar/Tasks deletion and add restore/undo.
5. Add regression tests for those four changes before broader refactors.
6. Introduce DST-safe date and month-end recurrence utilities; migrate callers.

**Dependency:** do this before design refactoring. Otherwise component cleanup can mask or spread data defects.

### Phase B — Global design-system normalization

1. Correct text/blue contrast roles.
2. Separate semantic status colors from category identity.
3. Freeze token, icon, control-target, elevation, and breakpoint contracts.
4. Remove Sport/local palette overrides and raw near-duplicate values.
5. Add style/token lint checks.

**Dependency:** settle token semantics before extracting more shared components.

### Phase C — Shared component consolidation

1. APG Select and DatePicker/calendar grid.
2. Responsive Drawer/DetailPanel.
3. PopoverMenu and SettingsDialog.
4. RecordRow, Progress, MoneyField/NumberField, Confirm/Undo.
5. Replace bespoke Task/Goal controls incrementally, with interaction tests.

**Dependency:** Modal and token work from A/B must be stable first.

### Phase D — Product IA and tab-specific UX

1. Decide and migrate Biuro/Finanse/Sprawy/JDG/Praca boundaries.
2. Define shared commitment projection and source adapters.
3. Repair Today arithmetic.
4. Complete finance recurrence/history and travel budget linkage.
5. Add Notes dirty protection/collection management and Sport dirty protection.
6. Finish Nutrition close-day semantics and Work attention logic.

**Dependency:** canonical domain ownership precedes route labels, navigation, and cross-module projections.

### Phase E — Accessibility, responsiveness, performance, and polish

1. Keyboard/AT pass over every dialog, drawer, grid, menu, tab, drag flow, and icon action.
2. Mobile navigation/settings parity and coarse-pointer targets.
3. Container-query/module responsive normalization at 1440, 1280, 1024, 768, 390px.
4. Route-owned loading/error/not-found; production proxy/offline checks.
5. Route CSS splitting, Sport timer isolation, font self-hosting, print styling.
6. Full long-content, empty, corrupt, write-failure, and overflow regression pass.

---

## 10. Acceptance checklist

### Product and IA

- [ ] Every intended module is either routed or explicitly mapped/renamed with migration copy.
- [ ] Biuro, Praca, Sprawy, Finanse, and JDG each have a non-overlapping documented purpose.
- [ ] Navigation labels, route titles, Today module names, and PRODUCT documentation agree.
- [ ] Meaningful subviews survive refresh and have intentional Back behavior.

### Data safety and functionality

- [ ] Corrupt/old local data is never overwritten before explicit recovery/reset.
- [ ] Full backup/export and tested restore exist.
- [ ] Timed-task edit preserves start/end time after open, outside click, cancel, OK, reload, and DST change.
- [ ] Every visible task scheduling option persists and appears in Calendar, or is absent/disabled with honest copy.
- [ ] Task deletion has the same trash/restore/purge outcome from Tasks and Calendar.
- [ ] Dirty Notes and Sport drafts autosave or warn before close/navigation/unload.
- [ ] Recurrence clamps month ends and rolls automatic items correctly.
- [ ] Travel rejects invalid currency/date combinations and reconciles reservation/budget totals.
- [ ] Today top arithmetic equals the sum of module dated statuses.

### Accessibility and interaction

- [ ] Modal focus remains stable while every field changes and while timers update.
- [ ] All dialogs/drawers/popovers open with intentional focus, close with Escape, and return focus.
- [ ] No role-button/card contains competing native controls.
- [ ] All fields and icon buttons have programmatic names.
- [ ] Select, Tabs, menus, date pickers, and Calendar match their APG keyboard pattern.
- [ ] Every drag flow has a discoverable keyboard alternative and announced result.
- [ ] Focus is always visible; readable text meets contrast; completed content remains legible.
- [ ] Desktop targets meet spacing/size requirements and coarse-pointer targets are at least 44px.
- [ ] Status is never communicated by color alone.

### Visual and responsive coherence

- [ ] Shared shell dimensions, header alignment, canvas padding, and detail behavior remain stable across tabs.
- [ ] Production modules use the frozen token/type/spacing/radius/elevation contract.
- [ ] Semantic colors encode status only; categories use neutral/accent treatment.
- [ ] No route-local copy of shared buttons, Select, date picker, menu, modal, progress, or record row remains without a documented exception.
- [ ] Active, completed, paused, unavailable, and selected states are consistent across modules.
- [ ] 1440, 1280, 1024, 768, and 390px layouts have no inaccessible controls, clipped primary actions, or hidden navigation.
- [ ] Mobile exposes profile/settings and all modules without blind horizontal hunting.
- [ ] Long lists, long titles, long notes, crowded calendar days, and large ledgers have explicit overflow behavior.

### Engineering quality

- [ ] Typecheck, CSS lint, ESLint/React Hooks, unit/component tests, and E2E tests pass.
- [ ] Route loading, chunk failure, not-found, write failure, corrupt data, offline, and remote API failure have product-owned states.
- [ ] Critical persistence/date/focus/deletion tests run in CI.
- [ ] Production Open Food Facts proxy/endpoint is deployed and smoke-tested.
- [ ] Route CSS is split or its global cost is explicitly accepted and budgeted.
- [ ] No browser-console errors/warnings occur in the tested routes/states.

---

## 11. Remediation addendum

Implementation completed on branch `AUDITFULL` on 2026-07-28.

### Outcome

- **52 findings resolved:** `AUD-001`–`AUD-019`, `AUD-021`–`AUD-024`, and `AUD-026`–`AUD-054`.
- **2 findings materially mitigated:** `AUD-020` and `AUD-055`.
- **1 deployment verification pending:** `AUD-025`.

`AUD-020` is mitigated through route-level loading/error ownership, removal of orphan and duplicate sources, shared primitives, normalized tokens, and stronger lint/test coverage. Further decomposition of the largest page modules and the remaining global CSS is a maintainability follow-up, not a release blocker.

`AUD-055` is mitigated through deduplicated writes, debounced editor persistence with lifecycle flushes, timer isolation, quota/error visibility, and transactional backup/recovery. IndexedDB migration remains a future scaling option for substantially larger histories or binary data.

`AUD-025` is code-complete: a production API proxy, environment contract, failure handling, and supporting documentation are present. The final production smoke test requires the target hosting environment and therefore cannot be certified from this local workspace.

### Verification evidence

- `npm run check`: passed, including ESLint, TypeScript, CSS lint, 59 unit/component tests, and production build.
- Playwright: 30/30 end-to-end tests passed across desktop and mobile, including strict axe accessibility checks, navigation, focus management, drawers/modals, and persistence.
- `npm audit --omit=dev`: 0 known vulnerabilities.
- CI workflow added for the same quality and end-to-end gates.
- Recovery import is validated transactionally, with rollback, corrupt-data quarantine, quota feedback, and full-workspace export.

The original findings and recommendations above remain as the pre-remediation audit record; this addendum is the implementation ledger.
