# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Rootine jest przeznaczone dla małej liczby użytkowników, którzy chcą zarządzać najważniejszymi obszarami codziennego życia w jednym miejscu. „Mateusz” i widoczne obecnie dane są przykładową personą oraz treścią demonstracyjną, a nie założeniem produktu dla jednej konkretnej osoby.

## Product Purpose

Produkt łączy planowanie i śledzenie codziennych obowiązków, czasu, celów, aktywności fizycznej oraz innych obszarów życia w jednym webowym pulpicie. Sukces MVP oznacza, że podstawowe przepływy można sprawnie zbudować, przetestować i ujednolicić lokalnie przed dołożeniem infrastruktury serwerowej.

## Positioning

Rootine ma być jednym spójnym miejscem do pracy z powiązanymi obszarami życia zamiast zbiorem odseparowanych narzędzi. Dokładne pozycjonowanie rynkowe i wyróżnik względem konkretnych produktów pozostają do ustalenia po walidacji MVP.

## Operating Context

Obecny interfejs obejmuje moduły Dzisiaj, zadań, kalendarza, notatek, celów, sportu, odżywiania, pracy, spraw oraz podróży. `Praca` jest kanonicznym miejscem dla obowiązków zawodowych i dawnego pojęcia „Biuro”; adres `/biuro` zachowuje zgodność przez przekierowanie. `Finanse` pozostają nazwanym podwidokiem modułu Sprawy, obejmującym płatności, subskrypcje, budżet oraz kontekst JDG; adres `/finanse` prowadzi do miesięcznego budżetu w Sprawach. JDG jest wydzielonym podwidokiem modułu Sprawy. Rozbudowane sekcje korzystają ze wspólnego systemu interfejsu i lokalnych obszarów roboczych dopasowanych do charakteru danych.

## Capabilities and Constraints

- MVP jest tworzone lokalnie jako aplikacja webowa.
- Obecnie nie ma kont użytkowników ani backendu; stan jest lokalny, a część modułów korzysta z `localStorage`.
- Aktualny zakres funkcjonalny obejmuje przede wszystkim zadania, kalendarz, cele, sport i dziennik odżywiania oraz prostsze wersje pozostałych modułów.
- Sprawy są centrum prywatnych zobowiązań: łączą poważne formalności, płatności jednorazowe i cykliczne, subskrypcje, ważność dokumentów, rejestr pojazdów z terminami datowymi i przebiegowymi oraz miesięczny budżet plan-versus-actual. Wspólny radar porządkuje najbliższe ryzyka między tymi rejestrami.
- Podróże łączą ogólny przegląd wyjazdów z osobną teczką każdej podróży: planem dzień po dniu, noclegami, transportem, budżetem plan-versus-actual, wymaganymi dokumentami oraz listą przygotowań. Dane i stan gotowości pozostają lokalne.
- Notatki zapewniają lokalny obszar szybkiego zapisu tekstu i checklist. Można je przypinać, kolorować, grupować w listach, oznaczać tagami, wyszukiwać, sortować, edytować, archiwizować i usuwać.
- Podwidok JDG w module Sprawy prowadzi miesięczną checklistę dokumentów, podatków, składek, dowodów wysyłki i zamknięcia miesiąca; wymagane punkty blokują przedwczesne zamknięcie, a własne punkty przechodzą do nowo tworzonych miesięcy.
- Planowanie w module Sport składa się z biblioteki szablonów przypisanych do kategorii oraz jednego aktywnego cyklu. Cykl pozwala rozłożyć treningi na tygodnie i dni, powtarzać je co tydzień albo tylko w wybranych tygodniach, przesuwać, edytować pojedynczo lub seriami, usuwać i zapisać jako jeden plan. Widok Dzisiaj uruchamia pełną aktywną sesję z ćwiczeniami, seriami, obciążeniem, powtórzeniami, RIR lub bólem, notatkami i trwałym timerem przerw; zakończenie automatycznie aktualizuje Historię i Analizę.
- Dziennik odżywiania łączy lokalny katalog podstawowych produktów USDA z odczytem publicznego katalogu Open Food Facts; zapisane posiłki nadal pozostają wyłącznie lokalne.
- Cele kalorii i nawodnienia mogą być ustawione ręcznie albo oszacowane z lokalnego profilu obejmującego dane ciała, charakter pracy, listę tygodniowych aktywności i procentową lub kaloryczną korektę celu diety. Makroskładniki można ustawić przez profil automatyczny, procenty albo twarde wartości; wynik kalkulatora pozostaje edytowalny i nie jest poradą medyczną.
- Moduł odżywiania przechowuje lokalne pomiary masy ciała i zestawia ich trend z zapisanymi kaloriami oraz makroskładnikami w zakresach 7, 30 i 90 dni.
- Po MVP planowane są kolejno: backend, własne bazy danych, synchronizacja, dalsze integracje, mechanizmy prywatności i eksport danych.
- Wersja mobilna jest planowana na końcu tej sekwencji i nie jest częścią bieżącego MVP.
- Architektura interfejsu nie powinna zakładać, że przykładowy użytkownik „Mateusz” jest jedynym użytkownikiem produktu.

## Brand Commitments

Nazwa produktu to Rootine. Interfejs i komunikaty są obecnie tworzone w języku polskim. Inne trwałe zobowiązania marki nie zostały jeszcze ustalone.

## Evidence on Hand

- Działająca implementacja React/Vite: `src/app/`.
- Routing i lista obszarów produktu: `src/app/routes.ts` oraz `src/app/layout/Layout.tsx`.
- Rozbudowane przepływy referencyjne: `src/app/pages/Zadania.tsx`, `src/app/pages/Kalendarz.tsx`, `src/app/pages/Cele.tsx`, `src/app/pages/Sport.tsx` wraz z `src/app/sport/` oraz `src/app/pages/Odzywanie.tsx`.
- Lokalne przechowywanie stanu jest widoczne m.in. w `src/app/goals/goalsStore.tsx`, `src/app/data/taskCompletion.ts`, `src/app/pages/Sport.tsx` i `src/app/data/nutritionWorkspace.ts`.
- Katalog produktów i reguły podpowiedzi dla odżywiania znajdują się w `src/app/data/nutritionCatalog.ts`.
- Jawne wzory estymacji kalorii i nawodnienia znajdują się w `src/app/data/nutritionCalculator.ts`.
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
