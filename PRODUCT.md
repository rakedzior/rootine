# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Routine jest przeznaczone dla małej liczby użytkowników, którzy chcą zarządzać najważniejszymi obszarami codziennego życia w jednym miejscu. „Mateusz” i widoczne obecnie dane są przykładową personą oraz treścią demonstracyjną, a nie założeniem produktu dla jednej konkretnej osoby.

## Product Purpose

Produkt łączy planowanie i śledzenie codziennych obowiązków, czasu, celów, aktywności fizycznej oraz innych obszarów życia w jednym webowym pulpicie. Sukces MVP oznacza, że podstawowe przepływy można sprawnie zbudować, przetestować i ujednolicić lokalnie przed dołożeniem infrastruktury serwerowej.

## Positioning

Routine ma być jednym spójnym miejscem do pracy z powiązanymi obszarami życia zamiast zbiorem odseparowanych narzędzi. Dokładne pozycjonowanie rynkowe i wyróżnik względem konkretnych produktów pozostają do ustalenia po walidacji MVP.

## Operating Context

Obecny interfejs obejmuje pulpit dnia oraz moduły zadań, kalendarza, celów, sportu, odżywiania, pracy, finansów, notatek i spraw. Cztery rozbudowane sekcje — Zadania, Kalendarz, Cele i Sport — są punktem odniesienia dla wspólnego systemu interfejsu, według którego mają powstać kolejne sekcje.

## Capabilities and Constraints

- MVP jest tworzone lokalnie jako aplikacja webowa.
- Obecnie nie ma kont użytkowników ani backendu; stan jest lokalny, a część modułów korzysta z `localStorage`.
- Aktualny zakres funkcjonalny obejmuje przede wszystkim zadania, kalendarz, cele i sport oraz prostsze wersje pozostałych modułów.
- Po MVP planowane są kolejno: backend, bazy danych, synchronizacja, integracje, mechanizmy prywatności i eksport danych.
- Wersja mobilna jest planowana na końcu tej sekwencji i nie jest częścią bieżącego MVP.
- Architektura interfejsu nie powinna zakładać, że przykładowy użytkownik „Mateusz” jest jedynym użytkownikiem produktu.

## Brand Commitments

Nazwa produktu to Routine. Interfejs i komunikaty są obecnie tworzone w języku polskim. Inne trwałe zobowiązania marki nie zostały jeszcze ustalone.

## Evidence on Hand

- Działająca implementacja React/Vite: `src/app/`.
- Routing i lista obszarów produktu: `src/app/routes.ts` oraz `src/app/layout/Layout.tsx`.
- Rozbudowane przepływy referencyjne: `src/app/pages/Zadania.tsx`, `src/app/pages/Kalendarz.tsx`, `src/app/pages/Cele.tsx` oraz `src/app/pages/Sport.tsx` wraz z `src/app/sport/`.
- Lokalne przechowywanie stanu jest widoczne m.in. w `src/app/goals/goalsStore.tsx`, `src/app/data/taskCompletion.ts` i `src/app/pages/Sport.tsx`.
- README opisuje obecną aplikację jako rekonstrukcję dostarczonego pliku Figma Make.
- Brak potwierdzonych referencji klientów, benchmarków, danych o użyciu lub innych dowodów rynkowych; przyszłe prace nie powinny ich fabrykować.

## Product Principles

1. Najpierw zweryfikować spójne i użyteczne przepływy MVP, dopiero potem zwiększać złożoność infrastruktury.
2. Łączyć obszary życia w jeden konsekwentny model produktu i interfejsu.
3. Projektować dla małej grupy rzeczywistych użytkowników, nie dla jednej zakodowanej persony demonstracyjnej.
4. Zachować możliwość późniejszego przejścia z danych lokalnych do kont, synchronizacji i integracji.
5. Rozwijać funkcje etapami, utrzymując działające lokalne MVP jako podstawę kolejnych decyzji.

## Accessibility & Inclusion

Nie ustalono jeszcze docelowego standardu dostępności ani szczególnych potrzeb użytkowników. Bieżące MVP powinno zachować semantyczne podstawy interfejsu webowego i nie zamykać drogi do późniejszego audytu dostępności.
