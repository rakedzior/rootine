# Rootine

Rootine to polskojęzyczny, local-first system do zarządzania codziennymi obszarami życia. Aplikacja działa bez konta i bez backendu, a opcjonalne konto Supabase dodaje trwałą synchronizację między urządzeniami bez odbierania użytkownikowi lokalnej ciągłości pracy.

## Zakres produktu

Kanoniczna nawigacja zawiera dziewięć modułów:

- `Dzisiaj` — bieżące zobowiązania i szybkie akcje;
- `Zadania` — zadania, Kalendarz i Nawyki;
- `Odżywianie` — dziennik, cele, pomiary i katalog produktów;
- `Sport` — plany, sesje, historia i analiza;
- `Praca` — firmy, projekty i zadania zawodowe;
- `Cele` — cele, kamienie milowe i historia postępu;
- `Podróże` — wyjazdy, plan, rezerwacje, budżet i dokumenty;
- `Pozostałe` — sprawy, finanse, rejestry, zdrowie i JDG;
- `Notatki` — notatki tekstowe i checklisty.

`/podroze` jest wejściem do Podróży, a istniejące adresy `/travel/...` należą do tego samego modułu. Stare zakładki nie wracają do globalnej nawigacji: `/biuro` przekierowuje do `/praca`, `/finanse` do `/sprawy?widok=finances`, a `/jdg` do `/sprawy?widok=jdg`.

Nowy profil zaczyna od pustych danych użytkownika. Pełne dane przykładowe są dostępne wyłącznie przez jawne konto testowe na ekranie startowym; działają w izolowanej pamięci i znikają po zakończeniu demo lub twardym odświeżeniu.

## Uruchomienie lokalne

Wymagany jest Node.js 24 i npm.

```bash
npm install
npm run dev
```

Skopiuj `.env.example` do `.env.local` tylko wtedy, gdy potrzebujesz integracji. Bez zmiennych Supabase można wybrać lokalny tryb pracy.

Najważniejsze komendy:

```bash
npm run check       # lint, CSS, audyty, testy, typy i build
npm run test:e2e    # regresje przeglądarkowe Playwright
npm run build       # typecheck i produkcyjny bundle
npm run preview     # podgląd buildu
```

## Dane i tryby sesji

Lokalne repozytoria domenowe są podstawową ścieżką zapisu. Małe manifesty i preferencje korzystają z `localStorage`, większe payloady z IndexedDB. Każdy odczyt przechodzi walidację i migrację wersji. Uszkodzony zapis jest zabezpieczany jako kopia odzyskiwania, a moduł otwiera bezpieczny pusty stan zamiast przykrywać problem danymi demo.

Aplikacja udostępnia trzy rozłączne tryby:

- lokalny — prawdziwe dane pozostają w tej przeglądarce;
- konto Supabase — te same lokalne workspace’y są dodatkowo synchronizowane;
- konto testowe — wygenerowane dane demonstracyjne w pamięci efemerycznej, bez dostępu do prawdziwego storage’u i konta.

Eksport, import i kopie odzyskiwania są dostępne w ustawieniach. Import oraz zdalne pobranie najpierw zabezpieczają zastępowaną wersję.

## Supabase: auth i synchronizacja

Frontend nie zawiera zapasowego adresu ani klucza projektu. Aby włączyć konto, ustaw browser-safe URL i publishable key w `.env.local`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Starsza nazwa `VITE_SUPABASE_ANON_KEY` jest wspierana przejściowo. Nigdy nie umieszczaj service-role key ani innego sekretu w zmiennej `VITE_`.

Zastosuj migracje w kolejności:

1. `supabase/migrations/20260806120000_rootine_workspace_snapshots.sql` — tabela snapshotów, indeks, RLS i rewizje;
2. `supabase/migrations/20260819090000_rootine_workspace_sync_v2.sql` — atomowy zapis compare-and-swap, zamknięcie bezpośrednich mutacji i publikacja Realtime.

Synchronizacja zachowuje granice domenowych dokumentów JSON:

- klient odczytuje ostatnią `revision` każdego workspace’u;
- zapis przechodzi wyłącznie przez `rootine_apply_workspace_snapshot(...)` z oczekiwaną rewizją;
- równoległa zmiana daje jawny konflikt zamiast last-write-wins;
- Realtime pobiera zdalną zmianę tylko wtedy, gdy lokalny workspace nie zmienił się od wspólnej wersji;
- przy konflikcie użytkownik wybiera dane z urządzenia albo z konta; żadna wersja nie jest po cichu nadpisywana;
- błąd sieci lub przekroczony czas synchronizacji nie blokuje pracy lokalnej.

Pełny, niezależny od UI kontrakt dla kolejnych klientów znajduje się w [`docs/data-sync-contract.md`](docs/data-sync-contract.md).

### Logowanie przez Google

1. Utwórz w Google OAuth klienta typu **Web application** i dodaj origin aplikacji, np. `http://127.0.0.1:5173`.
2. Dodaj `https://<project-ref>.supabase.co/auth/v1/callback` jako authorized redirect URI.
3. W Supabase włącz **Authentication → Providers → Google** i ustaw Client ID oraz Client Secret.
4. W **Authentication → URL Configuration** ustaw produkcyjny Site URL i dokładne dozwolone powroty, m.in. lokalne `http://127.0.0.1:5173/dzisiaj`.

Google Client Secret należy wyłącznie do konfiguracji Google/Supabase, nigdy do repozytorium lub zmiennych `VITE_`.

## Open Food Facts

Wyszukiwanie online w Odżywianiu korzysta z endpointu same-origin `/api/openfoodfacts/search`. Implementacja dla Vercel znajduje się w `api/openfoodfacts/search.ts` i waliduje metodę oraz zapytanie, ogranicza wynik, kontroluje częstotliwość żądań i ustawia jawne zasady cache.

W produkcji ustaw serwerową zmienną:

```env
OPEN_FOOD_FACTS_CONTACT=real-maintainer@example.com
```

Na innym hoście można wskazać równoważny proxy przez `VITE_OPEN_FOOD_FACTS_PROXY_URL`. Kontakt serwerowy nie może trafić do zmiennej `VITE_`. Po wdrożeniu uruchom:

```bash
npm run smoke:production -- https://your-deployment.example
```

Limit w pamięci chroni pojedynczą ciepłą instancję funkcji. Publiczne wdrożenie o większym ruchu powinno dodatkowo używać trwałego limitu na warstwie edge/WAF.

## Mapa repozytorium

- `src/app/` — moduły, routing, UI i repozytoria domenowe;
- `src/infrastructure/supabase/` — auth, synchronizacja i panel konta;
- `supabase/migrations/` — wersjonowany kontrakt bazy;
- `api/`, `functions/`, `worker/` — warianty proxy Open Food Facts;
- `e2e/` — testy Playwright;
- `docs/` — inwentarz produktu, system projektu i kontrakty danych.

Źródłem prawdy dla globalnych modułów jest `src/app/moduleRegistry.ts`, dla ekranów `ROUTE_LAYOUT_AUDIT` w `src/app/routes.ts`, a dla wspólnych komponentów `src/app/ui/index.ts`.
