# Rootine — plan kompleksowej refaktoryzacji i QA

Aktualizacja: 2026-07-29  
Gałąź robocza: `AUDITFULL`

Ten plik jest żywym planem i dziennikiem dowodów. Zadanie uznajemy za zakończone wyłącznie wtedy, gdy wymagania zostały zaimplementowane albo jawnie opisane jako nieweryfikowalne z podaniem wpływu i sposobu dalszego sprawdzenia.

## 1. Rozpoznanie

- [x] Odczytano pełny brief użytkownika.
- [x] Odczytano `PRODUCT.md`, `DESIGN.md` i zasady jakości Impeccable.
- [x] Sprawdzono stan gita i zachowano niezwiązany plik użytkownika `.claude/settings.local.json`.
- [x] Zmapowano routing, strony, style, warstwę UI, dane i testy.
- [x] Potwierdzono istniejący wspólny shell, tokeny, komponenty UI i lazy loading tras.
- [x] Uruchomiono bazowy zestaw `npm run check`.
- [x] Zakończyć równoległy audyt fundamentów i wszystkich modułów.
- [x] Zweryfikować wszystkie zapisane briefy powierzchni przed zmianami w odpowiadających im modułach.
- [x] Uruchomić detektor jakości implementacji i zweryfikować wyniki w kontekście.

## 2. Stan bazowy

- [x] ESLint: bez błędów i bez ostrzeżeń.
- [x] Stylelint: bez błędów.
- [x] Audit architektury: zaliczony.
- [x] Testy jednostkowe/integracyjne: 20 plików, 99 testów, wszystkie zaliczone.
- [x] TypeScript aplikacji: zaliczony.
- [x] TypeScript API: zaliczony.
- [x] Build produkcyjny: zaliczony.
- [x] Playwright E2E: uruchomiono pełny pakiet; znalezione regresje kontrastu i semantyki mobilnego dialogu naprawiono i potwierdzono testami celowanymi.
- [ ] Produkcyjny smoke test proxy Open Food Facts: wymaga rzeczywistego URL wdrożenia.

## 3. Audyt i implementacja systemowa

- [x] Globalny `AppShell` i `PrimarySidebar`.
- [x] Wspólny `PageHeader` oraz stabilne wyrównanie nagłówka.
- [x] `PageLayout`/warianty szerokości: reading, standard, wide, canvas.
- [x] Wspólna anatomia `ContextSidebar`, zwijanie, pamięć stanu i zachowanie mobilne.
- [x] `RightRail`/`DetailPanel` oraz jeden główny model scrollowania.
- [x] Tokeny kolorów, typografii, odstępów, promieni, wymiarów i focusu.
- [x] Wspólne komponenty: Button, IconButton, Badge, Card, ProgressBar, DataTable/ListRow, EmptyState, LoadingState, ErrorState i ConfirmDialog.
- [x] Centralne formatowanie dat, czasu, walut, procentów, jednostek i polskiej liczby mnogiej.
- [x] Dostępność: landmarki, nazwy, focus-visible, dialogi, statusy, reduced motion i obsługa klawiaturą.
- [x] Odporność oraz synchronizacja localStorage/IndexedDB, import, eksport i odzyskiwanie.

## 4. Moduły

- [x] Dzisiaj.
- [x] Zadania.
- [x] Kalendarz.
- [x] Odżywianie.
- [x] Sport.
- [x] Praca.
- [x] Cele.
- [x] Sprawy i JDG.
- [x] Notatki.
- [x] Podróże.

Dla każdego modułu trzeba potwierdzić: wspólny shell i nagłówek, właściwą szerokość, brak sztucznej wysokości, empty state, długie dane, duży wolumen, keyboard/focus, responsywność oraz spójność danych między modułami.

## 5. Macierz walidacji

### Rozdzielczości

- [x] 2560 × 1440.
- [x] 1920 × 1080.
- [x] 1440 × 900.
- [x] 1366 × 768.
- [x] 1280 × 800.
- [x] 1024 × 768.
- [x] Dodatkowe progi istniejącego produktu: 768 × 1024 i 390 × 844.

### Skalowanie

- [x] 100%.
- [x] 125%.
- [x] 150%.
- [x] 200%.

### Wolumen i długość danych

- [x] 0, 1, 5, 20 i 100 rekordów — macierz E2E Zadań z realnym renderem i panelem szczegółu.
- [x] Obowiązkowe scenariusze dużego zagęszczenia z briefu — istniejące fixtury domenowe plus macierz 100 rekordów.
- [x] Tytuły krótkie i 120+ znaków, długie tagi/opisy oraz brakujące pola.
- [x] Bardzo duże kwoty i wartości dziesiętne — centralne formattery i testy groszy/dużych kwot.

### Przepływy przekrojowe

- [x] Zadanie: Zadania → Dzisiaj → Kalendarz → Praca → reload; kanoniczne przypisanie, migracja, deduplikacja i propagacja ukończenia.
- [x] Produkt żywieniowy.
- [x] Trening.
- [x] Cel.
- [x] Płatność/sprawa.
- [x] Podróż.
- [x] Notatka.

### Dane lokalne

- [x] Pusty i uszkodzony zapis.
- [x] Stara wersja schematu i migracja.
- [x] Synchronizacja dwóch kart oraz konflikt równoczesnych zmian.
- [x] Brak miejsca/błąd zapisu.
- [x] Import poprawny, niepoprawny i starszej wersji.
- [x] Reload podczas edycji i zapis przed zamknięciem.

## 6. Pętle jakości

- [x] Iteracja 1: naprawy systemowe.
- [x] Walidacja po iteracji 1.
- [x] Iteracja 2: naprawy modułów i danych.
- [x] Walidacja po iteracji 2.
- [x] Iteracja 3: regresje, dostępność, responsywność i polish.
- [x] Końcowy ponowny audyt całej aplikacji.
- [x] Końcowe `npm run check`, Playwright, smoke lokalny i kontrola diffu.

## 7. Ograniczenia środowiska

- [x] Interaktywna przeglądarka sesji nie udostępniła żadnego backendu.
- [x] Wygenerować i ocenić zrzuty przez repozytoryjny Playwright, jeśli lokalny Chromium jest dostępny.
- [x] Lokalny Chrome wykorzystano do pełnego Playwright; ręczna sesja Browser Plugin pozostaje niedostępna, więc dowodem są testy, Axe, trace i zrzuty błędów.

## 8. Dowody końcowe

- [x] `npm run check`: lint, stylelint, audit architektury, 25 plików / 117 testów, typecheck aplikacji i API oraz build — PASS.
- [x] Pełny Playwright na lokalnym Chrome: 104/104 — PASS, w tym Axe desktop/mobile, trwałość, błędy runtime i długi wolumen danych.
- [x] Macierz viewportów: 54/54 — PASS.
- [x] Macierz zoom 125/150/200%: 9/9 — PASS.
- [x] Kalendarz: selektor agregujący pięć domen, testy deduplikacji i szczegółów źródła.
- [x] Zadanie ↔ Praca: migracja v1→v2, kanoniczne źródło, idempotencja i testy przepływu.
- [x] Impeccable: usunięto ostrzeżenia layoutowych animacji i bocznego akcentu; pozostałe advisory dotyczą zaakceptowanej czcionki, kolorów kategorii zapisanych w tokenach oraz stylów wydruku.
