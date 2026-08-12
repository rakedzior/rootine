---
name: Rootine
description: "Grafitowy warsztat do spokojnego zarządzania codziennymi obszarami życia."
colors:
  precision-blue: "#657FCE"
  precision-blue-text: "#8CA1E0"
  precision-blue-strong: "#657FCE"
  precision-blue-hover: "#7891DA"
  precision-blue-soft: "rgba(101,127,206,0.12)"
  on-primary: "#0B1020"
  graphite-shell: "#15181B"
  graphite-sidebar: "#101316"
  graphite-input: "#1D2125"
  graphite-canvas: "#15181B"
  graphite-panel: "#1D2125"
  graphite-card: "#24292F"
  graphite-hover: "#2B3138"
  border-subtle: "rgba(222,229,244,0.08)"
  border-strong: "rgba(222,229,244,0.16)"
  chalk-white: "#F1F0EC"
  text-secondary: "#B6B8BB"
  text-muted: "#92979E"
  text-disabled: "#92979E"
  success-seaglass: "#78B789"
  warning-ochre: "#D8AA58"
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
    textColor: "{colors.on-primary}"
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
    width: "680px"
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
    padding: "2px 8px"
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

Domyślny motyw jest ciemny, tonalny i kompaktowy, a ten sam kontrakt semantyczny obsługuje jasny wariant Pergamin. Marka ujawnia się przez konsekwentny rytm, oszczędne użycie akcentu motywu, drobną typografię oraz dobrze rozróżnione stany, nie przez dekorację. To interfejs w trybie **Operate**: ma ułatwiać wykonanie zadania, a nie konkurować o uwagę.

**Key Characteristics:**

- Grafitowe powierzchnie budują hierarchię przez różnicę tonu.
- Precyzyjny błękit oznacza wybór, aktywność i główną akcję.
- Układ jest zwarty, modularny i przygotowany na dużą ilość danych.
- Obramowania porządkują powierzchnie; cienie są zarezerwowane dla warstw unoszących się nad treścią.
- Komunikacja jest krótka, rzeczowa i po polsku.

## Colors

Frontmatter pokazuje wartości domyślnego `rootine-cobalt` jako czytelny snapshot dla narzędzi. Normatywnym źródłem wartości wszystkich motywów jest `src/styles/tokens.css`, a listy dostępnych identyfikatorów, nazw i mapowania preferencji `system` — `src/app/theme/appTheme.ts`. Zmiana motywu nie zmienia znaczenia ról `primary`, `surface`, `text`, `success`, `warning` i `danger`.

Runtime udostępnia dwa motywy: `rootine-cobalt` (Atrament, domyślny ciemny) oraz `rootine-warm-linen` (Pergamin, jasny). Historyczne nazwy `precision-*`, `graphite-*` i `chalk-*` są aliasami kompatybilności mapowanymi na role semantyczne.

### Primary

- **Akcent motywu** (`primary`, alias `precision-blue`): aktywna nawigacja, zaznaczenie, focus, główna akcja i wybrany filtr.
- **Precyzyjny błękit tekstowy** (`precision-blue-text`): tekst aktywnego stanu na ciemnej powierzchni; jaśniejszy wariant zapewniający kontrast małego tekstu.
- **Powierzchnia akcji** (`precision-blue-strong` → `primary`): tło głównej akcji pod semantycznym `on-primary`; kolor tekstu zależy od motywu i nie zawsze jest biały.
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
z nieczytelną siatką. Te cztery wartości są jedynymi dopuszczonymi w blokach `@media print`
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
- **Supporting microcopy:** 10–11px, tylko dla metadata i informacji trzeciego rzędu; nie dla głównej instrukcji lub podstawowej akcji.

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

Aplikacja używa jednego `AppLayout` ze stałą globalną nawigacją o szerokości 204px. Jeden rejestr modułów jest źródłem kolejności, etykiet, ikon i adresów dla sidebara, ustawień, nawigacji mobilnej oraz odsyłaczy z Dzisiaj. Globalna nawigacja zawiera osiem obszarów: Dzisiaj, Zadania, Odżywianie, Sport, Pracę, Cele, Sprawy i Notatki. Kalendarz oraz Nawyki należą do Zadań, a Podróże do Spraw. `Praca` obejmuje obowiązki zawodowe i historyczną nazwę „Biuro”. `Finanse` są grupą podwidoków Spraw, a JDG pozostaje podwidokiem Spraw, nie osobnym modułem globalnym. `WorkspaceLayout` ma jedną opcjonalną kolumnę `ModuleSidebar` oraz przewijany `MainContent`; żaden ekran nie kompensuje tych kolumn lokalnym offsetem. Bieżący inwentarz tras w `ROUTE_LAYOUT_AUDIT` pokazuje sidebar modułowy w Zadaniach, Kalendarzu, Notatkach, Celach, Sporcie, Odżywianiu, Pracy, Sprawach i Podróżach; Dzisiaj i osobna trasa szczegółu celu pozostają bez niego.

Sidebar kontekstowy odpowiada za strukturę modułu, nie za chwilowe filtry. Zaczyna się bez powtórzonego nagłówka modułu; pierwszym elementem są grupy widoków. `ContentHeader` nazywa aktualny widok i mieści jego lokalne akcje, filtry oraz sortowanie — jest jedynym nagłówkiem ekranu. Ta sama funkcja nie może być jednocześnie powielona w sidebarze i nagłówku. Panel prawy ma zawsze 408px i oznacza szczegóły aktualnie wybranego rekordu; przy braku wyboru nie zajmuje miejsca roboczego.

Zwykła kolekcja rekordów korzysta z płaskiego płótna i separatorów wierszy. Tło oznacza osobny obiekt, stan albo podsumowanie; nie służy do opakowywania zwykłej listy. Powierzchnie zachowują między innymi formularze, panele szczegółów, podsumowania budżetu, alerty wymagające reakcji i kafelki w jawnie wybranym widoku siatki.

Podstawą rytmu jest siatka 4px. Najczęstsze odstępy to 8, 12, 16, 20, 24 i 28px. Każda trasa używa wspólnego `PageShell`, który renderuje opcjonalny `PageToolbar` i wspólną oś treści — nic ponadto. Ten sam komponent jest obowiązkowy dla nowych ekranów.

Układ jest przede wszystkim desktopowy i gęsty. Globalne warianty szerokości to `standard` 1280px, `wide` 1480px oraz `fluid` bez maksymalnej szerokości; cała kompozycja sidebar + treść jest centrowana względem faktycznego `MainContent`. Powyżej 1380px obecny `DetailPanel` jest trzecią, dockowaną kolumną 408px i grid rezerwuje dla niego rzeczywisty tor, więc nie zasłania treści. Przy 1380px i niżej przechodzi w modalny drawer z backdropem oraz containmentem fokusu. Przy 980px globalny sidebar zwęża się do ikon, a przy 760px zastępuje go dolna nawigacja z czterema priorytetowymi modułami i pozycją „Więcej”. „Więcej” udostępnia wszystkie obszary, ustawienia, profil oraz przywrócenie ukrytych modułów bez poziomego przewijania paska. Sidebary kontekstowe są wtedy zastępowane kompaktowym Selectem w toolbarze. Treść używa 28px poziomego i 20px pionowego paddingu na desktopie oraz 16px na telefonie; Kalendarz pozostaje uzasadnionym wyjątkiem edge-to-edge.

**The Workspace First Rule.** Szerokość należy oddać głównej czynności. Panele pomocnicze mogą znikać lub nakładać się wcześniej niż treść robocza.

**The Four-Pixel Rhythm Rule.** Nowe odległości muszą wynikać z czteropikselowego rytmu, chyba że korekta optyczna wymaga pojedynczego piksela.

### Calm Layered Workspace / Variant A

**Status:** APPROVED AND IMPLEMENTED

**Date:** 2026-08-06

**Selected direction:** Variant A

This is the binding, implemented contract for complex workspaces.

#### Surface model

- **Surface 0 — Canvas:** the workspace background and spacing between independent sections.
- **Surface 1 — `SectionSurface`:** one quiet bounded surface grouping related transparent rows; no cards inside cards.
- **Surface 2 — object/widget cards:** standalone records, summaries, and widgets only.
- **Floating surfaces:** overlays are reserved for floating detail panels, menus, popovers, modals, and toasts; Surfaces 0–2 stay in document flow.

#### Tint, responsive, and shared-component rules

- Category tint is restrained and local (typically 2–4%); it may mark an edge, icon, or badge but never flood a section.
- Semantic tint communicates a real status only, stays restrained, and never becomes decorative module color.
- At `<=760px`, page, section, object, and widget titles wrap naturally; they must not be clipped or forced onto one line.
- `SectionSurface`, `FilterBar`, and `Pagination` are shared primitives; modules do not create local equivalents.

#### Interaction contracts

- **Work:** clicking an identity opens its scope; its chevron only toggles the inline preview.
- **Goals:** the sidebar scopes the workspace without opening detail; next-step depth is explicitly 1, 2, or 3.
- **Affairs:** information architecture uses agenda, register, and workspace views, including JDG and travel.
- **Notes:** grid cards have equal fixed height with local body scroll; list view stays flat and has no nested scroll.
- **Sport:** eligible past-day sessions replan safely without rewriting completed or active history; History shows 10 items per page.

#### Verification

- Status is computed, not preserved as a permanent PASS claim. Before merging a design-system change,
  run `npm run design-system:audit`, `npm run css:lint`, `npm run typecheck:app` and the focused
  viewport tests for the affected shell/component. Dated command output belongs in the change report
  or CI; this constitution records contracts, not historical test totals.

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

Standardowe obramowanie ma 1px. Checkboxy mogą używać 1.5px dla czytelności przy małym rozmiarze. Dashed border jest dopuszczalny dla wyspecjalizowanych kontrolek „dodaj”; wspólny `EmptyState` używa ciągłej linii.

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
- **Primary:** tło `primary`, tekst `on-primary`, wysokość 40px, poziomy padding 16px; jedna dominująca akcja w bieżącym kontekście. `on-primary` jest ciemny w motywie Cobalt i jasny w części pozostałych motywów.
- **Quiet:** transparentne tło, subtelna linia i tekst pomocniczy; hover przechodzi w Grafit reakcji.
- **Danger:** transparentny lub bardzo subtelny koral; pełne koralowe wypełnienie tylko dla ostatecznego potwierdzenia destrukcji.
- **Focus:** globalny obrys 2px w Precyzyjnym błękicie z offsetem 2px.
- **Disabled:** `--opacity-disabled` (0.42) i brak pozornej klikalności.

### Checkbox

- **Shared form contract:** `Checkbox` ma rozmiary `md` 18 × 18px i `sm` 16 × 16px, kształt `square | round`, natywną semantykę oraz stan indeterminate. Geometria pochodzi z `--component-checkbox-size*`.
- **Task checkbox:** domenowa kontrolka ukończenia pozostaje osobnym, zatwierdzonym wzorcem: 14 × 14px, w panelu szczegółów 17 × 17px, a w gęstym kalendarzu 11 × 11px.
- **Hover:** lekkie przejście w Grafit pola bez zmiany rozmiaru lub położenia.
- **Completed:** Precyzyjny błękit w obramowaniu, znaku i subtelnym tle. Zieleń pozostaje kolorem semantycznego sukcesu i nie oznacza zwykłego ukończenia zadania.
- **Accessibility:** checkbox zadania jest przyciskiem z opisem akcji i wspólnym focus ringiem.

### Card

- **Corner Style:** miękki prostokąt 12px.
- **Background:** Grafit karty albo Grafit modułu zależnie od poziomu zagnieżdżenia.
- **Shadow Strategy:** brak mocnego cienia w spoczynku; zobacz Elevation & Depth.
- **Border:** 1px w Linii subtelnej.
- **Internal Padding:** 12–16px dla kart gęstych, 20–24px dla pustych lub skupionych stanów.
- **Record typography:** standardowe kafelki rekordów używają `ui-record-title` 14px/600 oraz `ui-record-meta` 11px. Skondensowane kafelki kalendarzowe i gęste wiersze mogą używać `ui-record-title--compact` 12px/500.
- **Record density:** standardowy rekord zaczyna się od 12px pionowego i 16px poziomego paddingu. Większy format wymaga funkcjonalnego uzasadnienia, nie tylko innego modułu.
- **Calendar records:** zadania w komórce kalendarza są gęstymi, tonalnymi rekordami bez obramowania. Można je przeciągać między dniami; drop aktualizuje klucz daty, etykietę daty oraz inteligentny widok Zadania: Dziś, Jutro, Następne 7 dni albo Skrzynka.

### Input

- **Style:** Grafit pola, Kredowa biel, linia subtelna, promień 8px i wysokość około 40px.
- **Placeholder:** Popiel wyciszony.
- **Focus:** linia przechodzi w `primary`, a pierścień używa `0 0 0 2px var(--color-primary-subtle)`.
- **Error:** Przygaszony koral na obramowaniu i krótkim komunikacie.
- **Disabled:** Popiel nieaktywny i brak kontrastowego hovera.

### Textarea

- **Contract:** ten sam label, hint, error, disabled i focus co `Input`, z wielowierszową kontrolką oraz caller-owned `rows`/wysokością zależną od zadania.
- **Usage:** nowy formularz nie tworzy surowego wizualnego wrappera `<textarea>`; domenowe edytory o odmiennym zachowaniu wymagają jawnego wyjątku.

### Select

- **Style:** dziedziczy Input, z chevronem po prawej i menu na warstwie Floating Menu.
- **Density:** pola formularzowe mają 40px, a filtry w `ContentHeader` używają wariantu compact 28px.
- **Listbox:** powierzchnia `surface-1`, promień 8px i mocna linia; opcje mają minimum 38px z paddingiem 7px × 10px. To celowo wygodniejszy cel niż 28px w menu akcji; pozycjoner używa 44px wyłącznie jako bezpiecznego oszacowania wysokości.
- **Selected:** Precyzyjny błękit w tekście lub subtelnym tle; nie oba w pełnym nasyceniu.

### Menu

- **Contract:** wszystkie menu akcji używają wspólnych `Menu` i `MenuItem`; lokalne panele z własnym paddingiem i typografią są niedozwolone.
- **Geometry:** minimalna szerokość 148px, padding powierzchni 4px, promień 8px i wiersze minimum 28px z paddingiem 4px × 8px.
- **Typography:** 10px dla etykiety, ikona 13px; akcje success i danger używają wyłącznie kolorów semantycznych.
- **Elevation:** tylko cień Floating Menu; stan hover zmienia ton powierzchni, nigdy rozmiar elementu.
- **Keyboard:** elementy menu obsługują strzałki góra/dół oraz Home/End; niestandardowe wyzwalacze, takie jak import pliku, muszą być osiągalne przez Tab i aktywowane Enterem lub spacją.

### Modal

- **Shape:** promień 16px, bez dodatkowej linii, z cieniem modalnym i maksymalną wysokością 88vh (92vh jako mobilny bottom sheet).
- **Backdrop:** semantyczny `--color-backdrop`; w domyślnym Cobalt ma 72%, a w sześciu motywach dopasowuje kontrast do powierzchni. Brak dekoracyjnego bluru.
- **Header:** oddzielony subtelną linią; tytuł, opcjonalny eyebrow i przycisk zamknięcia.
- **Width:** nazwane kroki `sm=500`, `md=680` (domyślny), `lg=780`, `xl=960`; `width` jest pojedynczym escape hatchem dla dialogu zachowującego się jak pełna strona.
- **Behavior:** Escape, kliknięcie backdropu, `role="dialog"` i `aria-modal="true"`.

### Tabs

- **Style:** zwarta grupa przycisków bez ciężkiej obudowy.
- **Active:** Mgła błękitnego sygnału i Precyzyjny błękit.
- **Inactive:** Popiel pomocniczy na transparentnym tle.
- **Focus:** ten sam globalny focus ring co przyciski.

### Badge

- **Style:** mała etykieta statusu z minimum 22px, promieniem pill i paddingiem 2px × 8px; wariant `plain` usuwa powierzchnię i padding.
- **State:** kolor tekstu i lekkie tło wynikają z semantyki; opcjonalna kropka ma 6px.
- **Copy:** jedno lub dwa krótkie słowa, bez zdań.

### ProgressBar

- **Contract:** bounded metric z `min`/`max`, rozmiarem `sm | md`, semantycznym tonem albo świadomie przekazanym kolorem danych oraz osobnym tekstem dla czytnika ekranu.
- **Boundary:** nadaje się do postępu celu i prostych miar; nie zastępuje osi, siatki ani serii wykresu domenowego.

### Toast

- **Contract:** `ToastViewport` grupuje komunikaty przejściowe, a `Toast` zapewnia ton `neutral | success | warning | danger`, jedną opcjonalną akcję i jawne zamknięcie.
- **Behavior:** timer domyślnie trwa 8 sekund i zatrzymuje się podczas hovera lub interakcji fokusem; `danger` używa asertywnego alertu, pozostałe tony uprzejmego statusu.
- **Boundary:** długotrwały błąd należący do bieżącego widoku pozostaje widoczny przy jego `ContentHeader`; toast służy krótkiej informacji zwrotnej i możliwości cofnięcia.

### ContentHeader

Jedyny nagłówek ekranu. Nazywa bieżący widok i skupia wszystko, co go dotyczy: metadane, status, filtry i akcje lokalne. Komponent `PageHeader` nie istnieje — został usunięty w 2026-08 razem z globalnym paskiem.

- **Slots:** `leading` (nawigacja wsteczna na trasach szczegółu), `title`, `description`, `meta`, `actions`, `controls`, `below` oraz `mobileNavigation` na Select podwidoku.
- **Hierarchy:** `headingLevel` przyjmuje `1 | 2 | 3 | false`; `ContentHeader` trasy używa `<h1>`, a `2` i `3` są przeznaczone dla lokalnych nagłówków zagnieżdżonych. `false` pozostaje wyłącznie dla wizualnych etykiet bez udziału w strukturze dokumentu. `typography.headline` nie jest używana do tytułów stron.
- **Meta:** miejsce na status ekranu — badge zamknięcia dnia, ostrzeżenie o nieudanym zapisie lokalnym, licznik pozycji. Wiersz meta może zawijać.
- **Actions:** jedna akcja główna w bieżącym kontekście, reszta `quiet` lub `ghost`; nadmiar chowa się do `Menu`.
- **Contract:** rama wewnętrzna `ContentHeader` jest identyczna z ramą treści, więc nagłówek i treść stoją na jednej osi.

### ModuleShell

- **Structure:** opcjonalny `ModuleSidebar`, elastyczny `ModuleMain` oraz opcjonalny `DetailPanel`.
- **ModuleSidebar:** 220px, Grafit panelu bocznego, wyłącznie nawigacja po realnych podwidokach modułu.
- **ContentHeader:** wspólny nagłówek aktualnego widoku z tytułem, opisem, metadanymi, lokalnymi akcjami, filtrami i opcjonalnym drugim wierszem; jego wewnętrzna rama jest identyczna z ramą treści.
- **DetailPanel:** 408px, powierzchnia sidebara; dockowany w rzeczywistym torze gridu powyżej 1380px, a przy 1380px i niżej modalny drawer z backdropem, Escape, pułapką fokusu i przywróceniem fokusu.
- **Mobile:** sidebar kontekstowy znika, toolbar pokazuje Select podwidoku, a główna nawigacja przechodzi na dół ekranu.
- **Calendar detail:** szczegóły wydarzenia są pływającym panelem zakotwiczonym przy wybranej komórce, nie centralnym modalem ani stałym prawym panelem. Kliknięcie poza panelem go zamyka; kliknięcie innego dnia najpierw zamyka bieżący panel, a dopiero kolejne kliknięcie tworzy zadanie. Picker daty otwiera się przy przycisku z ikoną kalendarza.

### ContextNavItem

- **Contract:** wszystkie klikalne pozycje `ModuleSidebar` używają jednego komponentu `ContextNavItem`.
- **Typography:** 13px, waga 400; stan aktywny używa wagi 500. Lokalne nadpisania fontu są niedozwolone.
- **Geometry:** minimum `--row-height-compact` (domyślnie 36px), padding poziomy 12px, odstęp 8px i promień 8px.
- **Icon:** pole 14px z ikoną 13px oraz `stroke-width` 1.7.
- **Active:** tonalna powierzchnia panelu, tekst secondary i jednopikselowy znacznik `theme-signature`; aktywność jest również oznaczona `aria-current="page"`.
- **Meta:** licznik 11px w `DM Mono`; dziedziczy aktywny kolor tylko dla bieżącej pozycji.
- **Grouping:** pierwsza grupa podstawowych widoków używa etykiety „Główne”; nazwa aktualnego widoku pozostaje pozycją nawigacji, nie nagłówkiem grupy.

### SectionHeader

- **Style:** `typography.label`, Popiel wyciszony, uppercase i tracking 0.16em.
- **Spacing:** 8px do treści sekcji; akcja pomocnicza może znajdować się po prawej.

### EmptyState

- **Style:** minimum 208px wysokości, subtelna ciągła linia z krótkim znacznikiem `theme-signature`, promień 12px i wyśrodkowana treść.
- **Content:** krótki tytuł, jedno zdanie wyjaśnienia i opcjonalna pojedyncza akcja.
- **Tone:** rzeczowy i pomocny; bez ilustracyjnego hałasu.

**The Quiet-by-Default Rule.** Kontrolki zaczynają od neutralnego stanu. Kolor i podniesienie pojawiają się dopiero jako informacja o priorytecie, wyborze albo statusie.

## Implementacja

Źródłem prawdy dla nowych zakładek są:

- zatwierdzone decyzje produktowe i `docs/design-system-decisions.md`,
- `src/styles/tokens.css` oraz `docs/design-system-exceptions.json` — kolory, typografia, spacing, promienie, wymiary, cienie, motion i jawne wyjątki,
- `src/app/ui/breakpoints.ts` — kanoniczny manifest liczbowy breakpointów; `--bp-*` w CSS są mirrorami sprawdzanymi przez audyt,
- `src/app/ui/components/` — wspólne komponenty i ich aktywne API,
- `src/app/ui/index.ts` — jedyny publiczny punkt importu komponentów UI.

`src/app/ui/tokens.ts` jest wyłącznie transportem wartości CSS do istniejących, zatwierdzonych stylów dynamicznych, nie osobnym poziomem pierwszeństwa. Eksportuje tylko `uiColors`, `uiLayers` i `uiShadows`, które mają produkcyjnych konsumentów; alias bez konsumenta jest usuwany, nie utrzymywany jako fantomowy kontrakt.

Wyjątek dla inline style jest kontraktem właściwości, nie zgodą na cały plik. `allowedProperties` może przepuścić wyłącznie dynamiczną geometrię, kolor danych lub nazwany CSS custom property; literalny padding, font, radius, surface albo layout nadal jest długiem raportowanym przez audyt.

### Density i motion

Warianty `default`, `calm` i `compact` redefiniują wyłącznie trzy tokeny wysokości w `tokens.css`; moduły nie utrzymują własnej kopii skali density. Redukcja ruchu dla preferencji aplikacji skraca nazwane role motion przez `--motion-reduced`, wyłącza ruch ciągły/dekoracyjny i pozostawia natychmiastowy feedback zmiany stanu. Nowy ruch wybiera rolę `feedback`, `spatial` albo `decorative`; nie dodaje surowego czasu w feature CSS.

Nowa zakładka nie definiuje własnego obiektu palety ani lokalnego odpowiednika komponentu z tej biblioteki. Jeżeli brakuje wariantu, najpierw rozszerza komponent wspólny, a potem używa go w ekranie. Szczegółowe przykłady i kontrakt migracyjny znajdują się w `src/app/ui/README.md`.

### Ciągłość danych lokalnego MVP

- Zadania i Kalendarz korzystają z jednego rekordu zadania. Nadanie terminu tworzy `calendarDate`, usunięcie terminu usuwa rekord z Kalendarza bez usuwania zadania, a przesunięcie w Kalendarzu aktualizuje jego widok w Zadaniach.
- Dane odczytywane z `localStorage` muszą przejść walidację minimalnego kształtu. Uszkodzony lub niezgodny zapis wraca do bezpiecznego stanu demonstracyjnego zamiast blokować moduł.
- Błąd zapisu lokalnego jest komunikowany przez `Badge tone="danger"` w slocie `meta` komponentu `ContentHeader` — w module, w którym użytkownik pracuje, a nie tylko globalnym toastem.
- Główne moduły są ładowane jako osobne fragmenty tras; wspólny shell i tokeny pozostają w paczce bazowej.

`text-muted` jest jaśniejszy od pozostałych szarości, ponieważ tekst pomocniczy 10–11px musi zachować co najmniej kontrast 4.5:1 także na powierzchni karty (`graphite-card`). Wartości normatywne są w `tokens.css`; frontmatter jest snapshotem domyślnego motywu i nie zastępuje sześciu theme scopes. `text-disabled` pozostaje przeznaczony wyłącznie dla faktycznie nieaktywnych kontrolek.

Akcent ma trzy role kontrastowe: `primary` pozostaje sygnałem marki i fokusu, `primary-text` służy małemu tekstowi na powierzchni, a `primary` jako tło przycisku jest zawsze parowane z `on-primary`. Aliasy `precision-*` zachowują kompatybilność, ale nie należy zamieniać tych ról miejscami ani zakładać jednego koloru tekstu we wszystkich motywach.

## Do's and Don'ts

### Do:

- **Do** buduj nowe sekcje wyłącznie z tokenów i wzorców Button, Card, Input, Textarea, Select, Menu, Modal, Tabs, Badge, ProgressBar, Toast, ContentHeader, SectionHeader, EmptyState, ModuleShell, ModuleSidebar oraz DetailPanel.
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
