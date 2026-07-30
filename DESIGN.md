---
name: Rootine
description: "Grafitowy warsztat do spokojnego zarządzania codziennymi obszarami życia."
colors:
  precision-blue: "#4772FA"
  precision-blue-text: "#809AF4"
  precision-blue-strong: "#3E63DA"
  precision-blue-soft: "rgba(71,114,250,0.11)"
  graphite-shell: "#1C1C1C"
  graphite-sidebar: "#1E1E1E"
  graphite-input: "#222222"
  graphite-canvas: "#242424"
  graphite-panel: "#2A2A2A"
  graphite-card: "#2E2E2E"
  graphite-hover: "#333333"
  border-subtle: "#383838"
  border-strong: "#484848"
  chalk-white: "#F0F0F0"
  text-secondary: "#A0A0A0"
  text-muted: "#969696"
  text-disabled: "#444444"
  success-seaglass: "#70B89F"
  warning-ochre: "#D4AA68"
  danger-coral: "#CF777C"
  accent-violet: "#9B8CE8"
typography:
  micro:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "9px"
    fontWeight: 500
    lineHeight: 1.35
    letterSpacing: "normal"
  label:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.16em"
  meta:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
  data:
    fontFamily: "DM Mono, monospace"
    fontSize: "10px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
  body:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  body-emphasis:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.45
    letterSpacing: "normal"
  title:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "normal"
  headline:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.025em"
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
  page-header:
    backgroundColor: "{colors.graphite-canvas}"
    textColor: "{colors.chalk-white}"
    typography: "{typography.title}"
    padding: "0 28px"
    height: "70px"
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

**The Signal, Not Paint Rule.** Precyzyjny błękit jest sygnałem działania, nie dekoracyjną farbą; na jednym ekranie powinien wskazywać tylko najważniejsze aktywne miejsca.

**The Semantic Honesty Rule.** Zieleń, ochra i koral opisują rzeczywisty status. Nie służą do przypadkowego różnicowania kart.

## Typography

**Display Font:** Plus Jakarta Sans (with system-ui fallback)
**Body Font:** Plus Jakarta Sans (with system-ui fallback)
**Label/Mono Font:** DM Mono (with monospace fallback)

**Character:** Plus Jakarta Sans daje spokojną, współczesną czytelność przy dużej gęstości, a DM Mono oddziela czas, wartości, procenty i dane rytmiczne. Hierarchia wynika głównie z wagi, koloru i odstępu; skoki rozmiaru pozostają umiarkowane.

### Hierarchy

- **Headline** (`typography.headline`): tytuł pełnego obszaru roboczego; najwyżej jeden na ekran.
- **Title** (`typography.title`): nagłówki modułów, dialogów i paneli.
- **Body** (`typography.body`): zadania, wartości pól i podstawowa treść operacyjna.
- **Label** (`typography.label`): krótkie etykiety sekcji, zwykle uppercase z poszerzonym trackingiem.
- **Data** (`typography.data`): czas, daty, wyniki, serie, procenty i liczniki.
- **Supporting microcopy:** 9–11px, tylko dla metadata i informacji trzeciego rzędu; nie dla głównej instrukcji lub podstawowej akcji.

**The Compact Legibility Rule.** Mały tekst musi mieć wyraźną rolę pomocniczą, wystarczający kontrast i krótką długość. Rozmiar nie może zastępować hierarchii.

**The Data Voice Rule.** DM Mono jest zarezerwowany dla danych, nie dla nagłówków ani zwykłych opisów.

**The Control Cascade Rule.** Reset `font: inherit` dla `button`, `input`, `textarea` i `select` musi pozostawać w `@layer base`. Reset poza warstwą nadpisuje utility typograficzne kontrolek i powoduje niekontrolowane skoki do rozmiaru odziedziczonego.

## Layout

Aplikacja używa jednego `AppShell` ze stałą globalną nawigacją o szerokości 204px. Jeden rejestr modułów jest źródłem kolejności, etykiet, ikon i adresów dla sidebara, ustawień, nawigacji mobilnej oraz odsyłaczy z Dzisiaj. W aktualnym MVP globalna nawigacja zawiera Dzisiaj, Zadania, Kalendarz, Odżywianie, Sport, Pracę, Cele, Sprawy, Notatki i Podróże. `Praca` obejmuje obowiązki zawodowe i historyczną nazwę „Biuro”. `Finanse` są grupą podwidoków Spraw, a JDG pozostaje podwidokiem Spraw, nie osobnym modułem globalnym. `ModuleShell` może dodać kontekstowy sidebar 250px wyłącznie wtedy, gdy moduł ma prawdziwe podwidoki, tak jak Zadania, Cele, Sport i Sprawy. Kalendarz oraz Odżywianie pozostają pojedynczym canvasem bez lokalnego sidebara.

Sidebar kontekstowy odpowiada za strukturę modułu, nie za chwilowe filtry. Zaczyna się bez powtórzonego nagłówka modułu; pierwszym elementem są grupy widoków. Akcje tworzenia należą do głównego `PageHeader`, dzięki czemu nie są dublowane w panelu pomocniczym. Filtry i sortowanie należą do `WorkspaceToolbar`. Ta sama funkcja nie może być jednocześnie powielona w sidebarze i toolbarze. Panel prawy ma zawsze 370px i oznacza szczegóły aktualnie wybranego rekordu; przy braku wyboru nie zajmuje miejsca roboczego.

Podstawą rytmu jest siatka 4px. Najczęstsze odstępy to 8, 12, 16, 20, 24 i 28px. Zadania, Kalendarz, Cele, Sport i Odżywianie używają wspólnego `PageHeader` o wysokości 70px i poziomym paddingu 28px. Ten sam komponent jest obowiązkowy dla nowych ekranów.

Układ jest przede wszystkim desktopowy i gęsty. Przy 1380px każdy `DetailPanel` przechodzi w warstwę nakładaną, przy 980px globalny sidebar zwęża się do ikon, a przy 760px zastępuje go dolna nawigacja z czterema priorytetowymi modułami i pozycją „Więcej”. „Więcej” udostępnia wszystkie obszary, ustawienia, profil oraz przywrócenie ukrytych modułów bez poziomego przewijania paska. Sidebary kontekstowe są wtedy zastępowane kompaktowym Selectem w toolbarze. Treść używa 28px poziomego i 20px pionowego paddingu na desktopie oraz 16px na telefonie; Kalendarz pozostaje uzasadnionym wyjątkiem edge-to-edge.

**The Workspace First Rule.** Szerokość należy oddać głównej czynności. Panele pomocnicze mogą znikać lub nakładać się wcześniej niż treść robocza.

**The Four-Pixel Rhythm Rule.** Nowe odległości muszą wynikać z czteropikselowego rytmu, chyba że korekta optyczna wymaga pojedynczego piksela.

## Elevation & Depth

System jest warstwowy i powściągliwy. Na poziomie spoczynkowym hierarchię tworzą tony grafitu i cienkie obramowania. Cienie pojawiają się dopiero, gdy element realnie unosi się nad treścią: menu, modal, panel szczegółów, zaznaczona karta lub komunikat typu toast.

### Shadow Vocabulary

- **Card Rest** (`0 1px 2px rgba(0,0,0,0.12)`): minimalne odcięcie interaktywnej karty od tła.
- **Selected Card** (`0 0 0 1px rgba(71,114,250,0.12), 0 12px 28px rgba(0,0,0,0.16)`): wybrana karta bez nadmiernego blasku.
- **Floating Menu** (`0 8px 28px rgba(0,0,0,0.55)`): menu i select ponad treścią.
- **Overlay Panel** (`0 12px 36px rgba(0,0,0,0.38)`): panel szczegółów lub duży popover.
- **Primary Action** (`0 6px 18px rgba(71,114,250,0.22)`): opcjonalnie dla jednej głównej akcji na ekranie.

**The Lift Has a Job Rule.** Cień oznacza zmianę warstwy lub priorytetu interakcji. Zwykłe karty pozostają tonalne i obramowane.

## Shapes

Formy są miękko geometryczne, nie obłe. Drobne elementy kalendarza mogą używać promienia 3px, kompaktowe przyciski 6px, standardowe inputy i kontrolki 8px, karty i menu 12px, a modale 16px. Pełne zaokrąglenie jest przeznaczone dla statusów, tagów, awatarów, checkboxów kołowych i pasków postępu.

Standardowe obramowanie ma 1px. Checkboxy mogą używać 1.5px dla czytelności przy małym rozmiarze. Dashed border jest dopuszczalny wyłącznie w pustych stanach lub kontrolkach „dodaj”.

**The Radius Ladder Rule.** Promień rośnie wraz z wagą powierzchni: kontrolka → karta → modal. Nie należy losowo mieszać 6, 8, 9, 10 i 12px dla elementów tej samej klasy.

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
- **Density:** pola formularzowe mają 40px, a filtry w `WorkspaceToolbar` używają wariantu compact 28px.
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

### PageHeader

- **Style:** wysokość 70px, padding poziomy 28px i dolna Linia subtelna.
- **Content:** po lewej pojedynczy tytuł z krótkim opisem, po prawej 1–3 akcje.
- **Hierarchy:** tytuł korzysta z `typography.title` lub `typography.headline`, zależnie od złożoności przestrzeni.
- **Contract:** tytuł nazywa moduł, opis nazywa aktualny podwidok, a prawa strona zawiera jedną główną akcję: Nowe zadanie, Nowe wydarzenie, Nowy cel, Dodaj trening albo Dodaj produkt.

### ModuleShell

- **Structure:** opcjonalny `ContextSidebar`, elastyczny `ModuleMain` oraz opcjonalny `DetailPanel`.
- **ContextSidebar:** 250px, Grafit panelu bocznego, wyłącznie nawigacja po realnych podwidokach modułu.
- **WorkspaceToolbar:** minimum 52px, padding 12px × 28px, filtry, sortowanie i kontrolki widoku.
- **DetailPanel:** 370px, Grafit panelu bocznego; dockowany na szerokim ekranie i nakładany poniżej 1380px.
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
- Błąd zapisu lokalnego jest komunikowany przez `Badge tone="danger"` w `PageHeader`.
- Główne moduły są ładowane jako osobne fragmenty tras; wspólny shell i tokeny pozostają w paczce bazowej.

`text-muted` ma wartość `#969696`, ponieważ tekst pomocniczy 9–11px musi zachować co najmniej kontrast 4.5:1 także na powierzchni karty `#2E2E2E`. `text-disabled` pozostaje przeznaczony wyłącznie dla faktycznie nieaktywnych kontrolek.

Precyzyjny błękit ma trzy role kontrastowe: `precision-blue` pozostaje sygnałem marki i fokusu, `precision-blue-text` służy małemu tekstowi na graficie, a `precision-blue-strong` jest powierzchnią przycisku pod jasnym tekstem. Nie należy zamieniać tych ról miejscami.

## Do's and Don'ts

### Do:

- **Do** buduj nowe sekcje wyłącznie z tokenów i wzorców Button, Card, Input, Select, Menu, Modal, Tabs, Badge, PageHeader, SectionHeader, EmptyState, ModuleShell, ContextSidebar, WorkspaceToolbar oraz DetailPanel.
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
