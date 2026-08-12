# Rootine design-system governance

## Scope

This document governs reusable UI infrastructure, tokens, component contracts, and the exceptions required by feature-specific behavior. It does not replace product decisions about information architecture, density, terminology, category meaning, or chart composition.

## Source-of-truth hierarchy

1. Approved product and design decisions.
2. `src/styles/tokens.css` for CSS tokens, `src/app/data/taxonomyPalette.ts` for persisted taxonomy
   colour data, and `docs/design-system-exceptions.json` for approved departures.
   Temporary, measurable debt is kept separately in `docs/design-system-migrations.json`; stable
   component override hooks and icon grammar live in `docs/design-system-contracts.json`.
3. `src/app/ui/breakpoints.ts` for the canonical numeric breakpoint manifest; CSS `--bp-*` values are validated mirrors.
4. Shared component contracts in `src/app/ui/components/`.
5. Current feature implementation when it is registered as an exception.
6. Used transport aliases in `src/app/ui/tokens.ts`, examples, and secondary documentation.

`tokens.ts` is not a competing token source. It exposes CSS variables only where existing inline
geometry still needs a string value; an exported alias with no production consumer is removed,
not evidence of an adopted runtime contract.

Conflicts that change rendered dimensions or semantic meaning require a product decision. Documentation errors that do not change behavior may be fixed autonomously.

## Approved exception classes

- dynamic geometry: calendar coordinates, SVG geometry, and data-driven progress widths;
- data taxonomy: persisted category colors that are not UI status colors;
- visualization: chart-specific scales, labels, and series geometry;
- decorative motion: ambient scenes and non-essential visual signals;
- print: paper-specific colors and dimensions;
- theme preview: settings swatches derived from the theme registry;
- responsive exception: a local breakpoint needed for a component that cannot be represented by an official breakpoint without changing behavior.

Every exception must include existing paths, an owner, a reason, a migration note, and a review
trigger in `docs/design-system-exceptions.json`. The audit rejects stale paths, missing metadata,
breakpoint values absent from the manifest, and registered media values absent from their paths.
Inline-style exceptions additionally declare `allowedProperties`. A property is allowed only when
its runtime expression is dynamic and its name matches that path contract (including an explicit
custom-property prefix such as `--goal-*`). Literal padding, font, radius, surface, and layout values
remain findings even when another dynamic property in the same file is registered; a path is never a
whole-file suppression.

Migration entries are not permanent exceptions. Each entry owns exactly one source path, lists
exact selector/property/value triples, names an owner and migration, and has an ISO expiry date.
The audit rejects expired entries and entries whose declaration disappeared or changed. This keeps
the debt visible without weakening the zero-violation baseline. Run
`node scripts/design-system-audit.mjs --list-debt` to print the remaining registered declarations.

## Component rules

- Use the public exports from `src/app/ui` rather than importing implementation files directly.
- Extend a shared component when a variation is reusable; do not create a feature-local copy.
- Add a public export together with its first production consumer. If the last consumer disappears,
  remove the API or record a dated compatibility plan instead of preserving a phantom primitive.
- Keep dynamic values in props or CSS custom properties, not duplicated visual markup.
- Preserve existing behavior when moving an implementation behind a shared contract.
- Use named motion tokens for ordinary interaction timing; reduced-motion overrides and registered
  ambient/chart motion remain documented exceptions. Shared animation contracts may accept a
  dynamic duration when the prop is the explicit source of timing.
- Choose a motion role: `feedback`, `spatial`, or `decorative`. Reduced motion shortens named roles
  through `--motion-reduced`, removes continuous decorative motion, and preserves visible state feedback.
- Density modes redefine the row-height tokens in `tokens.css`; feature styles must not maintain a
  second density scale.
- Feature CSS must not style protected `.ui-*` component selectors. If a feature needs a reusable
  geometry or density variation, add a named shared variant. Existing declarations are tracked as
  exact, expiring migrations rather than permitted by a path-wide suppression.
- `border-radius` in production CSS uses `--radius-*`, `0`, `50%`, `inherit`, or a CSS variable.
  Literal values are accepted only when they are members of the canonical token scale; a new
  numerical value must first become an approved token.
- Global custom properties may be rebound outside `tokens.css` only through a documented override
  hook in `design-system-contracts.json`. `--list-rail-width` is such a component configuration
  hook; reduced-motion rebinding is an intentional semantic scope.
- Raw colour literals may be defined only by a source registered in
  `design-system-contracts.json`. `tokens.css` owns presentation roles and
  `taxonomyPalette.ts` owns the versioned values stored in user data; feature modules import one
  of those sources instead of copying hex values.
- A lucide icon inside a primary CTA uses the 13px CTA preset and the shared 1.7 stroke (normally by
  omitting `strokeWidth`). Other icon sizes may express different roles, but they are not primary
  action grammar.
- Task-like quick entry uses `QuickComposer`; property controls use `PropertyMenu`; a feature must
  not create another local quick-composer grid or anchored option layer.
- Priorytet w ikonowym triggerze, `PropertyMenu` i pełnym `Select` używa `PriorityIcon`; feature
  podaje wyłącznie poziom i domenową etykietę, a nie własny rozmiar, stroke lub kolor flagi.
- Dates use `DatePicker`, clock values use `TimePicker`, and combined domain fields compose those
  two primitives. Native time input remains inside `TimePicker`, never directly in feature markup.
- Portal positioning, collision, outside dismissal, Escape and focus restoration belong to
  `AnchoredPopover`, `Modal`, `DetailPanel` or `ConfirmDialog`; feature modules do not recreate them.
- Destructive confirmation uses `ConfirmDialog`. Binary settings use `Switch`; form and completion
  choices use `Checkbox`.

## Enforcement

`npm run design-system:audit` runs unit tests for both source scanners, then checks the zero-violation
baseline for layering, breakpoints, inline visual styles, raw colors, CSS radii, shared-internal
overrides, global-token shadowing, local control heights, raw switch implementations,
raw select/textarea/time controls, raw priority flags, primary CTA icon grammar, and direct
shared-component imports. Baseline version 3 records inventory separately from violations.
Registered migration debt never raises an allowed count: a new selector, property, or value fails
immediately, while an obsolete or expired migration entry also fails.
