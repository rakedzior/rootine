# Rootine responsive governance

Responsive behavior is governed by `src/app/ui/breakpoints.ts` and the mirrored CSS tokens in
`src/styles/tokens.css`. The pixel thresholds below were classified without changing their current
behavior.

## Official breakpoints

| Name | Width | Current responsibility |
|---|---:|---|
| detail | 1380px | detail panel switches from inline column to drawer behavior |
| context | 1180px | context sidebar collapses |
| columns | 980px | multi-column content folds into one column |
| mobile | 760px | primary navigation moves to the mobile bar |

## Registered feature thresholds

| Feature | Width | Reason |
|---|---:|---|
| settings | 560px | theme preview remains usable at compact widths |
| assistant | 1040px | assistant panel has a feature-specific compact composition |
| dense planner | 1100px | dense planner controls need an intermediate adjustment |
| nutrition | 1120px | analysis charts preserve label readability |
| work | 1200px | work detail actions need an intermediate collapse |
| ambient | 1280px | ambient surfaces are disabled before standard content width |

## Verification boundary

The audit rejects newly introduced unregistered width thresholds. Existing complementary `min-width`
values are treated as derived from the registered `max-width` thresholds. Layout collapse order,
scroll ownership, chart behavior, and detail-panel presentation remain product decisions; this pass
records and tests their thresholds without changing them.
