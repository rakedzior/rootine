# Rootine product inventory

This document identifies the maintained inventories and their code sources. It deliberately avoids
copying every route or export into a second hand-maintained list.

## Information architecture

The canonical global module registry is `src/app/moduleRegistry.ts`:

- Dzisiaj (`/dzisiaj`);
- Zadania (`/zadania`, owns `/kalendarz`);
- Odżywianie (`/odzywianie`);
- Sport (`/sport`);
- Praca (`/praca`);
- Cele (`/cele`);
- Podróże (`/podroze`, also owns the established `/travel/...` detail URL family);
- Pozostałe (`/sprawy`);
- Notatki (`/notatki`).

Legacy bookmarks `/biuro`, `/finanse`, and `/jdg` are redirects, not global modules.

## Screen and route inventory

`ROUTE_LAYOUT_AUDIT` in `src/app/routes.ts` is the reviewable screen inventory beside the actual
router. It records path, owning module, component, PageShell width, sidebar presence, heading
ownership, layout family, supported query-driven views, redirects, and the not-found state.
`src/app/moduleRegistry.test.ts` checks that this inventory covers every router leaf, every rendered
route resolves to its declared module, and redirect targets still resolve to a canonical module.
Route and hover-prefetch coverage are coupled by `src/app/routePrefetch.ts`.

The query-driven view families are intentionally kept on their canonical route rather than exposed
as additional global modules. This includes task smart views and calendar context, goal filters and
layout/sort state, sport planner views, work company/project context, notes list/tag filters, and the
agenda, finance, document, vehicle, health, and JDG views under `/sprawy`.

## Component inventory

`src/app/ui/index.ts` is the public barrel and therefore the canonical list of shared contracts.
Usage status, migration gaps, and component geometry are documented in
`docs/design-system-component-inventory.md`; active behavior is always defined by the component
implementation and CSS, not by the snapshot table.

## Copy and terminology inventory

`docs/content-terminology.md` defines the copy-governance boundary. Module names come from
`APP_MODULES`; route labels, statuses, destructive verbs, formatters, empty/error recovery copy, and
domain taxonomy remain the maintained inventory categories. Rootine is Polish-first and uses
`pl-PL` formatting where shared formatters exist.

## Capability inventory

`PRODUCT.md` describes current capabilities. The persistence contract is local-first with optional
Supabase authentication and workspace-snapshot synchronization; without configuration or a session,
the application continues locally.

Quick-capture handoff is defined by `src/app/experience/commandCenterActions.ts`. Every Command
Center action declares whether its target consumes `title`, `date`, `time`, and `priority`; the
preview and generated URL are built from the same filtered payload. Tasks and affairs accept the
complete schedule. Work and goals accept title, date, and priority but intentionally do not advertise
a time until their native data models expose one. Target pages consume the supported fields and
remove all command parameters from the URL after opening the form.

## Refresh and review

When routes or UI exports change, review this document together with:

```powershell
npm run architecture:audit
npm run design-system:audit
npm run typecheck:app
```

Do not create a second router, module list, or component barrel solely to generate documentation.
