# Rootine design-system governance

## Scope

This document governs reusable UI infrastructure, tokens, component contracts, and the exceptions required by feature-specific behavior. It does not replace product decisions about information architecture, density, terminology, category meaning, or chart composition.

## Source-of-truth hierarchy

1. Approved product and design decisions.
2. `src/styles/tokens.css` for CSS tokens and `docs/design-system-exceptions.json` for approved departures.
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

## Enforcement

`npm run design-system:audit` checks the ratcheted baseline for layering, breakpoints, inline visual styles, raw colors, and direct shared-component imports. Baseline version 2 records all literal style objects separately from their disallowed property counts, so the total inventory is not confused with governed debt. Existing known violations remain ratcheted per file while a new property or a static value inside a registered path fails the audit.
