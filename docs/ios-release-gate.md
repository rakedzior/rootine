# Rootine iOS — release gate, staging smoke i rollback

Ten dokument opisuje jedną bramkę jakości dla iOS, Supabase i synchronizacji.
Nie tworzy osobnego systemu monitoringu: wartości w sekcji metryk są
warunkami akceptacji release i wskazują istniejące źródła (`rootine_sync_*`,
Realtime i delivery APNs).

## Uruchomienie lokalne

Wymagania: Node 24, Xcode 26.3, Docker oraz Supabase CLI. Deno jest potrzebne
do testów funkcji Edge.

```bash
npm run test:sql -- --allow-missing-tooling # diagnostyka bez lokalnego CLI
npm run test:edge
npm run test:staging-smoke -- --strict
xcodebuild test \
  -project ios/Rootine/Rootine.xcodeproj \
  -scheme Rootine \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -derivedDataPath "$TMPDIR/RootineDerivedData" \
  CODE_SIGNING_ALLOWED=NO
```

Gate scripts zapisują zredagowane JSON-y do `ROOTINE_EVIDENCE_DIR` (w CI jest
to katalog tymczasowy runnera). Evidence zawiera commit, branch, migrację,
kontrakt, flagi, fazy testu, czasy i znane ograniczenia; nigdy nie zawiera
access/service-role tokenów ani payloadów prywatnych domen.

Workflow `release-gate.yml` uruchamia sekretne joby staging/upgrade wyłącznie
po pushu na chroniony `main` albo przez ręczne `workflow_dispatch` z akceptacją
Environment `staging` i wyłącznie ref `main`. Każdy sekretowy job (SQL,
staging smoke) deklaruje to środowisko; preflight i decyzja końcowa blokują
wywołanie z innego refu. Nie uruchamia tych jobów z
`pull_request` ani z ręcznego workflow na innej gałęzi, ponieważ
workflow wykonuje kod repozytorium i otrzymuje service-role/DB credentials.
Kontrola PR pozostaje w sekretless `ios-foundation.yml`; pełny release gate jest
post-merge gate’em z chronionego źródła.

## Zmienne CI/staging

Sekrety trzymać w GitHub Environment `staging`, nigdy w repozytorium lub
artefaktach:

| Zmienna | Użycie |
| --- | --- |
| `ROOTINE_STAGING_URL` | URL tego samego projektu Supabase, np. `https://<ref>.supabase.co` |
| `ROOTINE_STAGING_PUBLISHABLE_KEY` | signup/token validation oraz Realtime URL |
| `ROOTINE_UPGRADE_DB_URL` | jednorazowy, odtwarzalny URL kopii stagingowej do `db push` + SQL testów |
| `ROOTINE_STAGING_SERVICE_ROLE_KEY` | awaryjne sprzątnięcie konta, wyłącznie sekret CI |
| `ROOTINE_SMOKE_REALTIME_URL` | opcjonalny jawny WebSocket URL; domyślnie wyliczany z URL projektu |
| `ROOTINE_SMOKE_APNS_URL` | opcjonalny sandbox/mock provider dla dedupe/retry APNs; bez niego obowiązuje test fizycznego iPhone’a |
| `ROOTINE_SMOKE_SYNC_PATH` | opcjonalna względna ścieżka endpointu testowego bez query/fragmentu; domyślnie `/functions/v1/mobile-sync`, `{operation}` wybiera ścieżkę per operacja |
| `ROOTINE_SMOKE_DEVICE_A/B` | opcjonalne identyfikatory; domyślnie jednorazowe UUID |

Smoke korzysta z kanonicznego B01 endpointu `/functions/v1/mobile-sync` z polem
`action` oraz obwiedni `contract_version: 3` z
`correlation_id` w formacie `rt3_<environment>_<uuidv4>`. Tymczasowy adapter
per-operation można lokalnie wskazać przez `ROOTINE_SMOKE_SYNC_PATH` zawierający
`{operation}`; chroniony workflow używa wspólnego endpointu z B03.

`ROOTINE_SMOKE_REQUIRE_REALTIME_SIGNAL=1` zaostrza smoke o obowiązkowy
sygnał WebSocket; domyślnie gate akceptuje kontrolowany fallback do pull, ale
zawsze wymaga, aby drugi klient odebrał zmianę.

Evidence rozróżnia `metrics.automated_observations` (błędy transportu,
oczekiwany konflikt i invalidation po delete) od wartości wymagających źródeł
staging/produkcji (`cursor_lag_seconds`, `outbox_lag_seconds`, APNs delivery),
które pozostają `null` i mają status `manual-required`, dopóki nie zostanie
podłączony istniejący provider/eksport metryk.

Smoke bez `ROOTINE_SMOKE_ACCESS_TOKEN` tworzy konto pod `example.com`,
wykonuje Auth → bootstrap → offline serialization → push → idempotency → Realtime
lub fallback pull → konflikt → delete-account, a następnie weryfikuje
unieważnienie tokenu. Konto jest syntetyczne i usuwane przez Edge Function;
service-role cleanup jest tylko bezpiecznikiem po awarii smoke.

Podanie istniejącego tokenu jest celowo zablokowane. Aby użyć dedykowanego,
jednorazowego konta testowego, trzeba jawnie ustawić
`ROOTINE_SMOKE_ALLOW_EXISTING_ACCOUNT=1`; również wtedy gate wywołuje
`delete-account`.

## Kolejność bramki

1. `release-gate-pr.yml` uruchamia przed merge’em sekretless SQL/RLS na pustej
   bazie, Edge contract tests i XCTest. Staging upgrade nie jest wykonywany z
   kodu PR.
2. Chroniony `release-gate.yml` po pushu na `main` uruchamia `test:sql` z
   migracjami na pustej bazie, pgTAP/RLS oraz — jeśli
   dostarczono `ROOTINE_UPGRADE_DB_URL` — migrację kopii stagingowej i te same
   testy po upgrade. Tryb `--strict` sprawdza obecność funkcji B02/B03.
3. `test:edge` instaluje zależności Node (`npm ci --ignore-scripts`) dla importów `npm:` i uruchamia Deno z
   `--node-modules-dir=auto`, uruchamia wszystkie `*.test.ts`/`*.contract.ts`,
   waliduje executable sync-v3 contract z kanonicznego
   `contracts/schemas/sync-v3.schema.json` i
   wymaga implementacji `mobile-sync` oraz jego testu, gdy gate jest strict.
4. `xcodebuild test` uruchamia XCTest na symulatorze i zapisuje `.xcresult`.
5. `test:staging-smoke -- --strict` wykonuje scenariusz dwóch klientów. Jego
   statusy `manual-required` nie są zaliczane do `passed` i w trybie strict
   blokują gate, jeśli brakuje natywnego offline/restart, fizycznego web↔iOS
   round-trip lub wymaganej metryki. Syntetyczny transport HTTP nie jest
   dowodem natywnej integracji.
6. Release job scala wyniki; dowolny błąd, brak migracji, brak RLS, brak
   sync-v3, konflikt niejawny, utrata danych po pull lub brak cleanup blokuje
   merge/release.

Evidence rozdziela `automated_gate_passed` od `release_ready`. Wartości
`cursor_lag_seconds`, `outbox_lag_seconds` i APNs delivery pozostają `null` oraz
mają `thresholds_evaluated: false`, dopóki nie dostarczy ich stagingowy provider
metryk/mock. Nie wolno interpretować statusu joba jako potwierdzenia tych
progów.

Nie pomijaj `--strict` na branchu chronionym. Brak B02/B03/B08/B11 w tej
gałęzi jest oczekiwanym stanem scaffoldu: po ich scaleniu migracje i
`supabase/functions/mobile-sync` automatycznie zostaną objęte tymi samymi
kontraktami. B08 powinien wystawić `round_trip_domains` w bootstrapie po
rzeczywistym przejściu drugiego klienta przez każdą domenę; wtedy smoke
odblokuje macierz wszystkich domen: tasks, habits, notes, nutrition, sport,
goals, work, travel, health, affairs, finance i jdg. Sama lista nazw domen
nie wystarcza.

## TestFlight checklist

- [ ] SQL gate: reset pustej bazy i upgrade kopii stagingowej są zielone; wersja
      migracji i `contract_version` są zapisane w evidence.
- [ ] Edge gate: `mobile-sync` i `delete-account` mają zielone testy auth,
      authorization, idempotency, conflict, cursor expiry i redaction.
- [ ] XCTest: `xcodebuild test` zakończone bez testów pominiętych przez release
      configuration; wynik `.xcresult` załączony do workflow.
- [ ] Smoke: konto jednorazowe usunięte przez `delete-account`; nie ma danych
      prywatnych w logach/artefaktach; transport drugiego klienta przeszedł.
- [ ] Ręczny TestFlight: realny web ↔ iOS round-trip każdej domeny, offline po
      force-quit/restart oraz lokalna dostawa APNs zostały potwierdzone na
      fizycznym iPhonie; statusy `manual-required` w evidence są zamknięte.
- [ ] Supabase URL i publishable key wskazują produkcję; service-role key,
      APNs `.p8`, Key ID i Team ID są wyłącznie w secret managerze.
- [ ] Apple Sign-In: Services ID, redirect/callback i capability są zgodne z
      bundle identifierem; test logowania i refreshu tokenu wykonany na iPhone.
- [ ] APNs: sandbox/production environment rozróżnione, permission granted,
      token rotacja/revoke po reinstall/sign-out, local notification dedupe.
- [ ] Feature flags: `normalized_sync_enabled`, `normalized_read_enabled` i
      `notifications_enabled` mają wartości release zapisane w evidence.
- [ ] Fizyczny iPhone: cold start, offline + force quit, foreground recovery,
      Realtime disconnect/poll fallback, conflict recovery i delete account.
- [ ] Właściciel release zatwierdził evidence oraz rollback poniżej.

## Metryki jako warunki release

| Sygnał | Próg blokujący | Właściciel | Źródło |
| --- | --- | --- | --- |
| pull/push errors | `0` w smoke i brak regresji P0/P1 | mobile-platform | sync gate evidence / Edge logs |
| 401 po refreshu | `0` poza testem invalidation po delete | auth owner | auth + sync gate |
| jawne konflikty | oczekiwany konflikt stale-write; `0` cichych nadpisań | sync owner | `rootine_sync_operations` |
| cursor lag | `≤ 30 s` w środowisku release | sync owner | outbox/cursor evidence |
| outbox lag | `≤ 60 s` | backend owner | `rootine_sync_changes` |
| APNs delivery | `≥ 99%` dla nieprzeterminowanych jobów | notifications owner | `rootine_notification_deliveries` |

## Rollback

1. Zatrzymaj TestFlight release i pozostaw flagę `normalized_read_enabled=0`.
2. Jeżeli push/Realtime jest niestabilny, ustaw `normalized_sync_enabled=0`
   oraz `notifications_enabled=0`; zachowaj lokalny cache i kolejkę.
3. Włącz legacy read/recovery. Nie usuwaj snapshotów, outboxu ani tombstone’ów.
4. Zabezpiecz evidence i identyfikator commit/migracji; nie odtwarzaj danych
   przez ręczne UPDATE tabel relacyjnych.
5. Naprawę wdrażaj jako nowy commit i uruchom pełny gate od pustej bazy,
   upgrade kopii, XCTest i smoke. Po dwóch zielonych przebiegach włączaj
   flagi stopniowo na kontach testowych.

Rollback funkcjonalny nie cofa migracji automatycznie. Cofanie schematu jest
dozwolone tylko po osobnym backupie i decyzji właściciela bazy; lokalna
kolejka i legacy recovery muszą pozostać możliwe do odczytu.
