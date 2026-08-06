# Rootine component-state matrix

This matrix records the states the current shared contracts can represent. It distinguishes technical states already supported from product states that require a product decision before implementation.

| Contract/surface | Default | Hover | Focus | Selected/active | Disabled | Loading | Error | Empty | Notes |
|---|---|---|---|---|---|---|---|---|---|
| Button | yes | yes | yes | n/a | yes | not a shared prop | danger variant | n/a | Add loading only if a reusable async contract is defined. |
| Input | yes | yes | yes | n/a | yes | no | yes | n/a | Error uses `aria-invalid`, hint/error descriptions, and alert messaging. |
| Select | yes | yes | yes | yes | yes | no | yes | option-level | Native mirror and custom listbox must remain synchronized. |
| Checkbox | yes | yes | yes | checked/indeterminate | yes | no | no | n/a | Custom switch/form-card variants are registered exceptions. |
| Menu | yes | item hover | managed focus | selected item | item disabled | no | danger item | no-items caller state | Escape, arrows, Home/End, typeahead, and focus restoration are shared. |
| Modal | open/closed | backdrop | focus trap | n/a | caller-owned | caller-owned | caller-owned | caller-owned | The shell owns Escape, backdrop dismissal, and focus restoration. |
| Tabs | active/inactive | yes | roving focus | yes | yes | no | no | no-tabs caller state | Orientation and activation mode are explicit props. |
| Badge | neutral | n/a | n/a | semantic tone | no | no | danger tone | n/a | Status meaning must come from the caller. |
| ProgressBar | value | n/a | n/a | n/a | caller-owned | animated value | caller-owned tone | caller-owned | Dynamic geometry and chart bars remain separate exceptions. |
| EmptyState | n/a | action | action focus | n/a | action disabled | no | caller-owned | yes | Caller provides recovery or next action when one exists. |
| DetailPanel | docked | contained controls | drawer trap | selected record | caller-owned | caller-owned | caller-owned | caller-owned | Responsive drawer behavior is shared. |
| Route surface | loaded | contained controls | route controls | active subview | unavailable route | `RouteLoadingState` | `RouteErrorState` | `RouteNotFoundState` | Each route must expose one `ContentHeader` heading. |

## Rules

- Do not invent unreachable states solely to complete a table.
- Technical accessibility states may be implemented autonomously.
- Product behavior such as optimistic updates, permission states, and new recovery flows requires a product decision.
- Feature-specific states belong in the feature only when they represent different product semantics, not merely different markup.
