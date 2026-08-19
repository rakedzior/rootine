# Rootine iOS — fundamenty aplikacji

Status: `zaakceptowany; etap techniczny 1 rozpoczęty`
Wersja: `0.2`
Data: `2026-08-19`
Akceptacja: `2026-08-19`

## 1. Cel dokumentu

Ten dokument zamyka etap analizy i wywiadu przed rozpoczęciem natywnej aplikacji Rootine na iPhone'a. Opisuje zaakceptowany zakres MVP, relację z aplikacją webową, kontrakt danych, architekturę SwiftUI, nawigację, system wizualny, kolejność prac i ryzyka.

Implementacja projektu Xcode, backendu mobilnego ani ekranów nie rozpoczęła się przed jawną akceptacją tego dokumentu. Kolejne pełne ekrany nadal będą osobno omawiane, projektowane, zatwierdzane, implementowane i testowane.

## 2. Kontekst i użytkownicy

- Pierwsza wersja jest przeznaczona dla właściciela produktu i kilku znajomych.
- Pierwszą ścieżką dystrybucji będzie zamknięty TestFlight.
- Konto jest wymagane od pierwszego uruchomienia.
- Pierwsze logowanie wymaga sieci; po nim aplikacja ma działać offline na trwałej lokalnej kopii.
- Najczęstsze zadania mobilne to:
  1. sprawdzenie Dzisiaj;
  2. dodanie lub ukończenie zadania;
  3. dodanie posiłku albo wody;
  4. dodanie notatki.

## 3. Źródła prawdy

Implementacja iOS ma korzystać z istniejących kontraktów, a nie tworzyć drugiej, niezależnej wersji produktu.

| Obszar | Źródło prawdy |
| --- | --- |
| Globalne moduły | `src/app/moduleRegistry.ts` |
| Ekrany i routing webu | `src/app/routes.ts` |
| Modele domenowe i migracje | `src/app/data/`, `src/app/goals/`, `src/app/sport/` |
| Synchronizacja cross-platform | `docs/data-sync-contract.md` |
| Migracje backendu | `supabase/migrations/` |
| System wizualny | `DESIGN.md`, `src/styles/tokens.css` |
| Terminologia | `docs/content-terminology.md` |

Dokument wejściowy wymieniał historyczne moduły, które nie odpowiadają obecnej implementacji. Asystent został usunięty. Biuro, Finanse i JDG nie są globalnymi modułami: Biuro przekierowuje do Pracy, a Finanse i JDG są widokami w Pozostałych.

## 4. Kanoniczna lista wszystkich modułów Rootine

1. **Dzisiaj** — bilans dnia, kolejka, zaległości i podsumowania obszarów.
2. **Zadania** — zadania, Nawyki i Kalendarz.
3. **Odżywianie** — dziennik, cele, produkty, posiłki, nawodnienie i analiza.
4. **Sport** — plany, sesje, historia i analiza.
5. **Praca** — firmy, projekty i zadania zawodowe.
6. **Cele** — cele, kamienie milowe i postęp.
7. **Podróże** — wyjazdy, plany, rezerwacje, budżety i dokumenty podróży.
8. **Pozostałe** — Sprawy, Finanse, Dokumenty, Pojazdy, Zdrowie i JDG.
9. **Notatki** — notatki tekstowe i checklisty.

## 5. Zaakceptowany zakres MVP iOS

### 5.1 W zakresie

- wymagane konto Rootine;
- logowanie e-mail/hasło, Google i Sign in with Apple;
- odzyskiwanie hasła i trwała sesja w Keychain;
- Dzisiaj bez osobnego kalendarza;
- Zadania: lista, szczegóły, dodawanie, edycja, ukończenie i usunięcie;
- Nawyki: lista, dodawanie, edycja i oznaczanie wykonania;
- Kalendarz wewnątrz Zadań;
- Odżywianie:
  - śniadanie, obiad, kolacja i przekąski;
  - dziennik dzienny;
  - dodawanie i usuwanie pozycji;
  - kalorie, białko, węglowodany i tłuszcze;
  - woda;
  - cele kcal, makro i wody;
  - wykorzystanie profilu kalkulatora istniejącego na webie;
  - wyszukiwanie produktów;
  - skanowanie EAN-8, EAN-13, UPC-A, UPC-E i QR;
- pełny moduł Notatki: lista, wyszukiwanie/filtry, tekst, checklisty, przypięcie i archiwum zgodnie z modelem webowym;
- kontekstowy przycisk szybkiego dodawania;
- konto, stan synchronizacji, ręczne ponowienie, konflikty i usunięcie konta;
- trwała praca offline po pierwszym zalogowaniu;
- synchronizacja web ↔ iPhone przez ten sam projekt Supabase.

### 5.2 Poza MVP

- pełne natywne ekrany: Cele, Sport, Praca, Podróże i Pozostałe;
- powiadomienia lokalne i push;
- widżety, Live Activities, Apple Watch i iPad;
- jasny motyw Pergamin;
- własne produkty, własne przepisy i rozbudowana biblioteka dań;
- rozbudowane plany dietetyczne, społeczność i funkcje premium znane z MyFitnessPal/Fitatu;
- zaawansowana analityka masy i wymiarów ciała, jeśli nie jest potrzebna do prezentacji istniejących celów;
- edycja układu dolnej nawigacji.

Dane modułów spoza MVP nadal mogą być pobierane i przechowywane jako nieprzezroczyste snapshoty. Aplikacja iOS nie będzie ich interpretować ani modyfikować, dopóki odpowiadające im moduły nie zostaną wdrożone.

## 6. Dzisiaj w MVP

Ekran zachowuje znaczenie wersji webowej, ale nie jej desktopowy układ.

Kolejność treści:

1. postęp dnia;
2. następne zadania z przypisaną godziną;
3. zaległości;
4. podsumowania obszarów dostępnych natywnie w MVP:
   - Zadania;
   - Nawyki;
   - Odżywianie;
   - Notatki.

Kalendarz nie jest osobną kartą na Dzisiaj. „Następne w kolejce” jest skrótem zadań godzinowych, a pełny Kalendarz należy do Zadań. Obszary bez natywnego ekranu nie są pokazywane, aby nie tworzyć martwych przejść.

## 7. Nawigacja i interakcje

### 7.1 Główna nawigacja

Dolny pasek zawiera pięć elementów:

1. **Dzisiaj**;
2. **Zadania**;
3. **Odżywianie**;
4. **Notatki**;
5. kontekstowy przycisk **+**.

Profil, konto, synchronizacja i ustawienia są dostępne przez ikonę w prawym górnym rogu, a nie przez dodatkową zakładkę Więcej.

Każda zakładka utrzymuje własny `NavigationStack`. Szczegóły otwierają się przez push, krótkie formularze przez sheet, a skaner aparatu przez full-screen cover. Systemowy gest powrotu pozostaje aktywny.

### 7.2 Kontekstowy przycisk +

| Kontekst | Akcje |
| --- | --- |
| Dzisiaj | Zadanie, posiłek, woda, notatka |
| Zadania | Zadanie, nawyk |
| Odżywianie | Posiłek, woda, skanuj produkt |
| Notatki | Bezpośrednio nowa notatka |

Jedna dostępna akcja uruchamia się bez menu. Kilka akcji otwiera systemowy dolny arkusz. Przycisk nie może zasłaniać treści, klawiatury ani systemowego wskaźnika Home.

### 7.3 Preferencje urządzenia

Kolejność zakładek, stan rozwinięcia sekcji i inne preferencje mobilnego interfejsu są lokalne dla iPhone'a. Dane domenowe, cele, wpisy i stan synchronizacji są wspólne. Nie kopiujemy ustawień desktopowego sidebara do nawigacji iOS.

## 8. Model danych

### 8.1 Zasada

Jednostką danych jest wersjonowany dokument JSON wskazany przez `storage_key`. Swift odwzorowuje istniejące modele przez `Codable`, zachowując nazwy pól, identyfikatory, formaty dat, wersje i semantykę wartości opcjonalnych.

Najważniejsze dokumenty dla MVP:

| Domena | `storage_key` | Zakres Swift |
| --- | --- | --- |
| Zadania i Nawyki | `rootine.task-workspace.v1` | Pełne modele i edycja |
| Odżywianie | `rootine.nutrition-workspace.v1` | Pełne modele MVP i edycja |
| Notatki | `rootine.notes-workspace.v1` | Pełne modele i edycja |
| Ukończenia/podsumowania Zadań | `rootine.task-completion.v1`, `rootine.task-summary-notes.v1` | Zgodnie z użyciem ekranów MVP |
| Pozostałe domeny | pozostałe klucze Rootine | Opaque JSON, bez natywnej edycji |

Workspace Odżywiania ma obecnie wersję 6 i już przechowuje `goals`, `calculatorProfile`, `macroConfiguration`, pomiary oraz dni. Jeżeli cele istnieją na koncie, iPhone pobiera je bez ponownego onboardingu. Brak profilu prowadzi do formularza konfiguracji; nie tworzymy danych demonstracyjnych.

### 8.2 Kontrakt cross-platform przed UI

Przed wdrożeniem pierwszego ekranu domenowego należy dodać:

- kanoniczne przykładowe snapshoty JSON dla MVP;
- testy dekodowania tych samych fixture'ów w TypeScript i Swift;
- testy migracji starszych wersji;
- testy dat lokalnych `YYYY-MM-DD`, znaczników ISO 8601, enumów, identyfikatorów i pól opcjonalnych;
- test odczytu snapshotu zapisanego przez web i ponownego odczytu po zapisie z iOS.

Zmiana znaczenia pola lub `storage_key` wymaga wersjonowania kontraktu, nie jednostronnego refaktoru klienta.

## 9. Backend, konto i synchronizacja

### 9.1 Wspólna architektura

Supabase jest wspólnym systemem kont, wymiany danych i kontroli współbieżności dla webu oraz iOS. Nie powstaje osobna baza mobilna.

Przepływ zapisu:

1. użytkownik wykonuje akcję w SwiftUI;
2. lokalny workspace jest walidowany i atomowo zapisywany;
3. mutacja trafia do trwałej kolejki synchronizacji;
4. klient wywołuje `rootine_apply_workspace_snapshot(...)` z ostatnią znaną rewizją;
5. `applied = true` aktualizuje lokalną bazę rewizji;
6. `applied = false` tworzy jawny konflikt;
7. Realtime propaguje zatwierdzoną zmianę do webu i innych urządzeń.

Bezpośrednie `INSERT`, `UPDATE` i `DELETE` do `rootine_workspace_snapshots` pozostają zabronione. Klient używa wyłącznie publishable key i JWT użytkownika. Service-role key nigdy nie trafia do aplikacji.

### 9.2 Tryb offline

- Pierwsze logowanie i pierwsze pobranie wymagają sieci.
- Po pierwszym poprawnym zalogowaniu ważna lokalna kopia jest dostępna bez sieci.
- Zapisy offline są kolejkowane i ponawiane po odzyskaniu połączenia.
- Wylogowanie czyści tokeny i dane lokalne konta dopiero po potwierdzeniu użytkownika.
- Błąd sieci nie blokuje dodawania ani ukończenia elementu.

### 9.3 Konflikty

Konflikt jest rozwiązywany per `storage_key`, zgodnie z kontraktem v2:

- **Zachowaj dane z tego iPhone'a**;
- **Użyj danych z konta**.

Przed zastąpieniem lokalnego dokumentu powstaje kopia odzyskiwania. MVP nie wykonuje automatycznego scalania pól ani last-write-wins.

### 9.4 Logowanie

- e-mail i hasło przez Supabase Auth;
- Google OAuth przez systemową sesję uwierzytelniania i bezpieczny callback;
- Sign in with Apple jako równoważna metoda logowania;
- tokeny i refresh token przechowywane wyłącznie w Keychain;
- aplikacja obsługuje reset hasła i powrót przez deep link;
- ekran ustawień umożliwia usunięcie konta.

### 9.5 Prace backendowe wymagane przed wersją beta

1. Stabilny, produkcyjny URL backendu dostępny dla aplikacji mobilnej.
2. Uwierzytelniony endpoint wyszukiwania Open Food Facts.
3. Endpoint pobrania produktu po EAN/UPC z walidacją, limitem i cache.
4. Serwerowa operacja usunięcia konta oraz powiązanych danych; sekret service-role pozostaje wyłącznie po stronie serwera.
5. Konfiguracja Google i Apple w Supabase oraz callbacków iOS.
6. Test integracyjny Auth → odczyt snapshotu → CAS → Realtime → konflikt.

## 10. Architektura SwiftUI

### 10.1 Założenia narzędziowe

- lokalnie: MacBook Pro Retina Mid 2015, macOS Monterey 12.7.6 i Xcode 14.2;
- urządzenie: iPhone 15 Pro Max z iOS 27;
- deployment target: iOS 16.0;
- lokalne uruchamianie: symulator iOS 16.2;
- fizyczny iPhone: build chmurowy i TestFlight;
- język: Swift 5 w trybie zgodnym z Xcode 14.2;
- brak SwiftData, Observation i API wymagających iOS 17+.

Buildy TestFlight powstają ręcznie w GitHub Actions na nowoczesnym macOS/Xcode. Workflow nie uruchamia kosztownego buildu macOS po każdym commicie. Xcode Cloud może zostać rozważony później po jednorazowej konfiguracji w Xcode 15+.

### 10.2 Styl architektury

Preferowana jest prosta architektura feature-first z protokołami na granicach systemu:

- SwiftUI Views — wyłącznie prezentacja i intencje użytkownika;
- `@MainActor ObservableObject` feature stores — stan ekranu i orkiestracja;
- modele `Codable` — kontrakty domenowe;
- aktory persistence/sync — serializacja zapisu i współbieżność;
- repozytoria domenowe — walidacja, migracja i operacje na workspace'ach;
- `AppEnvironment` — jawne dependency injection przez protokoły.

Nie wprowadzamy TCA, globalnego Redux ani rozbudowanego frameworka DI. Najnowszy Supabase Swift nie jest zależnością MVP, ponieważ nie kompiluje się w Xcode 14.2. Warstwa backendu korzysta z `URLSession`, a szczegóły transportu są ukryte za protokołami, aby można było później wymienić implementację.

### 10.3 Proponowana struktura projektu

```text
ios/
  Rootine.xcodeproj
  Rootine/
    App/
      RootineApp.swift
      AppEnvironment.swift
      AppRouter.swift
    Core/
      Auth/
      Backend/
      DesignSystem/
      Persistence/
      Sync/
      Navigation/
      Utilities/
    Contracts/
      JSONValue.swift
      WorkspaceEnvelope.swift
      Tasks/
      Nutrition/
      Notes/
    Features/
      Launch/
      Authentication/
      Today/
      Tasks/
      Nutrition/
      Notes/
      Account/
    Resources/
      Assets.xcassets
      Localizable.strings
      PrivacyInfo.xcprivacy
  RootineTests/
    Contracts/
    Persistence/
    Sync/
    Features/
  RootineUITests/
  Config/
```

### 10.4 Pamięć lokalna

- Jeden atomowo zapisywany plik JSON na workspace w Application Support.
- Ochrona plików przez iOS Data Protection.
- Keychain dla sekretów sesji; żadnych tokenów w `UserDefaults`.
- Osobny manifest rewizji, hashy i wspólnej bazy synchronizacji.
- Trwała kolejka niezatwierdzonych zapisów.
- Kopie odzyskiwania przed importem wersji z konta.
- `UserDefaults` wyłącznie dla małych preferencji interfejsu urządzenia.

## 11. System wizualny i dostępność

### 11.1 Kierunek zaakceptowany

- tylko ciemny motyw Atrament w MVP;
- grafitowe, tonalne powierzchnie;
- precyzyjny błękit dla aktywności i głównej akcji;
- sea-glass/zieleń dla sukcesu, ochra dla ostrzeżeń i coral dla błędów;
- spokojny, premium i operacyjny charakter;
- zaokrąglone karty i subtelne obramowania;
- brak neonów, przypadkowych gradientów, ciężkich cieni i nadmiernego glassmorphismu.

### 11.2 Adaptacja do iOS

- systemowa typografia i Dynamic Type zamiast kopiowania webowych wartości pikselowych;
- SF Symbols przechowywane i używane po nazwie;
- minimalny cel dotykowy 44 × 44 pt;
- podstawowy rytm odstępów 4/8/12/16/24/32 pt;
- promienie 8/12/16 pt zależnie od hierarchii powierzchni;
- systemowe sheets, alerty, menu, swipe actions i gest powrotu;
- znaczące, oszczędne haptyki po ukończeniu i zapisie;
- pełny VoiceOver, odpowiednia kolejność fokusu i etykiety wartości postępu;
- obsługa Reduce Motion, zwiększonego kontrastu i bardzo dużego tekstu;
- kolor nigdy nie jest jedynym nośnikiem stanu.

## 12. Lista ekranów MVP

### Fundament i konto

1. Launch / przywracanie sesji i synchronizacji.
2. Logowanie e-mail/hasło.
3. Rejestracja.
4. Reset hasła.
5. Google OAuth.
6. Sign in with Apple.
7. Profil i ustawienia konta.
8. Stan synchronizacji i rozwiązanie konfliktu.
9. Usunięcie konta.

### Dzisiaj

10. Dzisiaj.
11. Arkusz szybkiego dodawania.

### Zadania

12. Lista Zadań i widoki inteligentne.
13. Szczegóły zadania.
14. Dodawanie/edycja zadania.
15. Nawyki.
16. Dodawanie/edycja nawyku.
17. Kalendarz.

### Odżywianie

18. Dziennik dnia i podsumowanie makro.
19. Dodawanie posiłku.
20. Wyszukiwanie produktu.
21. Skaner kodu.
22. Wybór porcji i dodanie produktu.
23. Dodawanie wody.
24. Cele i profil kalkulatora.

### Notatki

25. Lista, wyszukiwanie i filtry Notatek.
26. Edytor notatki tekstowej/checklisty.

Każdy z tych ekranów wymaga osobnej specyfikacji stanów: normalnego, pustego, ładowania, błędu, offline, konfliktu, długiego tekstu i klawiatury.

## 13. Kolejność realizacji

Kolejność różni się od pierwotnej propozycji, ponieważ wymagane konto i wspólne dane oznaczają, że synchronizacja nie może być ostatnim etapem.

1. Fixture'y kontraktowe i testy JSON web ↔ Swift.
2. Brakujące endpointy backendowe i konfiguracja Auth.
3. Projekt Xcode, konfiguracje środowisk i ręczny workflow chmurowy.
4. Design system Atrament.
5. Szkielet nawigacji i kontekstowy `+`.
6. Persistence, Keychain, kolejka offline i silnik synchronizacji.
7. Launch oraz logowanie/konto.
8. Dzisiaj — najpierw specyfikacja, potem implementacja i test.
9. Zadania: lista → szczegóły → formularz.
10. Nawyki.
11. Kalendarz.
12. Odżywianie: dzień → woda → dodawanie posiłku → wyszukiwanie → skaner → cele.
13. Notatki: lista → edytor.
14. Konflikty, eksport/odzyskiwanie i usunięcie konta.
15. Pełny przebieg TestFlight i testy z kilkoma kontami/urządzeniami.

Po każdym ekranie następuje osobna akceptacja przed rozpoczęciem kolejnego.

## 14. Testowanie i kryteria gotowości

### Lokalne

- kompilacja w Xcode 14.2;
- testy jednostkowe modeli, migracji, repozytoriów i synchronizacji;
- SwiftUI Preview, jeśli nie zwiększa złożoności produkcyjnej;
- symulator iOS 16.2 w małym i dużym rozmiarze;
- Dynamic Type, VoiceOver, klawiatura i zmiana orientacji tam, gdzie ma sens.

### Chmurowe i urządzenie

- build oraz testy w aktualnym wymaganym Xcode;
- archiwizacja i podpisanie;
- ręczne wysłanie do TestFlight;
- iPhone 15 Pro Max z iOS 27;
- logowanie e-mail, Google i Apple;
- praca offline, restart, odzyskanie sieci i synchronizacja;
- zmiana na webie widoczna na iPhonie i odwrotnie;
- wywołany celowo konflikt bez utraty żadnej wersji;
- skaner na fizycznym urządzeniu;
- brak atrap: każdy widoczny element interaktywny ma działanie.

### Koszt CI

- workflow macOS jest uruchamiany ręcznie;
- szybkie testy kontraktów niewymagające Xcode mogą działać poza macOS;
- build urządzeniowy tylko po ukończeniu większego etapu;
- budżet CI ma zatrzymywać użycie po osiągnięciu ustawionego limitu.

## 15. Bezpieczeństwo, prywatność i etyka

- Brak sekretów serwerowych w aplikacji i repozytorium.
- Minimalne uprawnienia: aparat dopiero przy uruchomieniu skanera.
- Jasne wyjaśnienie lokalnej kopii, synchronizacji i skutków wylogowania/usunięcia konta.
- Brak domyślnego tworzenia danych demo na prawdziwym koncie.
- Brak ukrytego nadpisywania konfliktów.
- Brak mechanizmów wymuszających zaangażowanie, streak shame lub manipulacyjnych powiadomień.
- Cele żywieniowe są narzędziem organizacyjnym, nie poradą medyczną; kalkulator pokazuje, że wynik jest szacunkiem.
- Usunięcie konta jest dostępne w aplikacji i wymaga jednoznacznego potwierdzenia zakresu operacji.

## 16. Ryzyka i działania ograniczające

| Ryzyko | Konsekwencja | Ograniczenie |
| --- | --- | --- |
| Xcode 14.2 nie obsłuży iOS 27 | Brak lokalnego debugowania na fizycznym telefonie | Symulator lokalnie, ręczny CI i TestFlight na kamieniach milowych |
| Nowoczesne SDK Supabase nie działa w Xcode 14.2 | Blokada kompilacji lub stara zależność | Cienki klient `URLSession` za protokołem |
| TypeScript i Swift mogą różnie interpretować JSON | Utrata lub odrzucenie danych | Wspólne fixture'y i testy round-trip przed ekranami |
| Snapshot całej domeny daje gruby konflikt | Równoległe edycje web/iPhone wymagają decyzji | CAS v2, jawny konflikt, kopia odzyskiwania; drobniejsze dokumenty dopiero w kontrakcie v3 |
| Open Food Facts ma braki i duplikaty | Nieudane skanowanie produktu | Backendowy lookup, walidacja, cache i ręczny wpis jako późniejszy fallback |
| Pięć zakładek plus `+` przeciąży pasek | Małe cele dotykowe i chaos | Cztery zakładki + `+`; ustawienia w toolbarze |
| Moduły spoza MVP mają dane, ale brak ekranów | Martwe przejścia | Opaque sync bez prezentacji na Dzisiaj |
| Buildy macOS generują koszt | Nieprzewidziane opłaty | Manual trigger, cache, limit kosztu i rzadkie buildy urządzeniowe |

## 17. Decyzje proponowane do akceptacji

Akceptacja dokumentu zatwierdza łącznie:

1. zakres MVP opisany w rozdziale 5;
2. cztery zakładki i kontekstowy `+` jako piąty element;
3. Dzisiaj bez Kalendarza i bez obszarów prowadzących do nieistniejących ekranów;
4. tylko ciemny Atrament w MVP;
5. e-mail/hasło, Google i Sign in with Apple;
6. iOS 16.0, Swift 5 i zgodność projektu z Xcode 14.2;
7. GitHub Actions/TestFlight jako ścieżkę testów fizycznego urządzenia;
8. `URLSession` zamiast niewspieranego SDK Supabase w MVP;
9. pliki JSON + Keychain + kolejkę offline jako lokalną warstwę danych;
10. zachowanie snapshotów i CAS v2 bez osobnej bazy mobilnej;
11. lokalne preferencje interfejsu i wspólne dane domenowe;
12. kolejność realizacji z backendem i synchronizacją przed ekranami domenowymi.

## 18. Otwarte pytania nieblokujące pierwszego etapu

- Ostateczny bundle identifier, np. `pl.rootine.app`.
- Produkcyjna domena backendu używana przez aplikację mobilną.
- Treść polityki prywatności i adres wsparcia dla TestFlight/App Review.
- Ostateczna ikona aplikacji i materiały App Store.
- Retencja kopii odzyskiwania po usunięciu konta.
- Moment dodania jasnego motywu, powiadomień i kolejnych modułów.

Te pytania muszą zostać rozstrzygnięte przed odpowiednim etapem, ale nie blokują przygotowania fixture'ów kontraktowych i projektu Xcode po akceptacji fundamentów.

## 19. Punkt akceptacji

Dokument został zaakceptowany 19 sierpnia 2026 r. Uruchomiony etap techniczny 1 obejmuje wyłącznie kontrakty cross-platform, brakujące operacje backendu oraz szkielet projektu Xcode/CI. Nie stanowi akceptacji finalnych projektów pełnych ekranów; każda większa część nadal wymaga osobnej akceptacji zgodnie z zasadą pracy etapami.
