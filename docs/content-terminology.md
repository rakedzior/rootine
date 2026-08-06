# Rootine content and terminology inventory

This is an inventory boundary, not a terminology rewrite. Product names and Polish labels remain unchanged.

## Existing conventions

- Primary interface language: Polish.
- Date and number formatting: `pl-PL` through shared formatters where available.
- Local timezone convention: Europe/Warsaw in the formatter/data layer.
- Search normalization: Polish diacritics are normalized for menu/select typeahead.
- Singular/plural handling: feature code uses shared `pluralize` in some modules.

## Inventory to maintain

- action labels and destructive verbs;
- status labels and semantic tones;
- date, time, number, percentage, and currency formats;
- empty-state and error recovery language;
- module and subview names;
- singular/plural forms;
- data-taxonomy labels versus UI status labels.

## Governance rule

Fix spelling and formatting inconsistencies when objectively clear. Do not rename product concepts, tabs, statuses, or actions as part of a design-system migration without a product decision.
