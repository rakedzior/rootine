# Rootine design-system governance

## Scope

This document governs reusable UI infrastructure, tokens, component contracts, and the exceptions required by feature-specific behavior. It does not replace product decisions about information architecture, density, terminology, category meaning, or chart composition.

## Source-of-truth hierarchy

1. Approved product and design decisions.
2. `src/styles/tokens.css` for CSS tokens.
3. `src/app/ui/tokens.ts` and `src/app/ui/breakpoints.ts` for runtime aliases.
4. Shared component contracts in `src/app/ui/components/`.
5. Current feature implementation when it is registered as an exception.
6. Examples and secondary documentation.

Conflicts that change rendered dimensions or semantic meaning require a product decision. Documentation errors that do not change behavior may be fixed autonomously.

## Approved exception classes

- dynamic geometry: calendar coordinates, SVG geometry, and data-driven progress widths;
- data taxonomy: persisted category colors that are not UI status colors;
- visualization: chart-specific scales, labels, and series geometry;
- decorative motion: ambient scenes and non-essential visual signals;
- print: paper-specific colors and dimensions;
- theme preview: settings swatches derived from the theme registry;
- responsive exception: a local breakpoint needed for a component that cannot be represented by an official breakpoint without changing behavior.

Every exception must include a path, owner, reason, and migration or review note in `docs/design-system-exceptions.json`.

## Component rules

- Use the public exports from `src/app/ui` rather than importing implementation files directly.
- Extend a shared component when a variation is reusable; do not create a feature-local copy.
- Keep dynamic values in props or CSS custom properties, not duplicated visual markup.
- Preserve existing behavior when moving an implementation behind a shared contract.
- Use named motion tokens for ordinary interaction timing; reduced-motion overrides and registered
  ambient/chart motion remain documented exceptions. Shared animation contracts may accept a
  dynamic duration when the prop is the explicit source of timing.

## Enforcement

`npm run design-system:audit` checks the ratcheted baseline for layering, breakpoints, inline visual styles, raw colors, and direct shared-component imports. Existing known exceptions remain documented while new unregistered violations fail the audit.
