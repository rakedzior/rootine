# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Rootine jest przeznaczone dla małej liczby użytkowników, którzy chcą zarządzać najważniejszymi obszarami codziennego życia w jednym miejscu. „Mateusz” i widoczne obecnie dane są przykładową personą oraz treścią demonstracyjną, a nie założeniem produktu dla jednej konkretnej osoby.

## Product Purpose

Produkt łączy planowanie i śledzenie codziennych obowiązków, czasu, celów, aktywności fizycznej oraz innych obszarów życia w jednym webowym pulpicie. Sukces MVP oznacza, że podstawowe przepływy pozostają szybkie i odporne lokalnie, a opcjonalne konto oraz synchronizacja Supabase nie blokują pracy bez konfiguracji serwera lub aktywnej sesji.

## Positioning

Rootine ma być jednym spójnym miejscem do pracy z powiązanymi obszarami życia zamiast zbiorem odseparowanych narzędzi. Dokładne pozycjonowanie rynkowe i wyróżnik względem konkretnych produktów pozostają do ustalenia po walidacji MVP.

## Operating Context

Obecny interfejs ma dziewięć głównych obszarów: Dzisiaj, Zadania, Odżywianie, Sport, Praca, Cele, Podróże, Notatki i Pozostałe. Kalendarz oraz Nawyki są widokami Zadań. Podróże mają własny moduł z przeglądem wyjazdów i teczką każdego wyjazdu. `Praca` jest kanonicznym miejscem dla obowiązków zawodowych i dawnego pojęcia „Biuro”; adres `/biuro` zachowuje zgodność przez przekierowanie. `Finanse` są jednym podwidokiem modułu Pozostałe, z filtrami dla płatności jednorazowych, cyklicznych i subskrypcji; adres `/finanse` prowadzi do tego wspólnego rejestru. JDG jest wydzielonym podwidokiem modułu Pozostałe.

## Capabilities and Constraints

- MVP jest tworzone jako aplikacja webowa o architekturze local-first.
- Bez konfiguracji Supabase lub bez zalogowanej sesji aplikacja działa lokalnie. Po skonfigurowaniu browser-safe URL i publishable/anon key panel profilu udostępnia konto, a workspace snapshots mogą synchronizować się z Supabase pod ochroną RLS.
- Dane lokalne korzystają z repozytoriów przeglądarkowych (`localStorage` i IndexedDB zależnie od obszaru); opcjonalna synchronizacja nie zastępuje lokalnej ścieżki działania.
- Aktualny zakres funkcjonalny obejmuje przede wszystkim zadania, kalendarz, cele, sport i dziennik odżywiania oraz prostsze wersje pozostałych modułów.
- Pozostałe są centrum prywatnych zobowiązań: Przegląd łączy wspólny radar z osobnymi torami Spraw, Finansów, Rejestrów i Pozostałych obszarów. Zakres obejmuje sprawy w trzech horyzontach czasu, płatności jednorazowe, cykliczne i subskrypcje, ważność dokumentów, pojazdy z terminami datowymi i przebiegowymi oraz administracyjne przypomnienia zdrowotne. Zdrowie przechowuje wizyty, badania, recepty i szczepienia, bez porad medycznych. Osobny moduł budżetu nie należy obecnie do zakresu produktu.
- Podróże łączą ogólny przegląd wyjazdów z osobną teczką każdej podróży: planem dzień po dniu, noclegami, transportem, budżetem plan-versus-actual, wymaganymi dokumentami oraz listą przygotowań. Dane i stan gotowości pozostają lokalne.
- Notatki zapewniają lokalny obszar szybkiego zapisu tekstu i checklist. Można je przypinać, kolorować, grupować w listach, oznaczać tagami, wyszukiwać, sortować, edytować, archiwizować i usuwać.
- Podwidok JDG w module Pozostałe prowadzi prostą, stałą checklistę sześciu kroków: wystawienia faktury, przekazania dokumentów księgowości, zamknięcia miesiąca oraz opłacenia PIT-28, VAT-7 i ZUS. Domyślnie pokazuje miesiąc poprzedni względem miesiąca rozliczenia, a wykonanie wszystkich kroków zamyka miesiąc.
- Planowanie w module Sport składa się z biblioteki szablonów przypisanych do kategorii oraz jednego aktywnego cyklu. Cykl pozwala rozłożyć treningi na tygodnie i dni, powtarzać je co tydzień albo tylko w wybranych tygodniach, przesuwać, edytować pojedynczo lub seriami, usuwać i zapisać jako jeden plan. Widok Dzisiaj uruchamia pełną aktywną sesję z ćwiczeniami, seriami, obciążeniem, powtórzeniami, RIR lub bólem, notatkami i trwałym timerem przerw; zakończenie automatycznie aktualizuje Historię i Analizę.
- Dziennik odżywiania łączy lokalny katalog podstawowych produktów USDA z odczytem publicznego katalogu Open Food Facts; zapisane posiłki nadal pozostają wyłącznie lokalne.
- Cele kalorii i nawodnienia mogą być ustawione ręcznie albo oszacowane z lokalnego profilu obejmującego dane ciała, charakter pracy, listę tygodniowych aktywności i procentową lub kaloryczną korektę celu diety. Makroskładniki można ustawić przez profil automatyczny, procenty albo twarde wartości; wynik kalkulatora pozostaje edytowalny i nie jest poradą medyczną.
- Moduł odżywiania przechowuje lokalne pomiary masy ciała i zestawia ich trend z zapisanymi kaloriami oraz makroskładnikami w zakresach 7, 30 i 90 dni.
- Obecna integracja serwerowa jest ograniczona do opcjonalnego Supabase auth i synchronizacji workspace snapshots. Dalsze integracje, pełniejsza polityka prywatności i eksport danych pozostają pracą przyszłą.
- Wersja mobilna jest planowana na końcu tej sekwencji i nie jest częścią bieżącego MVP.
- Architektura interfejsu nie powinna zakładać, że przykładowy użytkownik „Mateusz” jest jedynym użytkownikiem produktu.

## Brand Commitments

Nazwa produktu to Rootine. Interfejs i komunikaty są obecnie tworzone w języku polskim. Inne trwałe zobowiązania marki nie zostały jeszcze ustalone.

## Evidence on Hand

- Działająca implementacja React/Vite: `src/app/`.
- Routing i lista obszarów produktu: `src/app/routes.ts` oraz `src/app/layout/Layout.tsx`.
- Utrzymywane granice inwentarzy IA, ekranów, komponentów, copy i capabilities: `docs/product-inventory.md`.
- Rozbudowane przepływy referencyjne: `src/app/pages/Zadania.tsx`, `src/app/pages/Kalendarz.tsx`, `src/app/pages/Cele.tsx`, `src/app/pages/Sport.tsx` wraz z `src/app/sport/` oraz `src/app/pages/Odzywanie.tsx`.
- Lokalne przechowywanie stanu jest widoczne m.in. w `src/app/goals/goalsStore.tsx`, `src/app/data/taskCompletion.ts`, `src/app/pages/Sport.tsx` i `src/app/data/nutritionWorkspace.ts`.
- Katalog produktów i reguły podpowiedzi dla odżywiania znajdują się w `src/app/data/nutritionCatalog.ts`.
- Jawne wzory estymacji kalorii i nawodnienia znajdują się w `src/app/data/nutritionCalculator.ts`.
- README opisuje obecną aplikację jako rekonstrukcję dostarczonego pliku Figma Make.
- Opcjonalne konto i synchronizacja: `src/infrastructure/supabase/`, `supabase/migrations/20260806120000_rootine_workspace_snapshots.sql` oraz sekcja „Supabase persistence” w README.
- Brak potwierdzonych referencji klientów, benchmarków, danych o użyciu lub innych dowodów rynkowych; przyszłe prace nie powinny ich fabrykować.

## Product Principles

1. Najpierw utrzymać spójne i użyteczne przepływy local-first; opcjonalna infrastruktura nie może blokować pracy lokalnej.
2. Łączyć obszary życia w jeden konsekwentny model produktu i interfejsu.
3. Projektować dla małej grupy rzeczywistych użytkowników, nie dla jednej zakodowanej persony demonstracyjnej.
4. Utrzymywać jawny podział między lokalnym źródłem ciągłości pracy a opcjonalnym kontem, synchronizacją i integracjami.
5. Rozwijać funkcje etapami, utrzymując działające lokalne MVP jako podstawę kolejnych decyzji.

## Accessibility & Inclusion

Docelowym standardem interfejsu jest WCAG 2.2 na poziomie AA. Każda podstawowa czynność musi być dostępna z klawiatury, zachowywać widoczny fokus i poprawny powrót fokusu po zamknięciu warstwy, a komponenty złożone muszą realizować właściwy wzorzec ARIA. Automatyczne testy axe, kontrakty semantyczne oraz testy focus/Escape są bramką wydania; nie zastępują okresowej weryfikacji z czytnikiem ekranu ani badań z osobami korzystającymi z technologii asystujących.
