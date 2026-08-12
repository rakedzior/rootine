# Rootine UI

## Wspólne prymitywy planowania i szybkiego dodawania

- `TimePicker` jest kanonicznym polskim polem czasu 24h. Zachowuje natywne `type="time"`, ręczne wpisywanie, `min`, `max`, `step`, label, hint i error. Opcjonalne `options` tworzą dostępny listbox; `optionsPresentation="inline"` służy warstwie, która już zarządza własnym portalem.
- `AnchoredPopover` zapewnia portal, collision fallback, placement `auto | top | bottom | left | right`, click/focus outside, Escape i przywrócenie fokusu. Zawartość nadal deklaruje właściwą rolę ARIA: `menu`, `listbox` albo `dialog`.
- `SelectOption` może mieć `leadingIcon`, `description`, `meta` i semantyczny `tone`. `Select density="compact | standard"` zastępuje lokalne wysokości; boolean `compact` pozostaje aliasem migracyjnym.
- `PriorityIcon` jest jedyną flagą priorytetu (`none | normal | low | medium | high`). Szybkie menu i pełne `Select` używają tej samej ikony 13px, wypełnienia i semantycznego koloru.
- `PropertyMenu` łączy ikonowy trigger właściwości z zarządzanym `menuitemradio`: ikona, ton, meta, zaznaczenie, strzałki, Home/End, Escape i restore focus.
- `QuickComposer` jest bezdomenowym, responsywnym shellem formularza: `leadingAction`, `editor`, `propertyControls`, `scheduleControl`, `submitAction`. Przy 760px editor zajmuje pierwszy wiersz, a wszystkie akcje pozostają dostępne poniżej.
- `DatePicker` i `Tabs` przyjmują `density="compact | standard"`. Compact obejmuje trigger oraz cały inline calendar. Feature, który potrzebuje własnej prezentacji triggera, przekazuje bezpośredni hook przez `DatePicker.triggerClassName` zamiast selektora potomnego `.ui-date-trigger`. `Menu` ma gęstości `compact=28px`, `standard=40px` i `comfortable=36px` z 44px przy `pointer: coarse`.
- Tokeny `--component-option-height-*`, `--component-option-padding-inline-*`, `--component-scheduler-radius` i `--component-scheduler-layer-radius` są jedynym źródłem geometrii wspólnych list i schedulera.

Przykład kompozycji:

```tsx
<QuickComposer
  aria-label="Dodaj zadanie"
  density="compact"
  editor={<Input aria-label="Nazwa zadania" value={title} onChange={handleTitle} />}
  propertyControls={(
    <PropertyMenu
      ariaLabel="Priorytet"
      value={priority}
      options={priorityOptions}
      onChange={setPriority}
    >
      <Flag size={13} aria-hidden="true" />
    </PropertyMenu>
  )}
  scheduleControl={(
    <DatePicker aria-label="Termin" density="compact" value={date} onChange={setDate} />
  )}
  submitAction={<Button type="submit" size="sm">Dodaj</Button>}
/>
```

To jest publiczna warstwa interfejsu dla wszystkich zakładek aplikacji. Importuj wyłącznie z `src/app/ui`:

```tsx
import {
  Badge,
  Button,
  Card,
  ContentHeader,
  EmptyState,
  Input,
  Textarea,
  Menu,
  MenuItem,
  Modal,
  ModuleMain,
  ModuleShell,
  PageShell,
  ContextNavItem,
  ModuleSidebar,
  DetailPanel,
  SectionHeader,
  Select,
  Tabs,
  Checkbox,
  Switch,
  ProgressBar,
  PriorityIcon,
  Toast,
  ToastViewport,
} from "../ui";
```

## Reguły

Globalny pasek `PageHeader` jest usunięty z każdej zakładki i podzakładki — razem z samym komponentem. `PageShell` i `ModuleShell` **nie mają** już slotów `title`, `subtitle`, `leading`, `meta`, `actions` ani `header`. Przyjmowały je i po cichu wyrzucały, więc każde nieaktualne call site zamieniało się w niewidoczną treść zamiast w błąd kompilacji; tak zginął przycisk powrotu w szczegółach celu, cały komunikat błędu trasy i dziewięć wskaźników nieudanego zapisu. Bieżący widok, jego metadane i akcje należą do `ContentHeader`.

1. Nie twórz lokalnych kopii tych komponentów ani lokalnej palety dla nowej zakładki.
2. Układaj ekran na rytmie 4px i korzystaj z wartości z `tokens.css`.
3. `PageShell` jest wspólnym kontenerem strony i nie renderuje żadnego tytułu. Tytuł ekranu podaje `ContentHeader`.
4. Jedna akcja w aktualnym kontekście może używać `Button variant="primary"`; pozostałe są `quiet` lub `ghost`. `Button iconOnly` wymaga `aria-label` na poziomie typu.
5. `Card` nie służy do opakowywania każdej sekcji. Używaj jej tylko dla rzeczywistej powierzchni lub jednostki danych.
6. `Badge` opisuje status, kategorię albo krótki licznik. Kolor semantyczny musi odpowiadać znaczeniu.
7. `Modal` zapewnia Escape, kliknięcie backdropu, pułapkę fokusu i przywrócenie fokusu. Nie implementuj tego ponownie w ekranie.
8. Po dodaniu zakładki uruchom build, audyt CSS i `/impeccable critique the newly implemented section against DESIGN.md`.
9. `ModuleSidebar` służy podwidokom, `ContentHeader` bieżącemu widokowi i jego filtrom, a `DetailPanel` wyłącznie szczegółom wybranego rekordu.
10. Każda klikalna pozycja sidebara używa `ContextNavItem`. Nie nadpisuj lokalnie rozmiaru tekstu, ikony, paddingu ani aktywnego tła.
11. Filtry w `ContentHeader` używają `Select compact`, a wszystkie wysuwane listy akcji pary `Menu` + `MenuItem`.
12. Edytor planu sportowego przechowuje parametry na poziomie pojedynczej serii. Zmiana serii nie może przepisywać parametrów pozostałych serii.
13. Zadanie z terminem zawsze ma `calendarDate`; Zadania i Kalendarz aktualizują ten sam rekord oraz jego inteligentny widok daty.
14. Każdy moduł waliduje stan odczytany z `localStorage` i pokazuje `Brak zapisu lokalnego`, jeśli zapis się nie powiedzie.
15. Pozycje `Menu` obsługują strzałki oraz Home/End. Niestandardowy `menuitem` musi być fokusowalny i aktywowany klawiaturą.
16. `ContentHeader` trasy renderuje jeden `<h1>`; `headingLevel={2 | 3}` służy wyłącznie nagłówkom zagnieżdżonym, a `false` usuwa element z hierarchii.
17. `Menu` używa `layer` dla warstwy semantycznej; szeroki wariant to `size="wide"`. Pozycjonowanie pozostaje dynamiczne, ale nie dodaje surowego `z-index`.
18. `DatePicker` używa `portalLayer` dla portalu. `portalZIndex` pozostaje wyłącznie kompatybilnością wsteczną.

## Hierarchia źródeł prawdy

1. Zatwierdzona konstytucja systemu i decyzje produktowe.
2. Definicje tokenów w `src/styles/tokens.css` oraz rejestr wyjątków w `docs/design-system-exceptions.json`.
3. Kanoniczny manifest breakpointów w `src/app/ui/breakpoints.ts`; tokeny `--bp-*` są walidowanym mirrorem CSS.
4. Kontrakty komponentów w `src/app/ui/components/`.
5. Bieżąca implementacja modułu, jeśli korzysta z zatwierdzonego wyjątku.
6. Przykłady, aliasy transportowe z `tokens.ts` i dokumentacja pomocnicza.

Jeśli dokumentacja pomocnicza różni się od aktywnego kontraktu komponentu, popraw dokumentację. Jeśli token i aktywny layout mają różne wartości, nie zmieniaj wymiaru bez decyzji produktowej — zapisz konflikt w dzienniku decyzji.

## Szkielet zakładki

```tsx
export function NewSection() {
  return (
    <ModuleShell
      contextSidebar={<ModuleSidebar label="Widoki" />}
    >
      <ModuleMain>
        <ContentHeader
          title="Aktualny podwidok"
          description="Kontekst i metadane widoku"
          actions={<Button variant="quiet">Akcja lokalna</Button>}
          controls={<>Filtry i sortowanie</>}
        />
        <section className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <SectionHeader title="Najważniejsze" variant="label" />
          <Card>Treść</Card>
        </section>
      </ModuleMain>
    </ModuleShell>
  );
}
```

## Dostępne kontrakty

- `Button`: `primary | quiet | ghost | danger`, rozmiary `xs | sm | md`, tryb ikonowy i disabled.
- `Card`: powierzchnie `card | panel | input`, cztery poziomy paddingu i stan selected.
- `Input`, `Textarea`, `Select`: label, hint, error, disabled i spójny focus. Pola tekstowe pokazują aktywny akcent przez natywny kursor oraz pojedynczą spokojną ramkę; focus ring pozostaje zarezerwowany dla nawigacji i akcji klawiaturą. Surowy `<textarea>` wymaga jawnie zatwierdzonego kontraktu domenowego.
- `Menu`, `MenuItem`: wspólna powierzchnia 148px+, wiersze 28px, wariant `wide` i semantyczna warstwa.
- `Modal`: title, description, eyebrow, footer, nazwane rozmiary `sm=500 | md=680 | lg=780 | xl=960`, pojedynczy escape hatch `width` i dostępne zarządzanie fokusem.
- `Tabs`: semantyka tablist/tab i obsługa strzałek, Home oraz End.
- `Badge`: neutral, primary, success, warning, danger i violet; pill albo plain z opcjonalną kropką.
- `ContentHeader`: tytuł i opis aktualnego widoku, metadane, lokalne akcje, kontrolki, drugi wiersz oraz osobna nawigacja mobilna.
- `SectionHeader`: hierarchia nagłówka, opis, akcja oraz wariant label.
- `EmptyState`: icon, title, description i jedna akcja.
- `Checkbox`: natywny checkbox z rozmiarem `sm | md`, kształtem `square | round` i stanem indeterminate.
- `Switch`: natywny checkbox z semantyką `switch`, wspólną geometrią i obsługą label/description dla ustawień binarnych.
- `ProgressBar`: wartości ograniczone przez `min`/`max`, rozmiar `sm | md`, ton, etykieta wizualna i wartość dla czytnika ekranu; służy bounded metrics (m.in. postępowi celu), nie osi/serii wykresu.
- `Toast`, `ToastViewport`: wspólny komunikat przejściowy z semantycznym tonem, jedną opcjonalną akcją, pauzą timera przy hoverze/fokusie oraz kontrolką zamknięcia; `danger` używa alertu, pozostałe tony statusu.
- `ModuleShell`, `ModuleMain`: wspólna topologia modułu i chroniony główny workspace.
- `ModuleSidebar`: opcjonalna nawigacja podwidoków modułu.
- `ContextNavItem`: wspólna pozycja sidebara; kontroluje ikonę, etykietę, licznik oraz stan aktywny.
- `DetailPanel`: szczegóły wybranego rekordu; powyżej 1380px dockowany w rezerwowanym torze 408px, przy 1380px i niżej modalny drawer z backdropem i pułapką fokusu.

`tokens.ts` eksportuje wyłącznie używane transporty `uiColors`, `uiLayers` i `uiShadows`. Nie są alternatywnym źródłem prawdy; nowe style używają klas i tokenów CSS, a alias bez pierwszego konsumenta nie trafia do publicznego API.
