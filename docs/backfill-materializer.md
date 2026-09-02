# B04 — Backfill i materializer legacy

## Co jest źródłem prawdy

`rootine_workspace_snapshots` jest wejściem read-only. Adaptery z
`src/infrastructure/supabase/backfillMaterializer.ts` tworzą deterministyczny
canonical JSON i rekordy relacyjne. B04 nie kasuje ani nie aktualizuje źródłowego
snapshotu.

Rejestr adapterów znajduje się w sekcji `backfill.adapters` pliku
`contracts/manifest.json`. Obejmuje domeny tasks, nutrition, notes, sport, goals,
work, travel, health, affairs, JDG oraz jawnie oznaczone dane web-only.

## Uruchomienie na stagingu

Najpierw zastosuj migracje B02/B03 (jeżeli są już dostępne), a następnie migrację
`20260902120000_rootine_backfill_materializer.sql`. B02 jest już wejściem dla
wspólnych tabel rewizji, quarantine i reconciliation; B04 rozszerza je migracją
forward i dostarcza własną tabelę graniczną `rootine_workspace_backfill_records`.
Finalne RPC domenowe z B02/B03 powinny konsumować te rekordy w tej samej
transakcji.

Uruchomienie wymaga wyłącznie klucza service role po stronie operatora:

```sh
SUPABASE_URL=https://... \
SUPABASE_SERVICE_ROLE_KEY=... \
node --experimental-strip-types supabase/scripts/backfill-materializer.ts --user <uuid>
```

Brak `--user` przetwarza profile znalezione w tabeli snapshotów. Skrypt czyta
`storage_key`, `payload`, `content_hash` i `revision`, a następnie wywołuje
`rootine_backfill_commit`. Nie loguje payloadów ani treści prywatnych danych.

## Kolejność i retry

`rootine_backfill_commit` zapisuje rekordy, quarantine, revision/manifest,
reconciliation log i wpis `pending` w tabeli materializacji w jednej transakcji.
Dopiero później `rootine_materialize_legacy_snapshot` oznacza wygenerowaną kopię
jako `materialized`. Retry tego samego `(user_id, storage_key, source_revision,
adapter_version)` korzysta z kluczy unikalnych i nie duplikuje rekordów.

Jeśli canonical diff ma status `different`, backfill zapisuje reconciliation i
pozostawia kopię `pending`; materializacja wymaga osobnej decyzji operatora/B06.

Przerwanie pomiędzy tymi funkcjami pozostawia revision oraz status `pending`.
Ponowienie materializacji jest bezpieczne; źródłowy snapshot nadal pozostaje
nienaruszony. Faktyczny zapis wygenerowanego payloadu do legacy po CAS należy do
B06 dual-write bridge, nigdy do bezpośredniej mutacji w B04.

## Quarantine i diff

Nieznany `storage_key`, nieobsługiwana wersja, nieznane pole, brakujące/duplikowane
ID oraz wadliwe rekordy trafiają do `rootine_migration_quarantine` z path,
record_id i powodem. Są wynikiem migracji, a nie powodem do resetu danych.

Canonical diff sortuje klucze obiektów, normalizuje identyfikatory, daty ISO,
waluty i tombstone’y. Kolejność tablic jest ignorowana wyłącznie dla ścieżek
jawnie zadeklarowanych przez adapter. Status `different` jest raportowany w
`rootine_sync_reconciliation_log`; nie powoduje automatycznego nadpisania.

## Punkty integracji B02/B03

- B02 może dostarczyć finalne tabele domenowe; ich RPC powinny przyjąć
  `RelationalBackfillRecord` i zachować `user_id`, `entity_id`, `deleted_at` oraz
  `source_revision`.
- B03 może wywoływać `rootine_backfill_commit` jako etap transakcji zapisu, a po
  sukcesie zlecać materializację; nie należy przywracać bezpośrednich zapisów do
  `rootine_workspace_snapshots`.
- Gdy B02 wprowadzi własną tabelę `rootine_workspace_revisions` lub quarantine,
  należy wykonać migrację forward, mapując kolumny — nie usuwać B04 danych.

## Rollback

Wyłącz backfill/materializer i wróć do legacy read. Nie usuwaj częściowo
zmigrowanych rekordów ani snapshotów; statusy `pending`, `failed` i wpisy
quarantine są potrzebne do audytu i naprawy forward.
