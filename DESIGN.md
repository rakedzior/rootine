---
name: Rootine
description: "Grafitowy warsztat do spokojnego zarządzania codziennymi obszarami życia."
colors:
  precision-blue: "#657FCE"
  precision-blue-text: "#8CA1E0"
  precision-blue-strong: "#657FCE"
  precision-blue-hover: "#7891DA"
  precision-blue-soft: "rgba(101,127,206,0.12)"
  graphite-shell: "#101214"
  graphite-sidebar: "#0B0D0F"
  graphite-input: "#1A1D21"
  graphite-canvas: "#101214"
  graphite-panel: "#1A1D21"
  graphite-card: "#20242A"
  graphite-hover: "#282D35"
  border-subtle: "rgba(222,229,244,0.08)"
  border-strong: "rgba(222,229,244,0.16)"
  chalk-white: "#F2F3F5"
  text-secondary: "#AEB3BB"
  text-muted: "#818791"
  text-disabled: "#818791"
  success-seaglass: "#78B789"
  warning-ochre: "#D2A04D"
  danger-coral: "#DF7C7C"
  accent-violet: "#7D7FA8"
  category-sky: "#7FA6C9"
  category-teal: "#79A8A4"
  category-sand: "#B9A171"
  category-rose: "#BC8EA5"
  category-slate: "#8793A1"
  print-paper: "#FFFFFF"
  print-ink: "#111111"
  print-rule: "#777777"
  print-fill: "#EEEEEE"
typography:
  nano:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 400
    lineHeight: 1.35
    letterSpacing: "normal"
  micro:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.35
    letterSpacing: "normal"
  label:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.16em"
  meta:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  data:
    fontFamily: "DM Mono, monospace"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
  body:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  section:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "normal"
  body-emphasis:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "normal"
  page-title:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "normal"
  title:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  display:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "36px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.03em"
  display-compact:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.03em"
rounded:
  xs: "3px"
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
  3xl: "28px"
components:
  button-primary:
    backgroundColor: "{colors.precision-blue-strong}"
    textColor: "{colors.chalk-white}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "40px"
  card:
    backgroundColor: "{colors.graphite-card}"
    textColor: "{colors.chalk-white}"
    rounded: "{rounded.lg}"
    padding: "16px"
  input:
    backgroundColor: "{colors.graphite-input}"
    textColor: "{colors.chalk-white}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
    height: "40px"
  select:
    backgroundColor: "{colors.graphite-input}"
    textColor: "{colors.chalk-white}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
    height: "40px"
  modal:
    backgroundColor: "{colors.graphite-card}"
    textColor: "{colors.chalk-white}"
    rounded: "{rounded.xl}"
    padding: "20px"
    width: "520px"
  tabs-active:
    backgroundColor: "{colors.precision-blue-soft}"
    textColor: "{colors.precision-blue}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  badge-status:
    backgroundColor: "{colors.precision-blue-soft}"
    textColor: "{colors.precision-blue}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "4px 8px"
  content-header:
    backgroundColor: "{colors.graphite-canvas}"
    textColor: "{colors.chalk-white}"
    typography: "{typography.page-title}"
    padding: "0 0 12px"
  section-header:
    textColor: "{colors.text-muted}"
    typography: "{typography.label}"
    padding: "0 0 8px"
  empty-state:
    textColor: "{colors.text-secondary}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "24px"
---

# Design System: Rootine

## Overview

**Creative North Star: "Grafitowy warsztat"**

Rootine jest spokojnym, precyzyjnym i dyskretnym narzędziem do działania. Interfejs przypomina dobrze uporządkowany warsztat: każda kontrolka ma konkretne zadanie, treść ma pierwszeństwo, a gęstość pozwala szybko skanować wiele informacji bez wizualnego hałasu.

System jest ciemny, tonalny i kompaktowy. Marka ujawnia się przez konsekwentny rytm, oszczędne użycie Precyzyjnego błękitu, drobną typografię oraz dobrze rozróżnione stany, nie przez dekorację. To interfejs w trybie **Operate**: ma ułatwiać wykonanie zadania, a nie konkurować o uwagę.

**Key Characteristics:**

- Grafitowe powierzchnie budują hierarchię przez różnicę tonu.
- Precyzyjny błękit oznacza wybór, aktywność i główną akcję.
- Układ jest zwarty, modularny i przygotowany na dużą ilość danych.
- Obramowania porządkują powierzchnie; cienie są zarezerwowane dla warstw unoszących się nad treścią.
- Komunikacja jest krótka, rzeczowa i po polsku.

## Colors

Paleta łączy Grafit roboczy z Kredową bielą i rzadko używanym Precyzyjnym błękitem; barwy semantyczne są stonowane, aby status był czytelny bez efektu alarmowego.

### Primary

- **Precyzyjny błękit** (`precision-blue`): aktywna nawigacja, zaznaczenie, focus, główna akcja i wybrany filtr.
- **Precyzyjny błękit tekstowy** (`precision-blue-text`): tekst aktywnego stanu na ciemnej powierzchni; jaśniejszy wariant zapewniający kontrast małego tekstu.
- **Precyzyjny błękit mocny** (`precision-blue-strong`): tło głównej akcji pod jasnym tekstem; ciemniejszy wariant zapewniający kontrast przycisku.
- **Mgła błękitnego sygnału** (`precision-blue-soft`): tło aktywnego stanu, zaznaczonego wiersza lub delikatnego akcentu.

### Secondary

- **Morskie szkło** (`success-seaglass`): ukończenie i pozytywny postęp.
- **Warsztatowa ochra** (`warning-ochre`): ryzyko, trwający proces i ostrzeżenie.
- **Przygaszony koral** (`danger-coral`): błąd i działanie destrukcyjne.
- **Znacznik fioletowy** (`accent-violet`): pomocnicza kategoria, nigdy konkurencyjna główna akcja.

### Neutral

- **Grafit powłoki** (`graphite-shell`): globalny sidebar i najgłębsza stała warstwa.
- **Grafit panelu bocznego** (`graphite-sidebar`): lokalne nawigacje i panele kontekstowe.
- **Grafit pola** (`graphite-input`): inputy, selecty i zamknięte kontrolki.
- **Grafit roboczy** (`graphite-canvas`): główne tło aplikacji.
- **Grafit modułu** (`graphite-panel`): wtórne panele i zwarte powierzchnie.
- **Grafit karty** (`graphite-card`): karty oraz powierzchnie dialogów.
- **Grafit reakcji** (`graphite-hover`): hover wierszy i kart.
- **Kredowa biel** (`chalk-white`): tekst główny.
- **Popiel pomocniczy** (`text-secondary`): treść drugorzędna.
- **Popiel wyciszony** (`text-muted`): etykiety, metadata i opisy.
- **Popiel nieaktywny** (`text-disabled`): stany nieaktywne.
- **Linia subtelna** (`border-subtle`): standardowe separatory.
- **Linia mocna** (`border-strong`): kontrolki, aktywne obrysy i pływające warstwy.

### Print

Papier to osobne medium, nie kolejny motyw. Wydruk zawsze zakłada białą kartkę, więc powierzchnie
i tekst muszą się odwrócić — przeniesienie tokenów ekranowych na papier dałoby czarną stronę
z nieczytelną siatką. Te trzy wartości są jedynymi dopuszczonymi w blokach `@media print`
i nie zmieniają się razem z motywem aplikacji.

- **Papier** (`print-paper`): tło strony i komórek wydruku.
- **Tusz** (`print-ink`): tekst i wartości na wydruku.
- **Linia wydruku** (`print-rule`): siatki, obrysy i separatory na papierze.
- **Wypełnienie wydruku** (`print-fill`): wyróżnione bloki na papierze, np. wpisy w siatce kalendarza.

**The Signal, Not Paint Rule.** Precyzyjny błękit jest sygnałem działania, nie dekoracyjną farbą; na jednym ekranie powinien wskazywać tylko najważniejsze aktywne miejsca.

**The Semantic Honesty Rule.** Zieleń, ochra i koral opisują rzeczywisty status. Nie służą do przypadkowego różnicowania kart.

## Typography

**Display Font:** Plus Jakarta Sans (with system-ui fallback)
**Body Font:** Plus Jakarta Sans (with system-ui fallback)
**Label/Mono Font:** DM Mono (with monospace fallback)

**Character:** Plus Jakarta Sans daje spokojną, współczesną czytelność przy dużej gęstości, a DM Mono oddziela czas, wartości, procenty i dane rytmiczne. Hierarchia wynika głównie z wagi, koloru i odstępu; skoki rozmiaru pozostają umiarkowane.

### Hierarchy

- **Headline** (`typography.headline`): wartości liczbowe i wyróżnione stany; nie służy do tytułów zakładek ani podzakładek.
- **Title** (`typography.title`): nagłówki modułów, dialogów i paneli.
- **Body** (`typography.body`): zadania, wartości pól i podstawowa treść operacyjna.
- **Label** (`typography.label`): krótkie etykiety sekcji, zwykle uppercase z poszerzonym trackingiem.
- **Data** (`typography.data`): czas, daty, wyniki, serie, procenty i liczniki.
- **Supporting microcopy:** 9–11px, tylko dla metadata i informacji trzeciego rzędu; nie dla głównej instrukcji lub podstawowej akcji.

### Role nagłówków

Pięć ról, od największej. Skala pozostaje zwarta — to instrument pracy, nie strona marketingowa.
Zasada nadrzędna: **tytuł strony jest największym nagłówkiem na ekranie.** Jeśli sekcja pod nim
wygląda na ważniejszą, hierarchia jest odwrócona i trzeba to naprawić, a nie obejść.

| Rola | Token / styl | Gdzie |
|---|---|---|
| **Tytuł strony** | `--text-page-title` 16px / 600 | `ContentHeader` — jeden na widok |
| **Tytuł sekcji** | `--text-section` 13px / 600 | `SectionHeader` (wariant `title`), nagłówki grup |
| **Tytuł rekordu** | 14px / 600 | tytuł karty (np. cel); w wierszach listy 13px |
| **Etykieta sekcji** | `--text-label` 11px / 600, uppercase, `--tracking-label` | `SectionHeader` (wariant `label`), kickery |
| **Metadana gęsta** | `--text-nano` 10px | informacja trzeciego rzędu; nigdy dla instrukcji ani akcji |
| **Wartość eksponowana** | `--text-display` 36px / 600, przy wąskim oknie `--text-display-compact` 28px | pojedyncza liczba-bohater na pulpicie Dzisiaj |

Nagłówek sekcji renderuje się przez `SectionHeader`. Lokalne `<h2>`/`<h3>` z własnym rozmiarem
to dług — w audycie z 2026-08-04 było ich dwanaście wariantów dla pięciu ról.

**The Compact Legibility Rule.** Mały tekst musi mieć wyraźną rolę pomocniczą, wystarczający kontrast i krótką długość. Rozmiar nie może zastępować hierarchii.

**The Data Voice Rule.** DM Mono jest zarezerwowany dla danych, nie dla nagłówków ani zwykłych opisów.

**The Control Cascade Rule.** Reset `font: inherit` dla `button`, `input`, `textarea` i `select` musi pozostawać w `@layer base`. Reset poza warstwą nadpisuje utility typograficzne kontrolek i powoduje niekontrolowane skoki do rozmiaru odziedziczonego.

## Layout

There is no global page header on application routes, and no component for one: `PageHeader` was deleted in 2026-08. Each tab and subtab starts directly with its workspace; the current view, metadata, filters, and local actions belong to `ContentHeader`.

`PageShell` and `ModuleShell` accept **no** `title`, `subtitle`, `leading`, `meta`, `actions` or `header` prop. They used to accept and silently discard them, which turned every stale call site into invisible content instead of a build error — that is how a back button, an entire route error message and nine write-failure indicators went missing at once. Do not reintroduce those props.

Aplikacja używa jednego `AppLayout` ze stałą globalną nawigacją o szerokości 204px. Jeden rejestr modułów jest źródłem kolejności, etykiet, ikon i adresów dla sidebara, ustawień, nawigacji mobilnej oraz odsyłaczy z Dzisiaj. Globalna nawigacja zawiera osiem obszarów: Dzisiaj, Zadania, Odżywianie, Sport, Pracę, Cele, Sprawy i Notatki. Kalendarz oraz Nawyki należą do Zadań, a Podróże do Spraw. `Praca` obejmuje obowiązki zawodowe i historyczną nazwę „Biuro”. `Finanse` są grupą podwidoków Spraw, a JDG pozostaje podwidokiem Spraw, nie osobnym modułem globalnym. `WorkspaceLayout` ma jedną opcjonalną kolumnę `ModuleSidebar` oraz przewijany `MainContent`; żaden ekran nie kompensuje tych kolumn lokalnym offsetem. Kontekstowy sidebar służy wyłącznie rosnącym kolekcjom i drzewom w Zadaniach, Pracy i Notatkach. Sport, Cele, Sprawy oraz Podróże używają zakładek i filtrów nad treścią.

Sidebar kontekstowy odpowiada za strukturę modułu, nie za chwilowe filtry. Zaczyna się bez powtórzonego nagłówka modułu; pierwszym elementem są grupy widoków. `ContentHeader` nazywa aktualny widok i mieści jego lokalne akcje, filtry oraz sortowanie — jest jedynym nagłówkiem ekranu. Ta sama funkcja nie może być jednocześnie powielona w sidebarze i nagłówku. Panel prawy ma zawsze 408px i oznacza szczegóły aktualnie wybranego rekordu; przy braku wyboru nie zajmuje miejsca roboczego.

Podstawą rytmu jest siatka 4px. Najczęstsze odstępy to 8, 12, 16, 20, 24 i 28px. Każda trasa używa wspólnego `PageShell`, który renderuje opcjonalny `PageToolbar` i wspólną oś treści — nic ponadto. Ten sam komponent jest obowiązkowy dla nowych ekranów.

Układ jest przede wszystkim desktopowy i gęsty. Globalne warianty szerokości to `standard` 1280px, `wide` 1480px oraz `fluid` bez maksymalnej szerokości; cała kompozycja sidebar + treść jest centrowana względem faktycznego `MainContent`. Przy 1380px każdy `DetailPanel` przechodzi w warstwę nakładaną, przy 980px globalny sidebar zwęża się do ikon, a przy 760px zastępuje go dolna nawigacja z czterema priorytetowymi modułami i pozycją „Więcej”. „Więcej” udostępnia wszystkie obszary, ustawienia, profil oraz przywrócenie ukrytych modułów bez poziomego przewijania paska. Sidebary kontekstowe są wtedy zastępowane kompaktowym Selectem w toolbarze. Treść używa 28px poziomego i 20px pionowego paddingu na desktopie oraz 16px na telefonie; Kalendarz pozostaje uzasadnionym wyjątkiem edge-to-edge.

**The Workspace First Rule.** Szerokość należy oddać głównej czynności. Panele pomocnicze mogą znikać lub nakładać się wcześniej niż treść robocza.

**The Four-Pixel Rhythm Rule.** Nowe odległości muszą wynikać z czteropikselowego rytmu, chyba że korekta optyczna wymaga pojedynczego piksela.

## Elevation & Depth

System jest warstwowy i powściągliwy. Na poziomie spoczynkowym hierarchię tworzą tony grafitu i cienkie obramowania. Cienie pojawiają się dopiero, gdy element realnie unosi się nad treścią: menu, modal, panel szczegółów, zaznaczona karta lub komunikat typu toast.

### Shadow Vocabulary

Wartości są w `tokens.css` i zmieniają się razem z motywem; tutaj są tylko role.

- **`--shadow-sm`**: minimalne odcięcie interaktywnej karty od tła.
- **`--shadow-md`**: karta wybrana albo podniesiona.
- **`--shadow-floating`**: menu, select i popover ponad treścią.
- **`--shadow-modal`**: modal oraz panel szczegółów jako warstwa nakładana.
- **`--shadow-control`**: opcjonalne podkreślenie jednej głównej akcji; jedyny cień barwiony akcentem.

**The Lift Has a Job Rule.** Cień oznacza zmianę warstwy lub priorytetu interakcji. Zwykłe karty pozostają tonalne i obramowane.

## Shapes

Formy są miękko geometryczne, nie obłe. Drobne elementy kalendarza mogą używać promienia 3px, kompaktowe przyciski 6px, standardowe inputy i kontrolki 8px, karty i menu 12px, a modale 16px. Pełne zaokrąglenie jest przeznaczone dla statusów, tagów, awatarów, checkboxów kołowych i pasków postępu.

Standardowe obramowanie ma 1px. Checkboxy mogą używać 1.5px dla czytelności przy małym rozmiarze. Dashed border jest dopuszczalny wyłącznie w pustych stanach lub kontrolkach „dodaj”.

**The Radius Ladder Rule.** Promień rośnie wraz z wagą powierzchni: kontrolka → karta → modal. Nie należy losowo mieszać 6, 8, 9, 10 i 12px dla elementów tej samej klasy.

### Skala ikon

Sześć kroków. Wcześniej w kodzie było osiemnaście wartości od 7 do 38px, w tym pięć różniących
się o jeden piksel w tej samej roli — to nie jest hierarchia, tylko szum.

| Krok | Rola |
|---|---|
| **9px** | znacznik wewnątrz checkboxa; jedyny rozmiar poniżej skali i jedyny z cięższą kreską |
| **11px** | metadana gęsta, ikona przy liczniku lub tagu |
| **13px** | domyślna ikona inline: przyciski, pozycje `Menu`, `ContextNavItem` |
| **16px** | globalna nawigacja, dialogi i akcje o większej wadze |
| **18px** | nagłówek sekcji i ikona wiodąca modułu |
| **22px** | stan pusty oraz stan błędu trasy |

**The Icon Step Rule.** Nowa ikona wybiera krok ze skali. Jeśli wygląda o piksel za duża,
problem jest w otoczeniu — w odstępie albo wadze tekstu — a nie w brakującym kroku pośrednim.
Jedynym dopuszczonym wyjątkiem jest pojedyncza ikona-bohater w pełnoekranowym stanie pustym.

## Components

Komponenty są kompaktowe, rzeczowe i cicho responsywne. Stany hover, focus, active, disabled i destructive muszą być widoczne bez gwałtownej zmiany skali lub nasycenia.

### Button

- **Shape:** standardowy promień 8px; kompaktowe akcje narzędziowe mogą używać 6px.
- **Primary:** Precyzyjny błękit, Kredowa biel, wysokość 40px, poziomy padding 16px; jedna dominująca akcja w bieżącym kontekście.
- **Quiet:** transparentne tło, subtelna linia i tekst pomocniczy; hover przechodzi w Grafit reakcji.
- **Danger:** transparentny lub bardzo subtelny koral; pełne koralowe wypełnienie tylko dla ostatecznego potwierdzenia destrukcji.
- **Focus:** globalny obrys 2px w Precyzyjnym błękicie z offsetem 2px.
- **Disabled:** opacity około 0.38 i brak pozornej klikalności.

### Checkbox zadania

- **Geometry:** zawsze kwadrat; standardowo 14 × 14px, w panelu szczegółów 17 × 17px, a w gęstym kalendarzu 11 × 11px. Promień `radius.xs` (3px) i obramowanie 1.5px.
- **Hover:** lekkie przejście w Grafit pola bez zmiany rozmiaru lub położenia.
- **Completed:** Precyzyjny błękit w obramowaniu, znaku i subtelnym tle. Zieleń pozostaje kolorem semantycznego sukcesu i nie oznacza zwykłego ukończenia zadania.
- **Accessibility:** checkbox zadania jest przyciskiem z opisem akcji i wspólnym focus ringiem.

### Card

- **Corner Style:** miękki prostokąt 12px.
- **Background:** Grafit karty albo Grafit modułu zależnie od poziomu zagnieżdżenia.
- **Shadow Strategy:** brak mocnego cienia w spoczynku; zobacz Elevation & Depth.
- **Border:** 1px w Linii subtelnej.
- **Internal Padding:** 12–16px dla kart gęstych, 20–24px dla pustych lub skupionych stanów.
- **Record typography:** standardowe kafelki rekordów, takie jak cel lub dzisiejszy trening, używają `ui-record-title` 13px/600 oraz `ui-record-meta` 10px. Skondensowane kafelki kalendarzowe i gęste wiersze mogą używać `ui-record-title--compact` 11px/500.
- **Record density:** standardowy rekord zaczyna się od 12px pionowego i 16px poziomego paddingu. Większy format wymaga funkcjonalnego uzasadnienia, nie tylko innego modułu.
- **Calendar records:** zadania w komórce kalendarza są gęstymi, tonalnymi rekordami bez obramowania. Można je przeciągać między dniami; drop aktualizuje klucz daty, etykietę daty oraz inteligentny widok Zadania: Dziś, Jutro, Następne 7 dni albo Skrzynka.

### Input

- **Style:** Grafit pola, Kredowa biel, linia subtelna, promień 8px i wysokość około 40px.
- **Placeholder:** Popiel wyciszony.
- **Focus:** linia przechodzi w Precyzyjny błękit, opcjonalnie z pierścieniem `0 0 0 2px rgba(71,114,250,0.08)`.
- **Error:** Przygaszony koral na obramowaniu i krótkim komunikacie.
- **Disabled:** Popiel nieaktywny i brak kontrastowego hovera.

### Select

- **Style:** dziedziczy Input, z chevronem po prawej i menu na warstwie Floating Menu.
- **Density:** pola formularzowe mają 40px, a filtry w `ContentHeader` używają wariantu compact 28px.
- **Menu:** Grafit panelu bocznego lub Grafit karty, promień 8px, mocna linia i kompaktowe wiersze 28px.
- **Selected:** Precyzyjny błękit w tekście lub subtelnym tle; nie oba w pełnym nasyceniu.

### Menu

- **Contract:** wszystkie menu akcji używają wspólnych `Menu` i `MenuItem`; lokalne panele z własnym paddingiem i typografią są niedozwolone.
- **Geometry:** minimalna szerokość 148px, padding powierzchni 4px, promień 8px i wiersze minimum 28px z paddingiem 4px × 8px.
- **Typography:** 10px dla etykiety, ikona 13px; akcje success i danger używają wyłącznie kolorów semantycznych.
- **Elevation:** tylko cień Floating Menu; stan hover zmienia ton powierzchni, nigdy rozmiar elementu.
- **Keyboard:** elementy menu obsługują strzałki góra/dół oraz Home/End; niestandardowe wyzwalacze, takie jak import pliku, muszą być osiągalne przez Tab i aktywowane Enterem lub spacją.

### Modal

- **Shape:** promień 16px, mocna linia i maksymalna wysokość około 88–90vh.
- **Backdrop:** czarny overlay około 60–62%, opcjonalny blur 2px.
- **Header:** oddzielony subtelną linią; tytuł, opcjonalny eyebrow i przycisk zamknięcia.
- **Width:** 460–700px zależnie od zadania; 520px jest domyślnym punktem startowym.
- **Behavior:** Escape, kliknięcie backdropu, `role="dialog"` i `aria-modal="true"`.

### Tabs

- **Style:** zwarta grupa przycisków bez ciężkiej obudowy.
- **Active:** Mgła błękitnego sygnału i Precyzyjny błękit.
- **Inactive:** Popiel pomocniczy na transparentnym tle.
- **Focus:** ten sam globalny focus ring co przyciski.

### Badge

- **Style:** mała etykieta statusu z promieniem pill i paddingiem 4px × 8px.
- **State:** kolor tekstu i lekkie tło wynikają z semantyki; kropka 6–8px może wzmacniać identyfikację.
- **Copy:** jedno lub dwa krótkie słowa, bez zdań.

### ContentHeader

Jedyny nagłówek ekranu. Nazywa bieżący widok i skupia wszystko, co go dotyczy: metadane, status, filtry i akcje lokalne. Komponent `PageHeader` nie istnieje — został usunięty w 2026-08 razem z globalnym paskiem.

- **Slots:** `leading` (nawigacja wsteczna na trasach szczegółu), `title`, `description`, `meta`, `actions`, `controls`, `below` oraz `mobileNavigation` na Select podwidoku.
- **Hierarchy:** `headingLevel` przyjmuje `1 | 2 | 3 | false`; `ContentHeader` trasy używa `<h1>`, a `2` i `3` są przeznaczone dla lokalnych nagłówków zagnieżdżonych. `false` pozostaje wyłącznie dla wizualnych etykiet bez udziału w strukturze dokumentu. `typography.headline` nie jest używana do tytułów stron.
- **Meta:** miejsce na status ekranu — badge zamknięcia dnia, ostrzeżenie o nieudanym zapisie lokalnym, licznik pozycji. Wiersz meta może zawijać.
- **Actions:** jedna akcja główna w bieżącym kontekście, reszta `quiet` lub `ghost`; nadmiar chowa się do `Menu`.
- **Contract:** rama wewnętrzna `ContentHeader` jest identyczna z ramą treści, więc nagłówek i treść stoją na jednej osi.

### ModuleShell

- **Structure:** opcjonalny `ContextSidebar`, elastyczny `ModuleMain` oraz opcjonalny `DetailPanel`.
- **ContextSidebar:** 220px, Grafit panelu bocznego, wyłącznie nawigacja po realnych podwidokach modułu.
- **ContentHeader:** wspólny nagłówek aktualnego widoku z tytułem, opisem, metadanymi, lokalnymi akcjami, filtrami i opcjonalnym drugim wierszem; jego wewnętrzna rama jest identyczna z ramą treści.
- **DetailPanel:** 408px, Grafit panelu bocznego; dockowany na szerokim ekranie i nakładany poniżej 1380px.
- **Mobile:** sidebar kontekstowy znika, toolbar pokazuje Select podwidoku, a główna nawigacja przechodzi na dół ekranu.
- **Calendar detail:** szczegóły wydarzenia są pływającym panelem zakotwiczonym przy wybranej komórce, nie centralnym modalem ani stałym prawym panelem. Kliknięcie poza panelem go zamyka; kliknięcie innego dnia najpierw zamyka bieżący panel, a dopiero kolejne kliknięcie tworzy zadanie. Picker daty otwiera się przy przycisku z ikoną kalendarza.

### ContextNavItem

- **Contract:** wszystkie klikalne pozycje `ContextSidebar` używają jednego komponentu `ContextNavItem`.
- **Typography:** 12px, waga 400; stan aktywny używa wagi 500. Lokalne nadpisania fontu są niedozwolone.
- **Geometry:** minimum 34px wysokości, padding poziomy 12px, odstęp 8px i promień 8px.
- **Icon:** pole 14px z ikoną 13px oraz `stroke-width` 1.7.
- **Active:** `precision-blue-soft` jako tło i `precision-blue-text` dla tekstu; aktywność jest również oznaczona `aria-current="page"`.
- **Meta:** licznik 9px w `DM Mono`; dziedziczy aktywny kolor tylko dla bieżącej pozycji.
- **Grouping:** pierwsza grupa podstawowych widoków używa etykiety „Główne”; nazwa aktualnego widoku pozostaje pozycją nawigacji, nie nagłówkiem grupy.

### SectionHeader

- **Style:** `typography.label`, Popiel wyciszony, uppercase i tracking 0.16em.
- **Spacing:** 8px do treści sekcji; akcja pomocnicza może znajdować się po prawej.

### EmptyState

- **Style:** minimum 208px wysokości, subtelne dashed border, promień 12px i wyśrodkowana treść.
- **Content:** krótki tytuł, jedno zdanie wyjaśnienia i opcjonalna pojedyncza akcja.
- **Tone:** rzeczowy i pomocny; bez ilustracyjnego hałasu.

**The Quiet-by-Default Rule.** Kontrolki zaczynają od neutralnego stanu. Kolor i podniesienie pojawiają się dopiero jako informacja o priorytecie, wyborze albo statusie.

## Implementacja

Źródłem prawdy dla nowych zakładek są:

- `src/styles/tokens.css` — kolory, typografia, spacing, promienie, wymiary, cienie i motion,
- `src/app/ui/tokens.ts` — aliasy tokenów do istniejących stylów inline,
- `src/app/ui/components/` — wspólne komponenty,
- `src/app/ui/index.ts` — jedyny publiczny punkt importu komponentów UI.

Nowa zakładka nie definiuje własnego obiektu palety ani lokalnego odpowiednika komponentu z tej biblioteki. Jeżeli brakuje wariantu, najpierw rozszerza komponent wspólny, a potem używa go w ekranie. Szczegółowe przykłady i kontrakt migracyjny znajdują się w `src/app/ui/README.md`.

### Ciągłość danych lokalnego MVP

- Zadania i Kalendarz korzystają z jednego rekordu zadania. Nadanie terminu tworzy `calendarDate`, usunięcie terminu usuwa rekord z Kalendarza bez usuwania zadania, a przesunięcie w Kalendarzu aktualizuje jego widok w Zadaniach.
- Dane odczytywane z `localStorage` muszą przejść walidację minimalnego kształtu. Uszkodzony lub niezgodny zapis wraca do bezpiecznego stanu demonstracyjnego zamiast blokować moduł.
- Błąd zapisu lokalnego jest komunikowany przez `Badge tone="danger"` w slocie `meta` komponentu `ContentHeader` — w module, w którym użytkownik pracuje, a nie tylko globalnym toastem.
- Główne moduły są ładowane jako osobne fragmenty tras; wspólny shell i tokeny pozostają w paczce bazowej.

`text-muted` jest jaśniejszy od pozostałych szarości, ponieważ tekst pomocniczy 10–11px musi zachować co najmniej kontrast 4.5:1 także na powierzchni karty (`graphite-card`). Wartości są w normatywnym frontmatterze i nie powtarzamy ich tutaj. `text-disabled` pozostaje przeznaczony wyłącznie dla faktycznie nieaktywnych kontrolek.

Precyzyjny błękit ma trzy role kontrastowe: `precision-blue` pozostaje sygnałem marki i fokusu, `precision-blue-text` służy małemu tekstowi na graficie, a `precision-blue-strong` jest powierzchnią przycisku pod jasnym tekstem. Nie należy zamieniać tych ról miejscami.

## Do's and Don'ts

### Do:

- **Do** buduj nowe sekcje wyłącznie z tokenów i wzorców Button, Card, Input, Select, Menu, Modal, Tabs, Badge, ContentHeader, SectionHeader, EmptyState, ModuleShell, ModuleSidebar oraz DetailPanel.
- **Do** używaj różnic tonu grafitu i obramowań jako podstawowego mechanizmu grupowania.
- **Do** rezerwuj Precyzyjny błękit dla aktywnego wyboru, focusu i głównej akcji.
- **Do** używaj DM Mono dla czasu, dat, wartości, liczników i procentów.
- **Do** zachowuj czteropikselowy rytm oraz kompaktową gęstość.
- **Do** projektuj responsywność przez ochronę głównego workspace i redukcję paneli pomocniczych.

### Don't:

- **Don't** wprowadzaj gamingowego neonu, kolorowych poświat ani nasyconych gradientów.
- **Don't** zmieniaj Rootine w korporacyjny dashboard z wielkimi KPI i dekoracyjnymi wykresami.
- **Don't** używaj przesadnie dużej typografii; ekran aplikacyjny ma pozostać narzędziem.
- **Don't** stosuj glassmorphismu, przezroczystych kart ani rozmycia jako głównego materiału powierzchni.
- **Don't** dodawaj mocnego cienia do każdej karty.
- **Don't** twórz nowych lokalnych odcieni, radiusów lub wariantów komponentu, jeśli istniejący token opisuje tę samą rolę.
