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
- Sprawy (`/sprawy`, owns `/podroze`);
- Notatki (`/notatki`).

Legacy bookmarks `/biuro`, `/finanse`, and `/jdg` are redirects, not global modules.

## Screen and route inventory

`ROUTE_LAYOUT_AUDIT` in `src/app/routes.ts` is the reviewable screen inventory beside the actual
router. It records path, component, PageShell width, sidebar presence, heading ownership, layout
family, legacy redirects, and the not-found state. Route and hover-prefetch coverage are coupled by
`src/app/routePrefetch.ts`.

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

## Refresh and review

When routes or UI exports change, review this document together with:

```powershell
npm run architecture:audit
npm run design-system:audit
npm run typecheck:app
```

Do not create a second router, module list, or component barrel solely to generate documentation.
