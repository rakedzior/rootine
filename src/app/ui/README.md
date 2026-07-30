# Rootine UI

To jest publiczna warstwa interfejsu dla wszystkich zakładek aplikacji. Importuj wyłącznie z `src/app/ui`:

```tsx
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Menu,
  MenuItem,
  Modal,
  ModuleMain,
  ModuleShell,
  PageHeader,
  ContextNavItem,
  ContextSidebar,
  DetailPanel,
  SectionHeader,
  Select,
  Tabs,
  WorkspaceToolbar,
} from "../ui";
```

## Reguły

1. Nie twórz lokalnych kopii tych komponentów ani lokalnej palety dla nowej zakładki.
2. Układaj ekran na rytmie 4px i korzystaj z wartości z `tokens.css`.
3. `PageHeader` jest pojedynczym nagłówkiem obszaru roboczego i ma 70px wysokości.
4. Jedna akcja w aktualnym kontekście może używać `Button variant="primary"`; pozostałe są `quiet` lub `ghost`.
5. `Card` nie służy do opakowywania każdej sekcji. Używaj jej tylko dla rzeczywistej powierzchni lub jednostki danych.
6. `Badge` opisuje status, kategorię albo krótki licznik. Kolor semantyczny musi odpowiadać znaczeniu.
7. `Modal` zapewnia Escape, kliknięcie backdropu, pułapkę fokusu i przywrócenie fokusu. Nie implementuj tego ponownie w ekranie.
8. Po dodaniu zakładki uruchom build, audyt CSS i `/impeccable critique the newly implemented section against DESIGN.md`.
9. Sidebar kontekstowy służy podwidokom, toolbar filtrom, a `DetailPanel` wyłącznie szczegółom wybranego rekordu.
10. Każda klikalna pozycja sidebara używa `ContextNavItem`. Nie nadpisuj lokalnie rozmiaru tekstu, ikony, paddingu ani aktywnego tła.
11. Filtry w toolbarze używają `Select compact`, a wszystkie wysuwane listy akcji pary `Menu` + `MenuItem`.
12. Edytor planu sportowego przechowuje parametry na poziomie pojedynczej serii. Zmiana serii nie może przepisywać parametrów pozostałych serii.
13. Zadanie z terminem zawsze ma `calendarDate`; Zadania i Kalendarz aktualizują ten sam rekord oraz jego inteligentny widok daty.
14. Każdy moduł waliduje stan odczytany z `localStorage` i pokazuje `Brak zapisu lokalnego`, jeśli zapis się nie powiedzie.
15. Pozycje `Menu` obsługują strzałki oraz Home/End. Niestandardowy `menuitem` musi być fokusowalny i aktywowany klawiaturą.

## Szkielet zakładki

```tsx
export function NewSection() {
  return (
    <ModuleShell contextSidebar={<ContextSidebar label="Widoki" />}>
      <ModuleMain>
        <PageHeader
          title="Nazwa sekcji"
          description="Aktualny podwidok"
          actions={<Button variant="primary">Dodaj</Button>}
        />
        <WorkspaceToolbar>Filtry i sortowanie</WorkspaceToolbar>
        <section className="min-h-0 flex-1 overflow-y-auto px-7 py-5">
          <SectionHeader title="Najważniejsze" variant="label" />
          <Card>Treść</Card>
        </section>
      </ModuleMain>
    </ModuleShell>
  );
}
```

## Dostępne kontrakty

- `Button`: `primary | quiet | ghost | danger`, rozmiary `sm | md`, tryb ikonowy i disabled.
- `Card`: powierzchnie `card | panel | input`, cztery poziomy paddingu i stan selected.
- `Input`, `Select`: label, hint, error, disabled i spójny focus.
- `Menu`, `MenuItem`: wspólna powierzchnia 148px+, wiersze 28px oraz semantyczne tony akcji.
- `Modal`: title, description, eyebrow, footer, width i dostępne zarządzanie fokusem.
- `Tabs`: semantyka tablist/tab i obsługa strzałek, Home oraz End.
- `Badge`: neutral, primary, success, warning, danger i violet; pill albo plain z opcjonalną kropką.
- `PageHeader`: title, description, leading, meta, actions oraz opcjonalny drugi wiersz.
- `SectionHeader`: hierarchia nagłówka, opis, akcja oraz wariant label.
- `EmptyState`: icon, title, description i jedna akcja.
- `ModuleShell`, `ModuleMain`: wspólna topologia modułu i chroniony główny workspace.
- `ContextSidebar`: opcjonalna nawigacja podwidoków modułu.
- `ContextNavItem`: wspólna pozycja sidebara; kontroluje ikonę, etykietę, licznik oraz stan aktywny.
- `WorkspaceToolbar`: filtry, sortowanie i przełączniki widoku.
- `DetailPanel`: szczegóły wybranego rekordu; dockowany lub nakładany zależnie od szerokości.
