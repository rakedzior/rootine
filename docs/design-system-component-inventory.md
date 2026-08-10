# Rootine shared-component inventory

`src/app/ui/index.ts` is the canonical public barrel. This document records adoption and migration
status; component props and rendered CSS remain authoritative when wording here drifts.

## Adoption snapshot

The 2026-08-10 post-migration scan counted production JSX instances outside
`src/app/ui/components` (tests excluded):

| Contract | References | Files |
|---|---:|---:|
| Button | 418 | 35 |
| Input | 129 | 18 |
| Select | 111 | 26 |
| Badge | 80 | 18 |
| MenuItem | 49 | 12 |
| Modal | 43 | 22 |
| ContextNavItem | 38 | 9 |
| DatePicker | 37 | 12 |
| EmptyState | 37 | 13 |
| SectionHeader | 21 | 11 |
| Menu | 20 | 11 |
| SectionSurface | 20 | 6 |
| Card | 18 | 8 |
| ContentHeader | 16 | 13 |
| ModuleMain | 15 | 11 |
| ModuleShell | 14 | 11 |
| Textarea | 15 | 11 |
| Toast | 14 | 10 |
| ToastViewport | 10 | 10 |
| ProgressBar | 1 | 1 |

Counts are a migration signal, not a quality score. Raw buttons include listbox options, calendar
cells, drag/drop controls, and other semantics that should not be replaced mechanically.

## Active contract decisions

- `Button iconOnly` requires an accessible `aria-label` in its TypeScript props. The unused parallel
  `IconButton` API was removed instead of keeping two icon-action contracts.
- `Textarea` provides the same label, hint, error, disabled, and focus structure as `Input`; remaining
  domain-specific raw textareas are migration work, not permission to create another shared wrapper.
- `ProgressBar` has a real bounded-metric consumer in Goals. It is not a generic chart and does not
  activate the reserved axis/grid/series token vocabulary.
- `Toast` and `ToastViewport` provide the shared transient-feedback contract: semantic live-region
  tone, one optional action, explicit dismissal, and timeout pause during pointer or focus interaction.
- Unused `StatCard` and `StatGrid` APIs were removed after proving there were no production consumers.
- `DetailPanel` is docked in a reserved 408px grid track above 1380px and is a managed modal drawer at
  or below 1380px.
- `Select` listbox options are minimum 38px; the 28px row belongs to action `MenuItem`, not Select.
- `Modal` sizes are `sm=500`, `md=680`, `lg=780`, and `xl=960`; `md` is the default.
- `Badge` uses a 22px minimum height and 2px × 8px padding; `EmptyState` uses a solid border.

## Transport aliases

`uiColors`, `uiLayers`, and `uiShadows` have production consumers and remain in the public barrel.
The zero-consumer `uiRadii`, `uiSpacing`, `uiMotion`, `uiTypography`, `uiFocus`, `uiStates`,
`uiChartColors`, and `uiLayout` aliases were removed; CSS classes and `tokens.css` are authoritative.
The zero-consumer `ContextSidebar` alias was removed as well; `ModuleSidebar` is the sole contract.

## Review rule

When a public export is added, record its first production consumer in the same change. When the last
consumer disappears, remove the API or mark a dated compatibility plan; do not preserve a phantom
contract solely because it already has a file.
