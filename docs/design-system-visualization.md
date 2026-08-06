# Rootine visualization contract

The current charts and metric bars remain visually unchanged. This document establishes the reusable contract before any chart composition or information density is changed.

## Shared roles

- axis: `--color-chart-axis`
- grid: `--color-chart-grid`
- series 1–3: `--color-chart-series-1` through `--color-chart-series-3`
- target/goal: `--color-chart-goal`
- average/reference: `--color-chart-average`

## Required behavior

- Every chart has a concise accessible name or adjacent summary.
- Number formatting follows the existing `pl-PL` formatter conventions.
- Dynamic geometry stays in the feature visualization, not in ordinary layout tokens.
- Empty and insufficient-data states explain what is missing and what the user can do next.
- Loading and error states must not resemble a completed chart.
- Reduced motion disables non-essential transitions and animated drawing.
- Responsive rules preserve labels and reading order before decorative detail.

## Current classifications

- Nutrition trend SVGs: domain-specific visualization with reusable axis/grid/series roles.
- Task summary bars: metric/progress UI; candidate for `ProgressBar` only when the bar is not a chart axis or series.
- Sport analysis bars: domain-specific visualization; do not force into a generic progress component without preserving its meaning.
- Calendar geometry: dynamic layout, not visualization token debt.

The shared `ProgressBar` supports bounded values, semantic tones, optional data-driven fill colors,
and a separate spoken value. Remaining local bars are intentionally retained when their geometry or
domain scale is part of the product meaning.

## Visual-regression baseline

`e2e/design-system-visual.spec.ts` is the focused visual baseline for the refactor. It runs at the
canonical desktop (`desktop-1440`) and responsive mobile (`mobile-390`) viewports and captures:

- Today balance and progress treatment;
- calendar overflow menu;
- task detail panel and DatePicker portal;
- task actions menu on desktop;
- goal actions menu and edit dialog;
- work add menu.

The committed images live beside the spec in `e2e/design-system-visual.spec.ts-snapshots/`. Update
them only for an intentional visual change, and record the reason in the design-system decision log.

The round `Checkbox` variant currently has no live production consumer, so its class, size, and
native indeterminate semantics are covered by `src/app/ui/components/Checkbox.test.tsx` rather than
by a screenshot fixture.
