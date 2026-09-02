# Rootine — staging sync-v3 i rollback

Runbook opisuje izolowane środowisko testowe. Staging korzysta z osobnego
projektu Supabase i testowego konta; nigdy nie używa produkcyjnych tokenów,
kluczy APNs, danych ani snapshotów. Konto testowe powinno mieć jawnie zapisany
identyfikator w systemie sekretów CI, nie w repozytorium.

## Przygotowanie lub odtworzenie stagingu

1. Utwórz albo wybierz osobny projekt Supabase dla stagingu i zapisz jego
   `SUPABASE_URL` oraz klucz publishable/anon w sekretach środowiska `staging`.
2. Zastosuj migracje w kolejności z `docs/ios-backend-setup.md`:
   `rootine_workspace_snapshots`, `rootine_workspace_sync_v2` oraz migrację
   feature flags `rootine_feature_flags`.
3. Uruchom `supabase db reset` lokalnie, aby sprawdzić reprodukowalność
   migracji; na hostowanym stagingu użyj kontrolowanego resetu projektu lub
   odtworzenia z backupu zgodnie z polityką Supabase. Nie wykonuj resetu
   produkcji.
4. Utwórz konto testowe z potwierdzonym adresem i nie wgrywaj do niego danych
   z produkcji. Zweryfikuj logowanie access tokenem oraz odrzucenie żądania bez
   tokenu.
5. Wdróż Edge Function `mobile-sync` i sprawdź `bootstrap`, `pull`, `push`
   oraz `register_device` na fixture’ach (w tym rejestrację bez pól APNs po
   odmowie permission). Klient otrzymuje wyłącznie publishable/anon key;
   `service_role` pozostaje sekretem funkcji.
6. Włącz tylko flagę potrzebną do testu według macierzy poniżej. Każda zmiana
   flagi powinna mieć operatora, czas, środowisko i zakres konta w audycie.

## Macierz flag

| Flaga | Domyślnie | Test konta staging | Produkcja przed cutoverem | Źródło |
| --- | --- | --- | --- | --- |
| `normalized_sync_enabled` | `false` | `true` tylko dla konta testowego | `false` | `rootine_get_feature_flags(environment)` + override `auth.uid()` |
| `normalized_read_enabled` | `false` | `false` do B08 | `false` | j.w. |
| `notifications_enabled` | `false` | `false` do B09–B11 | `false` | j.w. |

Override konta wygrywa z ustawieniem środowiska i nie zmienia wartości dla
innego `user_id`. Weryfikacja po zmianie musi obejmować dwa konta: testowe
(`true`) oraz kontrolne (`false`). Zmian dokonuje operator przez chronioną
ścieżkę administracyjną/SQL; aplikacja nie może przyjmować `user_id` ani
wartości flagi od klienta jako źródła prawdy.

## Smoke i obserwacja

- bez tokenu: `401` i `error: unauthorized`;
- z tokenem testowym: bootstrap ma `contract_version: 3` i correlation ID;
- pull od najstarszego dopuszczalnego cursora jest paginowany do 500 zmian;
- push z tym samym `operation_id` drugi raz nie tworzy zmiany;
- zły `base_revision` daje jawny `conflict`;
- przeterminowany cursor daje `cursor_expired`, bez utraty lokalnej kolejki;
- log zawiera correlation/operation/device/entity ID, ale nie zawiera treści
  prywatnej ani tokenu APNs;
- konto kontrolne nadal używa legacy CAS, gdy wszystkie flagi są `false`.

## Wyłączenie i rollback

1. Najpierw wyłącz `normalized_read_enabled`, potem
   `normalized_sync_enabled` dla konta lub całego stagingu. Nowy klient wraca
   do legacy snapshotów; lokalne dane i kolejka nie są kasowane.
2. Jeśli problem dotyczy powiadomień, wyłącz tylko
   `notifications_enabled`; nie unieważniaj sesji synchronizacji.
3. Zachowaj korelacyjne logi i wynik smoke testu dla incydentu. Nie kopiuj do
   nich payloadów.
4. W przypadku kompromitacji stagingu unieważnij wyłącznie stagingowe sekrety,
   tokeny urządzeń i sesje testowe. Odtwórz izolowany projekt z migracji.
5. Nigdy nie usuwaj produkcyjnych snapshotów jako części rollbacku. Usunięcie
   legacy lub migracja produkcyjnych danych wymaga osobnej decyzji po B08/B12.

## Brakujące sekrety i właściciele

| Zadanie | Właściciel | Gdzie dostarczyć | Status |
| --- | --- | --- | --- |
| Apple Sign-In: App ID, Services ID, Team ID i signing key | Apple/Supabase administrator | Supabase Auth + CI secret store | brak wartości w repozytorium |
| Produkcyjny URL backendu mobilnego | właściciel backendu/release | `ROOTINE_BACKEND_URL` w produkcyjnym xcconfig/CI | do potwierdzenia przed TestFlight |
| APNs sandbox/production key, key ID i Team ID | właściciel powiadomień | Supabase/worker secrets | wymagane dopiero B09–B11 |
| Konto testowe staging i jego `user_id` | QA/release | sekret środowiska staging | utworzyć poza repozytorium |
