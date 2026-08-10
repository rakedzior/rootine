# Rootine visualization migration contract

The current charts and metric bars remain visually unchanged. No production chart currently consumes
all seven `--color-chart-*` roles. The zero-consumer `uiChartColors` TypeScript alias was removed and
must not return before a real shared chart consumer exists. This document is migration vocabulary and
an accessibility floor, not a claim that a shared chart component already exists.

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

## Adoption status

- Nutrition and Sport still own their chart geometry and local presentation.
- `ProgressBar` is a bounded metric primitive, not a generic chart; its adoption does not make the
  axis/grid/series contract active for Nutrition or Sport.
- A feature may adopt CSS roles incrementally, but it must keep an accessible name/summary and empty,
  loading, error, responsive, and reduced-motion states. Do not recreate a TypeScript chart-color
  alias merely to make a local chart appear shared.

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
