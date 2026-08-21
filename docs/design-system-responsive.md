# Rootine responsive governance

`src/app/ui/breakpoints.ts` is the canonical numeric manifest. CSS media queries must repeat pixel
values because custom properties are not valid in media preludes; matching `--bp-*` declarations in
`src/styles/tokens.css` are documentation mirrors. `npm run design-system:audit` rejects drift among
the manifest, mirrors, exception paths, and actual media preludes.

## Official breakpoints

| Name | Width | Current responsibility |
|---|---:|---|
| detail | 1380px | `DetailPanel` is docked in a reserved 408px track above this value and is a modal drawer at or below it |
| context | 1180px | context sidebar collapses |
| columns | 980px | multi-column content folds into one column |
| mobile | 760px | primary navigation moves to the mobile bar |

## Registered feature thresholds

| Feature | Width | Reason |
|---|---:|---|
| settings | 560px | theme preview remains usable at compact widths |
| command center | 600px | action register becomes one column before labels truncate |
| dense workspace | 1100px | planner controls and the Calendar header need an intermediate adjustment |
| nutrition | 1120px | analysis charts preserve label readability |
| work | 1200px | work detail actions need an intermediate collapse |
| nutrition wide | 1280px | upper bound of the intermediate nutrition chart layout |

## Verification boundary

The audit rejects newly introduced unregistered width thresholds and stale registrations whose path
does not contain the declared media value. Complementary `min-width` values one pixel above a
registered `max-width` are derived thresholds. The approved DetailPanel composition is not left to a
feature: the shared shell reserves its docked track above 1380px, while `Shell.tsx` owns dialog role,
backdrop, Escape, focus containment, and restoration at or below 1380px.
