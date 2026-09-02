# Rootine data sync contract

Status: `v2` dla legacy snapshotów; transport mobilny używa wersjonowanego
`sync-v3`, przygotowanego do wdrożenia na stagingu. Zobacz
[kontrakt sync-v3](sync-v3-contract.md) oraz [runbook stagingu](staging-runbook.md).

## Cel i granica

Rootine jest local-first. Klient zapisuje zmianę najpierw w swoim trwałym magazynie i pozostaje użyteczny bez sieci. Supabase jest repliką per użytkownik oraz kanałem wymiany między urządzeniami; nie jest zależnością konieczną do otwarcia i edycji lokalnego workspace’u.

Jednostką synchronizacji jest wersjonowany dokument domenowy wskazany przez `storage_key`, np. workspace Zadań lub Sportu. Synchronizacja nie interpretuje jego pól. Schemat, walidacja i migracje payloadu należą do repozytorium danej domeny.

## Zakres lokalny i konto

Trwały magazyn przeglądarki ma dwa zakresy danych: `local` dla pracy bez konta oraz `account:<user_id>` dla zalogowanego użytkownika. Manifesty, payloady IndexedDB, cache repozytoriów i kopie odzyskiwania są adresowane przez aktywny zakres. Namespace konta jest przygotowywany przed zamontowaniem ekranów aplikacji, więc zmiana sesji nie może wyświetlić ani wysłać danych poprzedniego użytkownika.

Przy pierwszym wejściu na konto istniejące dane z zakresu `local` mogą zostać jednorazowo przejęte do pustego namespace’u konta. Po tej operacji zakres anonimowy jest czyszczony. Znacznik claimu zapobiega ponownemu automatycznemu kopiowaniu danych przy kolejnych zmianach konta. Backup pełny zawiera zakres, z którego został wyeksportowany; import do innego konta jest odrzucany przed zapisem.

## Rekord serwera

Tabela `public.rootine_workspace_snapshots` przechowuje:

| Pole | Znaczenie |
| --- | --- |
| `user_id` | właściciel z `auth.users`; część klucza głównego |
| `storage_key` | stabilny identyfikator dokumentu; część klucza głównego |
| `payload` | pełny dokument JSON domeny |
| `content_hash` | niekryptograficzny fingerprint treści przekazany przez klienta |
| `revision` | monotoniczna rewizja serwera, źródło prawdy dla współbieżności |
| `updated_at` | czas zatwierdzenia przez serwer |
| `created_at` | czas utworzenia rekordu |

`content_hash` służy wyłącznie do szybkiego wykrycia równoważnego lokalnego zapisu. Nie jest ETagiem bezpieczeństwa ani podstawą rozstrzygania konfliktu. Klient webowy hashuje kanoniczny JSON z posortowanymi kluczami obiektów; inny klient może użyć własnego stabilnego fingerprintu. Poprawność zapisu zawsze wynika z `revision`.

## Odczyt i zapis

1. Zalogowany klient odczytuje własne rekordy chronione przez RLS.
2. Dla każdego klucza zapamiętuje zdalną `revision` oraz dokładną lokalną wersję, którą ta rewizja reprezentuje.
3. Zapis wywołuje wyłącznie RPC:

   ```text
   rootine_apply_workspace_snapshot(
     p_storage_key,
     p_payload,
     p_content_hash,
     p_expected_revision
   )
   ```

4. Nowy rekord używa `p_expected_revision = 0`. Aktualizacja używa ostatniej odczytanej rewizji.
5. RPC wykonuje atomowy compare-and-swap i zwraca aktualny rekord:
   - `applied = true` — zapis został zatwierdzony, a zwrócona rewizja staje się nową bazą;
   - `applied = false` — rewizja była nieaktualna, payload serwera nie został nadpisany.

Bezpośrednie `INSERT`, `UPDATE` i `DELETE` są odebrane roli `authenticated`. Mutacje muszą przejść przez funkcję CAS. Klucz service-role nie może być używany przez klienta.

## Pierwsze uzgodnienie

- Brak rekordu po jednej stronie kopiuje istniejący dokument na drugą stronę.
- Dwie istniejące, różne wersje bez potwierdzonej wspólnej bazy tworzą konflikt. Klient nie wybiera zwycięzcy na podstawie czasu, ponieważ nie każdy model ma domenowe `updatedAt`, a zegary urządzeń nie są źródłem prawdy.
- Każdy upload nadal ma ochronę rewizji; zmiana, która nastąpiła po odczycie, zamienia wynik w konflikt.
- Późne zdalne pobranie ma lokalny warunek compare-and-swap. Edycja wykonana w czasie oczekiwania nie może zostać zastąpiona.

Nowy profil nie tworzy seedów produktu. Puste workspace’y są prawidłowym stanem. Dane demonstracyjne należą wyłącznie do izolowanej sesji konta testowego i nigdy nie podlegają synchronizacji.

## Realtime

Tabela jest częścią publikacji `supabase_realtime`. Po pierwszym uzgodnieniu klient subskrybuje własne rekordy.

- Gdy lokalna wartość nadal odpowiada zapamiętanej bazie, nowa rewizja jest importowana przez chroniony zapis lokalny.
- Gdy lokalna i zdalna wartość zmieniły się od wspólnej bazy, klient nie stosuje żadnej automatycznej wersji i zgłasza konflikt.
- Echo własnego lub semantycznie równoważnego zapisu aktualizuje tylko bazę rewizji.
- Awaria kanału nie wyłącza zapisu lokalnego; użytkownik dostaje stan błędu i może ponowić synchronizację.

Kolejność zdarzeń Realtime nie zastępuje CAS. Każda mutacja nadal musi podać oczekiwaną rewizję.

## Rozwiązanie konfliktu

Interfejs pokazuje liczbę konfliktowych `storage_key` i dwie jawne decyzje:

- **zachowaj dane z urządzenia** — klient ponownie odczytuje bieżącą rewizję i próbuje zapisać lokalny payload względem niej;
- **użyj danych z konta** — klient ponownie odczytuje serwer i importuje payload tylko wtedy, gdy lokalna wersja nie zmieniła się w czasie decyzji.

Przed zastąpieniem istniejącego lokalnego dokumentu repozytorium tworzy kopię odzyskiwania. Ponowna zmiana którejkolwiek strony podczas rozwiązywania konfliktu skutkuje kolejnym konfliktem, nie wymuszonym nadpisaniem.

## Usuwanie i ewolucja

W `v2` nie ma zdalnej operacji usunięcia całego workspace’u. Pusty dokument domenowy jest zwykłym, wersjonowanym payloadem. Dodanie tombstone’ów wymaga nowej wersji tego kontraktu i migracji wszystkich klientów.

Każda domena musi utrzymywać własne pole `version`, walidator i deterministyczną migrację starszych payloadów. Zmiana nazwy `storage_key`, znaczenia rewizji, RPC albo reguł usuwania jest zmianą kontraktu cross-platform, a nie lokalnym refaktorem webowym.

## Operacje i weryfikacja

Wymagane migracje:

1. `20260806120000_rootine_workspace_snapshots.sql`;
2. `20260819090000_rootine_workspace_sync_v2.sql`.

Minimalne przypadki testowe klienta:

- utworzenie rekordu z rewizją `0`;
- aktualizacja na aktualnej rewizji;
- odrzucenie zapisu na starej rewizji bez utraty obu payloadów;
- lokalna edycja podczas zdalnego odczytu i importu;
- zdalna zmiana Realtime przy niezmienionym lokalnym dokumencie;
- konflikt Realtime po równoległej edycji;
- obie ścieżki ręcznego rozwiązania konfliktu;
- brak sieci, timeout i brak migracji bez blokowania trybu lokalnego.

## Sync-v3: RPC i endpoint mobilny

`POST /functions/v1/mobile-sync` jest cienką granicą dla iOS. Wymaga nagłówka
`Authorization: Bearer <access_token>` i nie przyjmuje `user_id` z body. Funkcja
przekazuje token do ograniczonych RPC, więc właściciel jest zawsze wyznaczany
przez `auth.uid()` po stronie Postgresa.

Body ma postać `{ "action": ..., "device_id": ... }`. Dozwolone akcje:

| `action` | Dodatkowe pola | RPC | Odpowiedź |
| --- | --- | --- | --- |
| `register_device` | `platform`, `app_version`, opcjonalnie `apns_environment`, `push_token` | `rootine_register_device` | rejestracja/rotacja urządzenia |
| `bootstrap` | brak | `rootine_sync_bootstrap` | pełny stan rekordów, `cursor`, `oldest_cursor` |
| `pull` | opcjonalnie `cursor` (domyślnie `0`) i `limit` | `rootine_sync_pull` | uporządkowane `changes`, `next_cursor`, `has_more` |
| `push` | `commands` | `rootine_sync_push` | wynik per komenda i `server_cursor` |

Limity są częścią kontraktu: body do 1 MiB, batch do 100 komend, pull do 500
zmian, payload pojedynczej komendy do 512 KiB oraz 60 żądań na minutę per
użytkownik/urządzenie/adres klienta. Timeout funkcji wynosi 8 sekund (można go
zmienić serwerowym `MOBILE_SYNC_TIMEOUT_MS`). Komunikaty błędów nie zawierają
treści SQL ani rekordów prywatnych.

### Wyniki push

Każda komenda musi zawierać `operation_id`, `entity`, `entity_id`, `kind`,
`base_revision` i obiekt `payload` (payload może być pominięty dla `delete`).
Dozwolone encje odpowiadają relacyjnym domenom Rootine, a nieznana encja jest
`invalid`. Wynik ma jeden z następujących statusów:

- `applied` — rekord zatwierdzony, rewizja i cursor są zwrócone;
- `already_applied` — retry tego samego `operation_id`, bez drugiego efektu;
- `conflict` — `base_revision` jest nieaktualna; wynik zawiera
  `server_revision` i `server_record`, a serwer nie jest nadpisany;
- `invalid` — zły kształt komendy, encja, payload albo limit;
- `unauthorized` — urządzenie nie należy do `auth.uid()` albo zostało odwołane.

Batch zachowuje kolejność wyników, ale pojedyncza komenda jest atomowa:
niezależne poprawne komendy mogą zostać zatwierdzone, a błąd jednej nie wycofuje
pozostałych. Tombstone usunięcia pozostaje w outboxie jako `operation: delete`.

### Pull i wygasły cursor

`rootine_sync_changes` jest append-only i ma monotoniczny cursor. Pull zwraca
`oldest_cursor` oraz `latest_cursor`; rekordy są sortowane rosnąco po cursorze.
Jeśli podany cursor jest starszy niż najwcześniejszy dostępny (`cursor_expired`),
odpowiedź nie udaje pustej listy: endpoint zwraca HTTP `409` z kodem
`cursor_expired`, a klient musi wykonać kontrolowany bootstrap. Cursor urządzenia
jest niezależny od rewizji rekordu.

### HTTP statusy

| Status | Znaczenie |
| --- | --- |
| `200` | poprawny bootstrap/pull/push/rejestracja |
| `400` | niepoprawny JSON, akcja lub pola |
| `401` | brak, nieważny lub wygasły JWT |
| `403` | urządzenie nieautoryzowane |
| `405` | metoda inna niż POST |
| `408` | timeout RPC/uwierzytelnienia |
| `409` | `cursor_expired` — wymagany bootstrap |
| `413` | body większe niż 1 MiB |
| `429` | przekroczony limit żądań; obecny jest `Retry-After` |
| `502`/`503` | chwilowa niedostępność usługi, bez szczegółów wewnętrznych |

## Relacyjny sync-v3 (warstwa B02)

Kontrakt v2 dla `rootine_workspace_snapshots` pozostaje aktywny bez zmian. B02
dodaje obok niego addytywny model relacyjny z tabelami domenowymi Rootine oraz
infrastrukturą `rootine_profiles`, `rootine_devices`, `rootine_sync_cursors`,
`rootine_sync_operations`, append-only `rootine_sync_changes`,
`rootine_workspace_revisions`, `rootine_migration_quarantine` i
`rootine_sync_reconciliation_log`. Każdy rekord ma stabilne `id`, `user_id`,
serwerowe timestampy, opcjonalny `deleted_at` i monotoniczną rewizję; relacje
używają klucza złożonego `(user_id, id)`.

`rootine_sync_changes.change_cursor` jest generowany wyłącznie przez serwer.
Retencja outboxa, tombstone'ów i historii rewizji wynosi 90 dni zgodnie z
`rootine_sync_retention_policy`; `oldest_available_cursor` jest jawnie
przechowywany per urządzenie, a widok `rootine_sync_cursor_bounds` pokazuje
granice dostępne dla konta. Aktualizacja rekordu z `deleted_at` tworzy
`operation = 'delete'` — tombstone nie jest fizycznym brakiem rekordu. RLS
ogranicza odczyt do `auth.uid() = user_id`, a `authenticated` nie ma
bezpośrednich uprawnień do mutacji.

RPC w B03 mają kompatybilny seam `rootine_sync_records`, ponieważ pozwala to
uruchomić kontrakt również na branchu bazowym bez nadpisywania domen. Po
integracji B02 adapter materializuje ten seam do właściwych tabel domenowych;
operation log, outbox i kontrakt HTTP/RPC nie wymagają zmiany.
