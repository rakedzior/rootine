# Rootine — audyt spójności tokenów i wzorców między modułami

**Data:** 12 sierpnia 2026  
**Zakres:** cały bieżący working tree aplikacji webowej: 9 modułów nawigacji, 17 tras ekranowych, podwidoki sterowane query string, wspólne okna globalne, komponenty UI, 24 arkusze CSS oraz reprezentatywne stany desktop/mobile.  
**Charakter pracy:** audyt diagnostyczny. Kod aplikacji i snapshoty nie zostały przeze mnie zmienione; jedynym nowym plikiem jest ten raport.

## 1. Werdykt

**Spójność międzymodułowa: 68/100.**  
**UX Health w ocenionym zakresie: 78/100.**  
**Anti-pattern verdict: Minor Issues — brak wzorców manipulacyjnych; obecny jest średnio dotkliwy „inconsistent mental model”.**

Rootine ma dobry, scentralizowany fundament: tokeny kolorów, typografii, promieni, spacingu, warstw i breakpointów; wspólny barrel UI; szeroko używane Button, Input, Select, DatePicker, Modal, Menu i Textarea; działające bramki jakości oraz testy desktop/mobile.

Nie ma jednak jeszcze jednego kontraktu interakcji dla analogicznych obiektów. Największy rozjazd występuje w dodawaniu i planowaniu zadań:

- Zadania mają własny bogaty scheduler, lokalne menu właściwości i własny quick-add;
- Praca ma drugi quick-add i drugi wariant menu właściwości, ale pełny formularz opiera już na shared UI;
- Sprawy używają wspólnego DatePicker, lecz godzinę wybierają natywnym polem time;
- Cele używają wspólnych formularzy i dwóch dat, ale bez godziny, przypomnienia i cykliczności.

W praktyce kolory i podstawowe powierzchnie wyglądają jak jedna aplikacja, lecz użytkownik nie może przenosić jednego wyuczonego sposobu dodawania, wyboru właściwości i planowania między modułami. Odpowiedź na główne pytanie brzmi więc: **nie, tokeny i komponenty nie są jeszcze używane jednolicie we wszystkich analogicznych miejscach.**

### Skąd 68/100

| Obszar | Wynik | Uzasadnienie |
|---|---:|---|
| Fundament tokenów | 18/20 | Jedno źródło prawdy, kompletne warstwy i breakpointy, zero nieautoryzowanych kolorów/z-indexów |
| Adopcja shared UI | 15/20 | Bardzo dobra dla Select/Modal/DatePicker; dużo lokalnych buttonów i inputów w Tasks/Goals |
| Spójność równoległych przepływów | 9/20 | Cztery różne archetypy tworzenia; brak wspólnego scheduling contract |
| Interakcja i dostępność | 12/20 | Rdzeń ma focus/Escape/typeahead; część lokalnych menu omija pełny kontrakt |
| Governance i regresja | 14/20 | Główne gate’y przechodzą, ale nie mierzą lokalnej geometrii, ikon ani override’ów internals |

## 2. Metoda i wiarygodność

Audyt łączy cztery warstwy dowodów:

1. **Pełna inwentaryzacja statyczna** src/app, routera, rejestru modułów, wszystkich feature TSX i wspólnego UI.
2. **Ilościowa analiza design systemu** wszystkich 24 plików CSS, deklaracji tokenów, importów, elementów native/shared oraz wyjątków audytu.
3. **Porównanie analogicznych przepływów** Zadania / Praca / Sprawy / Cele, a także powierzchni Sportu, Odżywiania, Podróży, Notatek i widoków globalnych.
4. **Walidacja runtime i wizualna** przez bieżące testy Playwright oraz bezpośredni ogląd aktualnych snapshotów.

### Bieżące wyniki automatyczne

- Vitest: **68 plików, 340 testów — PASS**.
- TypeScript app + API: **PASS**.
- CSS lint: **PASS**.
- Architecture audit: **PASS**.
- Design-system audit: **PASS**:
  - 93 obiekty inline-style w inwentarzu;
  - 0 niedozwolonych statycznych właściwości inline;
  - 0 nieautoryzowanych raw colors;
  - 0 nieautoryzowanych raw checkboxes;
  - 0 raw z-index;
  - 104 media queries, 0 niezarejestrowanych;
  - 0 bezpośrednich importów omijających barrel UI.
- Świeży ukierunkowany runtime pass: **67 testów PASS, 5 uzasadnionych skipów platformowych**, w tym:
  - design-system visual desktop/mobile: 10/10;
  - Praca desktop/mobile: 8/8;
  - Sprawy, Finanse, JDG i Podróże: 19 PASS + 3 skip;
  - Cele desktop/mobile: 10 PASS + 2 skip;
  - axe desktop/mobile: 18/18;
  - focus/Escape desktop/mobile: 2/2.

Testowane viewporty bieżące: 1440×900 i 390×844. Szerszy audyt z 10 sierpnia obejmujący 50 podwidoków i 128 screenshotów został wykorzystany wyłącznie jako materiał pomocniczy, ponieważ od tego czasu working tree się zmienił.

### Ograniczenie

Wbudowana przeglądarka interaktywna nie była dostępna. Cały kod i wszystkie powierzchnie zostały objęte inwentaryzacją statyczną, ale nie każdy z 218 lokalnych przycisków został ręcznie kliknięty w żywej sesji. Bieżąca walidacja runtime opiera się na repozytoryjnym Playwright i snapshotach. Wnioski o pełnym pokryciu oznaczają pełne pokrycie architektury i kodu oraz reprezentatywne pokrycie runtime — nie badanie użyteczności z użytkownikami.

Raport opisuje working tree zawierający niezacommitowane zmiany wokół TaskSchedulePicker i DatePicker. Końcowe gate’y uruchomiono ponownie po tych zmianach.

## 3. Mapa całej aplikacji

Źródło nawigacji deklaruje 9 modułów (src/app/moduleRegistry.ts:41-51), a router 17 właściwych ścieżek ekranowych plus 3 przekierowania legacy i wildcard (src/app/routes.ts:54-92).

| Obszar | Trasy / podwidoki | Główne powierzchnie | Ocena spójności |
|---|---|---|---|
| Dzisiaj | /dzisiaj | dashboard, agregaty dnia, globalny Command Center | Wysoka; bazuje na shared shell i globalnym tworzeniu |
| Zadania | /zadania; Dziś, Jutro, 7 dni, 30 dni, Bez terminu, Wszystkie, Nawyki, Podsumowanie, Ukończone, Kosz, listy i tagi | quick-add, listy, DetailPanel, scheduler, menu priorytetu/listy/tagu, modale taksonomii i kosza | **Najniższa**; najwięcej lokalnych kontraktów |
| Kalendarz | /kalendarz, formalnie własność Zadań | kalendarz i TaskDetail w lokalnym dialogu | Średnia; współdzieli dane/detail, ale nie shell detalu |
| Odżywianie | /odzywianie, /posilki, /analiza | dziennik, biblioteka i edytor posiłków, analiza, waga, cele, autocomplete produktu | Dobra; świadomy lokalny combobox, potrzebne szersze bieżące snapshoty |
| Sport | /sport; dziś, cykl, szablony, ćwiczenia, analiza, historia, sesja aktywna | planery, tabele, szczegóły, sesja i dialogi | Dobra na poziomie tokenów; dużo uzasadnionego lokalnego UI domenowego |
| Praca | /praca; today, tomorrow, week, active, untimed, unassigned, archive, company, project | quick-add, menu Dodaj, firma/projekt/zadanie, detail, pełne modale | Średnio-wysoka; pełne formularze spójne, quick-add osobny |
| Cele | /cele, /cele/:goalId; overview, next, week, statusy, kategorie, list/grid | karty/lista, detail, cel/postęp/etap, import/settings | Średnia; shared dialogs, lecz dużo lokalnych utilities i ikon |
| Podróże | /podroze, /podroze/:tripId oraz /travel/...; overview, itinerary, reservations, budget, documents, tasks, packing | dossier, detail, 7 sekcji, edytory trip/transport/stay/budget/document/task | Dobra wizualnie; błąd ownership tras /travel i natywne time/datetime-local |
| Pozostałe / Sprawy | /sprawy; overview, today, week, all, finances, payments, subscriptions, documents, vehicles, health, JDG | rejestry, detail, health workspace, miesięczny cockpit JDG, wiele edytorów | **Najwyższa adopcja shared UI**; wyjątki time i checkbox |
| Notatki | /notatki; all, pinned, archive, list, tag, sort, cards/list | kolekcja, editor w DetailPanel, listy/tagi, delete/dirty dialogs | Dobra; część potwierdzeń składa zwykłym Modalem |
| Globalne | Settings, Profile, Help, mobile menus/nav, Command Center, Day Replay, Recovery Center, reminder center | okna systemowe i cross-module quick capture | Rdzeń spójny, lecz payload quick capture jest konsumowany różnie |

## 4. Stan tokenów

### 4.1. Co jest dobrze zaprojektowane

tokens.css ma 336 deklaracji i 234 unikalne custom properties. Główne skale są jasne:

- radius: 3 / 6 / 8 / 12 / 16 / pill (src/styles/tokens.css:58-63);
- spacing: 4 / 8 / 12 / 16 / 20 / 24 / 28 (src/styles/tokens.css:65-71);
- control heights: 24 / 28 / 40 / 48 (src/styles/tokens.css:415-418);
- row heights: 36 / 44 / 56 wraz z trybami calm i compact (src/styles/tokens.css:420-449);
- warstwy od base do system/nested popover (src/styles/tokens.css:98-121);
- oficjalne breakpointy i wyjątki feature (src/styles/tokens.css:426-436);
- jeden globalny stroke ikon: 1.7 (src/styles/tokens.css:168).

To jest mocny fundament. Szczególnie dobrze wypadają kolory semantyczne, warstwy i breakpointy: audyty nie znalazły nowych naruszeń.

### 4.2. Dług ukryty pod zielonym gate’em

Zielony audit nie oznacza pełnej jednolitości. Analiza heurystyczna CSS poza tokens.css znalazła:

- 588 surowych deklaracji spacingu i 148 różnych wartości;
- 921 deklaracji geometrii i 177 wartości;
- 76 surowych deklaracji typografii i 35 wartości;
- 31 nietokenizowanych shadows i 21 wartości;
- 97 literalnych radiusów, z których większość to legalne 0, 50% lub inherit, ale scheduler Zadań ma także 14px i 13px.

Nie jest to lista 588 błędów. Offsety, rozmiary wykresów i geometria danych bywają celowo precyzyjne. Jest to jednak obszar, którego obecne gate’y nie odróżniają od faktycznej lokalnej reinwencji komponentu.

Przykład bezpośredni: tokeny mówią, że wartości poza skalą są błędem (src/styles/tokens.css:381-385), podczas gdy scheduler ma border-radius: 14px i 13px (src/styles/tasks.css:1613,1886).

### 4.3. Aliasy kompatybilności

tokens.css utrzymuje 25 aliasów kompatybilności; 24 są nadal używane, łącznie około 2225 razy. W kodzie dominują nazwy wizualne typu graphite-* i precision-blue zamiast ról semantycznych. To nie musi powodować natychmiastowej różnicy pikselowej, lecz sprawia, że migracja języka tokenów nie jest zakończona i zwiększa koszt kolejnych motywów.

TS-owa warstwa transportowa src/app/ui/tokens.ts publikuje 80 kluczy, z których wykorzystuje się około 29. Około 64% tej powierzchni jest martwe lub pełni jedynie historyczną rolę aliasu.

### 4.4. Cieniowanie nazw

Globalne --list-rail-width ma 64px (src/styles/tokens.css:423), ale Tasks i Work redefiniują tę samą nazwę na inne wartości. To działa kaskadowo, lecz nazwa sugeruje jeden globalny token, mimo że w praktyce jest lokalną zmienną modułu. Lokalne nazwy powinny mieć prefiks modułu.

### 4.5. Rozjazd podglądu motywu

Podgląd warm-linen pokazuje primary #76583e (src/styles/settings.css:115), a rzeczywisty motyw ustawia primary #4f63a6 (src/styles/tokens.css:254). Użytkownik wybiera więc motyw na podstawie próbki, która nie odpowiada temu, co zobaczy.

## 5. Adopcja komponentów współdzielonych

Statyczne liczenie feature TSX, bez testów i bez samych implementacji shared UI:

| Prymityw | Shared | Native | Adopcja shared | Interpretacja |
|---|---:|---:|---:|---|
| Button | 410 | 218 | 65,3% | Native obejmuje także klikalne wiersze/karty, więc nie każdy przypadek jest błędem |
| Input | 132 | 40 | 76,7% | Lokalne inputy skupiają się głównie w złożonych composerach |
| Select | 102 | 0 | 100% | Bardzo mocny wynik |
| Textarea | 15+ | 0 | 100% | Brak raw textarea |
| DatePicker | 41 | — | — | Szeroka adopcja we wszystkich domenach dat |
| Modal | 43 | — | — | Szeroka adopcja |
| ConfirmDialog | 18 | — | — | Istnieje, lecz nie wszystkie potwierdzenia go używają |

Porównanie czterech najważniejszych domen:

| Moduł | Button shared/native | Input shared/native | Select | DatePicker | Wniosek |
|---|---:|---:|---:|---:|---|
| Zadania | 39 / 67 | 0 / 16 | 4 | 8 | Największa ekspozycja na lokalne kontrakty |
| Praca | 20 / 16 | 1 / 3 | 19 | 8 | Pełne formularze wspólne, quick-add lokalny |
| Sprawy | 41 / 6 | 14 / 1 | 15 | 7 | Najlepsza adopcja |
| Cele | 31 / 32 | 9 / 5 | 2 | 4 | Shared dialogs, dużo lokalnych triggerów i utilities |

Wniosek: problemem nie jest brak shared UI jako takiego. Problemem jest to, że najbardziej częste i najbardziej charakterystyczne interakcje — quick-add, property picker i scheduling — znajdują się poza jego pełnym kontraktem.

## 6. Porównanie: dodawanie w Zadaniach, Pracy, Sprawach i Celach

| Element | Zadania | Praca | Sprawy | Cele | Ocena |
|---|---|---|---|---|---|
| Wejście w tworzenie | inline quick-add + DetailPanel | inline quick-add lub Dodaj → menu → Modal | CTA lub menu rodzaju rekordu → Modal | CTA → Modal | Cztery archetypy; nie muszą być identyczne, ale powinny dzielić reguły |
| Nazwa | raw input | raw input w quick-add, shared Input w Modal | shared Input | shared Input | Quick-add wymaga wspólnego prymitywu |
| Priorytet | lokalne ikonowe Menu, high/medium/low/brak | lokalne ikonowe Menu, none/low/medium/high; w Modal tekstowy Select | tekstowy Select normal/ważny | tekstowy Select high/medium/low | Taksonomie mogą się różnić domenowo, lecz ton i komponent powinny być mapowane wspólnie |
| Lista/projekt/kategoria | lokalne menu list/tag | TaskInlineMenu dla firma/projekt/status | shared Select | shared Select/wrapper | Brak wspólnego PropertySelect z ikoną i tone |
| Data | lokalny Schedule popup oparty teraz na shared inline DatePicker | shared DatePicker | shared DatePicker | shared DatePicker ×2 | Jeden silnik kalendarza, ale Tasks nadpisuje jego geometrię |
| Godzina | lokalny time/duration picker + 48 slotów | brak w formularzu zadania | shared Input type=time tylko dla wizyty | brak | **Niejednolite** |
| Przypomnienie | lokalny picker | brak | preset tylko dla wizyty | brak | **Niejednolite** |
| Powtarzanie | lokalny picker | brak | domenowe cykle dla części rekordów | brak | Inne możliwości i inne modele |
| Strefa czasu | lokalna warstwa | brak | brak | brak | Wyjątkowa funkcja Tasks, bez wspólnego primitive |
| Anuluj | różne lokalne modale | przeważnie ghost | ghost | quiet | Widoczny drift wariantu |
| Dodaj/Zapisz | Enter/CTA + detail | „Dodaj” lub „Dodaj zadanie” | często ogólne „Dodaj” | „Dodaj cel” | Copy niespójne na poziomie encji |

### Kluczowa przyczyna architektoniczna

Shared SelectOption obsługuje tylko value, label, description i disabled (src/app/ui/components/Select.tsx:17-22). Nie ma leadingIcon, tone ani metadata. Dlatego priorytet, lista, tag, firma i status są ponownie składane w lokalnych Menu w Zadaniach i Pracy, podczas gdy pełne formularze pokazują tekstowy Select.

Drugą przyczyną jest brak publicznego TimePicker, DateTimePicker, SchedulePicker oraz ogólnego AnchoredPopover w barrel UI. DatePicker jest date-only. Każdy moduł rozwiązuje resztę osobno.

## 7. Priorytetowe ustalenia

### P0 — krytyczne

**Brak.** Nie znaleziono blokady wszystkich podstawowych zadań, wzorca manipulacyjnego ani bezpośredniego ryzyka szkody wymagającego zatrzymania wydania.

### P1 — major

#### DS-01. Brak jednego kontraktu planowania

**Gdzie:** TaskSchedulePicker.tsx:181-340,342+; Praca.tsx:1841; AffairsEditorFields.tsx:68-70; GoalDialogs.tsx:447-454; Podroze.tsx:1741-1742,1798-1800.  
**Co:** Zadania mają datę, godzinę, zakres, czas trwania, przypomnienie, powtarzanie i strefę. Praca ma tylko datę. Sprawy i Podróże używają natywnego time/datetime-local. Cele mają dwie daty bez czasu.  
**Wpływ:** użytkownik uczy się innych kontrolek dla tego samego pojęcia „kiedy”; nie można przewidzieć, gdzie dostępna będzie godzina ani jak ją edytować.  
**Heurystyki:** H4, H6, H7.  
**Właściciel naprawy:** /journey + /specify + /include.

#### DS-02. Zadania i Praca mają dwa równoległe quick-addy

**Gdzie:** Zadania.tsx:1406-1525; TaskSecondaryViews.tsx:1032-1051; WorkQuickEntry.tsx:128-188; PracaMenus.tsx:69-109; tasks.css:2680+; work.css:1584+.  
**Co:** podobne wizualnie wiersze nie współdzielą composera. Oba mają 28px controls, ale Tasks używa radius 8px, Work 6px; menu mają inną gęstość i inne anchoring rules.  
**Wpływ:** każda poprawka focusu, pozycji, mobile lub ikon wymaga dwóch implementacji; wzorzec będzie dalej dryfował.  
**Heurystyki:** H4, H7.  
**Właściciel naprawy:** /journey + /specify.

#### DS-03. Globalny Command Center obiecuje więcej niż moduły konsumują

**Gdzie:** CommandCenter.tsx:235-244; Praca.tsx:547-565; Cele.tsx:194-204; Sprawy.tsx:446-489.  
**Co:** Command Center dodaje title/date/time/priority do każdego targetu. Sprawy konsumują komplet. Praca konsumuje datę i priorytet, ale nie godzinę i pozostawia parametr godzina w URL. Cele używają tylko tytułu, po czym bez ostrzeżenia usuwają datę, godzinę i priorytet.  
**Wpływ:** użytkownik widzi w podglądzie rozpoznane dane, ale część z nich znika po przejściu do modułu; to funkcjonalna, nie kosmetyczna niespójność.  
**Heurystyki:** H1, H4, H5.  
**Właściciel naprawy:** /journey + /fortify + /specify.

#### DS-04. Aktywne trasy /travel nie mają właściciela modułu

**Gdzie:** moduleRegistry.ts:41-66; routes.ts:80-82; Podroze.tsx:195-206,318-350; Layout.tsx:669-674,1032-1040.  
**Co:** moduł Podróże posiada /podroze, ale nie deklaruje ownedPaths dla /travel. Router i sam moduł aktywnie używają /travel/...  
**Wpływ:** findModuleForPath nie rozpoznaje Podróży; aktywny kontekst nawigacji, contextual help i priorytety Command Center mogą wpaść w fallback Dzisiaj.  
**Heurystyki:** H1, H4, H10.  
**Właściciel naprawy:** /organize + /specify.

### P2 — minor, ale odczuwalne lub ryzykowne

#### DS-05. Scheduler nadpisuje wnętrze wspólnego DatePicker

Shared inline DatePicker ma dni 36×36 i tokenizowaną geometrię (ui.css:301-319). Tasks nadpisuje header/nav/weekdays/days do 28/26/20/29px (tasks.css:1670-1719) i dodaje radius 14/13px (tasks.css:1613,1886). Silnik daty i ARIA są wspólne — to realna poprawa — lecz wariant wizualny jest drugim mini-systemem.

#### DS-06. Dropdowny mają pięć gęstości bez jawnego modelu

- MenuItem: 28px (ui.css:355-369);
- Work quick menu: 34px (work.css:459-462);
- Select option: 38px (ui.css:227-246);
- Task time option: 39px;
- Task schedule option: 40px (tasks.css:1902-1953).

Różne gęstości mogą być prawidłowymi wariantami, ale dziś nie są nazwanymi presetami. Użytkownik odbiera je jako przypadkowy rytm.

#### DS-07. Ikony nie mają jednego grammar

Shared DatePicker używa CalendarDays 13 (DatePicker.tsx:414), a Zadania Calendar 13 ze stroke 1.5 (Zadania.tsx:1509; TaskViews.tsx:507). Typowe header CTA używa Plus 13, ale Cele używają Plus 16 (Cele.tsx:569). Cele i Zadania mają po 8-9 rozmiarów oraz wiele jawnych strokeWidth. Globalny stroke 1.7 chroni shared containers, ale lokalne kontrolki omijają część tej ochrony.

#### DS-08. Task detail menu nie korzysta z pełnego keyboard/focus contract

PriorityDropdown i ListPicker składają shared Menu, lecz nie przekazują triggerRef, onDismiss ani initialFocus; implementują osobny listener mousedown (TaskViews.tsx:185-267). Ich triggery nie deklarują aria-haspopup, aria-expanded ani aria-controls (TaskViews.tsx:483-494). Wspólny Menu potrafi Escape, return focus, initial focus, strzałki i typeahead (ui/components/Menu.tsx:27-40,76-100,111-195), ale te dwa menu aktywują tylko część kontraktu.

#### DS-09. Potwierdzenia destrukcyjne nie są jednym wzorcem

Sprawy używają ConfirmDialog (Sprawy.tsx:1650-1668). Zadania, Praca i Notatki część usunięć/dirty state składają zwykłym Modalem (Zadania.tsx:1685-1757; Praca.tsx:1846-1848; Notatki.tsx:1603-1737). Skutkiem są różne kolejności akcji, copy i zachowanie.

#### DS-10. Raw checkbox w Sprawach

AffairsEditorFields.tsx:119-122 używa native checkboxa z lokalnym rozmiarem 15px, mimo istnienia shared Checkbox i tokenów 18/16px. Jest to zarejestrowany wyjątek, dlatego gate pokazuje 0 nieautoryzowanych checkboxów; nadal pozostaje widoczną różnicą.

#### DS-11. Dokumentacja nie zgadza się z aplikacją

README.md:5 i docs/product-inventory.md:16 opisują osiem obszarów i Podróże pod Sprawami. Bieżący rejestr ma dziewięć modułów, a PRODUCT.md:23 opisuje Podróże osobno. ROUTE_LAYOUT_AUDIT deklaruje komplet URL-i, lecz miesza path z pojedynczym query-view i nie obejmuje wszystkich pozostałych query-view (routes.ts:24-52).

#### DS-12. Ten sam TaskDetail ma dwa shelle

Zadania renderują TaskDetail w shared DetailPanel (Zadania.tsx:1635-1672). Kalendarz renderuje go w osobnym pozycjonowanym role=dialog (Kalendarz.tsx:1405-1455). Ten sam obiekt ma więc inną geometrię, responsywność i lifecycle zależnie od miejsca wejścia.

### P3 — polish i governance

#### DS-13. Wariant Anuluj i copy CTA dryfują

Goals używa quiet dla Anuluj (GoalDialogs.tsx:323,772,894), podczas gdy Praca, Sprawy, Podróże, Notatki i inne formularze zwykle używają ghost. Sprawy i Praca często kończą ogólnym „Dodaj”, Cele używają „Dodaj cel”. Dla tej samej roli akcja powinna mieć jeden wariant oraz label nazwany encją.

#### DS-14. Gate’y nie mierzą tego, o co pyta ten audyt

design-system.spec.ts sprawdza wysokości tylko elementów z klasami shared: .ui-button, .ui-field__control, .ui-select-trigger, .ui-date-trigger, .context-nav-item i .ui-tab (e2e/design-system.spec.ts:25-42). Celowo pomija lokalne clickable rows/cards, ale razem z nimi poza zasięgiem zostają także lokalne quick controls.

Static audit wykrywa m.in. raw colors, z-index, breakpointy i arbitralny radius w klasie TSX, lecz nie literalne border-radius: 14px w feature CSS (scripts/design-system-audit.mjs:138-169). Stylelint pilnuje unikalności i custom properties, nie tokenizacji każdej geometrii (stylelint.config.mjs:1-16).

Dlatego wszystkie gate’y mogą być zielone przy nadal widocznej niespójności.

## 8. Heuristic evaluation

Skala: 0 brak problemu, 1 kosmetyczny, 2 minor, 3 major, 4 katastrofalny.

| Heurystyka | Wynik | Dowód / interpretacja |
|---|---:|---|
| H1 Widoczność statusu | 2 | /travel może zgubić aktywny moduł; parametry globalnego capture bywają porzucane bez feedbacku |
| H2 Zgodność ze światem użytkownika | 1 | Priorytet oznacza high/medium/low, none lub normal/ważny zależnie od modułu; część różnic jest domenowa |
| H3 Kontrola i swoboda | 1 | Rdzeń Modal przechodzi Escape/return-focus; destrukcyjne dialogi mają jednak różne kontrakty |
| H4 Spójność i standardy | **3** | Cztery przepływy tworzenia, trzy sposoby czasu, kilka gęstości dropdownów i lokalne ikony |
| H5 Zapobieganie błędom | 2 | Silent loss w Command Center; niejednolite confirmy |
| H6 Rozpoznawanie zamiast pamiętania | 2 | Ikonowe property controls nie mają jednego znaczenia/kształtu w różnych modułach |
| H7 Elastyczność i efektywność | 1 | Quick-add jest szybki i dobry, ale jego warianty nie przenoszą się między modułami |
| H8 Estetyka i minimalizm | 1 | Wspólna powierzchnia, rytm i motywy są mocne; lokalne gęstości lekko dryfują |
| H9 Rozpoznawanie i odzyskiwanie po błędach | 1 | Recovery Center i draft protection są mocne; confirmy/copy nie są jednolite |
| H10 Pomoc i dokumentacja | 2 | Dokumenty opisują różną liczbę modułów; /travel może dostać pomoc Dzisiaj |

Najważniejszy wynik to H4=3. Aplikacja jest używalna i zadania można ukończyć, ale spójność standardów jest na tyle naruszona, że wymaga świadomego programu ujednolicenia, a nie pojedynczego poprawienia CSS.

## 9. Cognitive walkthrough

### Zadanie A: dodać zadanie w module Zadania z terminem i godziną

| Krok | Motywacja | Widoczność | Zrozumienie | Feedback | Ocena |
|---|---|---|---|---|---|
| Otworzyć quick-add | Tak | Tak | Tak | Tak | Pass |
| Wpisać tytuł | Tak | Tak | Tak | Tak | Pass |
| Ustawić priorytet/listę/tag | Tak | Tak | Częściowo — ikonowe przyciski wymagają nauczenia | Tak | Hesitation |
| Ustawić datę/godzinę | Tak | Tak | Tak, ale popup ma dużo równorzędnych opcji | Tak | Hesitation |
| Zapisać | Tak | Tak | Tak | Tak | Pass |

**Wynik:** ukończenie prawdopodobne, wysoka efektywność dla stałego użytkownika, większy koszt nauki.

### Zadanie B: dodać zadanie pracy z terminem

| Krok | Ocena | Uzasadnienie |
|---|---|---|
| Wybrać quick-add lub menu Dodaj | Hesitation | Dwa wejścia prowadzą do różnych poziomów formularza |
| Ustawić firmę/projekt/status/priorytet | Pass | TaskInlineMenu jest czytelne i korzysta z shared Menu |
| Ustawić termin | Pass | Shared DatePicker |
| Ustawić godzinę | Failure, jeśli wymagana | Formularz zadania pracy nie udostępnia godziny |
| Zapisać | Pass | Jasne CTA i feedback |

**Wynik:** dobry dla zadania date-only; niespójny względem oczekiwania z Zadań.

### Zadanie C: dodać wizytę w Sprawach

| Krok | Ocena | Uzasadnienie |
|---|---|---|
| Otworzyć Dodaj sprawę | Pass | Bezpośrednie, nazwane CTA |
| Wybrać rodzaj i kategorię | Pass | Shared Select |
| Wybrać datę | Pass | Shared DatePicker |
| Wybrać godzinę | Hesitation | Native time wygląda i działa inaczej niż scheduler Tasks |
| Zapisać | Pass | Wspólny Modal i footer |

**Wynik:** kompletne, lecz zmiana mechaniki na poziomie czasu jest odczuwalna.

### Zadanie D: dodać cel

| Krok | Ocena | Uzasadnienie |
|---|---|---|
| Otworzyć Dodaj cel | Pass | Jasne CTA |
| Uzupełnić parametry | Pass | Shared Input/Select |
| Ustawić start i termin | Pass | Shared DatePicker ×2 |
| Anulować lub zapisać | Hesitation | Anuluj ma wariant quiet zamiast systemowego ghost |

**Wynik:** najbardziej klasyczny formularz; niski koszt nauki.

### Zadanie E: utworzyć element przez globalny Command Center

| Cel | Ocena | Uzasadnienie |
|---|---|---|
| Zadania | Pass | Konsumuje title/date/time/priority |
| Sprawy | Pass | Konsumuje komplet, godzina ustawia wizytę |
| Praca | Failure częściowy | Godzina nie jest użyta i pozostaje w URL |
| Cele | Failure częściowy | Data, godzina i priorytet są cicho odrzucane |

**Wynik:** główne miejsce, w którym historia użytkownika faktycznie się łamie: system rozpoznaje dane, ale cel podróży nie zachowuje obietnicy.

## 10. Co należy chronić

1. **Jedno źródło kolorów, warstw i breakpointów.** To jest dojrzała część systemu.
2. **Shared Select.** Ma prawidłowy combobox/listbox contract, keyboard navigation, Home/End i typeahead (Select.tsx:235-323).
3. **Shared Menu.** Potrafi initial focus, Escape, click-outside, return focus, strzałki i typeahead (Menu.tsx:27-40,76-195).
4. **Shared Modal i DatePicker.** Są szeroko używane; aktualne testy focus/Escape i visual pass przechodzą.
5. **Migracja TaskSchedulePicker do shared inline DatePicker.** To właściwy kierunek: współdzielić silnik i dostępność, a warianty wyrażać jawnie.
6. **Brak native select i textarea.** To bardzo dobry wynik adopcji.
7. **Draft protection, undo/recovery i semantyczne stany.** Są mocniejsze niż w typowym dashboardzie i nie powinny ucierpieć w refaktorze.
8. **Różnice domenowe.** Nie należy na siłę usuwać możliwości scheduler Tasks ani sprowadzać każdego modułu do identycznego formularza. Celem jest wspólny kontrakt i warianty, nie identyczna funkcjonalność.

## 11. Rekomendowany plan naprawczy

### Etap 0 — zamknąć funkcjonalne pęknięcia, 1–2 dni

1. Dodać /travel, /travel/overview i /travel/:... do ownership modułu Podróże albo wyeliminować równoległy canonical path.
2. Wprowadzić typowany kontrakt CommandCenterActionPayload:
   - każda akcja deklaruje obsługiwane pola;
   - preview pokazuje tylko pola, które target zachowa;
   - target konsumuje i usuwa cały przekazany payload;
   - testy kontraktowe dla Zadania/Praca/Sprawy/Cele.
3. Ujednolicić aria-haspopup / expanded / controls i pełny managed Menu contract w PriorityDropdown oraz ListPicker.

### Etap 1 — prymitywy design systemu, 3–5 dni

1. Dodać **TimePicker** oparty na jednym dostępnym kontrakcie:
   - klawiatura, wpis ręczny i lista;
   - format 24h;
   - min/max/step;
   - mobile fallback kontrolowany i przetestowany.
2. Dodać **SchedulePicker** z jednym modelem:
   - date;
   - date-time;
   - range/duration;
   - optional reminder;
   - optional recurrence;
   - optional timezone;
   - all-day.
3. Rozszerzyć SelectOption lub wprowadzić **PropertySelect**:
   - leadingIcon;
   - tone;
   - description/meta;
   - selected mark;
   - density: compact/standard.
4. Wydzielić **AnchoredPopover** z collision detection, portalem, layer, Escape, click-outside i return focus.
5. Nazwać tylko dwa dozwolone presety gęstości opcji, zamiast 28/34/38/39/40 jako wartości lokalnych.

### Etap 2 — migracja analogicznych przepływów, 5–8 dni

1. Zbudować **TaskComposer / QuickEntry** z slotami title, priority, container, tags, schedule i submit.
2. Przenieść do niego Zadania i Pracę bez zmiany ich domenowych możliwości.
3. Przenieść Sprawy i Podróże z native time/datetime-local na shared TimePicker/SchedulePicker.
4. Pozostawić Cele jako wariant date-only, ale na tym samym Schedule contract.
5. Usunąć feature CSS targetujące .ui-date-picker__*; wariant compact powinien należeć do DatePicker.
6. Zastąpić ręczne destrukcyjne Modale przez ConfirmDialog.
7. Zastąpić raw checkbox Spraw przez shared Checkbox.
8. Ujednolicić AddIcon/DateIcon/TimeIcon i wariant Anuluj.

### Etap 3 — governance i regresja, 3–5 dni

1. Rozszerzyć audit o:
   - literalne radii poza skalą w CSS;
   - feature selectors stylujące internals .ui-*;
   - lokalne icon sizes/stroke poza presetami;
   - niejawne gęstości kontrolek;
   - cieniowanie globalnych custom properties przez feature CSS.
2. Dodać exhaustive test: każda nielegacy trasa ma dokładnie jednego właściciela modułu.
3. Dodać macierz E2E add/edit Zadania/Praca/Sprawy/Cele:
   - desktop i mobile;
   - open, keyboard, selected, error, save, cancel;
   - Date, Time, Menu, footer i return focus.
4. Dodać bieżące visual snapshots pełnych formularzy Spraw mobile oraz głównych add/edit Sport, Odżywianie, Notatki i Podróże.
5. Zaktualizować README, product inventory i component inventory z jednego generatora/rejestru.
6. Ratchetować adopcję: native Button/Input można zachować tylko jako udokumentowany semantic row lub złożony widget.

### Etap 4 — sprzątanie tokenów, iteracyjnie

1. Zmapować graphite-* i precision-blue na role semantic i stopniowo usunąć compatibility aliases.
2. Usunąć martwe klucze z ui/tokens.ts albo wygenerować transport bezpośrednio z token registry.
3. Zmienić lokalne --list-rail-width na --tasks-list-rail-width i --work-list-rail-width.
4. Naprawić warm theme preview.
5. Dokumentować uzasadnione różnice domenowe jako warianty lub wyjątki z ownerem i datą przeglądu.

## 12. Definition of Done

Ujednolicenie można uznać za zakończone, gdy:

- każda trasa ekranowa ma dokładnie jednego właściciela modułu;
- payload Command Center zachowuje wszystkie obiecane pola albo nie pokazuje nieobsługiwanych;
- Zadania i Praca korzystają z jednego composera oraz jednego property-menu contract;
- każda kontrolka godziny korzysta z shared TimePicker lub jawnie udokumentowanego fallbacku;
- DatePicker ma oficjalny wariant compact, a feature CSS nie styluje jego internals;
- wszystkie dropdowny należą do nazwanych presetów gęstości;
- Add/Calendar/Time mają ustalone ikony i rozmiary;
- każde menu właściwości obsługuje trigger semantics, initial focus, Escape, arrows, typeahead, click-outside i return focus;
- wszystkie destrukcyjne potwierdzenia używają ConfirmDialog;
- nie ma literalnych radiusów 13/14px w schedulerze;
- visual matrix czterech przepływów przechodzi na 1440×900 i 390×844;
- design-system audit, CSS lint, architecture audit, 340+ testów unit i typecheck pozostają zielone;
- README, PRODUCT, product inventory i module registry opisują tę samą mapę aplikacji.

## 13. Routing ustaleń do dalszej pracy

| Obszar | Ustalenia | Właściwa dyscyplina |
|---|---|---|
| Przepływy tworzenia i scheduling | DS-01, DS-02, DS-03, DS-12 | /journey |
| Nawigacja i ownership | DS-04, DS-11 | /organize |
| Dostępność menu i time picker | DS-08 oraz część DS-01 | /include |
| Stany, confirmy, silent loss | DS-03, DS-09 | /fortify |
| Copy CTA i terminologia | DS-07, DS-13 | /articulate |
| Spec API, tokenów i testów | DS-01–DS-14 | /specify |
| Pomiar skuteczności po wdrożeniu | task completion, error rate, time-on-task | /measure |

## 14. Najkrótsza decyzja produktowo-techniczna

Nie należy przepisywać całej aplikacji ani ujednolicać każdego ekranu piksel w piksel. Należy zbudować trzy brakujące warstwy wspólne:

1. **PropertySelect / AnchoredPopover** dla priorytetu, statusu, listy, tagu, firmy i projektu;
2. **TimePicker / SchedulePicker** dla daty, godziny, zakresu, przypomnienia i cykliczności;
3. **TaskComposer / QuickEntry** dla częstych przepływów Zadania i Praca.

Po tym należy migrować moduły według ryzyka: Zadania → Praca → Sprawy/Podróże → Cele, a następnie zablokować ponowny drift testami kontraktowymi i visual matrix.

To rozwiąże główny problem użytkownika bez niszczenia uzasadnionych różnic domenowych.
