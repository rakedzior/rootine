# Rootine — triage audytu UI/UX (2026-08-04)

Dokument roboczy. Zawiera: obowiązujące decyzje architektoniczne, klasyfikację znalezisk
z audytu, grupowanie wg przyczyn źródłowych, priorytety i plan paczek.

**Stan: paczki 01–14 wdrożone i zweryfikowane.** Sekcja 12 na końcu podsumowuje wyniki.

---

## 0. Jak powstał audyt i jak odtworzyć dowody

Audyt przeprowadzono na uruchomionej aplikacji, nie na samym kodzie:

- dev server: `node ./node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4174`
- 38 tras/podzakładek × 6 szerokości okna: **390 / 1024 / 1280 / 1440 / 1920 / 2560**
- ~45 stanów interaktywnych (modale, drawery, dropdowny, menu, panele szczegółów, puste stany, hover, focus)
- pomiar `getComputedStyle` + `getBoundingClientRect` dla: pozycji i szerokości treści,
  pozycji tytułu, wysokości kontrolek, radiusów, fontów, `stroke-width` ikon,
  oraz detekcja `scrollWidth > clientWidth`

Zrzuty ekranu i pliki `metrics.json` powstały w katalogu tymczasowym sesji i **nie są trwałe**.
Odtworzenie: skrypt Playwright (`chromium.launch()`, `page.goto`, `page.screenshot`,
`page.evaluate` z pomiarami) — pakiet `playwright` jest już w `node_modules`.

### Kluczowe liczby pomiarowe (zachowane, bo są podstawą wielu punktów)

Szerokość i pozycja treści (`.ui-page-shell__content`), `x,width`:

| trasa | 1280 | 1440 | 1920 | 2560 |
|---|---|---|---|---|
| /dzisiaj | 232,1012 | 232,1172 | 446,1224 | 766,1224 |
| /zadania (fluid) | 452,792 | 452,952 | 452,1432 | 452,2072 |
| /kalendarz (fluid) | 452,792 | 452,952 | 452,1432 | 452,2072 |
| /notatki, /cele (standard) | 452,792 | 452,952 | 556,1224 | 876,1224 |
| /sport, /praca, /sprawy, /podroze (wide) | 452,792 | 452,952 | 456,1424 | 776,1424 |
| /odzywianie (wide, bez sidebara) | 232,1012 | 232,1172 | 346,1424 | 666,1424 |
| /404 | 260,964 | 260,1124 | 450,1224 | 770,1224 |

Pozycja `x` tytułu w `ContentHeader` (1440 px):
**480** wszędzie, **522** Praca (prefiks „Praca" w slocie `leading`),
**552** Sprawy→JDG, **672** Sprawy→Podróże (select przed tytułem).

Wysokości przycisków (zmierzone): 28, 30, 32, 36, 39, 40, 42, 44.
Tokeny kontrolek: 24 / 28 / 40 / 48. Tokeny wierszy: 36 / 44 / 56.

Ikony: rozmiary 10–18 px (9 wartości), `stroke-width` 1.5 / 1.6 / 1.7 / 1.8 / 2.0 / 2.2.
Token `--icon-stroke-width: 1.7` aplikowany tylko w `.ui-button > svg`
i `.ui-empty-state__icon > svg` (`src/styles/ui.css:47`).

Style nagłówków (tag / rozmiar / waga / letter-spacing / transform):
`DIV 14/600` (ContentHeader, 23 trasy) · `H2 11/600 uppercase ls=1.76px` (34×) ·
`H2 13/600` · `H2 14/600` · `H2 15/600` · `H2 20/600` · `H3 11/600 bez uppercase` ·
`H3 11/600 ls=0.88 uppercase` · `H2 36/600 ls=-1.08` (jednorazowo, Dzisiaj).

Tytuły rekordów: `13/400` (`ui-list-row__title`) · `13/600` (`sport-history-row__title`) ·
`14/500` (`sport-template-row__title`) · `14/600` (`goal-card-title`) ·
`16/400` (`affairs-payment-row__title` — wyciek domyślnej wartości przeglądarki).

Szerokości modali: 420, 460, 520, 620, 640, 660, 680, 700, 760, 920, 1360.
Radius 16 px wszędzie poza „Analiza odżywiania" (12 px, X w `right:24/top:18` zamiast `20/20`).

Panel szczegółów: `width: 408px`, `x=1032`, tło `#0b0d0f` — identyczna rama
w Zadaniach / Pracy / Celach / Sprawach, całkowicie różna zawartość i geometria nagłówka.

Wykryte przycięcia (`scrollWidth > clientWidth`, elementy bez `overflow:auto`):
`travel-sidebar__nav 219<249` · `context-nav-item__label 139<159` ·
`ui-content-header__actions 524<543` (Praca) · `work-toolbar__controls 524<543` ·
`sport-planner-content 952<978` · `sport-insights 896<950` ·
`affairs-record-value 94<106..112` (Dokumenty) ·
`today-module-row__overdue-column 208<277` · `ui-list-row__title 220<226..243` (Zadania).

Inne: 8 plików używa klas Tailwind (`Cele`, `CelSzczegoly`, `Kalendarz`, `Odzywanie`,
`Zadania`, `GoalDialogs`, `GoalWorkspaceViews`, `RecoveryCenter`); reszta BEM.
`<Tabs>` użyty 2× (Podróże, TaskSchedulePicker) obok 7 własnych przełączników.
`.ui-empty-state` + 33 lokalne klasy pustych stanów.
28 duplikatów „uppercase kicker" w 9 plikach CSS.
`--control-height-sm` i `--control-height-md` zadeklarowane dwukrotnie w `tokens.css`.
Konsola: ostrzeżenia Reacta o zduplikowanych kluczach na 8 podzakładkach Spraw.

---

## 1. OBOWIĄZUJĄCE DECYZJE ARCHITEKTONICZNE

Ustalone przez właściciela 2026-08-04. **Nie są problemami do naprawienia.**
Każdy agent kontynuujący pracę musi je respektować.

**AD-1. Wspólny sidebar Zadania ↔ Kalendarz.**
Identyczny wygląd, szerokość i pozycja. Nie może znikać ani zmieniać geometrii przy
przełączaniu widoku. Wejście do Kalendarza może przełączyć aktywny zakres na „Wszystkie",
ale geometria zostaje. *Nie proponować usunięcia wspólnego sidebara.*

**AD-2. Zadania mają pełną, szeroką ramę strony.**
Rama strony pozostaje szeroka. Sama **zawartość listy** może być optycznie zwężona
wewnątrz tej ramy (krótsze linie, łatwiejsze skanowanie). Rozróżniać trzy rzeczy:
szerokość ramy / szerokość nagłówka i toolbaru / szerokość zawartości listy.
*Nie zwężać całej zakładki do wąskiego kontenera.*

**AD-3. Kalendarz wykorzystuje pełną dostępną szerokość.**
Celowo szerszy niż lista zadań. Spójność z Zadaniami wynika ze wspólnej ramy, wspólnego
sidebara, wspólnego położenia nagłówka, wspólnego paddingu i wspólnej osi startu
zawartości — nie z identycznej szerokości siatki. *Nie zwężać kalendarza do szerokości listy.*

**AD-4. Zakładki NIE muszą mieć identycznej szerokości.**
Docelowe warianty: `standard` (zwarta treść) · `wide` (dashboardy, tabele, wielokolumnowe) ·
`task-fluid` (pełna rama + optycznie zwężona lista) · `calendar-fluid` (ta sama rama,
pełna szerokość siatki). Przypisanie konkretnych zakładek do `standard`/`wide` wymaga
oceny wizualnej — nie zmieniać automatycznie.
*Nie wdrażać jednej arbitralnej szerokości (np. 1400 px) dla całej aplikacji.*

**AD-5. Komponenty domenowe mogą mieć różną anatomię.**
Wiersz zadania, karta celu, wpis historii treningu, karta notatki, płatność, posiłek,
ćwiczenie — mogą różnić się układem, wysokością, liczbą metadanych, prezentacją statusu,
gęstością. Muszą natomiast dzielić: tokeny typografii, skalę spacingu, skalę promieni,
wysokości kontrolek, ikony, stany focus/hover/active/disabled, kolory statusów, terminologię.
*Nie ujednolicać anatomii kosztem funkcji.*

**AD-6. Panele szczegółów mogą mieć różną zawartość i model edycji.**
Wspólna ma być **rama**: stała pozycja przycisku zamknięcia, geometria nagłówka, padding,
hierarchia tytułu i opisu, zachowanie scrolla, stopka, położenie akcji destrukcyjnej.
*Nie przepisywać wszystkich paneli na jeden formularz.*

**AD-7. KPI i puste stany mogą mieć różną formę.**
Nie każdy pusty stan musi mieć ikonę + tytuł + opis + przycisk + ramkę. Pilnować:
wspólnych tokenów, hierarchii, kolorów, proporcjonalnego paddingu, naturalnego następnego kroku.
*Nie sprowadzać wszystkiego do jednego szablonu.*

**AD-8. Tailwind nie jest sam w sobie problemem.**
Liczy się efekt: inne tokeny, inny focus ring, przypadkowe wartości, duplikowanie
komponentów. Jeśli utility classes dają wynik zgodny z tokenami — nie wymagają przepisania.

**AD-9. Liczniki wyrażają „pozostałe do zrobienia".** (decyzja właściciela, 2026-08-04,
odpowiedź na Q-OPEN-1). Licznik przy pozycji nawigacji i licznik w nagłówku widoku liczą
to samo: pozycje **pozostałe do wykonania**, nie wszystkie zaplanowane. Etykieta nagłówka
nie może sugerować innej semantyki niż liczba, którą pokazuje.

**AD-10. Wydruk ma własne tokeny, nie literały i nie tokeny ekranowe.** (decyzja właściciela,
2026-08-04, wariant B). Papier jest osobnym medium — bloki `@media print` używają wyłącznie
`--print-paper`, `--print-ink`, `--print-rule`, `--print-fill`, udokumentowanych w DESIGN.md
w sekcji `Colors → Print`. Tokeny są niezależne od motywu aplikacji.

**AD-11. Widok `matters` nazywa się „Do załatwienia".** (decyzja właściciela, 2026-08-04).
„Sprawy" to nazwa całego modułu i nie może jednocześnie nazywać jednej z jego zakładek.
Nazwy pozycji nawigacji Spraw mają jedno źródło: `NAV_LABELS` w `affairsPresentation.ts`.
Sidebar nie definiuje własnych etykiet.

### Decyzje jeszcze niepodjęte (do zapytania właściciela pojedynczo)

- **Q-OPEN-2:** „Analiza odżywiania" jako modal 1360×849 — zostaje modalem
  zachowującym kontekst dnia, czy staje się pełnoprawnym widokiem? (nie pytać przed paczką 05)
- **Q-OPEN-3:** Przypisanie zakładek do `standard` / `wide` (AD-4) — wymaga oceny wizualnej.
- **Q-OPEN-4:** Polityka czasownika akcji tworzenia: „Dodaj X" vs „Nowy X" vs „Utwórz X".
- **Q-OPEN-5:** Barwione pasy nagłówków grup w Pracy vs zwykły tekst w Zadaniach —
  celowe rozróżnienie domenowe czy niespójność?
- **Q-OPEN-6:** Kolorowy lewy pasek kart Notatek — co koduje i czy potrzebuje legendy?

---

## 2. KLASYFIKACJA

Kategorie: `BUG-FUNCTIONAL` · `BUG-LAYOUT` · `BUG-OVERFLOW` · `SYSTEM-INCONSISTENCY` ·
`INTENTIONAL-DIFFERENCE` · `ARCHITECTURAL-DECISION` · `NEEDS-OWNER-DECISION` ·
`LOW-VALUE` · `DUPLICATE-FINDING`

### 2.1 Punkty raportu będące BŁĘDNĄ INTERPRETACJĄ świadomej architektury

Te punkty audytu **odrzucamy** — rekomendacja z raportu naruszałaby AD-1..AD-8.

| ID | Klasyfikacja | Decyzja | Uzasadnienie |
|---|---|---|---|
| A1 (jedna szerokość dla wszystkich) | ARCHITECTURAL-DECISION | zostawić | AD-4: cztery jawne warianty szerokości są celowe; skok Zadania↔Cele wynika z różnych wariantów, nie z błędu. |
| A2 (tiery „martwe" poniżej 1280) | LOW-VALUE | zostawić | To poprawne zachowanie `max-width`; jedyny realny podpunkt to nieaktualny `ROUTE_LAYOUT_AUDIT` (P3). |
| A14 (33 klasy pustych stanów → jeden szablon) | INTENTIONAL-DIFFERENCE | zostawić | AD-7: forma pustego stanu zależy od kontekstu; ujednolicić tylko tokeny, nie szablon. |
| A16 — część „różny model edycji" | INTENTIONAL-DIFFERENCE | zostawić | AD-6: treść i model edycji mogą się różnić. Rama — patrz A16-frame poniżej. |
| B1.5 (Dzisiaj x=766 vs Odżywianie x=666 przy 2560) | ARCHITECTURAL-DECISION | zostawić | AD-4: `standard` vs `wide`, różnica uzasadniona funkcją. |
| B2.8 (wiersz nawyku ≠ wiersz zadania) | INTENTIONAL-DIFFERENCE | zostawić | AD-5: inna anatomia dla innej domeny. |
| B3.4 (ikona drukarki tylko w Kalendarzu) | INTENTIONAL-DIFFERENCE | zostawić | Funkcja specyficzna dla kalendarza. |
| B4.8 (jedna karta w siatce 2-kol.) | LOW-VALUE | zostawić | Naturalne zachowanie siatki. |
| B5.6 (546 px martwego płótna w Celach @2560) | NEEDS-OWNER-DECISION | omówić | AD-4 dopuszcza `standard`; pytanie brzmi, czy Cele są dobrze przypisane → Q-OPEN-3. |
| B6.3 (podział 388/492 w Sport→Dzisiaj) | INTENTIONAL-DIFFERENCE | zostawić | Realny problem to ściśnięty pusty stan (B6.1), nie sama proporcja. |
| B6.10 („✓ Zapisano" zamiast przycisku) | INTENTIONAL-DIFFERENCE | zostawić | Wskaźnik stanu zapisu, nie akcja. |
| B7.5 (nawodnienie 2×2) | INTENTIONAL-DIFFERENCE | zostawić | Układ adekwatny do 4 równorzędnych skrótów. |
| B8.7 (brak composera w Pracy) | INTENTIONAL-DIFFERENCE | zostawić | Inny model domenowy niż Zadania. |
| B9.5 (podział 574/304 w Sprawach) | INTENTIONAL-DIFFERENCE | zostawić | Treść nie jest ściśnięta, brak martwej przestrzeni. |
| B9.11 (nierówne dna kolumn JDG) | INTENTIONAL-DIFFERENCE | zostawić | Różna liczba punktów kontrolnych; realny problem to B9.7 (nagłówek). |
| B9.15 (brak paska postępu w „Wpływy netto") | INTENTIONAL-DIFFERENCE | zostawić | Wpływy nie mają relacji plan/wykonanie w tym sensie. |
| B10.4 (Podróże jedyne z prawdziwą tabelą i `<Tabs>`) | INTENTIONAL-DIFFERENCE | zostawić | Dobry wzorzec — kandydat na rozszerzenie, nie na usunięcie. |
| C4 — „wyrównać wszystkie karty" | INTENTIONAL-DIFFERENCE | zostawić | Wyrównywać tylko zestawy porównywalne stojące obok siebie. |
| C5 — „jedna wysokość wiersza globalnie" | INTENTIONAL-DIFFERENCE | zostawić | AD-5: wysokość wiersza zależy od domeny. Problem to rytm **wewnątrz jednej listy**. |
| A4 / Faza 9 (usunięcie Tailwinda) | ARCHITECTURAL-DECISION | zostawić | AD-8: przepisywać tylko tam, gdzie utility daje wynik niezgodny z tokenami (→ C8). |
| D1 (jedna miara ~1400 px) | ARCHITECTURAL-DECISION | zostawić | Wprost sprzeczne z AD-2/AD-3/AD-4. |
| D4 — część „jeden panel" | INTENTIONAL-DIFFERENCE | zostawić | AD-6: tylko rama. |

### 2.2 Problemy BEZDYSKUSYJNE — do naprawy

#### BUG-FUNCTIONAL (P0)

| ID | Opis skrótowo | Uzasadnienie |
|---|---|---|
| B3.2 | Kalendarz renderuje nazwę listy zamiast nazwy zadania | Wszystkie wpisy czytają się „Zadania" — moduł nieużywalny. |
| B6.25 | Wykres Sport→Analiza nie rysuje słupków mimo danych w KPI | Dane są (11 treningów / 430 min), wykres pusty. |
| B2.7 | Nawyki: sidebar 3 vs nagłówek „4 na dzisiaj" | Sprzeczne liczniki pod tą samą etykietą → Q-OPEN-1. |
| B2.14 | Composer „Dodaj zadanie do »Kosz«" w widoku Kosz | Akcja bez sensu w tym kontekście. |
| B9.22 | Pojazdy: ta sama data w dwóch kolumnach wiersza | Podwójna prezentacja tej samej informacji. |
| B8.8 | Praca: pole „Notatka" przykryte przez sticky footer | Element funkcjonalny niedostępny. |
| B9.27 | React: duplikaty kluczy na 8 podzakładkach Spraw | Gubienie/dublowanie wierszy przy aktualizacji. |
| B3.5 | Kalendarz: kliknięcie dnia bez widocznej odpowiedzi | Wymaga weryfikacji w kodzie — bug albo brakująca afordancja. |
| B7.13 | Legenda „Kalorie w czasie": 3 pozycje w nierozróżnialnym błękicie | Dane nieczytelne. |

#### BUG-OVERFLOW (P1)

B1.1 badge zaległości na Dzisiaj (208<277) · B2.4 kolumny priorytetu/tagów znikają @1024 ·
B2.5 toolbar Zadań przycięty po otwarciu panelu · B2.10 treść Podsumowania ucięta przez panel ·
B5.3 opis w środkowym KPI Celów · B6.6 pasek tygodni Sport→Plan ·
B6.8 nazwy treningów ucinane przy wolnym miejscu · B6.17 nazwa ćwiczenia nachodzi na kolumnę „Triceps" ·
B6.19 ostatni select filtrów Sport→Historia · B6.24 etykiety osi X wykresu ·
B8.2 kontrolki nagłówka Pracy (524<543) · B9.6 badge terminów w JDG ·
B9.19 wartości „Typ" w Dokumentach (94<106) · B10.1 sidebar Podróży (219<249) ·
B10.3 tytuł w karcie hero Podróży · B2.1 tytuły zadań ucinane na 220 px przy pustce w wierszu.

#### BUG-LAYOUT (P1)

B6.11 treść Sport→Szablony/Ćwiczenia na x=508 przy nagłówku na x=480 ·
B5.1 kolumny „%" i statusu falują o 14 px między wierszami ·
B9.3 prawe krawędzie kwot w Sprawach falują ·
B9.7 nagłówek 3. kolumny JDG zawija i przesuwa listę o 20 px ·
B9.8 przyciski akcji JDG w dwóch rzędach · B9.9 opis JDG pod kontrolkami zamiast pod tytułem ·
B4.3 trzy wysokości kontrolek w jednym rzędzie nagłówka Notatek ·
B6.14 pole wyszukiwania 32 px vs 40 px w tym samym module ·
A3/B8.1 pozycja tytułu 480/522/552/672 · B3.6 nagłówek Kalendarza wyższy niż Zadań (narusza AD-1) ·
B2.15 artefakt — niebieska kreska nad pustym stanem Kosza · C8 focus ring 3 px szary zamiast 2 px niebieskiego.

#### Zduplikowane nagłówki (P1)

B6.5 „Plan treningowy" / „Plany treningowe" · B6.12 „Szablony" / „Szablony",
„Ćwiczenia" / „Biblioteka ćwiczeń" · B6.21 „Historia" / „Historia treningów" ·
B10.2 select „Przegląd podróży" obok tytułu „Przegląd podróży".
*Uwaga: usuwać redundancję, nie warstwę informacji — gdzie nagłówek sekcji niesie inną
treść, zmienić etykietę zamiast kasować.*

#### Hierarchia typograficzna (P2)

A5 inwersja (tytuł 14 px, sekcje 15–20 px) · A6 sześć stylów nagłówka sekcji ·
A7 wyciek `16px/400` w `affairs-payment-row__title` · B2.11 · B7.3 · B2.13.

#### Natywne kontrolki (P2)

A13: `<select>` w Ustawieniach (Ruch, Gęstość) · `<input type="date">` w „Nowa sprawa"
i w panelu szczegółów Pracy.

#### Akcje destrukcyjne (P2)

A17: „Usuń" identyczny z „Edytuj"/„Zwiń sekcję" w edytorze szablonu Sport ·
goła ikona kosza bez tooltipa w Sprawy→Pojazdy i w panelu Spraw · B4.6 ikony na kartach Notatek.

#### Błędy językowe (P1, tanie)

B6.4 „3 treningów" · B9.23 „1 bliskich terminów" · B5.x „5 cele nieaktualizowane" ·
B1.4 podwójna spacja „8  obszarów" · B9.18 „Sierpień 2026" vs „sierpień 2026"
(`text-transform: capitalize` w `affairs.css:86` i `:971`) ·
C9 anglicyzmy: „Privacy Mode", „Assistant Stage".

#### SYSTEM-INCONSISTENCY (P2)

A8 wysokości kontrolek poza skalą · A9 ikony (9 rozmiarów, 6 grubości) ·
A10 sześć powierzchni kart + `goal-card` radius 16 vs 12 ·
A16-frame geometria ramy panelu szczegółów (AD-6) ·
A18 radius 12 px i offset X w modalu Analizy · A19 kontrakt stopki modala ·
B9.2 mieszanie dat relatywnych i absolutnych w jednej kolumnie ·
B9.13 dwa przełączniki miesiąca w module Sprawy · B6.15 uppercase vs sentence case w nagłówkach tabel ·
C7 `.ui-badge` h=22 vs h=28; `.task-tag-control` radius 8 vs 999 ·
B6.23/B6.26 nierówne karty w porównywalnych zestawach (Sport→Analiza).

#### P3 / LOW-VALUE

A11 (28 duplikatów kickera) · A20 (6 formatów licznika) · A21 (mono dla słów) ·
A24 (duplikat tokena) · C6 (`ui-menu` pad 4 vs `ui-select-menu` pad 5) ·
B4.7, B6.9, B6.20, B6.22, B6.27, B7.4, B7.12, B8.6, B8.9, B9.16, B9.17, B9.20, B9.25, B10.5,
B11.4, B2.16.

#### NEEDS-OWNER-DECISION

B7.8 Analiza jako modal (Q-OPEN-2) · B5.6 + A1 przypisanie wariantów (Q-OPEN-3) ·
A15 czasownik akcji tworzenia (Q-OPEN-4) · B8.4 barwione pasy grup w Pracy (Q-OPEN-5) ·
B4.1 kolorowy pasek kart Notatek (Q-OPEN-6) · B2.2 „19 otwartych" jako segment filtra ·
B9.14 Select ostylowany jak badge w Budżecie · B9.21 brak akcji w wierszach Dokumentów ·
B9.26 zmienny skład nagłówka między podzakładkami Spraw · B1.2 hero 36 px na Dzisiaj ·
B1.3 różna liczba segmentów paska postępu na Dzisiaj.

#### DUPLICATE-FINDING

D1–D15 to skrót A/B/C — nie traktować jako osobnych zadań.
D1→A1 · D2→A3 · D3→A5 · D4→A16 · D5→B9.6-9.12 · D6→B2.5+B2.10 · D7→B6.5/6.12/6.21+B10.2 ·
D8→B5.1 · D9→A13 · D10→B6.11 · D11→B2.1 · D12→B6.24+B6.25 · D13→A17 · D14→B10.1 · D15→B9.2.

---

## 3. GRUPOWANIE WG PRZYCZYN ŹRÓDŁOWYCH

| # | Przyczyna techniczna | Zamyka |
|---|---|---|
| **RC-1** | Złe dane wchodzące do widoku (nie layout) | B3.2, B6.25, B2.7, B9.22, B9.27, B7.13 |
| **RC-2** | Kontrolki renderowane w kontekście, w którym nie mają sensu | B2.14, B3.5 |
| **RC-3** | Brak container queries — reakcja na viewport zamiast na rodzica | B2.5, B2.10, B8.2, B6.19, A22, B9.12 |
| **RC-4** | Kolumny gridu o stałym `min-width` bez reguły zawijania/ellipsis | B9.6, B9.7, B9.19, B6.17, B1.1, B10.1, B10.3, B5.3, B6.8 |
| **RC-5** | Brak stałej szerokości kolumny w listach → falowanie | B5.1, B9.3 |
| **RC-6** | `overflow: hidden` zamiast reguły responsywnej → treść znika | B2.4 |
| **RC-7** | Lokalny padding/wrapper poza `.ui-page-shell` | B6.11, B11.1 |
| **RC-8** | Slot `leading` w `ContentHeader` bez stałej geometrii | A3, B8.1, B10.2, B3.6 |
| **RC-9** | Nagłówki renderowane lokalnie z pominięciem `SectionHeader` | A5, A6, A11, B6.5, B6.12, B6.21, B2.11, B7.3, B2.13 |
| **RC-10** | Brak egzekwowania skali kontrolek i pól | A8, B4.3, B6.14, C1, C2 |
| **RC-11** | Token ikony aplikowany tylko wewnątrz `.ui-button` | A9 |
| **RC-12** | Natywne kontrolki zamiast komponentów Rootine | A13 |
| **RC-13** | Brak wariantu destrukcyjnego w systemie przycisków | A17, B4.6, B9.24 |
| **RC-14** | Brak wspólnej ramy modala i panelu szczegółów | A16-frame, A18, A19 |
| **RC-15** | Brak warstwy formatterów (daty, liczebniki, liczniki, miesiące) | B6.4, B9.23, B9.18, B1.4, B9.2, A20 |
| **RC-16** | Lokalne nadpisania powierzchni i promieni | A10, C7 |
| **RC-17** | Utility classes omijające tokeny (tylko tam, gdzie zmieniają wynik) | C8 |
| **RC-18** | Wykres bez reguły skracania etykiet osi | B6.24 |
| **RC-19** | Realizacja AD-2 (optycznie zwężona lista w szerokiej ramie) nie istnieje | B2.1 |

---

## 4. PRIORYTETY

**P0** — RC-1, RC-2 (błędne dane, nieklikalne/bezsensowne akcje, zasłonięte pola)
**P1** — RC-3, RC-4, RC-5, RC-6, RC-7, RC-8, RC-18, RC-19, duplikaty nagłówków, język
**P2** — RC-9, RC-10, RC-11, RC-12, RC-13, RC-14, RC-16
**P3** — RC-15 (część kosmetyczna), RC-17, LOW-VALUE

---

## 5. PLAN PACZEK

Zasada: jedna paczka = jeden temat. Nie mieszać layoutu globalnego, refaktoru modali,
języka i napraw funkcjonalnych.

| # | Temat | Priorytet | Zamyka | Ryzyko |
|---|---|---|---|---|
| 01 | Dane i akcje, które kłamią (RC-1, RC-2) | P0 | B3.2, B6.25, B2.7, B2.14, B9.22, B8.8, B9.27, B3.5 | niskie–średnie |
| 02 | Przycięcia w gridach kolumnowych (RC-4) | P1 | B9.6, B9.7, B9.19, B6.17, B1.1, B10.1, B10.3, B5.3, B6.8 | niskie |
| 03 | Container queries — nagłówki i filtry (RC-3, RC-6) | P1 | B2.5, B2.10, B8.2, B6.19, B2.4 | średnie |
| 04 | Geometria `ContentHeader` + duplikaty nagłówków (RC-8, RC-7) | P1 | A3, B8.1, B10.2, B3.6, B6.11, B6.5, B6.12, B6.21 | średnie |
| 05 | Falujące kolumny (RC-5) + AD-2 dla listy zadań (RC-19) | P1 | B5.1, B9.3, B2.1 | średnie |
| 06 | Język i formattery (RC-15) | P1 | B6.4, B9.23, B9.18, B1.4, C9 | niskie |
| 07 | Natywne kontrolki (RC-12) | P2 | A13 | niskie |
| 08 | Akcje destrukcyjne (RC-13) | P2 | A17, B4.6, B9.24 | niskie |
| 09 | Skala kontrolek, pól i ikon (RC-10, RC-11) | P2 | A8, A9, B4.3, B6.14 | średnie |
| 10 | Role typograficzne + `SectionHeader` (RC-9) | P2 | A5, A6, A7, A11, B2.11, B2.13, B7.3 | średnie |
| 11 | Rama modala i panelu szczegółów (RC-14) | P2 | A16-frame, A18, A19 | wysokie |
| 12 | Powierzchnie, promienie, badge (RC-16) | P2 | A10, C7 | niskie |
| 13 | Responsywność @1024 i mobile (RC-3 c.d.) | P2 | A22, B9.12, B2.6, B3.3 | wysokie (dotyka AD-1) |
| 14 | Cleanup (RC-17, LOW-VALUE) | P3 | A24, C6, reszta P3 | niskie |

Paczki wymagające decyzji przed startem: **11** (po Q-OPEN-2), **13** (po weryfikacji AD-1),
oraz każda dotykająca przypisania wariantów szerokości (Q-OPEN-3).

---

## 6. TESTY REGRESJI — do dodania

Rozszerzyć `e2e/layout-consistency.spec.ts` i `e2e/design-system.spec.ts`.
Macierz: **2560 / 1920 / 1440 / 1024 / 390**.

1. **Detektor przycięć** — `scrollWidth > clientWidth` dla elementów bez `overflow: auto|scroll`,
   z listą wyjątków. Pilnuje: RC-4, RC-3, RC-6.
2. **Kontrakt wariantu layoutu** — nie „wszystkie trasy tak samo", tylko:
   trasy przypisane do tego samego wariantu (`standard` / `wide` / `task-fluid` / `calendar-fluid`)
   mają identyczne `x` i `width` treści. Pilnuje AD-4.
3. **Kontrakt wspólnej ramy Zadania↔Kalendarz (AD-1/AD-3)** — sidebar: identyczne
   `x`, `width`; nagłówek: identyczne `x` tytułu i wysokość rzędu; padding zewnętrzny identyczny.
   Siatka kalendarza może być szersza niż lista — to NIE jest błąd.
4. **Pozycja tytułu w obrębie wariantu** — `x` tytułu identyczny dla wszystkich tras wariantu.
5. **Panel szczegółów nie przycina toolbara** — po otwarciu panelu `ContentHeader`
   nie ma przycięć i nie wychodzi poza kolumnę.
6. **Brak duplikatów nagłówków** — tekst `ContentHeader__title` nie powtarza się
   w pierwszym nagłówku sekcji na tej samej stronie.
7. **Dozwolone wysokości kontrolek** — zbiór dopuszczonych wartości dla `button`/`input`/`select`.
8. **Brak natywnych kontrolek** — `select:not(.ui-select-native)` i `input[type=date]`
   nie występują w obszarach objętych design systemem.
9. **Poprawność danych** — chip kalendarza zawiera tytuł zadania, nie nazwę listy;
   wykres Analizy ma ≥1 element słupka, gdy KPI > 0.
10. **Zgodność liczników** — licznik w sidebarze i w nagłówku dla tego samego pojęcia równe.
11. **Composer nieobecny w Koszu.**
12. **Brak poziomego scrolla dokumentu** na każdej z 5 szerokości.
13. **Focus ring** — `outline` w dozwolonym zbiorze (2 px, kolor primary).

---

## 7. KOREKTY KLASYFIKACJI PO WERYFIKACJI W PRZEGLĄDARCE

Dwa znaleziska z raportu nie potwierdziły się w takiej formie, w jakiej je opisałem.
Zapisuję to jawnie, żeby nikt ich nie „naprawiał" ponownie.

**B8.8 — „pole Notatka przykryte przez sticky footer" → BŁĘDNA DIAGNOZA.**
Pomiar: panel 900 px, obszar treści 86–827 px, stopka 827–900 px, `scrollHeight` 922 vs
`clientHeight` 741. Po przewinięciu pole jest w całości widoczne (606–706 px).
Pole **nie jest zasłonięte** — jest pod linią zagięcia i w pełni dostępne.
Rzeczywisty, znacznie łagodniejszy problem: granica scrolla przecina kontrolkę w połowie
i nie ma widocznej afordancji przewijania.
→ przeklasyfikowane z `BUG-FUNCTIONAL / P0` na `BUG-LAYOUT / P2`, przeniesione z paczki 01
do paczki 11 (rama panelu szczegółów).

**B3.5 — „kliknięcie dnia w kalendarzu bez odpowiedzi" → DUPLICATE-FINDING (B3.2).**
Kliknięcie dnia zawsze wywoływało `createDraft()` i tworzyło szkic zadania. Szkic ma pusty
tytuł, a przy zepsutym układzie chipa etykieta źródła zjadała całą szerokość, więc nowy
element był niewidoczny i klik wyglądał na bezskuteczny. Naprawa B3.2 usunęła również ten
objaw (zweryfikowane: liczba chipów 4 → 5, fokus wchodzi w nowy szkic, panel szczegółów
otwiera się z datą wybranego dnia).

**B6.24 — „ucięte etykiety osi X wykresu" → naprawione ubocznie przez B6.25.**
Ta sama przyczyna (nieaktualna reguła CSS wypychająca komórkę słupka z układu grid).
Po naprawie etykiety mieszczą się w całości: „15 cze … 3 sie".

---

## 8. STAN PRAC

- [x] Audyt wykonany (2026-08-04)
- [x] Klasyfikacja i triage (ten dokument)
- [x] Q-OPEN-1 — odpowiedź: liczniki = „pozostałe do zrobienia" (AD-9)
- [x] **Paczka 01 — wdrożona i zweryfikowana**
- [ ] Paczka 02 — przycięcia w gridach kolumnowych
- [ ] Pozostałe paczki

### Paczka 01 — co zostało zmienione

| Znalezisko | Przyczyna | Plik |
|---|---|---|
| B3.2 + B3.5 | `calendar-event__source` miał `flexShrink: 0` i zabierał całą szerokość chipa; etykieta „Zadania" jest w kalendarzu zadań i tak zbędna | `src/app/pages/Kalendarz.tsx` |
| B6.25 + B6.24 | nieaktualna generacja reguł `.sport-analysis-chart > div > div` (specyficzność 0,1,2) wygrywała z `.sport-analysis-bars > div` (0,1,1) i wymuszała `display: flex`, zwijając obszar wykresu do 3 px | `src/styles/sport.css` |
| B2.7 | licznik nawyków wyliczany osobno w sidebarze i w nagłówku; wprowadzono jedno źródło `remainingHabitsToday` | `src/app/pages/Zadania.tsx` |
| B2.14 | composer renderowany bezwarunkowo; dodano `canAddTaskInView` (Kosz, Ukończone) | `src/app/pages/Zadania.tsx` |
| B9.22 | `vehicleItemDueCopy` zwracał surową datę, którą wiersz już drukował w swojej kolumnie | `src/app/affairs/affairsPresentation.ts` |
| B9.27 | `mobileViewOptions` doklejał „overview” przed `NAV_ITEMS`, które już go zawierają | `src/app/pages/Sprawy.tsx` |

Testy: `e2e/data-integrity.spec.ts` (6 testów, desktop-1440 + mobile-390).

### Znany stan zastany (NIE regresje paczki 01)

Zweryfikowane przez uruchomienie tych samych testów na `git stash` (czysty `src/`) —
padają identycznie przed i po zmianach:

- `goals.spec.ts` — „double-clicking a goal opens its full view”
- `interactions.spec.ts` — „Escape closes and returns focus to its trigger”
- `production-validation.spec.ts` — „failed lazy route module…”, „local write failure…”
- `today.spec.ts` — „keeps the preferred module order…”, „dims modules with nothing planned…”

Do osobnego triage'u; nie mieszać z paczkami wizualnymi.

### Paczka 12a — tokeny wydruku (AD-10, wdrożona)

Kolory w `@media print` w `calendar.css` były literałami (`#ffffff`, `#111111`, `#777777`,
`#eeeeee`) i przy każdej edycji w okolicy kalendarza podnosiły finding hooka impeccable.
Wartości były poprawne (dark theme na papierze dałby czarną stronę), brakowało im tylko
miejsca w design systemie.

- `DESIGN.md` → nowa sekcja `Colors → Print` z czterema rolami
- `src/styles/tokens.css` → `--print-paper` / `--print-ink` / `--print-rule` / `--print-fill`
- `src/styles/calendar.css` → blok `@media print` używa tokenów

Zweryfikowane pod `emulateMedia({ media: "print" })`: tło `rgb(255,255,255)`,
tekst `rgb(17,17,17)`, wpis `rgb(238,238,238)` — wynik identyczny jak przed zmianą.

### Paczka 06a — jedna nazwa widoku `matters` (AD-11, wdrożona)

Sidebar Spraw miał etykiety wpisane na sztywno, a tytuł strony brał je z `NAV_ITEMS` —
na jednym ekranie pozycja nawigacji nazywała się „Do załatwienia", a otwarta przez nią
strona „Sprawy" (czyli tak samo jak cały moduł).

- `affairsPresentation.ts` → `matters.label = "Do załatwienia"`, nowy eksport `NAV_LABELS`
- `Sprawy.tsx` → wszystkie 10 pozycji sidebara czyta z `NAV_LABELS`

Zweryfikowane: tytuł strony i pozycja sidebara pokazują „Do załatwienia"; mobilny select
dziedziczy tę samą nazwę.

### Otwarte findings hooka impeccable

- ~~`src/styles/sport.css` L1930/L1949 `border-radius: 2px`~~ — już nie występuje.
- ~~**`.impeccable/design.json` starszy niż `DESIGN.md`**~~ — **odświeżony 2026-08-05.**
  Podejrzenie się potwierdziło i było gorsze, niż zakładano: sidecar niósł **całą starą
  paletę** (`#4772FA` zamiast `#657FCE`, `#2E2E2E` zamiast `#20242A`), 21 kolorów zamiast 31,
  5 ról typografii zamiast 13, sześć wymyślonych breakpointów zamiast czterech oficjalnych
  i komponent `PageHeader`, którego już nie ma.

  Po odświeżeniu detektor od razu pokazał **19 zgłoszeń, które stara migawka maskowała**:
  literały starej palety w danych demo (`taskWorkspace.ts`, `goalsModel.ts`) i w testach.
  Naprawione — listy i tagi dostały kolory `category-*`, a nie semantyczne, bo błękit jest
  sygnałem akcji, a ochra i zieleń znaczą ostrzeżenie i sukces. Do funkcji migrujących
  zapisany stan dopisano `#9B8CE8 → #7D7FA8`, żeby istniejące dane użytkownika nie spadły
  po cichu na kolor domyślny.

  Komponenty w sidecarze odwołują się teraz do `var(--color-*)` zamiast do zapisanych na
  sztywno hexów — dziedziczą przez shadow DOM, więc następna zmiana palety ich nie zdezaktualizuje.

---

## 9. INWENTARZ PRZYCIĘĆ (wejście do paczki 02)

Zmierzone `node scripts/clip-audit.mjs` przy działającym dev serverze na `127.0.0.1:4174`.
Skrypt jest w repo — **po każdej naprawie uruchomić ponownie**, zamiast ufać pamięci.
Format: `klasa | szerokość kontenera < szerokość treści | brakuje N px`.

### A. Przycięcia obecne na WSZYSTKICH szerokościach (prawdziwy RC-4)

Kolumny gridu ze stałym `min-width`/`width` bez reguły zawijania lub ellipsis.
To jest właściwy zakres paczki 02.

| Trasa | Element | @1440 | Uwagi |
|---|---|---|---|
| `/sprawy?widok=jdg` | `STRONG` (nazwy punktów) | `180<355` **+175** | najgorsze w aplikacji; też 265/295/304/240 |
| `/sprawy?widok=jdg` | `jdg-stage__items`, `ui-card` | `289<402` +113 | kolumna węższa niż jej treść |
| `/sport?widok=cycle` | `sport-cycle-workout__preview` | `99<388` **+289** | także 200 i 319 |
| `/sport?widok=templates` | `sport-template-row__content` | `248<388` +140 | także 319/306/349 |
| `/dzisiaj` | `today-module-row__overdue-column` | `208<277` +69 | badge zaległości |
| `/kalendarz` | `calendar-event__title` | `42<128` +86 | wąskie komórki miesiąca |
| `/podroze` | `travel-sidebar__nav` | `219<249` +30 | sidebar ucina nazwy wyjazdów |
| `/podroze` | `context-nav-item__label` | `139<159` +20 | ta sama przyczyna |
| `/cele` | `SPAN` (opis KPI) | `244<280` +36 | środkowa karta KPI |
| `/praca` | `ui-content-header__actions` | `524<543` +19 | kontrolki nagłówka |
| `/praca` | `ui-field__control` | `118<145` +27 | i `118<158` |
| `/sprawy?widok=documents` | `affairs-record-value` | `94<106` +12 | i `94<112` |
| `/sport?widok=exercises` | `sport-record-table__name` | `220<232` +12 | nazwa wchodzi w sąsiednią kolumnę |
| `/zadania` | `ui-list-row__title` | `220<226` +6 | i `220<243`; wiąże się z AD-2 (paczka 05) |
| `/sport?widok=history` | `sport-planner-content` | `952<978` +26 | pasek filtrów; `sport-insights 896<950` |
| `/sport` | `sport-overview-drag-hint` | `1<404` **+403** | element 1 px — prawdopodobnie miał być `ui-sr-only`, ale nie ma tej klasy |

### B. Załamanie układu przy 1024 px (paczka 13, NIE paczka 02)

Przy 1024 px sidebar aplikacji (204) + sidebar modułu (220) zostawiają 536 px, i wtedy
sypie się prawie wszystko. Nie naprawiać punktowo — to jest jeden problem: `--bp-context: 1180px`
jest zdefiniowany, ale nieużywany (sidebar modułu chowa się dopiero przy 760 px).

Najgorsze: `/sport?widok=history` `sport-insights 480<950` **+470** · `/sprawy?widok=jdg`
`jdg-stage__items 150<402` +252 · `/podroze` `travel-board 478<672` +194 ·
`/sport?widok=cycle` `sport-cycle-week-header__identity 62<330` +268 ·
`/zadania` `task-content__inner 480<749` +269 · `/cele` `goal-card 478<592` +114 ·
`/sprawy?widok=documents` `affairs-ledger 478<616` +138 · `/dzisiaj` `today-content 756<818` +62.

### C. Mobile 390 px (paczka 13)

`/praca` `ui-list-row__title 85<180` · `/sprawy?widok=matters` i `documents`
`header-action-label 1<86` (kolejny element 1 px bez `ui-sr-only`) ·
`/sport?widok=cycle` `sport-cycle-workout__preview 27<388` · `/kalendarz`
`calendar-event__title 30<128`.

### Wniosek dla paczki 02

Zakres = tabela **A**, 16 pozycji, jedna przyczyna: element o stałej szerokości sąsiaduje
z elementem, który dostał `flex-shrink: 0` albo kolumnę gridu bez `minmax(0, …)`.
Sekcje B i C zostają dla paczki 13 (responsywność) — punktowe łatanie ich teraz
zostałoby cofnięte przez zmianę breakpointu.

Dwa elementy (`sport-overview-drag-hint`, `header-action-label`) to najpewniej teksty dla
czytników ekranu, którym brakuje klasy `ui-sr-only` — do sprawdzenia jako pierwsze,
bo mogą być trywialne.

### KOREKTA metody (ważna)

Pierwsza wersja detektora raportowała **każde** `scrollWidth > clientWidth`. To błąd:
element z `text-overflow: ellipsis` **z definicji** ma `scrollWidth > clientWidth` — to działające
skracanie, nie usterka. Naprawianie takich miejsc psuje poprawny kod.

Detektor rozróżnia teraz trzy przypadki:

- **CLIP** — treść ucięta bez wielokropka → użytkownik bezgłośnie traci informację
- **CONTAINER** — dziecko wystaje poza krawędź rodzica → układ rozjechany
- **TRUNCATED** — działający `ellipsis` → informacyjnie, **nie naprawiać**

Po tej korekcie z 16 „przycięć" zostało **6 realnych grup**. Pozostałe 10 to poprawnie
działające skracanie tekstu.

---

## 10. PACZKI 02–04 — WDROŻONE

### Paczka 02 — przycięcia (RC-4)

Wynik: **z 14 elementów ciętych bez wielokropka do 0** na 1440 / 1920 / 2560 px.

| Przyczyna | Poprawka |
|---|---|
| `.ui-field__control` bez `min-width: 0` — kontrolka nie zwężała się i wychodziła z pola o stałej szerokości | `ui.css` |
| `.context-nav-item` bez `min-width: 0` — pozycja nawigacji rozpychała sidebar Podróży | `ui.css` |
| `.ui-date-trigger > span` bez skracania — „1 dzień po terminie" wypychało ikonę kalendarza poza kontrolkę | `ui.css` |
| `.jdg-check-row` miał 180 px podłogi na tytule → wiersz 370 px w kolumnie 289 px | `affairs.css` |
| `.affairs-payment-row` — kolumna metadanych 94 px cięła „Umowa / gwarancja" | `affairs.css` |
| `.sport-record-table__row` — podłogi kolumn sumowały się do 866 px w karcie 838 px | `sport.css` |
| `.sport-history-head/.row` — podłogi 948 px w karcie 894 px | `sport.css` |
| `.sport-insights` bez `min-width: 0` — pasek filtrów rozpychał kolumnę strony | `sport.css` |
| `.today-module-row__overdue` z `flex: 0 0 auto` — badge zaległości wchodził na wykres obok | `today.css` |
| `.sport-overview-drag-hint` — własna kopia klasy „visually hidden"; zastąpiona `ui-sr-only` | `sport.css`, `SportInsights.tsx` |

### Paczka 03 — container queries (RC-3)

`.ui-content-header` reagował na szerokość **okna**, a nie kolumny, w której stoi. Otwarcie
panelu 408 px zwężało kolumnę bez zmiany viewportu, więc pasek narzędzi zostawał w układzie
szerokim i był ucinany krawędzią panelu.

`.ui-main-content` dostał `container: workspace / inline-size`, a reguła zawijania nagłówka
działa teraz na `@container workspace (max-width: 860px)`. Zachowany fallback `@supports not`
dla silników bez container queries.

### Paczka 04 — geometria nagłówka i zduplikowane nagłówki (RC-8, RC-7, RC-9 częściowo)

**Pozycja tytułu — było 480 / 522 / 552 / 672, jest 480 wszędzie** (i 260 na dwóch trasach
bez sidebara modułu, co jest poprawne).

- `Praca` — usunięty breadcrumb ze slotu `leading` (moduł jest już zaznaczony w nawigacji,
  firma i projekt są w tytule i opisie)
- `Sprawy → JDG` — przełącznik miesiąca przeniesiony z `leading` do `meta`; opis wrócił
  bezpośrednio pod tytuł
- `Podróże` — selektor podróży przeniesiony z `leading` do `meta`; nie stoi już obok tytułu,
  który powtarzał jego wartość

**AD-1 spełnione:** nagłówek Zadań i Kalendarza ma teraz identyczną geometrię
(rzędy 39/39, identity 39/39, actions 34/34). Wcześniej Kalendarz był o 9 px wyższy, bo licznik
siedział jako badge obok 28-pikselowego przycisku. Licznik przeniesiony do opisu — dokładnie
tak jak w widoku listy; skrót „Bez terminu" trafił do akcji.

**Zduplikowane nagłówki usunięte:** „Szablony"/„Szablony", „Ćwiczenia"/„Biblioteka ćwiczeń",
„Historia"/„Historia treningów". W Planie treningowym sekcja opisuje inną warstwę (lista
wszystkich planów), więc **została** — zmieniono tylko nazwę na „Twoje plany", żeby nie
powtarzała tytułu strony.

**Wcięcie:** `.sport-record-view` dokładał drugi `--space-3xl` poziomego paddingu wewnątrz
`PageShell`, przez co Szablony i Ćwiczenia były wsunięte 28 px głębiej niż własny nagłówek.

### Testy dodane

- `e2e/clipping.spec.ts` — 22 testy: brak przycinania na 18 trasach, brak przycinania po
  otwarciu panelu szczegółów (Zadania / Cele / Praca), brak poziomego scrolla dokumentu
- `scripts/clip-audit.mjs` — pełny przegląd na 5 szerokościach do ręcznych sweepów

### Stan testów po paczkach 02–04

`typecheck`, `lint`, `css:lint`, `architecture:audit` czyste · 277 testów jednostkowych ·
e2e desktop **70 passed, 4 failed**. Cztery błędy to stan zastany (goals double-click,
interactions Escape-focus, production-validation ×2). **Dwa wcześniejsze błędy `today.spec.ts`
zniknęły** — naprawiła je poprawka kolumny zaległości.

---

## 11. PACZKI 05–07 — WDROŻONE

### Paczka 05 — falujące kolumny (RC-5) + realizacja AD-2 (RC-19)

**Cele.** `.goal-card-actions` był flexem zakotwiczonym na prawej krawędzi, więc każda zmiana
szerokości etykiety statusu albo daty przesuwała wszystko po lewej — procent i chip statusu
skakały o 14 px między sąsiednimi wierszami. Teraz to grid o stałych kolumnach.

Pomiar po zmianie (identyczny `x` w każdym wierszu):

| | `%` | status | data |
|---|---|---|---|
| @1440 | 549 | 1103 | 1211 |
| @2560 | 973 | 1799 | 1907 |

**AD-2 zrealizowane.** Nowy token `--task-list-measure: 1120px`. Rama strony i nagłówek
zostają pełnej szerokości, sama lista jest capowana i wyśrodkowana:

| | rama / nagłówek | lista |
|---|---|---|
| @2560 | 2072 px | **1120 px** (x=928) |
| @1440 | 952 px | 896 px (bez zmiany) |

Wcześniej wiersz rozciągał się na 2072 px i między tytułem zadania a kolumną listy powstawała
~700-pikselowa dziura.

### Paczka 06 — język (RC-15)

- `Sprawy` — „1 bliskich terminów" → `pluralize()`; to samo dla liczby pojazdów
- `Cele` — brakowała forma 2–4, więc 5 celów czytało się „cele nieaktualizowane" →
  „celów nieaktualizowanych"
- `Sport` — „3 treningów" → istniejący w tym pliku `workoutCountLabel()`
- **Kapitalizacja miesięcy ujednolicona na małą literę** (poprawna polska ortografia, zgodna
  z tym, co już pokazywał Kalendarz). Usunięte trzy `text-transform: capitalize`
  z `affairs.css` (Budżet, przełącznik JDG) i `ui.css` (nagłówek date pickera). Wcześniej
  ten sam miesiąc był „Sierpień 2026" w Budżecie i „sierpień 2026" w JDG.

### Paczka 07 — natywne kontrolki (RC-12)

- **Ustawienia → Ruch, Gęstość**: natywne `<select>` (systemowy chevron, font 16 px)
  zastąpione komponentem `Select`. Przy okazji spolszczone wartości gęstości
  („Calm/Standard/Compact" → „Spokojna/Standardowa/Zwarta").
- **`<input type="date">` → `DatePicker`**, 14 miejsc: `AffairsEditorFields` (7),
  `Podroze` (7 — wliczając modale nowej podróży, noclegów i transportu), `GoalDialogs` (2),
  `Praca` (4), `Odzywanie` (1).

Pozostały jeszcze natywne `<input type="date">` w `NutritionAnalysis` (zakres własny w modalu
analizy) i `TaskSecondaryViews` (harmonogram cykliczny, 4 sztuki) — do dokończenia.

### Stan po paczkach 02–07

`typecheck`, `lint`, `css:lint`, `architecture:audit` czyste · 277 testów jednostkowych ·
e2e **106 passed / 5 failed** na desktop+mobile. Wszystkie 5 to stan zastany
(goals double-click ×2, interactions Escape-focus, production-validation ×2).

### Paczka 08 — akcje destrukcyjne (RC-13), CZĘŚCIOWO

Nowy wariant `.ui-button--ghost-danger`: zachowuje cichy kształt ghost, ale niesie kolor
destrukcyjny. Zastosowany tam, gdzie „Usuń" był nieodróżnialny od neutralnych akcji:

- `SportTemplates` — „Usuń" w rzędzie z „Edytuj" / „Zwiń sekcję" → `variant="danger"`;
  ikonowe usuwanie elementu i serii → `ghost-danger`
- `Sprawy` — 9 przycisków ikonowych „Usuń …" (płatności, subskrypcje, dokumenty, pojazdy)

**Do dokończenia w tej paczce:** przegląd pozostałych modułów (Notatki, Praca, Podróże),
ujednolicenie potwierdzeń i tooltipów przy ikonach.

---

## 12. STAN NA KONIEC SESJI

### Wdrożone: paczki 01, 02, 03, 04, 05, 06, 07, 06a, 12a oraz 08 (częściowo)

`typecheck`, `lint`, `css:lint`, `architecture:audit` czyste · 277 testów jednostkowych ·
e2e **107 passed / 5 failed / 4 skipped** (desktop-1440 + mobile-390).

Wszystkie 5 błędów to **stan zastany**, potwierdzony uruchomieniem na `git stash`:
`goals.spec.ts` double-click (×2 projekty), `interactions.spec.ts` Escape-focus,
`production-validation.spec.ts` ×2. Do osobnego triage'u — nie są to regresje.

### Wszystkie paczki wdrożone (01–14)

| Paczka | Temat | Wynik |
|---|---|---|
| 01 | Błędy funkcjonalne | 6 napraw + 6 testów regresji |
| 02 | Przycięcia zawartości | 14 → **0** elementów ciętych bez wielokropka |
| 03 | Container queries | nagłówek reaguje na kolumnę, nie na okno |
| 04 | Geometria nagłówka, duplikaty | tytuł na `x=480` wszędzie; AD-1 spełnione co do piksela |
| 05 | Falujące kolumny + AD-2 | kolumny Celów na jednej osi; lista zadań 1120 px w ramie 2072 px |
| 06 | Język i formattery | odmiana liczebników, kapitalizacja miesięcy |
| 07 | Natywne kontrolki | 0 natywnych `<select>` i `<input type="date">` |
| 08 | Akcje destrukcyjne | wariant `ghost-danger`, 12 miejsc |
| 09 | Skala kontrolek i ikon | grubość kreski **9 → 2 wartości**; wysokości na 24/28/40 |
| 10 | Role typograficzne | **12 stylów nagłówka → 5 ról**; inwersja usunięta |
| 11 | Rama modala i panelu | **16 szerokości → 4 kroki**; rama identyczna w 10 modalach i 3 panelach |
| 12 | Powierzchnie i promienie | 8 alf tła → 1 token; radius 16 px → 12 px |
| 13 | Responsywność | 1024 i 390: **0 przycięć** (było 27 i 12) |
| 14 | Cleanup | martwe generacje CSS, duplikaty tokenów, jedna klasa `sr-only` |

### Wyniki pomiarowe (przed → po)

| Metryka | Przed | Po |
|---|---|---|
| Elementy cięte bez wielokropka @1440 | 14 | **0** |
| To samo @1024 / @390 | 27 / 12 | **0 / 0** |
| Pozycja `x` tytułu strony | 480 / 522 / 552 / 672 | **480** (jednolicie) |
| Wysokość rzędu nagłówka Zadania vs Kalendarz | 39 vs 48 | **39 vs 39** |
| Style nagłówków | 12 | **5 ról** |
| Grubości kreski ikon | 9 (1,5–2,5) | **2** (1,7 + wyjątek 2,5) |
| Szerokości modali | 16 | **4 kroki** + 1 wyjątek pełnoekranowy |
| Półprzezroczyste tła kart | 8 alf | **1 token** (+ soft) |
| Promienie kart | 12 px i 16 px | **12 px** |
| Rozjazd kolumn w Celach | ±14 px | **0** |

### Nowe tokeny i decyzje zapisane w DESIGN.md

`--text-page-title` · `--text-section` · `--text-display` / `--text-display-compact` ·
`--task-list-measure` ·
`--color-surface-veil` / `--color-surface-veil-soft` · `--print-paper/ink/rule/fill` ·
skala `ModalSize` (`sm` 500 / `md` 680 / `lg` 780 / `xl` 960).

### Stan testów

`typecheck`, `lint`, `css:lint`, `architecture:audit` czyste · 277 testów jednostkowych ·
e2e **107 passed / 5 failed / 4 skipped**.

Pięć błędów to **stan zastany**, potwierdzony na `git stash` przed rozpoczęciem prac:
`goals.spec.ts` double-click (2 projekty), `interactions.spec.ts` Escape-focus,
`production-validation.spec.ts` ×2. Nie są to regresje — wymagają osobnego triage'u.

### Decyzje podjęte w zastępstwie właściciela (delegacja 2026-08-05)

Właściciel przekazał rozstrzygnięcie otwartych punktów. Każda decyzja jest odwracalna.

| Punkt | Decyzja | Uzasadnienie |
|---|---|---|
| **Q-OPEN-2** Analiza odżywiania | **Zostaje modalem** | Otwiera się z konkretnego dnia i służy porównaniu z nim; osobna trasa zabrałaby ten kontekst. Ma już wspólną ramę. |
| **Q-OPEN-3** Warianty szerokości | **Bez zmian** | Obecne przypisanie jest sensowne: pulpity i tabele `wide`, kolekcje `standard`, Zadania i Kalendarz `fluid`. Po realizacji AD-2 Zadania faktycznie działają jak `task-fluid`, a Kalendarz jak `calendar-fluid`. |
| **Q-OPEN-4** Czasownik tworzenia | **„Dodaj X" wszędzie** | Wygrywał 36:11. Ujednolicono 11 etykiet + 3 zdania opisowe. Stopki edytorów zachowują „Zapisz …" — zapis to inna akcja niż utworzenie. |
| **Q-OPEN-5** Barwione pasy grup w Pracy | **Zostają** | Kodują status (po terminie / dziś / ukończone) kolorami semantycznymi, a nie dekorują. AD-5 dopuszcza inną anatomię przy wspólnych tokenach. |
| **Q-OPEN-6** Kolorowy pasek kart Notatek | **Zostaje** | Koduje przynależność do listy — ta sama informacja co kolor listy w nawigacji. |
| **Sprawy — 4 drobiazgi** | **Bez zmian** | „19 otwartych" to filtr „wszystkie" z licznikiem; Select-jako-badge w Budżecie koduje typ pozycji kolorem semantycznym; brak akcji w wierszach Dokumentów to brak funkcji, nie niespójność; zmienny skład nagłówka wynika z treści podzakładki. |
| **Siatka ambientu w Pracy** | **Uznana za celową** | Motyw modułu, nie dekoracja. Wyjątku **nie dało się zapisać z tej sesji** — `/impeccable hooks` to komenda pluginu, nie CLI npm. Do uruchomienia raz: `/impeccable hooks ignore-value codex-grid-background "*" --file "src/styles/ui.css"` |

### Domknięcie paczek A12, 10 i 06 (2026-08-05)

**Zduplikowane przełączniki (A12).** Dwa realne duplikaty scalone:

- `jdg-month-switcher` + `affairs-month-switcher` → jeden `affairs-month-switcher`.
  Przy okazji stepper w JDG odzyskał widoczną nazwę miesiąca między strzałkami (po paczce 04
  zostały tam dwie strzałki bez etykiety), a opis strony przestał ją powtarzać.
- `task-view-switch` + `ui-view-switch` → jeden `ui-view-switch`.
  Zadania i Kalendarz dostały ramkę design systemu, którą miały już Cele i Notatki.

Pozostałych pięć „przełączników" **nie jest duplikatami** — karuzela tygodni w Sporcie,
przełącznik obszarów w Sprawach i dwuopcyjny toggle w Odżywianiu to różne kontrolki
o różnym zachowaniu. Wciskanie ich w jeden komponent pogorszyłoby funkcję.

**Rozmiary fontów (paczka 10).** Zero literałów `font-size` w CSS. Dwie wartości były realnie
poza skalą (17px w `experience.css`, 18px w `goals.css`) — zsnapowane do kroków. Pozostałe 41
to wartości ze skali zapisane liczbą; zamienione na tokeny.

Dodany krok `--text-nano: 10px` dla metadanych trzeciego rzędu. **Uwaga:** pierwsze podejście
zmapowało 9px i 10px na `--text-micro` (11px), co powiększyłoby 12 miejsc. Wykryte pomiarem
i cofnięte — stąd osobny token zamiast podciągania w górę.

**Regresja złapana i naprawiona.** Przywrócenie etykiety miesiąca w JDG rozepchnęło pasek
nagłówka (`ui-content-header__meta` 567 < 611 przy 1440, 318 < 418 przy 390). Naprawione:
etykieta zwęża się z wielokropkiem, a pasek meta może zawijać. Detektor znów pokazuje zero.

### Design system zsynchronizowany z kodem (2026-08-05)

**Przyczyna źródłowa fałszywych alarmów hooka.** Detektor czyta paletę i rampę typografii
z **frontmatteru DESIGN.md**, a ten opisywał starszy motyw:

| | frontmatter (przed) | rzeczywistość w `tokens.css` |
|---|---|---|
| `precision-blue` | `#4772FA` | `#657FCE` |
| `graphite-shell` | `#1C1C1C` | `#101214` |
| `graphite-card` | `#2E2E2E` | `#20242A` |
| `typography.title` | 16px | 20px |
| `typography.headline` | 22px | 24px |
| `typography.label` | 10px | 11px |
| `typography.body` | 12px | 13px |

Dlatego hook zgłaszał jako „dryf" wartości, które **są** w design systemie. Frontmatter
przepisany ręcznie na wartości z `tokens.css` (nie przez `/impeccable document`, bo ta komenda
regeneruje cały plik i skasowałaby opisy ról, sekcję Print i tokeny veil). Klucze kolorów
zachowane, żeby referencje `{colors.…}` w bloku `components` dalej się rozwiązywały.
Dodane brakujące kroki: `nano`, `section`, `page-title`, `display`, `display-compact`
oraz cztery kolory wydruku.

**Wynik: `npx impeccable detect src/` kończy się kodem 0.** Z dziesiątek zgłoszeń do zera.

Po drodze naprawione trzy realne rzeczy, które ukrywały się w szumie:

- `goals.css` — `transition: width` na pasku postępu celu → `transform: scaleX()`
  (ten sam wzorzec co wcześniej w `work.css`)
- `assistant.css` — `clamp(1.25rem, 2.4vw, 2rem)`; górny koniec 32px był poza rampą
- `GoalWorkspaceViews` i `CelSzczegoly` — `text-[22px]`, pozostałość po starej rampie
  (headline ma 24px)

### Wyjątki zapisane w `.impeccable/config.json`

Wszystkie przez `hook-admin.mjs`, każdy z uzasadnieniem, wszystkie odwracalne:

| Reguła | Zakres | Dlaczego |
|---|---|---|
| `codex-grid-background` | `src/styles/ui.css` | Motyw ambientowy modułu Praca — siatka blueprint z `perspective`/`rotateY`, jeden z dziesięciu motywów semantycznych. Nie dekoracja. |
| `layout-transition` | `src/styles/experience.css` | **Fałszywy alarm:** wszystkie trafienia to `transition: stroke-width` na SVG w warstwie Living Day. Detektor dopasowuje „width" jako podciąg. W tym pliku nie ma ani jednej animacji szerokości layoutu. |
| `overused-font` | `Plus Jakarta Sans` | Krój produktu udokumentowany w DESIGN.md jako Display i Body font. Zmiana to decyzja brandingowa, nie porządkowanie. |

### Świadomie niezrobione

- **Analiza odżywiania pozostaje modalem** (Q-OPEN-2). Dostała wspólną ramę (radius, pozycja X,
  padding nagłówka), ale nadal zachowuje się jak pełna strona w oknie 1360 px. Przeniesienie
  jej do osobnej trasy to zmiana nawigacji, a nie porządkowanie ramy — wymaga decyzji.
- **`.ui-ambient-work::before`** — hook zgłasza dekoracyjną siatkę; to motyw ambientowy modułu
  (patrz tabela rozstrzygnięć wyżej). Czeka na potwierdzenie przed zapisaniem wyjątku.
- ~~**Rozmiary ikon**~~ — **zrobione 2026-08-05.** Pomiar wykazał nie 12, a **18 wartości
  od 7 do 38 px** (668 wystąpień). Zbite do sześciu kroków **9 / 11 / 13 / 16 / 18 / 22**
  plus jedna ikona-bohater 38 px. Skala zachowuje 13 px, które DESIGN.md dokumentuje dla
  `ContextNavItem` i `Menu`, oraz 9 px dla znaczników w checkboxach (mają własną, cięższą
  kreskę). Zapisana w DESIGN.md jako **The Icon Step Rule**.
- ~~**Formaty liczników**~~ — **zrobione 2026-08-05.** Prawdziwym problemem nie było
  brzmienie, tylko **cztery ręcznie pisane implementacje polskiej liczby mnogiej** obok
  kanonicznego `pluralize` z `Intl.PluralRules`. Jedna z nich (`completedTaskLabel`) była
  błędna: dla 21 dawała „21 ukończone" zamiast „21 ukończonych". Wszystkie przepięte na
  `pluralForm` / `pluralize` z `formatters.ts`.
- ~~**5 padających testów e2e**~~ — **zrobione 2026-08-05**, patrz
  `AUDIT-2026-08-05-FAILING-E2E.md`. Trzy z pięciu były jedną regresją: `PageShell`
  przyjmował i po cichu wyrzucał propsy nagłówka.
- **Wszystkie Q-OPEN rozstrzygnięte** — patrz tabela decyzji wyżej.
  grup w Pracy, kolorowy pasek kart Notatek. Wszystkie wymagają decyzji produktowej.
