# Agent C — audyt wizualny, UX, copy PL i dostępności działającej aplikacji Rootine

Data audytu: 2026-08-10 (czas aplikacji ustalony na 10:00, Europe/Warsaw)  
Aplikacja: `http://127.0.0.1:4174/`  
Tryb: wyłącznie odczytowy; kod produkcyjny i istniejące dane nie zostały zmienione.  
Artefakty: [`audit-visual-agent-c/`](audit-visual-agent-c/), w tym 128 screenshotów, [`audit-data.json`](audit-visual-agent-c/audit-data.json), [`targeted-data.json`](audit-visual-agent-c/targeted-data.json) i [`copy-checks.json`](audit-visual-agent-c/copy-checks.json).

## Executive summary

Rootine jest wizualnie dojrzałym, spokojnym i w dużej mierze spójnym produktem desktopowym. Hierarchia grafitowych powierzchni, oszczędne akcenty, stałe osie i gęste wiersze odpowiadają kierunkowi „Calm Layered Workspace”. Wszystkie 95 kontrole trasa × profil miały dokładnie jeden `h1`, nie wykazały globalnego poziomego overflow, a 52/52 repozytoryjnych testów layoutu i 6/6 testów zoom/reflow przeszło.

Największe ryzyko leży w dostępności podwidoków, których domyślne smoke testy nie obejmują: dwie wizualne tabele Sportu mają niepoprawną strukturę ARIA, a dziewięć małych tekstów w pięciu podwidokach nie osiąga 4,5:1. Dodatkowo implementacja szerokiego `DetailPanel` świadomie nakłada go na workspace, mimo że `DESIGN.md` wymaga dockowania powyżej 1380 px. Tego konfliktu nie należy rozstrzygać bez wskazania źródła prawdy.

Rejestr zawiera 3 problemy P1, 6 P2 i 2 P3; nie znaleziono P0.

Najmocniejsze elementy:

- konsekwentne osie `ContentHeader` i treści, szerokości 204/220/408 px i wspólne warianty `standard`, `wide`, `fluid`;
- dokładnie jeden `h1` i jeden główny landmark na każdej sprawdzonej trasie;
- brak globalnego overflow w czterech viewportach, profilach zoom i na obu stronach czterech breakpointów;
- czytelne, płaskie listy rekordów, lokalny kolor statusu i niewielka liczba cieni;
- poprawna pułapka fokusu, Escape i zwrot fokusu w modalach otwieranych bezpośrednim CTA; poprawna nawigacja strzałkami w menu; działający skip link;
- `prefers-reduced-motion` usuwa animacje w pięciu reprezentatywnych modułach (`runningAnimations: []`, transition 0,001 s).

Największe ryzyko funkcjonalno-UX w tym zakresie: modal „Edytuj cel” ukrywa około połowy głównego CTA przy pierwszym renderze i nie pokazuje paska przewijania; po Escape focus przepada do `body`, jeśli modal otwarto z menu karty.

Werdykt dla design systemu w warstwie renderowanej: system jest wyraźnie egzekwowany dla geometrii, powierzchni i typografii, ale nie jest jeszcze równie skuteczny dla semantyki dostępności, kontrastu stanów oraz kontraktu overlay/docked.

## Oceny cząstkowe 0–100

| Obszar | Ocena | Uzasadnienie |
| --- | ---: | --- |
| Spójność wizualna | 88 | Jedna gramatyka powierzchni, statusów i gęstości; pojedyncze problemy z clippingiem. |
| Layout i wyrównanie | 91 | Osie i szerokości są stabilne; konflikt `DetailPanel` obniża ocenę. |
| UX i architektura informacji | 81 | Dobre archetypy robocze, lecz Dzisiaj powtarza metryki, a stopka modala jest słabo odkrywalna. |
| Copy PL | 85 | Ogólnie naturalne i konsekwentne; jedno mylące CTA i dwa ucięte komunikaty pomocnicze. |
| Dostępność | 70 | Mocne podstawy klawiatury i landmarków, ale systemowe błędy ARIA/kontrastu oraz lokalny błąd zwrotu fokusu. |
| Odporność viewport/zoom | 93 | 58/58 testów repozytoryjnych przeszło; brak globalnego overflow przed/po breakpointach. |
| Odporność na dane | 82 | 19 rekordów i długie tytuły zachowują geometrię; syntetyczny skrajny dataset nie był wstrzykiwany. |

Metoda: 100 oznacza brak wykrytego odstępstwa w sprawdzonym zakresie. P1 obniża obszar o 8–15 punktów zależnie od skali; P2 o 3–7; P3 o 1–2. Oceny tokenów, architektury komponentów i pełnej spójności funkcjonalnej pozostają do scalenia z Agentami A/B.

## Metoda i źródła prawdy

Przed uruchomieniem audytu przeczytano lokalne instrukcje, `PRODUCT.md`, `DESIGN.md` i odpowiednie instrukcje umiejętności Intent (`intent`, `evaluate`, `include`, `fortify`, `articulate`, `impeccable`) oraz instrukcję sterowania przeglądarką.

Wbudowana przeglądarka aplikacji nie była dostępna (`agent.browsers.list() = []`, „No browser is available”). Po wykonaniu zalecanego bootstrap checku użyto repozytoryjnego Playwrighta w izolowanym kontekście Chromium. To ograniczenie narzędzia, nie defekt Rootine.

Zakres pomiarów:

- 50 tras/podwidoków przy 1440 × 900: screenshot, DOM/bounding boxes i axe-core 4.12 na każdym widoku;
- dziewięć reprezentatywnych ekranów przy 1366 × 768, 1920 × 1080 i 2560 × 1440;
- dziewięć reprezentatywnych ekranów dla profili repozytorium 125% i 150%;
- `DetailPanel` w czterech viewportach i obu profilach zoom;
- pomiary bezpośrednio przed/po 1380, 1180, 980 i 760 px;
- modale, panel szczegółów, edytor Notatek, DatePicker, trzy menu, focus/hover, selected, completed, overdue i disabled;
- sekwencja 28 Tabów, pułapka fokusu, Escape, Home/End/Arrow, zwrot fokusu i skip link;
- pięć tras z `prefers-reduced-motion: reduce`;
- repozytoryjne testy: `layout-consistency.spec.ts` 52/52, `zoom-reflow.spec.ts` 6/6 i wcześniej `accessibility.spec.ts` 11/11.

### Zasada interpretacji kontrastu

Do rejestru trafiły wyłącznie naruszenia potwierdzone przez axe lub osobny pomiar konkretnego elementu. Surowe 96 trafień własnego kolektora kontrastu odrzucono: część nie uwzględniała kompozycji półprzezroczystych warstw, a kontrolki `disabled` są wyłączone z kryterium WCAG 1.4.3. Nie raportowano też surowych liczników `unnamed` i `<24 px`, bo obejmowały etykiety opakowujące input oraz dozwolone wyjątki „spacing/equivalent target”.

## Macierz pokrycia tras

Legenda: **V** — wizualnie; **D** — DOM/axe; **F** — interakcja; **—** — nieweryfikowane w tym przebiegu.

| Moduł | Trasy/podwidoki przy 1440 × 900 | Status |
| --- | --- | --- |
| Dzisiaj | `/dzisiaj` | V, D, F |
| Zadania | Dziś, Jutro, Następne 7 dni, Następne 30 dni, Bez terminu, Wszystkie, Nawyki, Podsumowanie, Ukończone, Kosz, `/kalendarz` | V, D; F dla Dziś, panelu, DatePickera i menu |
| Odżywianie | Dzienny rejestr, Własne posiłki, Analiza | V, D; F dla „Dodaj produkt” |
| Sport | Dziś, Cykl, Szablony, Ćwiczenia, Historia, Analiza | V, D; F dla nowego szablonu i menu |
| Praca | Dziś, Tydzień, Aktywne, Bez terminu, Nieprzypisane, Archiwum | V, D; F dla menu „Dodaj” |
| Cele | Aktywne, Następne kroki, Ten tydzień, Wszystkie, Zagrożone, Zakończone, Archiwum, szczegóły celu | V, D; F dla menu i edycji |
| Sprawy | Dziś, Tydzień, Wszystkie, Jednorazowe, Cykliczne, Subskrypcje, Budżet, Dokumenty, Pojazdy, JDG, Podróże, alias `/podroze` | V, D; F dla dialogu dodawania |
| Notatki | Wszystkie, Przypięte, Archiwum | V, D; F dla edytora |

### Pokrycie viewportów

| Profil | Zakres | Wynik |
| --- | --- | --- |
| 1366 × 768 | 9 reprezentatywnych + task detail + goal modal | brak globalnego overflow; header Zadań obcina datę |
| 1440 × 900 | wszystkie 50 + pełny zestaw stanów | referencja; 12 grup naruszeń axe, zredukowanych do 6 problemów |
| 1920 × 1080 | 9 reprezentatywnych + task detail | stabilne osie i pełne daty |
| 2560 × 1440 | 9 reprezentatywnych + task detail | poprawne centrowanie `standard`/`wide`; `fluid` wykorzystuje szerokość |
| zoom-125 | 9 reprezentatywnych + task detail | 3/3 testy zoom przeszły |
| zoom-150 | 9 reprezentatywnych + task detail | 3/3 testy zoom przeszły; Budżet ponownie uchwycony przy `scrollTop=0` |

Profile zoom odpowiadają macierzy repozytorium (skalowany CSS viewport + DPR), a nie ręcznej zmianie UI Chrome. Screenshot Budżetu 150% po jawnym wyzerowaniu `window`, `document`, `.ui-module-main` i `.ui-page-shell`: [`targeted-zoom-150__affairs-budget-scroll-reset.png`](audit-visual-agent-c/targeted-zoom-150__affairs-budget-scroll-reset.png).

### Pokrycie stanów

| Stan | Dowód | Status |
| --- | --- | --- |
| default / selected / overdue | Zadania Dziś, Sport, Cele, Budżet | sprawdzono wizualnie i w DOM |
| completed | Zadania Ukończone, Nawyki | sprawdzono; znaleziono kontrast completed subtitle |
| disabled | DatePicker zadania, akcje formularzy | sprawdzono wizualnie; disabled wyłączono z audytu 1.4.3 |
| hover / focus | task row/title, 28 Tabów, skip link | sprawdzono; widoczny wspólny focus ring |
| modal | Cele, Sport, Odżywianie, Sprawy | sprawdzono screenshot, Escape i częściowo focus |
| drawer/detail | Zadania w 6 profilach, Notatki, breakpointy | sprawdzono screenshot i DOM |
| popover | DatePicker zadania | sprawdzono; `role=dialog`, `aria-modal=false` jako niemodalny popover |
| menu | Zadania, Cele, Praca | sprawdzono; Arrow/Home/End/Escape dla Pracy |
| reduced motion | Dzisiaj, Zadania, Sport, Cele, Sprawy | brak uruchomionych animacji |
| długie/dużo danych | 19 zadań, długie nazwy, 14 ćwiczeń | brak złamania geometrii; kontrolowane ellipsis |
| loading/error/offline/permission/read-only | — | nieweryfikowane na żywo |

## Geometria i breakpointy

- Globalny sidebar: 204 px w żądanych desktopowych viewportach; kontekstowy: 220 px; panel szczegółów: 408 px.
- Oś `ContentHeader` i treści ma różnicę `x = 0`, `width = 0` we wszystkich 95 kontrolach.
- `standard` stabilizuje się na 1224 px treści, `wide` na 1424 px, `fluid` rośnie: 878 → 952 → 1432 → 2072 px po uwzględnieniu sidebara i paddingu.
- Brak poziomego overflow przy 1366, 1440, 1920, 2560, zoom 125/150 oraz 1379/1381, 1179/1181, 979/981, 759/761.

| Próg | Poniżej | Powyżej | Ocena |
| --- | --- | --- | --- |
| 1380 | 1379: drawer `role=dialog`, `aria-modal=true`, backdrop, focus wewnątrz | 1381: nadal `position:absolute`, ale bez modalności/backdropu | technicznie stabilne; konflikt z dokumentacją — C-DS-001 |
| 1180 | 1179: kontekstowy sidebar ukryty, meta wiersza ograniczone | 1181: sidebar 220 px i pełne kolumny | zgodne z implementacją, bez overflow |
| 980 | 979: globalny sidebar 68 px, padding 20 px | 981: sidebar 204 px, padding 28 px | zgodne, bez overflow |
| 760 | 759: sidebar ukryty, panel pełnej szerokości 759 px | 761: rail 68 px, panel 408 px | zgodne; oba probe’y poza żądanym zakresem desktopowym |

## Rejestr problemów

### C-DS-001 — szeroki DetailPanel przeczy udokumentowanemu kontraktowi

| Pole | Wartość |
| --- | --- |
| ID | C-DS-001 |
| Priorytet | P1 |
| Kategoria | component |
| Lokalizacja | Wszystkie widoki z `DetailPanel`; pomiar Zadania Dziś przy 1379/1381 i 1920/2560 |
| Porównanie | `DESIGN.md:314,488` („dockowany na szerokim ekranie”) vs `experience.css:761–770` i runtime (`position:absolute` także od 1381 px) |
| Oczekiwane | Jedno zatwierdzone źródło prawdy: dockowana trzecia kolumna >1380 i overlay ≤1380 albo jawnie udokumentowany overlay na wszystkich szerokościach. |
| Faktyczne | Przy 1379 panel jest modalnym drawerem. Przy 1381 nadal leży absolutnie nad workspace, grid track panelu ma 0 px, ale panel traci `role=dialog`, `aria-modal`, backdrop i focus containment. Komentarz CSS mówi, że jest to celowe. |
| Dowód | [`targeted-breakpoint-1379__task-detail.png`](audit-visual-agent-c/targeted-breakpoint-1379__task-detail.png), [`targeted-breakpoint-1381__task-detail.png`](audit-visual-agent-c/targeted-breakpoint-1381__task-detail.png), [`targeted-1920x1080__task-detail.png`](audit-visual-agent-c/targeted-1920x1080__task-detail.png), [`targeted-data.json`](audit-visual-agent-c/targeted-data.json); `DESIGN.md:488`; `src/styles/experience.css:761–770`. |
| Skala | 8 użyć `DetailPanel` w 6 modułach: Zadania, Sport, Praca, Cele, Sprawy, Notatki. |
| Przyczyna | Późniejsza globalna reguła w `experience.css` nadpisuje bazową geometrię gridu z `ui.css`; dokumentacja nie została zsynchronizowana albo implementacja odbiegła od kontraktu. |
| Rekomendacja | Najpierw zatwierdzić źródło prawdy. Jeśli DESIGN wygrywa — pozostawić panel w trzecim tracku >1380 i absolutny drawer ≤1380. Jeśli overlay jest zatwierdzony — zaktualizować DESIGN i dopisać reguły dostępności/interakcji szerokiego niemodalnego overlayu. |
| Koszt | M |
| Pewność | Wysoka |

### C-A11Y-001 — wizualne tabele Sportu mają niepoprawne role ARIA

| Pole | Wartość |
| --- | --- |
| ID | C-A11Y-001 |
| Priorytet | P1 |
| Kategoria | accessibility |
| Lokalizacja | `/sport?widok=templates` oraz `/sport?widok=exercises`, stan domyślny 1440 × 900 |
| Porównanie | Wizualnie są to uporządkowane tabele z nagłówkami kolumn; semantycznie `role=row` nie ma rodzica `table/grid/rowgroup` ani dzieci `cell/columnheader`. Inne rekordy, np. Kalendarz, tworzą pełny `grid → rowgroup → row → gridcell`. |
| Oczekiwane | Native `<table>/<thead>/<tbody>/<tr>/<th>/<td>` albo kompletna, poprawna struktura ARIA. |
| Faktyczne | Nagłówek i rekordy mają `role=row`, ale bez dozwolonych rodziców/dzieci; bezpośrednimi dziećmi są `span` i `button`. Axe: `aria-required-parent` i `aria-required-children`, impact `critical`. |
| Dowód | [`1440x900__sport-templates.png`](audit-visual-agent-c/1440x900__sport-templates.png), [`1440x900__sport-exercises.png`](audit-visual-agent-c/1440x900__sport-exercises.png), [`audit-data.json`](audit-visual-agent-c/audit-data.json); `src/app/sport/SportTemplates.tsx:182–204`, `SportExercises.tsx:157–175`. |
| Skala | 21 elementów `role=row`: 6 w Szablonach i 15 w Ćwiczeniach; dwa podwidoki. |
| Przyczyna | Wizualny grid został częściowo „doprawiony” rolą `row`, bez wspólnego komponentu dostępnej tabeli rekordów. |
| Rekomendacja | Utworzyć wspólny `RecordTable` oparty o semantykę natywną; przyciski tytułu i menu osadzić wewnątrz komórek. Jeżeli kolekcja nie ma być tabelą, usunąć wszystkie role `row`, zamiast pozostawiać niepełny wzorzec. |
| Koszt | M |
| Pewność | Wysoka |

### C-A11Y-002 — mały tekst nie osiąga 4,5:1 w pięciu podwidokach

| Pole | Wartość |
| --- | --- |
| ID | C-A11Y-002 |
| Priorytet | P1 |
| Kategoria | accessibility |
| Lokalizacja | Nawyki, Kalendarz, Sport: Cykl, Historia i Analiza przy 1440 × 900 |
| Porównanie | Tekst podstawowy i większość metadanych przechodzi axe; konkretne stany `completed`, „dzisiaj”, zakres tygodnia i neutralny badge nie przechodzą. |
| Oczekiwane | WCAG 1.4.3 AA: minimum 4,5:1 dla małego tekstu normalnego. |
| Faktyczne | Nawyki completed subtitle 3,73:1; numer dzisiejszego dnia Kalendarza 3,36:1; pięć zakresów tygodni Sportu 3,53–3,59:1; badge Historii 4,22:1; badge Analizy 3,81:1. |
| Dowód | [`1440x900__tasks-habits.png`](audit-visual-agent-c/1440x900__tasks-habits.png), [`1440x900__calendar.png`](audit-visual-agent-c/1440x900__calendar.png), [`1440x900__sport-cycle.png`](audit-visual-agent-c/1440x900__sport-cycle.png), [`audit-data.json`](audit-visual-agent-c/audit-data.json). |
| Skala | 9 węzłów, 5 podwidoków, 3 obszary produktu (Zadania/Kalendarz/Sport). |
| Przyczyna | Kompozycja tokenu tertiary z `--opacity-completed`, dziedziczony muted color w week tabs, neutral badge na różnych tłach oraz inline `C.text` na `C.blue` w Kalendarzu. |
| Rekomendacja | Dodać kontrastowo bezpieczne tokeny stanów (`text-completed-readable`, `text-on-accent`, `badge-neutral-text`) i test axe dla wszystkich podwidoków, nie tylko tras domyślnych. Nie korygować przez samo zwiększenie opacity globalnie bez testu powierzchni. |
| Koszt | S–M |
| Pewność | Wysoka |

### C-A11Y-003 — po zamknięciu edycji celu focus trafia do `body`

| Pole | Wartość |
| --- | --- |
| ID | C-A11Y-003 |
| Priorytet | P2 |
| Kategoria | accessibility |
| Lokalizacja | `/cele?widok=overview` → menu karty → „Edytuj cel” → Escape, 1366 i 1440 |
| Porównanie | Modal „Nowy szablon” otwierany bezpośrednim CTA zwraca focus do „Dodaj szablon”; modal celu otwierany z chwilowego menu nie wraca do przycisku „Więcej opcji”. |
| Oczekiwane | Po Escape focus wraca do stabilnego triggera akcji, który otworzył menu/modal. |
| Faktyczne | Modal zamyka się, lecz `document.activeElement` to `BODY` w obu viewportach; `returnedToTrigger=false`. |
| Dowód | [`targeted-data.json`](audit-visual-agent-c/targeted-data.json), `src/app/ui/components/Modal.tsx:59,112–116`. |
| Skala | Potwierdzone w jednym przepływie i dwóch viewportach; ryzyko dotyczy innych modali otwieranych z odmontowywanego menu. |
| Przyczyna | `Modal` zapamiętuje aktywny `menuitem`; po wyborze menu jest odmontowane, więc cleanup nie ma połączonego elementu do fokusowania. |
| Rekomendacja | Przekazywać do `Modal` stabilny `returnFocusRef` albo zapamiętywać trigger menu na poziomie przepływu. Dodać test „menu → modal → Escape → trigger”. |
| Koszt | S |
| Pewność | Wysoka |

### C-A11Y-004 — `aria-label` na bezrolowym kontenerze grup Zadań

| Pole | Wartość |
| --- | --- |
| ID | C-A11Y-004 |
| Priorytet | P2 |
| Kategoria | accessibility |
| Lokalizacja | `/zadania?widok=jutro`, `7dni`, `30dni`, stan domyślny 1440 × 900 |
| Porównanie | Inne nazwane kolekcje używają `section`, `nav` lub jawnego `role`; `.task-groups` to zwykły `div`. |
| Oczekiwane | Nazwa dostępności tylko na elemencie/roli, która ją wspiera. |
| Faktyczne | `<div class="task-groups" aria-label="Grupy zadań">`; axe `aria-prohibited-attr`, impact `serious`. |
| Dowód | [`audit-data.json`](audit-visual-agent-c/audit-data.json); `src/app/pages/Zadania.tsx:1465`. |
| Skala | 3 podwidoki. |
| Przyczyna | Częściowa semantyzacja lokalnego kontenera bez użycia wspólnej sekcji. |
| Rekomendacja | Użyć `<section aria-label="Grupy zadań">` lub nadać uzasadnioną rolę `group`; nie usuwać samej nazwy bez oceny struktury czytnika. |
| Koszt | S |
| Pewność | Wysoka |

### C-A11Y-005 — linki źródeł danych w modalu Odżywiania odróżnia wyłącznie kolor 1,16:1

| Pole | Wartość |
| --- | --- |
| ID | C-A11Y-005 |
| Priorytet | P2 |
| Kategoria | accessibility |
| Lokalizacja | `/odzywianie` → „Dodaj produkt”, stopka formularza |
| Porównanie | Przyciski/linki na innych powierzchniach mają obramowanie lub underline; te dwa linki są ciągłym fragmentem szarego akapitu. |
| Oczekiwane | Link w bloku tekstu ma trwałe podkreślenie lub różnicę koloru ≥3:1 względem tekstu otoczenia. |
| Faktyczne | Open Food Facts i USDA FoodData Central: różnica koloru link/tekst 1,16:1, bez underline. Axe `link-in-text-block`, impact `serious`. |
| Dowód | [`1440x900__state-nutrition-add-product-dialog.png`](audit-visual-agent-c/1440x900__state-nutrition-add-product-dialog.png), [`audit-data.json`](audit-visual-agent-c/audit-data.json); `Odzywanie.tsx:1507–1512`, `nutrition.css:1092–1102`. |
| Skala | 2 linki w jednym ważnym formularzu. |
| Przyczyna | CSS ustawia `text-underline-offset`, lecz nie włącza `text-decoration`. |
| Rekomendacja | Włączyć stałe `text-decoration: underline` dla linków attribution i zachować focus/hover; alternatywnie dobrać kontrast ≥3:1 względem akapitu. |
| Koszt | S |
| Pewność | Wysoka |

### C-UX-001 — stopka „Edytuj cel” jest przycięta i ma niewidoczny scrollbar

| Pole | Wartość |
| --- | --- |
| ID | C-UX-001 |
| Priorytet | P2 |
| Kategoria | UX |
| Lokalizacja | Cele → menu karty → Edytuj, pierwsze otwarcie przy 1366 × 768 i 1440 × 900 |
| Porównanie | Modal nowego szablonu mieści całą stopkę; modal celu przekracza `max-height` o 55 px i ukrywa scrollbar. |
| Oczekiwane | Główne CTA i cała stopka są widoczne/sticky albo scroll jest wyraźnie odkrywalny. |
| Faktyczne | 1366: modal `clientHeight=676`, `scrollHeight=731`; tylko ok. 20,5/40 px CTA znajduje się wewnątrz clipu. 1440: 792/847 i ok. 21,4/40 px. `scrollbar-width:none`. Wheel przewija do 55 px i odsłania stopkę; fokus CTA autoscrolluje częściowo, więc proces nie jest zablokowany. |
| Dowód | [`targeted-1366x768__goal-edit-initial.png`](audit-visual-agent-c/targeted-1366x768__goal-edit-initial.png), [`targeted-1440x900__goal-edit-initial.png`](audit-visual-agent-c/targeted-1440x900__goal-edit-initial.png), [`targeted-data.json`](audit-visual-agent-c/targeted-data.json); `ui.css:794–801`, `GoalDialogs.tsx:627–630`. |
| Skala | 1 modal, oba najciaśniejsze viewporty referencyjne. |
| Przyczyna | Cały modal jest jednym scroll containerem, scrollbar jest globalnie ukryty, a akcje celu są wewnątrz body zamiast wspólnego sticky footer. |
| Rekomendacja | Przenieść akcje do `Modal.footer` i uczynić footer sticky; przewijać wyłącznie body. Jeśli scrollbar pozostaje ukryty, dodać silny wizualny sygnał dalszej treści. |
| Koszt | S–M |
| Pewność | Wysoka |

### C-COPY-001 — „Dodaj posiłek” otwiera formularz „Dodaj produkt”

| Pole | Wartość |
| --- | --- |
| ID | C-COPY-001 |
| Priorytet | P2 |
| Kategoria | content |
| Lokalizacja | `/odzywianie`, główne CTA ContentHeader |
| Porównanie | Lokalna akcja sekcji mówi „Dodaj produkt do: Śniadanie”, modal „Dodaj produkt”, a jego primary „Dodaj do dziennika”; tylko globalny CTA mówi „Dodaj posiłek”. |
| Oczekiwane | Etykieta wejściowa opisuje dokładnie rezultat lub otwiera rzeczywisty flow tworzenia posiłku. |
| Faktyczne | „Dodaj posiłek” wywołuje `openEntryDialog()` i od razu prosi o produkt; nazwa sugeruje inną jednostkę danych niż modal. |
| Dowód | [`1440x900__nutrition-today.png`](audit-visual-agent-c/1440x900__nutrition-today.png), [`1440x900__state-nutrition-add-product-dialog.png`](audit-visual-agent-c/1440x900__state-nutrition-add-product-dialog.png), [`copy-checks.json`](audit-visual-agent-c/copy-checks.json); `Odzywanie.tsx:1049–1050,1365`. |
| Skala | 1 główne CTA, codzienny kluczowy flow. |
| Przyczyna | Header odziedziczył pojęcie „posiłek”, podczas gdy model formularza dodaje wpis/produkt do wybranego slotu posiłku. |
| Rekomendacja | Jeśli zachowanie zostaje — zmienić CTA na „Dodaj produkt” lub „Dodaj wpis”. Jeśli intencją jest posiłek wieloelementowy — otworzyć flow tworzenia posiłku. Zachować jedną nazwę obiektu w całej sekwencji. |
| Koszt | S |
| Pewność | Wysoka |

### C-CONTENT-001 — Dzisiaj powtarza te same metryki w pierwszym viewportcie

| Pole | Wartość |
| --- | --- |
| ID | C-CONTENT-001 |
| Priorytet | P2 |
| Kategoria | content |
| Lokalizacja | `/dzisiaj`, ContentHeader + hero summary + pierścień + panel zaległości + rejestr modułów |
| Porównanie | Rejestr modułów już zapewnia szczegół i wejścia; hero powinien dawać jedną syntetyczną odpowiedź, a nie powtarzać headline. |
| Oczekiwane | Jedna nadrzędna prezentacja każdej metryki plus lokalny drill-down. |
| Faktyczne | „25 pozostało” występuje w meta nagłówka, dużym headline i środku pierścienia; „15 zaległych” w subtitle i osobnym bloku; „6 wymaga uwagi” w nagłówku i jako „6 obszarów wymaga uwagi”. Dalej wiersze ponownie pokazują zaległości modułów. |
| Dowód | [`1440x900__today.png`](audit-visual-agent-c/1440x900__today.png), [`copy-checks.json`](audit-visual-agent-c/copy-checks.json). |
| Skala | 3 kluczowe metryki powtórzone w 4 strefach jednego pierwszego viewportu. |
| Przyczyna | ContentHeader, trzykolumnowy summary i rejestr agregują te same dane niezależnie. |
| Rekomendacja | Zachować jedną liczbę bohatera „25”, jeden lokalny alert „15 zaległych” i szczegół w wierszach. Usunąć liczby z meta ContentHeader albo z centrum pierścienia; pierścień może pozostać wyłącznie wizualizacją rozkładu. Użytkownik nie traci wartości ani drill-downu, zyskuje szybszy skan i wyraźniejsze CTA. |
| Koszt | S–M |
| Pewność | Wysoka |

### C-VIS-001 — data w opisie Zadań urywa się w dwóch desktopowych viewportach

| Pole | Wartość |
| --- | --- |
| ID | C-VIS-001 |
| Priorytet | P3 |
| Kategoria | visual |
| Lokalizacja | Zadania Dziś, ContentHeader, 1366 × 768 i 1440 × 900 |
| Porównanie | Przy 1920/2560 pełne „11 otwartych · Poniedziałek, 10 sierpnia”; przy 1366/1440 losowe ucięcie w środku daty. |
| Oczekiwane | Świadomie skrócony format daty albo pełna data w stabilnym slocie. |
| Faktyczne | 1366: `clientWidth=189`, `scrollWidth=215`; 1440: 206/215; `overflow:hidden; text-overflow:ellipsis; white-space:nowrap`. |
| Dowód | [`1366x768__tasks-today.png`](audit-visual-agent-c/1366x768__tasks-today.png), [`1440x900__tasks-today.png`](audit-visual-agent-c/1440x900__tasks-today.png), [`copy-checks.json`](audit-visual-agent-c/copy-checks.json). |
| Skala | 2 z 4 żądanych viewportów, w tym referencyjny 1440. |
| Przyczyna | Liczne akcje i filtry konkurują z elastycznym slotem identity. |
| Rekomendacja | Przy ograniczonej szerokości użyć kontrolowanego formatu „pon., 10 sie” albo przenieść datę do drugiego wiersza/meta, zamiast urywać słowo. |
| Koszt | S |
| Pewność | Wysoka |

### C-VIS-002 — placeholder wyszukiwarki Sportu jest stale przycięty

| Pole | Wartość |
| --- | --- |
| ID | C-VIS-002 |
| Priorytet | P3 |
| Kategoria | visual |
| Lokalizacja | Sport → Szablony i Ćwiczenia, toolbar 1440 × 900 |
| Porównanie | Accessible label jest krótki i pełny („Szukaj szablonów/ćwiczeń”), ale widoczny placeholder próbuje wymienić trzy zakresy wyszukiwania. |
| Oczekiwane | Widoczny helper mieści się albo jest świadomie krótszy; pełny zakres pozostaje w nazwie/hint. |
| Faktyczne | Szablony: input 167 px, użyteczne ok. 141 px, tekst placeholdera 238,6 px — widoczne tylko „Szukaj po nazwie, ćwicz…”. Analogicznie Ćwiczenia kończą się na „partii…”. |
| Dowód | [`1440x900__sport-templates.png`](audit-visual-agent-c/1440x900__sport-templates.png), [`1440x900__sport-exercises.png`](audit-visual-agent-c/1440x900__sport-exercises.png), [`copy-checks.json`](audit-visual-agent-c/copy-checks.json); `SportTemplates.tsx:174–176`, `SportExercises.tsx:139–145`. |
| Skala | 2 podwidoki. |
| Przyczyna | Stała/ciasna kolumna wyszukiwania i zbyt obszerny placeholder. |
| Rekomendacja | Skrócić do „Szukaj szablonów…” / „Szukaj ćwiczeń…”; zakres działania przekazać przez `aria-label` lub osobny hint. |
| Koszt | S |
| Pewność | Wysoka |

## Raport treści powtarzalnych

| Treść | Decyzja | Uzasadnienie |
| --- | --- | --- |
| Dzisiaj: 25/15/6 w nagłówku, hero, ring i rejestrze | uprościć/połączyć | Zachować po jednym nadrzędnym odczycie i pełne wiersze modułów. Użytkownik nie traci danych, zyskuje hierarchię. |
| Dzisiaj: zaległości przy Zadaniach/Pracy | zachować | To lokalny kontekst i wejście do działania; nie jest zbędne po uproszczeniu hero. |
| Sport: opisy sekcji „Zawartość widoczna…” | zachować | Wyjaśniają różnicę między przeglądem a edycją i wspierają pierwszy kontakt. |
| Odżywianie: attribution Open Food Facts/USDA | zachować, poprawić styl linków | Informacja buduje zaufanie i licencję; problemem jest dostępność, nie obecność treści. |
| Zadania: pełna data przy zatłoczonym headerze | skrócić kontrolowanie | Data jest przydatna, lecz obecne ellipsis daje przypadkowy fragment. |

## Sprzeczności dokumentacji i implementacji

1. `DESIGN.md:488`: `DetailPanel` jest dockowany na szerokim ekranie i nakładany poniżej 1380 px. `experience.css:761–770`: każdy szeroki panel jest absolutnym overlayem od 1381 px. Runtime potwierdza CSS. Rekomendacja: decyzja właściciela design systemu; bez cichego wyboru jednej wersji.
2. `DESIGN.md:458` definiuje modal jako `role=dialog` + `aria-modal=true`. Poniżej 1380 `DetailPanel` spełnia ten kontrakt jako drawer; powyżej 1380 pozostaje overlayem, ale semantycznie jest zwykłym `aside`. Jest to poprawne tylko wtedy, gdy szeroki panel zostanie jawnie uznany za niemodalny overlay z dozwoloną interakcją w tle.

## Quick wins

1. Dodać underline do `.nutrition-data-attribution a`.
2. Naprawić `.task-groups` przez semantyczne `section`/`role=group`.
3. Zastąpić trzy problematyczne zestawy kolorów tokenami przechodzącymi 4,5:1.
4. Przekazywać `returnFocusRef` dla modali otwieranych z menu.
5. Przenieść akcje GoalForm do wspólnego sticky `Modal.footer`.
6. Ujednolicić „Dodaj posiłek” → „Dodaj produkt” albo zmienić flow.
7. Skrócić placeholdery Sportu i responsywny format daty Zadań.
8. Dodać testy axe dla wszystkich podwidoków Sportu/Zadań, nie tylko stron domyślnych.
9. Podjąć i zapisać decyzję docked vs overlay dla szerokiego `DetailPanel` przed refaktorem.

## Plan naprawczy dla zakresu C

1. Fundamenty: rozstrzygnąć kontrakt `DetailPanel`; utworzyć kontrastowo bezpieczne tokeny stanów.
2. Komponenty: dostępny `RecordTable`, `Modal.footer` sticky, `returnFocusRef`.
3. Archetypy: zabezpieczyć listy/panele testami 1379/1381 i czterema desktopowymi viewportami.
4. Lokalne UX/copy: Odżywianie CTA/linki, Dzisiaj redundancja, skróty dat i placeholderów.
5. Regression: pełna macierz axe subviewów, screenshoty stanów, zoom 125/150 i reduced motion w CI.

## Nieweryfikowalne lub częściowo zweryfikowane obszary

- Nie wykonano manualnej sesji z NVDA/JAWS/VoiceOver; wnioski screen-reader wynikają z DOM, axe i klawiatury.
- Nie użyto systemowego zoom UI Chrome; zastosowano dokładne profile repozytorium oparte o skalowany CSS viewport i DPR.
- Nie wstrzyknięto skrajnie długich syntetycznych danych ani setek rekordów, aby nie utrwalać testowych zmian. Sprawdzono istniejące 19 zadań, 14 ćwiczeń i długie nazwy.
- Loading, offline, błąd zapisu, optimistic update, brak uprawnień, read-only, migracje localStorage, potwierdzenia usuwania i undo nie zostały kompleksowo uruchomione w tym odczytowym przebiegu.
- Nie wykonano destrukcyjnych akcji ani zapisu formularzy. Otwarcie draftu Notatki i formularzy nie zostało zatwierdzone przyciskiem „Zapisz”.
- Kliknięcie backdropu nie zostało ręcznie sprawdzone dla każdego modala; Escape i focus trap sprawdzono reprezentatywnie, a zachowanie wspólnego `Modal` potwierdzono w kodzie.
- `aria-controls` wskazujące nieobecny, zamknięty popup pozostały w sekcji axe `incomplete`; nie zgłoszono ich jako potwierdzonego defektu.
- Breakpointy 759/761 są pomocniczym probe’em poniżej żądanego desktopowego zakresu i nie stanowią pełnego audytu mobile.

## Podsumowanie dowodów

- 95 route checks, 0 błędów tras, 0 błędów runtime, 0 globalnych overflow, 0 błędów liczby `h1`.
- 12 grup axe na trasach: po deduplikacji 3 problemy (`task-groups`, kontrast, tabele Sportu) oraz 1 problem linków w stanie modala.
- 58/58 repozytoryjnych testów layout/zoom przeszło; wcześniejsze 11/11 domyślnych testów a11y także przeszło, co pokazuje lukę pokrycia podwidoków, nie sprzeczność w wynikach.
- 128 screenshotów zapisanych w [`artifacts/audit-visual-agent-c/`](audit-visual-agent-c/).

## Aneks A — skonsolidowana tabela axe i kontrastu

| Trasa / stan | Reguła axe | Impact | Węzły | Pomiar / opis |
| --- | --- | --- | ---: | --- |
| Zadania — Jutro | `aria-prohibited-attr` | serious | 1 | `.task-groups`: `aria-label` bez wspieranej roli |
| Zadania — 7 dni | `aria-prohibited-attr` | serious | 1 | jw. |
| Zadania — 30 dni | `aria-prohibited-attr` | serious | 1 | jw. |
| Zadania — Nawyki | `color-contrast` | serious | 1 | completed subtitle: 3,73:1, 11 px |
| Kalendarz | `color-contrast` | serious | 1 | numer dzisiejszego dnia: 3,36:1, 12 px |
| Sport — Cykl | `color-contrast` | serious | 5 | zakresy tygodni: 3,53–3,59:1, 11 px |
| Sport — Szablony | `aria-required-children` | critical | 6 | header + 5 rekordów `role=row` bez komórek |
| Sport — Szablony | `aria-required-parent` | critical | 6 | te same wiersze bez `table/grid/rowgroup` |
| Sport — Ćwiczenia | `aria-required-children` | critical | 15 | header + 14 rekordów `role=row` bez komórek |
| Sport — Ćwiczenia | `aria-required-parent` | critical | 15 | te same wiersze bez `table/grid/rowgroup` |
| Sport — Historia | `color-contrast` | serious | 1 | neutral badge: 4,22:1, 9 px |
| Sport — Analiza | `color-contrast` | serious | 1 | neutral badge: 3,81:1, 9 px |
| Odżywianie — Dodaj produkt | `link-in-text-block` | serious | 2 | link vs tekst otoczenia: 1,16:1, brak underline |

Łącznie potwierdzono 9 węzłów kontrastu tekstu, 2 linki nierozróżnialne bez koloru, 3 kontenery z niedozwolonym `aria-label` i 21 unikalnych wierszy o błędnej strukturze ARIA. Kontrole disabled oraz wyniki własnego skanera kompozytowego nie są wliczone.

## Aneks B — pomiary DetailPanel

| Profil | Panel `x / width / height` | Pozycja | Modalność | Globalny overflow X |
| --- | --- | --- | --- | ---: |
| 1366 × 768 | 958 / 408 / 768 | absolute | `role=dialog`, `aria-modal=true`, backdrop | 0 |
| 1440 × 900 | 1032,01 / 408 / 900 | absolute | zwykły `aside`, bez backdropu | 0 |
| 1920 × 1080 | 1512,01 / 408 / 1080 | absolute | zwykły `aside`, bez backdropu | 0 |
| 2560 × 1440 | 2152,00 / 408 / 1440 | absolute | zwykły `aside`, bez backdropu | 0 |
| zoom-125 (CSS 1536 × 864) | 1128,00 / 408 / 864 | absolute | zwykły `aside`, bez backdropu | 0 |
| zoom-150 (CSS 1280 × 720) | 872 / 408 / 720 | absolute | `role=dialog`, `aria-modal=true`, backdrop | 0 |

Bounding box panelu przecina bounding box `.ui-module-main` we wszystkich sześciu profilach; jest to dowód geometrii overlay, nie twierdzenie, że w każdym module zasłonięta jest treść o wysokim priorytecie. Pełne wymiary: [`targeted-data.json`](audit-visual-agent-c/targeted-data.json).

## Aneks C — pomiary modala „Edytuj cel”

| Profil | Modal | `clientHeight / scrollHeight` | Overflow | CTA na starcie wewnątrz clipu | Po wheel | Po fokusie CTA | Escape / return focus |
| --- | --- | --- | ---: | ---: | --- | --- | --- |
| 1366 × 768 | x=293,00, y=46,08, w=780, h=675,82 | 676 / 731 | 55 px | ok. 20,5 / 40 px | `scrollTop=55`, pełne CTA | `scrollTop=19`, niemal pełne CTA | zamknięty / `BODY` |
| 1440 × 900 | x=330,00, y=54,01, w=780, h=791,99 | 792 / 847 | 55 px | ok. 21,4 / 40 px | `scrollTop=55`, pełne CTA | `scrollTop=19`, pełne CTA | zamknięty / `BODY` |

CSS modala: `overflow-y:auto`, `scrollbar-width:none`, różnica `offsetWidth-clientWidth=0`. Wheel skierowany na prawą krawędź powierzchni działa; defekt dotyczy odkrywalności i początkowego clippingu, nie całkowitej blokady procesu.

## Aneks D — nazwy screenshotów

Pełna macierz 1440 × 900 (50):

`1440x900__today.png`, `tasks-today`, `tasks-tomorrow`, `tasks-7-days`, `tasks-30-days`, `tasks-unscheduled`, `tasks-all`, `tasks-habits`, `tasks-summary`, `tasks-completed`, `tasks-trash`, `calendar`, `nutrition-today`, `nutrition-meals`, `nutrition-analysis`, `sport-today`, `sport-cycle`, `sport-templates`, `sport-exercises`, `sport-history`, `sport-analysis`, `work-today`, `work-week`, `work-active`, `work-unscheduled`, `work-unassigned`, `work-archive`, `goals-active`, `goals-next`, `goals-week`, `goals-all`, `goals-risk`, `goals-completed`, `goals-archive`, `goal-detail`, `affairs-today`, `affairs-week`, `affairs-all`, `affairs-one-time`, `affairs-recurring`, `affairs-subscriptions`, `affairs-budget`, `affairs-documents`, `affairs-vehicles`, `affairs-jdg`, `affairs-travel`, `travel-alias`, `notes-all`, `notes-pinned`, `notes-archive` — każdy z prefiksem `1440x900__` i sufiksem `.png`.

Macierz reprezentatywna (45): każdy z identyfikatorów `today`, `tasks-today`, `calendar`, `nutrition-today`, `sport-cycle`, `work-today`, `goals-active`, `affairs-budget`, `notes-all` występuje z prefiksem `1366x768__`, `1920x1080__`, `2560x1440__`, `zoom-125__` i `zoom-150__`.

Stany (10):

`1440x900__state-task-row-focus.png`, `1440x900__state-task-detail.png`, `1440x900__state-task-date-picker.png`, `1440x900__state-task-actions-menu.png`, `1440x900__state-goal-menu.png`, `1440x900__state-goal-edit-dialog.png`, `1440x900__state-sport-new-template-dialog.png`, `1440x900__state-work-add-menu.png`, `1440x900__state-nutrition-add-product-dialog.png`, `1440x900__state-affairs-add-dialog.png`.

Reduced motion (5):

`reduced-motion__today.png`, `reduced-motion__tasks-today.png`, `reduced-motion__sport-cycle.png`, `reduced-motion__goals-active.png`, `reduced-motion__affairs-today.png`.

Targeted (18):

`targeted-1366x768__task-detail.png`, `targeted-1440x900__task-detail.png`, `targeted-1920x1080__task-detail.png`, `targeted-2560x1440__task-detail.png`, `targeted-zoom-125__task-detail.png`, `targeted-zoom-150__task-detail.png`, `targeted-1366x768__goal-edit-initial.png`, `targeted-1366x768__goal-edit-primary-focused.png`, `targeted-1440x900__goal-edit-initial.png`, `targeted-1440x900__goal-edit-primary-focused.png`, `targeted-breakpoint-1379__task-detail.png`, `targeted-breakpoint-1381__task-detail.png`, `targeted-breakpoint-759__task-detail.png`, `targeted-breakpoint-761__task-detail.png`, `targeted-1440x900__skip-link-focus.png`, `targeted-1440x900__notes-editor.png`, `targeted-zoom-125__affairs-budget-scroll-reset.png`, `targeted-zoom-150__affairs-budget-scroll-reset.png`.
