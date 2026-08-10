# Rootine — audyt tras, funkcji i ciągłości stanu (Agent A)

Data audytu: 2026-08-10  
Repozytorium: `C:\dev\rootine`  
Zakres: kompletna inwentaryzacja tras, podtras, linków głębokich, przekierowań, archetypów ekranów, głównych powierzchni interakcji i stanów funkcjonalnych. Audyt jest odczytowy; nie zmieniono `src/`, konfiguracji produkcyjnej ani testów repozytorium.

## 1. Jak czytać poziom dowodu

Wyniki celowo rozdzielają trzy warstwy weryfikacji:

- **`kod`** — zachowanie potwierdzone inspekcją implementacji lub testu, ale nie wykonane w tej sesji w przeglądarce;
- **`funkcja`** — zachowanie potwierdzone wykonanym testem Vitest/Playwright albo celowanym odczytem DOM w żywej aplikacji;
- **`wizualnie`** — bezpośrednio oceniony wygląd na renderze/zrzucie; w tym raporcie nie oceniano pikseli, aby nie dublować audytu wizualnego, więc przeważnie występuje `nieweryfikowalne`;
- **`nieweryfikowalne`** — potrzebne środowisko produkcyjne, konto, uprawnienia, prawdziwy backend, manualny render lub scenariusz niewykonany w tej sesji;
- **`brak implementacji`** — mechanizmu nie ma w kodzie, niezależnie od tego, czy produkt go obecnie wymaga.

Priorytety są zgodne z briefem: P0 — awaria/utrata danych/blokada kluczowego procesu; P1 — problem systemowy, poważna niespójność lub problem użyteczności; P2 — problem lokalny, lecz zauważalny; P3 — drobny polish.

## 2. Podsumowanie wykonawcze

Najpoważniejszy wynik to **potwierdzona funkcjonalnie utrata świeżo dodanej pracy w module Praca po szybkiej nawigacji**. Zapis jest odroczony o 260 ms i anulowany podczas unmountu bez flushowania. Celowany test DOM odtworzył utratę: wpis był widoczny przed przejściem do Dzisiaj i nie istniał po powrocie do Pracy.

Drugi problem o dużym wpływie dotyczy ciągłości tras produkcyjnych: router obsługuje `/odzywianie/posilki` i `/odzywianie/analiza`, ale `vercel.json` nie ma dla nich rewrite. Wdrożenie Cloudflare ma poprawny fallback SPA, natomiast Vercel może zwrócić serwerowe 404 przy bezpośrednim otwarciu lub reloadzie tych adresów.

Ogólna ocena funkcjonalna jest mimo to dobra. Rootine ma spójny lokalny model danych, migracje, odzyskiwanie uszkodzonych rekordów, kolejkę zapisów, obsługę konfliktów i cross-tab. Szczególnie dobrze zachowują stan Cele, Notatki, Sport i Podróże. Największa nierówność dotyczy formularzy roboczych i destrukcyjnych akcji: Notatki i Sport chronią szkice, podczas gdy Praca, Sprawy, Podróże oraz część Odżywiania nie zapewniają równoważnej ochrony.

### Bilans ustaleń

| Priorytet | Liczba | Najważniejszy temat |
|---|---:|---|
| P0 | 1 | Utrata świeżej zmiany w Pracy przy szybkiej nawigacji |
| P1 | 2 | Niepełne rewrite tras Vercel; systemowo nierówna ochrona niezapisanych formularzy |
| P2 | 7 | JDG month deep link, martwy projekt Pracy, słabe linki kontekstowe, data Odżywiania, destrukcje, powrót z celu, inicjalny sync |
| P3 | 5 | Martwe preferencje Zadań, drift audytu tras, niekanoniczny query Spraw, natywny confirm/dead branch, ulotne dismissale |

## 3. Źródła prawdy i architektura nawigacji

- Router i deklaratywny audyt layoutu: `src/app/routes.ts:29-49`, `src/app/routes.ts:52-86`.
- Rejestr 8 kanonicznych modułów i własność tras zagnieżdżonych: `src/app/moduleRegistry.ts:39-63`.
- Lazy loading oraz prefetch po hover/focus/idle z wyłączeniem wolnych łączy i możliwością ponowienia po błędzie: `src/app/routePrefetch.ts:1-94`.
- Globalne providery: Supabase auth, persistence, experience, activity log, goals, router i globalne przypomnienia Spraw: `src/app/App.tsx:1-48`.
- Powłoka, aktywna pozycja nawigacji, mobilny drawer, skróty i focus trap: `src/app/layout/Layout.tsx:165-181`, `228-276`, `472-478`, `531-591`, `688-723`.
- Pamięć modułów i scrolla: `src/app/experience/moduleMemory.ts:13-28`, `53-93`, `96-117`; integracja powłoki: `src/app/ui/components/Shell.tsx:153-195`.

Kanoniczne moduły: **Dzisiaj, Zadania, Odżywianie, Sport, Praca, Cele, Sprawy, Notatki**. Kalendarz należy nawigacyjnie do Zadań, a Podróże do Spraw; matcher aktywnego modułu uwzględnia ich trasy potomne (`src/app/moduleRegistry.ts:56-63`).

## 4. Kompletna inwentaryzacja tras

### 4.1 Trasy routera

| Trasa | Właściciel / archetyp | Stan adresowalny | Dowód |
|---|---|---|---|
| `/` | redirect startowy | zawsze do `/dzisiaj` | `kod`, `src/app/routes.ts:52-56` |
| `/dzisiaj` | Dzisiaj; dashboard/aggregator dnia | brak podtrasy; linki do kontekstu modułów | `kod` + `funkcja`, `src/app/routes.ts:64`; E2E navigation |
| `/zadania` | Zadania; lista + panel szczegółów | `widok`, komendy `akcja/tytul/data/godzina/priorytet` | `kod` + `funkcja`, `src/app/routes.ts:65`, `src/app/pages/Zadania.tsx:103-110` |
| `/kalendarz` | Zadania; siatka miesiąca + popover/panel | miesiąc i filtry lokalne, bez query | `kod` + `funkcja`, `src/app/routes.ts:66`, `src/app/pages/Kalendarz.tsx:253-316` |
| `/notatki` | Notatki; kolekcja + edytor | `widok`, `q`, `sort`; lista/tag w `widok` | `kod`, `src/app/pages/Notatki.tsx:144-155`, `202-244` |
| `/cele` | Cele; agenda/kolekcja + panel | `widok`, `uklad`, `sort`, `zakres`, `cel` | `kod` + `funkcja`, `src/app/goals/goalViewState.ts:1-24`, `50-87` |
| `/cele/:goalId` | Cele; pełny widok szczegółowy | identyfikator celu w path | `kod` + `funkcja`, `src/app/routes.ts:69`, `src/app/pages/CelSzczegoly.tsx:89-100` |
| `/sport` | Sport; planner + panel/sesja pełnoekranowa | `widok`, `tydzien`; komendy globalne | `kod`, `src/app/pages/Sport.tsx:152-168`, `391-437` |
| `/odzywianie` | Odżywianie; dziennik dnia | początkowo `data`; bieżąca data potem w memory | `kod` + `funkcja`, `src/app/pages/Odzywanie.tsx:89-103` |
| `/odzywianie/posilki` | Odżywianie; biblioteka + edytor posiłków | podtrasa path | `kod`, `src/app/routes.ts:72` |
| `/odzywianie/analiza` | Odżywianie; analiza | podtrasa path; zakres lokalny | `kod`, `src/app/routes.ts:73` |
| `/praca` | Praca; workspace/tabela/drzewo + detail | `widok`, `firma`, `projekt`, `q` | `kod` + `funkcja`, `src/app/work/workPresentation.tsx:257-277` |
| `/sprawy` | Sprawy; agenda/rejestr/workspace + detail | `widok`; komendy globalne | `kod` + `funkcja`, `src/app/pages/Sprawy.tsx:122-154` |
| `/podroze` | Sprawy; dossier podróży | lista/start lub legacy embedded query | `kod` + `funkcja`, `src/app/routes.ts:76` |
| `/podroze/:tripId` | Sprawy; dossier konkretnej podróży | `sekcja` | `kod` + `funkcja`, `src/app/pages/Podroze.tsx:143-251` |
| `/biuro` | legacy redirect | `/praca` | `kod`, `src/app/routes.ts:79` |
| `/finanse` | legacy redirect | `/sprawy?widok=budget` | `kod`, `src/app/routes.ts:80` |
| `/jdg` | legacy redirect | `/sprawy?widok=jdg` | `kod`, `src/app/routes.ts:81` |
| `*` | stan nieznanej trasy | własny ekran 404 i link do Dzisiaj | `kod`, `src/app/routes.ts:82`, `src/app/RouteStates.tsx:127-145` |

Wizualny render wszystkich tras w tym raporcie: **`nieweryfikowalne`**; przypisanie layoutu i h1 sprawdzono tylko w kodzie oraz semantycznych testach DOM.

### 4.2 Zakładki, podzakładki i nested views

| Moduł | Główne widoki / podzakładki | Dalsze powierzchnie |
|---|---|---|
| Dzisiaj | bilans dnia, moduły dnia, nawyki, priorytety | globalne Dodaj/Command Center, replay dnia, ustawianie kolejności i ukrywania modułów |
| Zadania | `dzis`, `jutro`, `7dni`, `30dni`, `bezterminu`, `wszystkie`, `nawyki`, `podsumowanie`, `ukonczone`, `kosz`; alias `skrzynka → bezterminu` | listy, tagi, filtr priorytetu, list/calendar, multiselect, bulk bar, panel zadania, quick task/habit, recurrence/reminder/date popovers, taxonomy/delete/purge/empty-trash dialogs |
| Kalendarz | miesiąc + agenda nadmiarowa; sidebar widoków Zadań | filtr all/list/tag/priority, anchored popover, read-only external occurrence, panel zadania, quick add |
| Notatki | wszystkie, przypięte, archiwum, lista, tag; cards/list | wyszukiwanie, sort, pełny edytor, checklisty, list/tag/delete dialogs, dirty-state dialog |
| Cele | następne kroki, tydzień, overview, active/on-track/risk/paused/completed/planned/archived/category; list/grid | scope celu, panel szybkich szczegółów, pełny `/cele/:id`, etapy, wpisy postępu, powiązane zadania, historia, settings/import/export |
| Sport | `today`, `cycle`, `templates`, `exercises`, `history`, `analysis`; `tydzien` | planner cyklu, biblioteki, panele szablonu/ćwiczenia, modal treningu, aktywna sesja pełnoekranowa, replan/delete/undo |
| Odżywianie | Dzisiaj, Moje posiłki, Analiza | dzień, posiłki i produkty, wyszukiwanie online/manual, nawodnienie, masa, cele, kalkulator, własne posiłki; zakres analizy 7/14/30/90/custom |
| Praca | today, week, active, bezterminu/untimed, unassigned, archive, company, project | agenda, tabela aktywnych, rejestr firm/projektów, dossier projektu i drzewo zadań, panel zadania, filtry/sort/search, modale firmy/projektu/zadania/delete/discard |
| Sprawy | today, week, all, oneTime, payments, subscriptions, documents, vehicles, budget, jdg, travel | agenda/rejestry/workspaces, panel sprawy, wspólny edytor rekordów, delete dialog, budżet miesięczny |
| JDG | miesięczny cockpit/checklista | obowiązki, dowody, linked tasks, undo, miesiąc lokalny |
| Podróże | Pulpit, Plan podróży, Rezerwacje, Budżet, Dokumenty, Zadania | selektor podróży, dossier, edytor 7 typów wpisu, archiwizacja/usuwanie, część undo |

### 4.3 Globalne i kontekstowe powierzchnie UI

- Nawigacja: desktop app sidebar, kontekstowy sidebar modułu, mobile bottom navigation oraz dialog „Więcej”.
- Warstwy globalne: Command Center, Day Replay, Recovery Center, Settings, Profile/Account/Auth, pomoc/skróty, notification toasts i permission prompts.
- Warstwy treści: detail panel, modal, confirm dialog, menu/popover, DatePicker portal, Select/listbox, formularz inline lub dialogowy, toast/undo.
- Odczyt statyczny znalazł około 48 użyć `<Modal` w 24 plikach, 7 użyć `<ConfirmDialog` w 4 plikach, 78 użyć `<Menu` w 14 plikach, 27 znaczników `<form` w 18 plikach, 109 użyć `<Select` w 26 plikach i 41 użyć `<DatePicker` w 14 plikach. To liczba wystąpień w kodzie, nie liczba jednoczesnych runtime overlays.

## 5. Ciągłość stanu: back/forward/reload/selection/scroll

| Obszar | URL i back/forward | Reload i pamięć lokalna | Ocena dowodu |
|---|---|---|---|
| Dzisiaj | route stabilny; linki modułowe; brak podwidoków URL | dane odświeżane z repozytoriów; kolejność/ukrycie modułów jako preferencje | `kod` + część `funkcja`; wizualnie `nieweryfikowalne` |
| Zadania | `widok` czytany z URL; zwykłe przejścia między modułami działają; detail/filtry/lista/tag/selection nie są deep-linkowane | dane persist; część sidebar preferences jest zapisywana, ale nieodtwarzana; widok główny resetuje się zgodnie z testem nawigacji | `kod` + `funkcja`, `e2e/navigation.spec.ts:78-87` |
| Kalendarz | brak query dla miesiąca/filtrów; back nie rekonstruuje tych stanów | miesiąc i collapse groups przez module memory; filtr resetuje się | `kod` + `funkcja`, `src/app/pages/Kalendarz.tsx:253-316` |
| Notatki | jawny `popstate`; kanoniczne query `widok/q/sort` | layout w localStorage; szkic w sessionStorage, flush pagehide i beforeunload | `kod`, `src/app/pages/Notatki.tsx:254-358` |
| Cele | React Router search params; stan walidowany i kanonizowany | widok/layout/sort/scope/selected przeżywają reload; defaults layout/sort w localStorage | `kod` + `funkcja`, `src/app/pages/Cele.tsx:109-198` |
| Sport | jawny `popstate`; `widok/tydzien` synchronizowane w URL | workspace flushuje lifecycle; szkic cyklu w sessionStorage; beforeunload i guards | `kod`, `src/app/pages/Sport.tsx:330-505` |
| Odżywianie | path utrzymuje subtab; `data` działa jako komenda wejściowa, dalsze zmiany daty nie aktualizują URL | selectedDate w module memory; zakres analizy lokalny; dane persist | `kod`, `src/app/pages/Odzywanie.tsx:95-143`, `1023-1026` |
| Praca | jawne query dla view/company/project/search; `popstate` odtwarza kontekst | dane zwykle persist, ale 260 ms debounce tworzy P0; filtry/sort/selection lokalne | `kod` + `funkcja` P0 |
| Sprawy | `popstate` odtwarza tylko `widok`; filtry, selekcja i miesiąc budżetu lokalne | workspace persist; formularze nie mają draft persistence | `kod` |
| JDG | wygenerowany `month` nie jest konsumowany; back/reload nie rekonstruują wskazanego miesiąca | miesiąc startuje od bieżącego | `kod` |
| Podróże | trip i section są adresowalne; invalid trip ma bezpieczny fallback/redirect | workspace persist; formularze bez draft guard | `kod` + `funkcja` |
| Scroll | route-owner key + wykrywane scroll containers; zapis i przywrócenie po 2 RAF | wersjonowana pamięć, walidator per moduł, flush przy cleanup | `kod`, `src/app/experience/moduleMemory.ts:13-28`, `53-117` |

### Szczegółowy bilans parametrów

| Typ stanu | Najmocniejsza implementacja | Słabsza / lokalna implementacja |
|---|---|---|
| Data/okres | Sport `tydzien` w URL; Podróże `sekcja` | Kalendarz month memory; Odżywianie date memory; JDG month lokalny i niespójny; Budżet Spraw lokalny |
| Filtry | Cele i Notatki w URL | Zadania, Kalendarz, Sprawy, Podróże, zakres analizy Odżywiania lokalnie |
| Sort | Cele i Notatki w URL | Praca advanced sort/filter lokalnie; inne rejestry lokalnie |
| Search | Notatki i Praca w URL | część wyszukiwań produktowych/formularzowych lokalnie |
| View mode | Cele w URL + defaults; Notes layout localStorage | Task viewmode ma zapis, lecz brak konsumenta; część widoków to stan lokalny |
| Selection | Cele `cel`, Podróże trip/section, Praca company/project | task detail, calendar item, note, sport template/exercise i sprawa są lokalne |
| Scroll | wspólna module memory | best-effort; brak gwarancji dla wirtualizowanych lub niestandardowych kontenerów |

## 6. Problemy P0–P3

### RF-01 — P0 — Praca traci świeżą zmianę przy szybkiej nawigacji

**Warstwa dowodu:** `kod` + `funkcja`; wizualnie `nieweryfikowalne`.

`Praca` planuje zapis workspace dopiero 260 ms po zmianie, a cleanup efektu kasuje timer bez wykonania zapisu (`src/app/pages/Praca.tsx:172-187`). Drugi cleanup także tylko kasuje timer (`src/app/pages/Praca.tsx:201-205`). `showSaveNotice` zmienia stan komunikatu, ale nie zapisuje danych (`src/app/pages/Praca.tsx:207-213`). Mutacja szybkiego zadania jest wykonywana w pamięci przy `src/app/pages/Praca.tsx:436-455`; podobny los mają mutacje edytora `489-610`.

Dolny lifecycle flush repozytorium (`src/app/data/localRepository.ts:288-301`) nie pomaga, bo zapis Pracy nie został jeszcze przekazany do kolejki. Dla kontrastu Sport flushuje bieżący workspace przy `pagehide`, hidden i unmount (`src/app/pages/Sport.tsx:330-351`).

Celowany live DOM probe:

1. otwarto `/praca` i poczekano na hydrację;
2. dodano unikatowe zadanie przez `.work-quick-entry input`;
3. natychmiast kliknięto Dzisiaj;
4. wrócono do `/praca`.

Wynik: `visibleBefore=1`, `visibleAfter=0`, `lostAfterRapidNavigation=true` dla `AUDYT-SZYBKI-ZAPIS-1786357114584`.

**Skutek:** normalny szybki klik po dodaniu/edycji może bez ostrzeżenia utracić dane. **Kierunek naprawy:** flush bieżącego snapshotu w cleanup/pagehide/hidden albo kolejka zapisu, której nie anuluje unmount; test regresyjny szybkiej nawigacji.

### RF-02 — P1 — Vercel nie obsługuje reloadu dwóch kanonicznych nested routes Odżywiania

**Warstwa dowodu:** `kod`; funkcja na prawdziwym Vercel `nieweryfikowalne`; wizualnie `nieweryfikowalne`.

Router deklaruje `/odzywianie/posilki` i `/odzywianie/analiza` (`src/app/routes.ts:71-73`), ale rewrite Vercel zawiera tylko `/odzywianie` (`vercel.json:6-22`). Nie ma też ogólnego fallbacku. Produkcyjny smoke sprawdza jedynie `/odzywianie` (`scripts/smoke-production.mjs:12-19`), więc luka nie jest wykrywana. README obiecuje browser-route rewrites (`README.md:25-35`). Cloudflare jest odporny dzięki `not_found_handling: "single-page-application"` (`wrangler.jsonc:6-12`).

**Skutek:** bookmark, paste URL lub reload na dwóch kanonicznych widokach może zakończyć się 404 na Vercel. **Kierunek:** catch-all SPA rewrite albo kompletna lista tras oraz smoke obu nested routes.

### RF-03 — P1 — Ochrona niezapisanych formularzy jest systemowo nierówna

**Warstwa dowodu:** `kod`; pełne scenariusze wszystkich formularzy `nieweryfikowalne`.

Pozytywny wzorzec istnieje: Notatki zapisują szkic w sessionStorage, flushują na pagehide i ostrzegają przed unloadem (`src/app/pages/Notatki.tsx:94-141`, `254-328`); Sport robi to dla szkicu cyklu i blokuje zmianę widoku/trasy (`src/app/pages/Sport.tsx:369-389`, `444-505`).

Niespójne miejsca:

- Praca ma dirty guard tylko dla zamknięcia własnego modala (`src/app/pages/Praca.tsx:478-487`, dialog przy `1773`), ale globalna nawigacja unmountuje moduł poza tym guardem.
- Cele mają szczególnie długi `GoalFormDialog`: stan obejmuje ok. 20 właściwości celu (`src/app/goals/GoalDialogs.tsx:239-259`), a właściwy formularz ciągnie się przez `300-632`. `DialogShell`, Escape i przycisk Anuluj wywołują bezpośrednio `onClose` (`300-305`, `628-632`), bez baseline/dirty/draft. Dwa główne callsite'y po prostu zerują stan dialogu: lista Celów (`src/app/pages/Cele.tsx:844-855`) i pełny widok celu (`src/app/pages/CelSzczegoly.tsx:319`). Tak samo zamykane są krótsze Progress/Milestone dialogs (`src/app/pages/Cele.tsx:857-873`, `src/app/pages/CelSzczegoly.tsx:320-321`). Wyjątek: inline `GoalNoteTextarea` flushuje pending note na pagehide/beforeunload (`src/app/goals/GoalNoteTextarea.tsx:56-60`), więc luka dotyczy formularzy dialogowych, nie każdej edycji celu.
- Sprawy zamykają edytor przez samo `setEditor(null)` (`src/app/pages/Sprawy.tsx:436-439`), mimo złożonych pól i wielu typów rekordu (`1641-1670`).
- Podróże analogicznie czyszczą edytor (`src/app/pages/Podroze.tsx:366-369`) obejmujący siedem typów danych (`1473-1656`).
- Odżywianie ma rozbudowane formularze celu, kalkulatora, produktu, posiłku i masy bez wspólnego draft lifecycle/dirty guard. Trzy closery strony wyłącznie zerują stan i błędy (`src/app/pages/Odzywanie.tsx:276-299`); callsite'y to dialog produktu/wpisu (`1371-1374`), masy (`1524-1527`) i dwa warianty celu/kalkulatora (`1597`, `1620`). Osobne edytory własnych posiłków także dostają bezpośrednie closery (`src/app/nutrition/NutritionCustomMeals.tsx:197-211`).

Skala w kodzie:

| Powierzchnia | Dirty detection | Close guard | Draft po reloadzie | Callsite'y / typy |
|---|---|---|---|---|
| Notatki — edytor | tak | tak, discard dialog | tak, sessionStorage | 1 główny edytor; `src/app/pages/Notatki.tsx:422-481`, `1417-1426` |
| Sport — szkic cyklu | tak | tak, save/discard + blokady przejść | tak, sessionStorage | planner cyklu; `src/app/pages/Sport.tsx:444-505`, `1283-1340` |
| Praca — modal record | tak | tak tylko wewnątrz modala | nie | 3 typy: company/project/task; `src/app/pages/Praca.tsx:478-487`, `1725-1773` |
| Cele — GoalForm | nie | nie | nie | 2 główne callsite'y, ok. 20 pól; `src/app/pages/Cele.tsx:844-855`, `src/app/pages/CelSzczegoly.tsx:319` |
| Cele — progress/milestone | nie | nie | nie | callsite'y listy i pełnego celu; `src/app/pages/Cele.tsx:857-873`, `src/app/pages/CelSzczegoly.tsx:320-321` |
| Odżywianie | nie | nie | nie | co najmniej 6 rodzin formularzy: entry/product, weight, goals, calculator, custom meal editor, quick add |
| Sprawy | nie | nie | nie | 1 wspólny edytor obejmujący wiele typów rekordu |
| Podróże | nie | nie | nie | 1 wspólny edytor obejmujący 7 typów rekordu |

Uwaga: ochrona Sportu jest potwierdzona dla szkicu cyklu; ten wynik nie oznacza, że każdy pomocniczy modal Sportu ma własny dirty guard.

**Skutek:** Escape, kliknięcie poza modal, zmiana modułu, back lub reload może skasować długi szkic bez ostrzeżenia. **Kierunek:** jeden kontrakt dirty/draft dla wszystkich długich formularzy i jednolite zachowanie route/unload/close.

### RF-04 — P2 — JDG generuje deep link z `month`, którego nie odczytuje

**Warstwa dowodu:** `kod`; funkcja `nieweryfikowalne` w live DOM.

Miesiąc inicjalizuje się zawsze przez `getJdgMonthKey` (`src/app/pages/Jdg.tsx:139`) i zmienia wyłącznie lokalny state (`189-195`). Jednocześnie linki źródłowe zapisują `month=${monthKey}` (`463-476`, ponownie `540-553`). W pliku nie ma `useSearchParams` ani parsera `month`.

**Skutek:** zadanie powiązane z historycznym miesiącem otwiera aktualny cockpit, choć URL deklaruje inny miesiąc. **Kierunek:** walidowany query jako source of truth, canonical replace dla błędnej wartości i test reload/back.

### RF-05 — P2 — Nieaktualny deep link projektu Pracy renderuje pusty workspace

**Warstwa dowodu:** `kod`; live reprodukcja `nieweryfikowalne`.

Sama obecność `projekt` wymusza view `project`, a ID jest przyjmowany surowo (`src/app/work/workPresentation.tsx:257-277`). `Praca` kanonizuje niepoprawną firmę, lecz nie analogicznie projekt (`src/app/pages/Praca.tsx:250-256`). `renderProjectView` zwraca `null`, jeśli projekt nie istnieje (`1398-1400`), a końcowy branch nadal go zwraca (`1559-1567`).

**Skutek:** stary bookmark lub link do usuniętego projektu daje nagłówek „Projekt” i pustą treść zamiast komunikatu/fallbacku. **Kierunek:** walidacja ID i replace do bezpiecznego widoku lub jawny not-found state.

### RF-06 — P2 — Link z celu do powiązanego zadania nie wskazuje zadania

**Warstwa dowodu:** `kod`.

Każdy linked task w pełnym widoku celu jest zwykłym `<a href="/zadania">` bez identyfikatora, widoku i daty (`src/app/pages/CelSzczegoly.tsx:304-308`). Powoduje pełny reload i otwiera domyślny kontekst. Zadanie przyszłe lub bez terminu może nie być widoczne. Kierunek odwrotny — zadanie do celu — zawiera lepszy link źródłowy (`src/app/pages/tasks/TaskViews.tsx:161-164`, `524-527`).

**Skutek:** CTA „Otwórz w zadaniach” nie gwarantuje wykonania obietnicy. **Kierunek:** adresowalny task selection/detail lub przynajmniej deterministyczny widok + highlight.

### RF-07 — P2 — Karta dzisiejszego Odżywiania może otworzyć zapamiętany inny dzień

**Warstwa dowodu:** `kod`.

Dzisiaj wylicza summary dla `todayKey` (`src/app/pages/Dzisiaj.tsx:497-508`), lecz CTA prowadzi do ogólnego `APP_MODULE_BY_ID.nutrition.to` (`709-711`). Odżywianie odtwarza `selectedDate` z module memory (`src/app/pages/Odzywanie.tsx:95-103`) i zapisuje ją ponownie (`141-143`); zmiana dnia nie synchronizuje query (`1023-1026`). Infrastruktura komendy umie przyjąć `data` (`src/app/nutrition/useNutritionCommandAction.ts:35-59`), ale karta Dzisiaj go nie przekazuje.

**Skutek:** użytkownik klika informacje o dzisiejszych kaloriach, po czym widzi np. wczorajszy dziennik. **Kierunek:** link z `data=today` lub jawne resetowanie daty dla tego entry pointu.

### RF-08 — P2 — Destrukcyjne akcje mają nierówny poziom odwracalności

**Warstwa dowodu:** `kod`; pełne interakcje `nieweryfikowalne`.

- Sprawy potwierdzają usunięcie wszystkich typów, ale nie zapewniają undo (`src/app/pages/Sprawy.tsx:476-513`, `1673-1679`).
- Podróże dają undo dla całej podróży (`src/app/pages/Podroze.tsx:632-659`, `940-945`), lecz elementy planu/rezerwacji/budżetu/dokumentów/zadań są nieodwracalne mimo confirm (`603-614`, `1659-1673`).
- Najnowszy pomiar masy w Odżywianiu usuwa się jednym kliknięciem, bez confirm/undo (`src/app/pages/Odzywanie.tsx:675-684`, button `1341`).
- Pełny widok celu ma confirm, ale nie undo (`src/app/pages/CelSzczegoly.tsx:319-324`), podczas gdy lista Celów oferuje undo (`src/app/pages/Cele.tsx:904-909`).
- Sport usuwa szablon przez natywny `window.confirm` bez undo (`src/app/pages/Sport.tsx:1360-1365`).

Pozytywne wyjątki: kosz/restore/purge Zadań, undo Notatek, Pracy, pełnej Podróży, wybranych operacji Sportu i JDG.

### RF-09 — P2 — Powrót z pełnego celu traci stan listy; invalid goal łamie kontrakt h1

**Warstwa dowodu:** `kod`.

Przycisk back w szczegółach zawsze wykonuje `navigate("/cele")` (`src/app/pages/CelSzczegoly.tsx:234`), mimo że lista Celów koduje w URL `widok/uklad/sort/zakres/cel` (`src/app/goals/goalViewState.ts:1-24`, `50-87`). Użytkownik wraca więc do domyślnego kontekstu, a nie do miejsca wyjścia.

Dodatkowo invalid `/cele/:goalId` renderuje `<h2>` i nie używa route ContentHeader (`src/app/pages/CelSzczegoly.tsx:89-100`), choć deklaracja trasy mówi `h1: route` (`src/app/routes.ts:35`).

**Kierunek:** zachować `location.state/from` lub search context oraz wystawić semantyczny h1 również w stanie not-found.

### RF-10 — P2 — Inicjalny remote sync może bezterminowo zasłaniać aplikację

**Warstwa dowodu:** `kod`; prawdziwy hang sieci/backendu `nieweryfikowalne`.

Po zalogowaniu provider uruchamia `startRemoteWorkspaceSync` (`src/infrastructure/supabase/RemotePersistenceProvider.tsx:35-94`) i pokazuje globalny loader, dopóki `readyUserId` nie zrówna się z user ID (`97-106`). W tym providerze nie ma timeoutu ani ręcznego przejścia do trybu lokalnego. Jawny błąd kończy się fallbackiem local-first (`76-88`), ale promise, który nigdy się nie rozstrzyga, utrzymuje blocker.

**Kierunek:** ograniczony czas inicjalnego oczekiwania, retry/cancel i czytelne „Kontynuuj lokalnie”.

### RF-11 — P3 — Preferencje widoku Zadań są częściowo martwe

**Warstwa dowodu:** `kod` + intencja `funkcja` z istniejącego E2E.

`loadTasksViewMode/saveTasksViewMode` istnieją (`src/app/pages/tasks/taskPageModel.ts:143-163`), ale loader nie ma konsumenta. Sidebar zapisuje `taskView/listFilter/tagFilter` (`166-207`), podczas gdy `Zadania` inicjalizują widok z URL, a filters jako null (`src/app/pages/Zadania.tsx:103-110`); odtwarzane są tylko grupy collapse (`242-264`). Kalendarz także odtwarza collapse, po czym zapisuje default filter/view (`src/app/pages/Kalendarz.tsx:253-316`). Test nawigacji świadomie oczekuje powrotu do głównego widoku Zadań (`e2e/navigation.spec.ts:78-87`), więc nie jest to automatycznie błąd UX, lecz martwy/stający się mylący kontrakt persistence.

### RF-12 — P3 — `ROUTE_LAYOUT_AUDIT` nie zgadza się z runtime h1 dla 404

**Warstwa dowodu:** `kod`.

Tabela deklaruje dla `*` `h1: "none"` (`src/app/routes.ts:49`), ale `RouteNotFoundState` używa ramy stanu trasy z h1 (`src/app/RouteStates.tsx:41-47`, `127-145`). Runtime jest lepszy niż dokumentacja; problemem jest drift audytowego źródła prawdy.

### RF-13 — P3 — Niepoprawny `widok` Spraw nie jest kanonizowany

**Warstwa dowodu:** `kod`.

Parser mapuje nieznany `widok` do today (`src/app/affairs/affairsPresentation.ts:289-299`), ale mount `Spraw` nie wykonuje replace URL. Adres nadal komunikuje nieistniejący stan do chwili następnej nawigacji. Funkcja działa, lecz link/share/debugging są mniej jednoznaczne.

### RF-14 — P3 — Niespójne confirmy i martwy branch JDG

**Warstwa dowodu:** `kod`.

Sport używa natywnego `window.confirm` w części operacji (`src/app/pages/Sport.tsx:682`, `916-925`, `1360-1365`) zamiast wspólnego dialogu. W JDG występuje drugi, praktycznie nieosiągalny wariant renderowania linked-task po wcześniejszym returnie (`src/app/pages/Jdg.tsx:500-560`), który powiela także błędny query `month`. To ryzyko rozjazdu i polish, nie potwierdzony błąd danych.

### RF-15 — P3 — Część dismissali/reminderów jest tylko stanem komponentu

**Warstwa dowodu:** `kod`.

Wybrane dismissale przypomnień/toastów żyją wyłącznie w stanie komponentu, więc po reloadzie lub ponownym wejściu komunikat może wrócić. Bez badania oczekiwanej polityki produktu nie jest to P2; wymaga doprecyzowania, czy dismissal ma być „na sesję”, „na dzień” czy trwały.

## 7. Formularze, walidacja, błędy i read-only

### 7.1 Walidacja potwierdzona w kodzie

- Podróże: wymagana nazwa, zakres dat, daty wewnątrz podróży, kolejność departure/arrival, waluta ISO, kwoty (`src/app/pages/Podroze.tsx:371-600`).
- Praca: nazwy, firma projektu, zakres dat projektu i pola typów rekordów (`src/app/pages/Praca.tsx:489-610`).
- Odżywianie: nawodnienie 0–20000 ml (`src/app/pages/Odzywanie.tsx:605-614`), pomiar masy z datą i zakresem, kontrola zamkniętego dnia (`171-172`, `624-684`).
- Zadania: normalizacja widoku, dat, recurrence i źródeł; testy workspace i repozytorium przeszły.
- Persistence: wersjonowanie, walidacja i migracja każdego workspace; dane corrupt nie są cicho nadpisywane (`src/app/data/localRepository.ts:934-951`, `1048-1072`).

### 7.2 Macierz stanów funkcjonalnych

| Stan | Implementacja | Pokrycie |
|---|---|---|
| Route loading | skeleton, `aria-live`/sr status | `kod`, `src/app/RouteStates.tsx:55-99`; wizualnie `nieweryfikowalne` |
| Route error | ErrorBoundary route z powrotem do Dzisiaj | `kod`, `src/app/RouteStates.tsx:101-125`; failure-injection E2E obecnie niestabilny |
| 404 | jawny not-found state | `kod`, `src/app/RouteStates.tsx:127-145` |
| Empty states | obecne w listach/rejestrach, zwykle z akcją startową | `kod`; kompletność wizualna `nieweryfikowalne` |
| Offline product search | manual entry pozostaje dostępny; Retry-After komunikowany | `kod` + istniejący E2E `e2e/production-validation.spec.ts:151-190`; w tej sesji nieuruchomiony |
| Corrupt local data | recovery copy/index + Recovery Center | `kod` + `funkcja` unit tests |
| Storage quota / permission | issue model z retry/recovery, brak cichego sukcesu | `kod` + `funkcja` unit tests |
| Concurrent tabs | BroadcastChannel, CAS/conflict, protected draft | `kod` + `funkcja` unit tests; Sport pokazuje konflikt `src/app/pages/Sport.tsx:353-367` |
| Read-only | external Calendar occurrences; źródłowo zarządzane linked tasks; closed nutrition day | `kod` |
| Role/ACL read-only | brak systemu ról/uprawnień w UI; single-user/local-first poza RLS auth | `brak implementacji`; potrzeba produktu `nieweryfikowalne` |
| Notification permission | browser permission workflow | `kod`; prawdziwa decyzja użytkownika `nieweryfikowalne` |
| Initial remote sync | loader + local fallback po jawnym błędzie | `kod`; hang i realny backend `nieweryfikowalne` |
| Rapid clicks | część przycisków disable/dedupe, ale P0 Pracy potwierdzony | `kod` + `funkcja` |

Read-only jest semantycznie rozpoznany m.in. dla zewnętrznych wystąpień Kalendarza (`src/app/pages/Kalendarz.tsx:1285-1358`), zadań zarządzanych przez źródło (`src/app/pages/tasks/TaskViews.tsx:490-693`) i zamkniętego dnia Odżywiania. Nie istnieje natomiast ogólny tryb „viewer” ani per-module permissions.

## 8. Persistence, migracje i integralność danych

`localRepository` jest jednym z najmocniejszych elementów aplikacji:

- jawne statusy `missing/ok/migrated/corrupt` (`src/app/data/localRepository.ts:7-14`);
- typy problemów conflict/corrupt/quota/permission/unknown i retry metadata (`27-45`);
- manifest IndexedDB oraz warstwy cache/storage (`63-90`);
- lifecycle flush `pagehide` i `visibilitychange` (`288-301`);
- migracje legacy i odroczone zapisy (`791-926`);
- odzyskiwanie danych uszkodzonych bez ich cichego zniszczenia (`934-1072`);
- CAS i wykrywanie konfliktów (`1086-1204`);
- kolejka/debounce zapisów tiered oraz `flushLocalWorkspaceWrites` (`1212-1357`);
- export poprzedzony flush (`1734-1741`);
- subscriptions i BroadcastChannel/cross-tab (`1918-1952`).

Celowany zestaw 10 plików Vitest potwierdził migracje, recovery/corrupt, pagehide flush, quota/conflicts i domenowe workspace: **71/71 testów przeszło**.

Słaby punkt nie leży więc w samym repozytorium, lecz w adapterach modułów, które muszą faktycznie przekazać zmianę do kolejki przed unmountem — czego nie robi Praca w oknie 260 ms.

## 9. Testy wykonane i wiarygodność QA

### 9.1 Testy wykonane w tej sesji

1. Vitest:

   `npm test -- src/app/data/localRepository.test.ts src/app/data/workWorkspace.test.ts src/app/data/taskWorkspace.test.ts src/app/data/nutritionWorkspace.test.ts src/app/data/jdgWorkspace.test.ts src/app/data/travelWorkspace.test.ts src/app/sport/sportPersistence.test.ts src/app/experience/moduleMemory.test.tsx src/app/goals/goalViewState.test.ts src/app/pages/Kalendarz.test.tsx`

   Wynik: **10/10 plików, 71/71 testów passed**.

2. Playwright desktop-1440 + mobile-390:

   `npx playwright test e2e/navigation.spec.ts e2e/persistence.spec.ts e2e/work.spec.ts e2e/affairs.spec.ts --project=desktop-1440 --project=mobile-390`

   Wynik: **47 testów: 45 passed, 2 expected skips**.

3. Celowany live DOM probe utraty danych Pracy: **błąd odtworzony** (`visibleBefore=1`, `visibleAfter=0`).

4. Poprawiony, odczytowy test wolumenu Zadań (artefakt `artifacts/audit-task-volume-check.mjs`): seed zawiera `calendarDate: "2026-08-05"` oraz `schedule`. Dla **0/1/5/20/100** rekordów przed i po reloadzie:

   - liczba widocznych zadań była równa seedowi;
   - nie było poziomego overflow dokumentu;
   - ostatni rekord można było przewinąć i otworzyć w panelu;
   - wszystkie 5 wariantów przeszły.

   To funkcjonalnie potwierdza, że aktualna porażka starego testu wolumenu jest problemem seeda, nie dowodem defektu produktu.

### 9.2 Cztery nieaktualne/niestabilne testy desktop-1440 — luka QA, nie automatycznie błąd produktu

| Test | Dlaczego wynik nie jest wiarygodnym dowodem błędu produktu | Status |
|---|---|---|
| Goals baseline/default grid, `e2e/goals.spec.ts:30-35` | założenie „no layout preference has been saved” zależy od izolacji storage/baseline i aktualnego kanonicznego defaultu | test/baseline do odświeżenia; produkt `nieweryfikowalne` tym testem |
| Wolumen 0/1/5/20/100, `e2e/production-validation.spec.ts:53-80` | seed ustawia `view: "dzis"`, lecz pomija `calendarDate` i `schedule`, więc rekordy nie należą do faktycznego dnia 2026-08-05 | stary test nieaktualny; poprawiony probe **passed** |
| Hydration selector, `e2e/production-validation.spec.ts:109-148` | test wiąże się ze sztywnym `.nutrition-water-card__value > strong/span`; zmiana semantycznego markup/layoutu może unieważnić locator bez regresji funkcji | selektor/baseline niestabilny; wygląd ocenia audyt wizualny |
| Lazy-route failure injection, `e2e/production-validation.spec.ts:192-210` | interceptuje dev-source `/src/app/pages/Praca.tsx`; idle/hover prefetch może załadować moduł przed abortem, a build używa chunk URL | failure injection niestabilny; error state istnieje w kodzie, runtime failure nadal wymaga stabilnego testu |

Rekomendacja QA: izolować storage per test/context, seedować pełne domenowe rekordy przez fabryki, używać semantycznych locatorów zamiast strukturalnych child selectorów i wstrzykiwać kontrolowany błąd loadera przed startem prefetchu.

## 10. Pozytywne ustalenia

1. **Cele mają najlepszy URL state.** Parser waliduje widok, layout, sort, scope i selected ID, a strona kanonizuje query przez replace (`src/app/goals/goalViewState.ts:50-87`, `src/app/pages/Cele.tsx:169-193`).
2. **Podróże mają użyteczny model deep-link.** Osobny route i embedded mode zachowują trip/section; niepoprawny trip prowadzi do bezpiecznego fallbacku (`src/app/pages/Podroze.tsx:145-160`, `219-251`).
3. **Notatki chronią realną pracę.** Session draft, pagehide flush, beforeunload i dirty prompt tworzą kompletny happy/unhappy path (`src/app/pages/Notatki.tsx:254-328`, `422-481`).
4. **Sport ma dojrzały lifecycle.** URL back/forward, flush danych, konflikt kart i szkic cyklu są obsłużone (`src/app/pages/Sport.tsx:330-505`).
5. **Kalendarz rozróżnia źródła.** Task-backed wpis jest edytowalny, external occurrence ma czytelny read-only detail; popover obsługuje Escape/outside/focus restoration (`src/app/pages/Kalendarz.tsx:649-682`, `1285-1358`).
6. **Powłoka zachowuje własność modułu.** Nested route nadal podświetla moduł właściciela, powtórne kliknięcie niepotrzebnie nie zeruje kontekstu, a mobile menu zamyka się przy route change (`src/app/layout/Layout.tsx:228-276`, `589-591`).
7. **Scroll memory jest wspólną platformową funkcją**, a nie duplikowanym hackiem per strona (`src/app/experience/moduleMemory.ts:53-93`).
8. **Persistence nie niszczy danych corrupt.** Istnieje recovery index, protected copies, retry i jawne issue states; testy domenowe i migracyjne przechodzą.
9. **Add-to-Tasks ma deduplikację i stan disabled** (`src/app/ui/components/AddToTasksButton.tsx:6-27`), co ogranicza duplikaty przy szybkich kliknięciach.
10. **Stany route loading/error/404 są semantyczne i odseparowane** (`src/app/RouteStates.tsx:55-145`).

## 11. Macierz końcowego pokrycia

| Obszar | `kod` | `funkcja` | `wizualnie` | `nieweryfikowalne` / `brak implementacji` |
|---|---:|---:|---:|---|
| Router, nested routes, redirects | pełne | reprezentatywne trasy desktop/mobile | nie | Vercel live nieweryfikowalne |
| Back/forward/reload | pełne dla implementacji | navigation/persistence + corrected volume | nie | wszystkie kombinacje modułów nieweryfikowalne |
| Aktywna nawigacja właściciela | pełne | główne E2E | nie | pixel active state nieweryfikowalne |
| Query/date/filter/sort/search | pełna inwentaryzacja | częściowe E2E | nie | combinatorial matrix nieweryfikowalne |
| Selection/detail/panels | pełna inwentaryzacja | Zadania/Praca/Sprawy/Kalendarz reprezentatywnie | nie | wszystkie panele nieweryfikowalne |
| Scroll memory | pełne | unit tests | nie | złożone nested scroll nieweryfikowalne |
| localStorage/IndexedDB/migracje | pełne | 71 targeted unit tests + reload E2E | n/d | produkcyjne quota/device edge cases nieweryfikowalne |
| Walidacja formularzy | szerokie | częściowe | nie | pełna macierz każdego pola nieweryfikowalne |
| Destructive/undo | pełna inwentaryzacja kodu | częściowe E2E | nie | percepcja komunikatów nieweryfikowalne |
| Unsaved changes | pełna inwentaryzacja kodu | P0 Pracy potwierdzony | nie | wszystkie close/unload paths nieweryfikowalne |
| Loading/error/offline | pełne | unit + część istniejących E2E | nie | realny backend/network hang nieweryfikowalne |
| Read-only/permissions | source/read-only pełne | nie | nie | role/ACL: `brak implementacji`; potrzeba biznesowa nieweryfikowalne |
| Rapid clicks | wybrane guards/dedupe | P0 Pracy i corrected volume | nie | pełny click-storm nieweryfikowalne |

## 12. Ograniczenia i następne kroki audytowe

- Ten agent nie wykonywał oceny wizualnej; „funkcja” oznacza semantykę/DOM, a nie pixel correctness.
- Nie wykonywano testów na prawdziwym Vercel/Cloudflare, prawdziwym koncie Supabase, wielu urządzeniach ani z realnym brakiem miejsca/permission denial.
- Nie zmieniano kodu, więc rekomendacje są kierunkami naprawy, nie implementacją.
- Najbardziej wartościowe następne testy regresyjne: szybka nawigacja po każdej mutacji Pracy; reload obu nested routes na Vercel preview; JDG `month` back/reload; stale project ID; dirty-form matrix; deep link do linked task; karta Dzisiaj → data Odżywiania.

Najważniejszy warunek release: **RF-01 powinien zostać naprawiony i objęty testem przed wydaniem**, ponieważ jest potwierdzoną utratą danych w zwykłym przepływie użytkownika.
