# Rootine sync-v3 — kontrakt transportu

Status: `wersja 3 przygotowana do wdrożenia na stagingu`

To jest wersja transportu synchronizacji, niezależna od wersji payloadu każdej
domeny. Zmiana `contract_version` jest zmianą cross-platform: wymaga
jednoczesnego wdrożenia serwera oraz klienta albo jawnego fallbacku do klienta
legacy. Źródłem maszynowej definicji jest
[`contracts/schemas/sync-v3.schema.json`](../contracts/schemas/sync-v3.schema.json),
a przykłady znajdują się w `contracts/fixtures/sync-v3-*.json`.

## Wspólna obwiednia

Każde żądanie zawiera `correlation_id`, a każda odpowiedź (również błąd)
zawiera `contract_version: 3` oraz to samo `correlation_id`. Klient musi
odrzucić odpowiedź z inną wersją, zanim odczyta jej dane.

Identyfikatory są nieprzezroczyste i nie zawierają e-maila, `user_id` ani
treści użytkownika:

| Identyfikator | Format | Przykład |
| --- | --- | --- |
| `correlation_id` | `rt3_<environment>_<lowercase UUIDv4>` | `rt3_staging_123e4567-e89b-42d3-a456-426614174000` |
| `operation_id` | `op3_<lowercase UUIDv4>`; wymagany w każdej komendzie `push` | `op3_123e4567-e89b-42d3-a456-426614174000` |
| `device_id` | `ios_<lowercase UUIDv4>`; stabilny dla instalacji | `ios_123e4567-e89b-42d3-a456-426614174000` |

`environment` przyjmuje wyłącznie `development`, `staging` albo `production`.
UUID musi być generowany lokalnie przez klienta i nie powinien być ponownie
używany po reinstalacji aplikacji.

## Operacje

Endpoint Supabase to `/functions/v1/mobile-sync`. Operację wybiera pole
`action` w JSON body, przyjmujące jedną z nazw w tabeli poniżej. W nagłówku należy przesłać
`Authorization: Bearer <access_token>`. Funkcja używa
`auth.uid()` z tokenu; `user_id` nie jest przyjmowany z body.

| Operacja | Żądanie | Odpowiedź |
| --- | --- | --- |
| `bootstrap` | `action: "bootstrap"`, `correlation_id`, `device_id` | `server_cursor`, `next_cursor`, `has_more`, `changes[]` |
| `pull` | `action: "pull"`, `correlation_id`, `device_id`, `cursor` (`null` oznacza początek), `limit` 1–500 | `from_cursor`, `next_cursor`, `has_more`, `changes[]` |
| `push` | `action: "push"`, `correlation_id`, `device_id`, 1–100 komend | `server_cursor`, `results[]` per komenda |
| `register_device` | `action: "register_device"`, `correlation_id`, `device_id`, platforma `ios`, wersja aplikacji i środowisko; opcjonalnie para środowisko APNs + token | `device_id`, `environment`, `registered_at` |

Komenda `push` ma `operation_id`, `entity`, `entity_id`, `kind`,
`base_revision` i `payload` dla `upsert`. `delete` jest soft-delete i nie
przyjmuje payloadu. Ponowienie tego samego `operation_id` zwraca
`already_applied`, nie wykonując drugiego efektu ubocznego. Konflikt rewizji
zwraca wynik `conflict` z techniczną rewizją serwera oraz opcjonalnym
`server_record` dla właściciela danych. Rekord jest częścią odpowiedzi
autoryzowanej, ale nie wolno go kopiować do logów; logger stosuje redakcję.

Zmiany w `pull` i `bootstrap` są uporządkowane rosnąco po `cursor`. Realtime
może jedynie zasygnalizować dostępność zmian — klient zawsze pobiera treść
przez `pull`.

`register_device` nie blokuje synchronizacji, gdy użytkownik odmówił
uprawnienia do powiadomień. W takim przypadku klient pomija zarówno
`push_token`, jak i `apns_environment`. Jeśli uprawnienie jest przyznane,
wysyła oba pola razem; kontrakt odrzuca niepełną parę. Token jest przechowywany
i redagowany wyłącznie po stronie serwera.

## Błędy

Błąd ma tę samą obwiednię co sukces i jedno z kodów:

`unauthorized`, `invalid`, `conflict`, `cursor_expired`, `rate_limited`,
`server_error`.

Klient ponawia po `rate_limited` (z `retry_after_seconds`) oraz po błędzie
przejściowym zgodnie z backoffem. `cursor_expired` uruchamia kontrolowany
bootstrap. `unauthorized` uruchamia pojedynczy refresh sesji, a następnie
wylogowanie z zachowaniem lokalnej kolejki. Żaden komunikat błędu nie może
zawierać payloadu, tokenu, SQL ani danych innego konta.

## Logowanie i prywatność

Log zawiera wyłącznie identyfikatory techniczne i wynik operacji, np.
`endpoint`, `contract_version`, `correlation_id`, `operation_id`, `device_id`,
`entity`, `entity_id`, `cursor`, `revision`, `status` i `error`.

Przed wysłaniem do loggera należy zastosować
`api/_shared/syncV3Logging.ts`. Wartości pod `payload`, `record`, `notes`,
`health`, `finance`, `content`, `text`, `push_token`, `authorization`,
`password` i `secret` są zastępowane przez `[REDACTED]`; nie logujemy całych
obiektów żądania na zasadzie „debug”. Fixture’y sync-v3 zawierają wyłącznie
techniczne rekordy i sztuczny token, nie notatki, zdrowie ani finanse.

## Kompatybilność

Wszystkie flagi są domyślnie wyłączone, więc dotychczasowy klient korzysta z
CAS snapshotów przez `rootine_apply_workspace_snapshot`. Nie zmieniamy ani
nie usuwamy `rootine_workspace_snapshots` do czasu zakończenia B08 i B12.

Nowy klient może użyć sync-v3 tylko po pozytywnym odczycie flagi
`normalized_sync_enabled`. `normalized_read_enabled` steruje dopiero
odczytem relacyjnym, a `notifications_enabled` nie włącza samodzielnie
żadnych uprawnień systemowych.
