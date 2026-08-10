# Rootine — kompletny audyt produktu desktopowego

**Data:** 10 sierpnia 2026  
**Rewizja:** `24f8800`  
**Zakres:** audyt wizualny, funkcjonalny, UX, treści, dostępności i design systemu całej aplikacji desktopowej  
**Tryb:** wyłącznie odczytowy — nie zmieniono kodu produkcyjnego, konfiguracji ani istniejących danych użytkownika

## 1. Executive summary

Rootine jest dojrzałym wizualnie, spokojnym i w dużej mierze spójnym produktem. Kierunek „Calm Layered Workspace / Graphite Cool Ice” jest widoczny w realnym interfejsie: grafitowe powierzchnie mają czytelną hierarchię, akcenty pozostają lokalne, listy są płaskie i gęste, a moduły zachowują wspólną geometrię bez utraty własnego charakteru. Łączna ocena audytowa wynosi **77/100** (średnia dziewięciu wymiarów, 76,67 po zaokrągleniu).

Najważniejszy wniosek nie dotyczy wyglądu: **moduł Praca może utracić świeżo dodany lub edytowany rekord, jeżeli użytkownik opuści moduł przed upływem 260 ms**. Błąd odtworzono w działającej aplikacji (`visibleBefore=1`, `visibleAfter=0`). To jedyny P0 i warunek naprawy przed wydaniem.

### Pięć największych problemów systemowych

1. **P0 — utrata danych w Pracy.** Debounce zapisu jest anulowany przy unmount bez flushowania bieżącego snapshotu.
2. **Rozszczepione źródło prawdy.** Normatywny frontmatter `DESIGN.md`, aktywne tokeny sześciu motywów, specyfikacje komponentów i runtime opisują różne palety oraz kontrakty.
3. **Nierówna ochrona pracy użytkownika.** Notatki i szkic cyklu Sportu mają session draft, ochronę unload i ograniczone guardy wewnętrzne, a długie formularze Celów, Odżywiania, Spraw i Podróży mogą zostać zamknięte bez ostrzeżenia.
4. **Wspólne wzorce są omijane.** Istnieją trzy systemy potwierdzeń, wiele lokalnych toastów/undo, 236 literalnych obiektów inline style, nieużywany `IconButton` i brak wspólnego `Textarea`.
5. **Dostępność podwidoków nie jest zabezpieczona.** Dwie wizualne tabele Sportu mają krytycznie błędną strukturę ARIA, a dziewięć małych tekstów w pięciu podwidokach nie osiąga 4,5:1.

### Pięć najmocniejszych elementów

1. **Spójny język wizualny.** Interfejs faktycznie realizuje spokojną, premium estetykę; nie znaleziono neonów, ciężkich gradientów ani systemowego „cards-in-cards”.
2. **Stabilna geometria powłoki.** Osie nagłówków i treści są zgodne w 95 kontrolach; szerokości 204/220/408 px są centralne i przewidywalne.
3. **Mocna warstwa persistence.** `localRepository` ma migracje, recovery danych corrupt, kolejkę zapisów, CAS/conflict i cross-tab; 71/71 celowanych testów domenowych przeszło.
4. **Realny rdzeń design systemu.** Sześć motywów mapuje wspólne role semantyczne; 49/49 deklaracji `z-index` używa tokenów; importy UI przechodzą przez jeden barrel.
5. **Dobre fundamenty semantyki i klawiatury.** Wszystkie 95 renderów miały jeden `h1`, brak globalnego overflow; działają focus ring, skip link, Escape, focus trap i klawiaturowe menu w sprawdzonych przepływach.

### Największe ryzyko funkcjonalne

`Praca.tsx` odkłada zapis o 260 ms, a cleanup anuluje timer bez zapisania zmiany. Repozytoryjny flush nie pomaga, ponieważ snapshot nie trafia wcześniej do kolejki. Ten defekt może wystąpić po zwykłym, szybkim kliknięciu do innego modułu i prowadzi do cichej utraty danych.

### Werdykt o design systemie

**Design system jest rzeczywisty, lecz tylko częściowo egzekwowany.** Nie jest to zbiór ekranów „wyglądających podobnie”: wspólne role semantyczne, shell, komponenty rdzenia, warstwy i focus są realnie współdzielone. Egzekwowanie kończy się jednak tam, gdzie plikowe wyjątki ukrywają statyczne style, publiczne prymitywy nie mają konsumentów, lokalne moduły tworzą równoległe potwierdzenia/toasty/tabele, a dokumentacja nie nadąża za implementacją. Obecny stan to **dobry system semantyczny z niedokończoną migracją i czerwonymi bramkami governance**.

### Podstawa dowodowa

| Obszar | Zakres i wynik |
| --- | --- |
| Trasy i podwidoki | 50 widoków przy 1440×900; 95 kontroli route × profil; 0 błędów tras/runtime, 0 globalnego overflow, 0 błędów liczby `h1` |
| Viewporty | 1366×768, 1440×900, 1920×1080, 2560×1440; 9 reprezentatywnych ekranów poza viewportem referencyjnym |
| Zoom/reflow | profile repozytorium 125% i 150% dla 9 ekranów; `test:e2e:zoom` 9/9; dodatkowe 6/6 celowanych testów reflow |
| Breakpointy | 1379/1381, 1179/1181, 979/981 oraz pomocniczo 759/761 |
| Stany | 10 screenshotów interakcji/overlayów, 3 sekwencje klawiaturowe, 5 ekranów reduced motion |
| Dostępność | axe-core 4.12 na wszystkich 50 podwidokach 1440×900; 12 grup naruszeń zredukowanych do 4 potwierdzonych problemów |
| Dane | poprawiony test Zadań 0/1/5/20/100 przed i po reloadzie — wszystkie warianty przeszły; 19 realnych zadań i 14 ćwiczeń w renderach |
| Testy jakości | viewport 287/287, zoom 9/9, unit 254/254, build PASS; pełny `check` i design-system audit obecnie FAIL |
| Artefakty | 128 screenshotów i dane pomiarowe w [`audit-visual-agent-c/`](audit-visual-agent-c/) |

## 2. Oceny 0–100

| Wymiar | Ocena | Krótkie uzasadnienie |
| --- | ---: | --- |
| Spójność wizualna | **88** | Jedna gramatyka powierzchni, koloru i gęstości; lokalne clippingi i redundancje nie podważają kierunku. |
| Layout i wyrównanie | **87** | Osie są bardzo stabilne, brak globalnego overflow; szeroki `DetailPanel` oraz modal celu łamią kontrakt kompozycji. |
| Design tokens | **75** | 223 unikalne tokeny, wysoka tokenizacja kolorów/radiusów/warstw; rozjazd dokumentacji, density override i martwe aliasy. |
| Komponenty współdzielone | **68** | Rdzeń ma wysoką adopcję, ale potwierdzenia, toasty, textarea, icon button i tabele pozostają niespójne. |
| UX i architektura informacji | **76** | Dobre archetypy i nawigacja; nierówne draft guards, utrata kontekstu deep-linków i powtórzenia na Dzisiaj. |
| Copy | **82** | Język jest naturalny i konsekwentny; jedno mylące CTA, dwa ucięte komunikaty i nadmiar metryk. |
| Spójność funkcjonalna | **66** | Mocne persistence i URL state w kilku modułach, lecz P0 Pracy, różne undo/confirm i niespójne formularze obniżają wynik. |
| Dostępność | **70** | Jeden `h1`, landmarki, klawiatura i focus są mocne; krytyczne role ARIA, kontrast, linki w tekście i zwrot fokusu wymagają naprawy. |
| Odporność na dane i viewporty | **78** | Matryce viewport/zoom i wolumen 0–100 przechodzą; P0 rapid navigation, Vercel deep routes, modal clipping i brak skrajnego stress-testu ograniczają wynik. |

**Metoda.** Każdy wymiar oceniono na podstawie czterech składowych: zgodność implementacji ze źródłem prawdy (30%), spójność między modułami (25%), zachowanie zaobserwowane w runtime (25%) i pokrycie regresyjne (20%). P0 ogranicza wynik funkcjonalny do poziomu poniżej 70; krytyczne naruszenie ARIA ogranicza dostępność do 70. Nie przyznawano punktów za obszary nieweryfikowane.

## 3. Macierz pokrycia

Legenda: **V** — sprawdzono wizualnie; **K** — sprawdzono w kodzie; **F** — sprawdzono funkcjonalnie/testem; **N** — nie udało się sprawdzić; **B** — brak implementacji. Status „częściowo” oznacza, że nie przetestowano wszystkich kombinacji stanu.

### 3.1 Trasy, zakładki i podwidoki

| Moduł / trasa | Widoki i podwidoki objęte audytem | V | K | F | Uwagi |
| --- | --- | :---: | :---: | :---: | --- |
| `/` | przekierowanie do `/dzisiaj` | — | ✓ | ✓ | redirect potwierdzony |
| `/dzisiaj` | bilans, zaległości, nawyki, rejestr 8 obszarów, globalne Dodaj | ✓ | ✓ | ✓ | pełny ekran + klawiatura |
| `/zadania` | Dziś, Jutro, 7 dni, 30 dni, Bez terminu, Wszystkie, Nawyki, Podsumowanie, Ukończone, Kosz | ✓ | ✓ | częściowo | panel, DatePicker, menu, focus, volume 0–100 |
| `/kalendarz` | miesiąc, filtry, agenda nadmiarowa, popover, panel zadania, external read-only | ✓ | ✓ | częściowo | realny read-only potwierdzony w kodzie |
| `/notatki` | Wszystkie, Przypięte, Archiwum, edytor, wyszukiwanie/sort/list/tag | ✓ | ✓ | częściowo | draft lifecycle potwierdzony w kodzie |
| `/cele` | Aktywne/overview, Następne kroki, Ten tydzień, Wszystkie, Zagrożone, Zakończone, Archiwum, list/grid, menu | ✓ | ✓ | częściowo | menu → modal, Escape, focus, scroll |
| `/cele/:goalId` | pełny cel, etapy, postęp, linked tasks, not-found | ✓ | ✓ | częściowo | powrót i invalid ID ocenione w kodzie |
| `/sport` | Dziś, Cykl, Szablony, Ćwiczenia, Historia, Analiza, `tydzien` | ✓ | ✓ | częściowo | nowy szablon, modal, focus trap, ARIA tabel |
| `/odzywianie` | dziennik dnia, posiłki/produkty, nawodnienie, masa, cele, kalkulator | ✓ | ✓ | częściowo | dialog produktu i linki attribution |
| `/odzywianie/posilki` | własne posiłki, edytor | ✓ | ✓ | częściowo | reload na Vercel: N |
| `/odzywianie/analiza` | 7/14/30/90/custom, wykresy | ✓ | ✓ | częściowo | reload na Vercel: N |
| `/praca` | Dziś, Tydzień, Aktywne, Bez terminu, Nieprzypisane, Archiwum, company/project/detail | ✓ | ✓ | częściowo | Dziś, Bez terminu i company/project reprezentatywnie; P0 rapid navigation odtworzony |
| `/sprawy` | Dziś, Tydzień, Wszystkie, Jednorazowe, Cykliczne, Subskrypcje, Budżet, Dokumenty, Pojazdy, JDG, Podróże | ✓ | ✓ | częściowo | dialog dodawania; destructive bez wykonania |
| `/podroze`, `/podroze/:tripId` | bezpośrednia trasa dossier, pulpit, plan, rezerwacje, budżet, dokumenty, zadania, `sekcja` | ✓ | ✓ | częściowo | invalid trip fallback potwierdzony |
| `/biuro`, `/finanse`, `/jdg` | legacy redirects | — | ✓ | ✓ | poprawne cele redirectów |
| `*` | 404 i powrót do Dzisiaj | — | ✓ | częściowo | runtime visual osobno niewykonany; semantyka w kodzie |

### 3.2 Stany interakcji i odporności

| Stan | V | K | F | Wniosek / ograniczenie |
| --- | :---: | :---: | :---: | --- |
| default, selected, active, overdue | ✓ | ✓ | ✓ | spójne powierzchnie i statusy |
| hover i focus | ✓ | ✓ | ✓ | wspólny ring widoczny; task row i 28 Tabów |
| completed | ✓ | ✓ | częściowo | subtitle Nawyku nie przechodzi kontrastu |
| disabled | ✓ | ✓ | częściowo | nie liczono disabled do WCAG 1.4.3 |
| detail panel / drawer | ✓ | ✓ | ✓ | 6 profili + breakpointy; konflikt docked/overlay |
| modal | ✓ | ✓ | ✓ | Escape/trap reprezentatywnie; nie każdy backdrop |
| popover / DatePicker | ✓ | ✓ | ✓ | niemodalny `role=dialog`, focus poprawny |
| menu / dropdown | ✓ | ✓ | ✓ | Arrow/Home/End/Escape i zwrot fokusu w Pracy |
| formularze create/edit | ✓ | ✓ | częściowo | nie zapisywano danych; dirty matrix z kodu |
| confirm / delete / undo | częściowo | ✓ | częściowo | nie wykonywano wszystkich destrukcji |
| empty / small data | ✓ | ✓ | częściowo | wiele pustych kolekcji; 0/1/5 Zadań |
| large data | ✓ | ✓ | ✓ | 20/100 Zadań przed/po reloadzie, detail ostatniego rekordu |
| długi tekst / brak wartości / duże liczby | częściowo | ✓ | częściowo | realne długie tytuły; brak syntetycznego ekstremum |
| loading / route error | — | ✓ | częściowo | failure injection lazy route jest niestabilny |
| offline / quota / corrupt | — | ✓ | ✓ | unit/recovery; brak realnego odcięcia sieci/quota urządzenia |
| optimistic update | — | ✓ | częściowo | P0 Pracy; pełna macierz kliknięć N |
| read-only | — | ✓ | częściowo | external Calendar, linked tasks, closed nutrition day |
| role/permission denial | — | B | — | produkt nie ma ogólnego UI ról/ACL |
| reduced motion | ✓ | ✓ | ✓ | brak aktywnych animacji na 5 trasach; kontrakt jest zbyt globalny |

### 3.3 Viewporty, zoom i breakpointy

| Profil | Zakres | Wynik |
| --- | --- | --- |
| 1366×768 | 9 ekranów + task detail + goal modal | brak globalnego overflow; przycięta meta Zadań i akcje modala celu |
| 1440×900 | wszystkie 50 podwidoków + 10 stanów | viewport referencyjny; 12 grup axe i wszystkie pomiary osi |
| 1920×1080 | 9 ekranów + task detail | stabilne osie; szeroki panel nadal overlay |
| 2560×1440 | 9 ekranów + task detail | poprawne max-width/centrowanie; `fluid` wykorzystuje przestrzeń |
| zoom 125% | 9 ekranów + detail | bez globalnego overflow; testy zoom przechodzą |
| zoom 150% | 9 ekranów + detail | bez globalnego overflow; Budżet ponownie mierzony przy `scrollTop=0` |
| 1379 / 1381 | próg DetailPanel | zmiana semantyki modalnej, lecz nie geometrii overlay |
| 1179 / 1181 | próg context sidebar | 0 → 220 px, bez overflow |
| 979 / 981 | próg global sidebar | 68 → 204 px, bez overflow |
| 759 / 761 | pomocniczy próg mobile/rail | stabilny, ale poza żądanym zakresem desktopowym |

### 3.4 Wyniki automatyczne

| Polecenie / zestaw | Wynik | Interpretacja |
| --- | --- | --- |
| `npm run check` | **FAIL** | lint zatrzymuje pipeline: 6 warnings w `SportPlanner.tsx`; dalsze kroki nie są wykonywane |
| `npm run design-system:audit` | **FAIL** | 95 governance inline, 69 arbitrary typography, 93 media queries, 2 raw transitions, 1 niezarejestrowany breakpoint 600 px |
| `npm run css:lint` | PASS | stylelint bez błędów |
| `npm run architecture:audit` | PASS | ownership i limity wejść zachowane |
| `npm run typecheck` | PASS | TypeScript poprawny |
| `npm run test` | 48/48 plików, 254/254 | unit/integration przechodzą |
| celowane persistence | 10/10 plików, 71/71 | migracje, recovery, conflict, domain workspace |
| `npm run build` | PASS | vendor 539,64 kB ostrzega o chunk >500 kB |
| `test:e2e:viewport` | 287/287 | 12 tras × 7 profili, brak globalnych regresji layoutu |
| `test:e2e:zoom` | 9/9 | 125/150/200% dla 8 rdzeniowych modułów |
| Playwright desktop-1440 | 110 pass, 5 fail, 2 skip | 1 realny clipping Sportu; 4 testy/baselines nieaktualne lub niestabilne |

Do rejestru kontrastu trafiły wyłącznie wyniki axe i celowane pomiary konkretnego elementu. Surowe wyniki własnych heurystyk (`domContrastFailures`, `unnamed`, `<24 px`) odrzucono, ponieważ obejmowały m.in. kompozycję półprzezroczystych warstw, kontrolki disabled, wrappery label oraz dozwolone equivalent targets. Nie są dowodem błędu produktu.

## 4. Mapa design systemu

### 4.1 Faktyczna hierarchia źródeł prawdy

Zgodnie z `src/app/ui/README.md` i governance obowiązuje kolejność: zatwierdzone decyzje produktu/designu → `tokens.css` i rejestr wyjątków → kontrakty wspólnych komponentów → implementacja funkcji z zatwierdzonym wyjątkiem → dokumentacja pomocnicza. `tokens.ts` jest aliasem transportowym, nie osobnym szczeblem autorytetu. Hierarchia jest rozsądna, ale `DESIGN.md` jednocześnie nazywa własny frontmatter normatywnym i `tokens.css` źródłem prawdy. To główna sprzeczność wymagająca decyzji, nie automatycznej korekty.

Nie istnieją pliki `ROOTINE_UI_THEME_BRIEF.md`, `DESIGN_SYSTEM.md`, `INFORMATION_ARCHITECTURE.md`, `SCREEN_INVENTORY.md`, `COMPONENT_INVENTORY.md` ani `COPY_GUIDELINES_PL.md` pod oczekiwanymi nazwami. Ich rolę częściowo pełnią `DESIGN.md`, `src/app/ui/README.md`, `docs/design-system-*`, `docs/content-terminology.md`, route/module registries oraz osiem approved surface briefs; nie tworzą jednak jednego kompletnego inwentarza.

### 4.2 Tokeny

| Kategoria | Obecne źródło | Pokrycie tokenami | Faktyczne użycie | Naruszenia | Ocena |
| --- | --- | ---: | ---: | ---: | ---: |
| Powierzchnie i tekst | `tokens.css:5–40,182–201` | 90,3% deklaracji kolorystycznych | role we wszystkich modułach i 6 motywach | frontmatter ma starsze wartości; ~346 użyć aliasu `graphite-*` | 4/5 |
| Border/focus/backdrop | `tokens.css:78–86`, theme scopes | wysokie | wspólne kontrolki, modale, focus | backdrop i spec Modal rozjechane; link attribution bez wyraźnego affordance | 4/5 |
| Statusy i disabled | role semantic/state | wysokie | Badge, listy, overdue/completed | 9 kontrastów AA; completed opacity zbyt słaba lokalnie | 3/5 |
| Typografia | `tokens.css:43–57,549–581` | 96,4% CSS | wspólna skala 10–36 px | 69 arbitrary classes; lokalne line-height w `goals.css` | 3/5 |
| Spacing/position | skala 4–28 + feature CSS | 63,3% | shell i shared UI dobrze | 236 literalnych inline objects; dużo lokalnej geometrii | 3/5 |
| Width/height/layout | shell/layout tokens | 6,1% proxy | 204/220/408 i PageShell działają | Select 28/38/44; lokalne chart/portal math; dead PageHeader | 3/5 |
| Radius | skala 3/6/8/12/16/pill | 81,2% | bardzo spójny CSS | 15 px w Kalendarzu, 20 px w Zadaniach, `calc(...-2px)` | 4/5 |
| Cienie | semantic shadows | 83,8% | oszczędne i zgodne z briefem | głównie `none`; brak systemowego problemu | 5/5 |
| Z-index | 24 role `--layer-*` | **100%** | 49/49 deklaracji token-backed | nazwy `floating/ambient/system-overlay` są zbyt złożone | 5/5 |
| Motion | `tokens.css:143–158` | 76,9% | focus/overlay/arrival | 6 surowych czasów; dwa globalne catch-all reduced motion | 3/5 |
| Breakpointy | CSS + `breakpoints.ts` + JSON + docs | 92/93 zarejestrowane | 1380/1180/980/760 stabilne | nowe 600; stale 1040; 1280 tylko w TS | 2/5 |
| Komponentowa geometria | menu/checkbox/progress tokens | częściowe | część wspólnego UI | checkbox/menu tokens bez konsumenta; Select ma trzy wartości | 2/5 |
| Wykresy | 7 chart roles + `uiChartColors` | zadeklarowane | brak konsumenta runtime mapy | Nutrition/Sport/progress mają lokalne dialekty | 2/5 |
| Theme/runtime aliases | `appTheme.ts`, `tokens.ts` | 6 pełnych palet | `uiColors/uiLayers/uiShadows` żywe | 8/11 grup aliases bez konsumentów | 3/5 |
| Kolory danych | exception registry | 100% zarejestrowane | taxonomy/migracje | 88 trafień poza tokens; hex utrwala prezentację w danych | 3/5 |

Łącznie znaleziono **223 unikalne custom properties** (487 deklaracji z powtórzeniami motywów); 197 nazw jest wystawionych lub użytych poza `tokens.css`. Niski wynik width/height nie oznacza, że SVG, `100%` czy viewport math powinny być sztucznie tokenizowane.

### 4.3 Komponenty wspólne, lokalne i brakujące

| Wzorzec | Stan | Faktyczne użycie / problem |
| --- | --- | --- |
| App/Module Shell, PageShell, ContentHeader | wspólne i szeroko przyjęte | 14 `ModuleShell`, 16 `ContentHeader`; osie zgodne w 95 kontrolach |
| ModuleSidebar / ContextNavItem | wspólne | 220 px, `aria-current`, compact navigation poniżej 1180 |
| DetailPanel | wspólny, lecz kontrakt sprzeczny | 8 użyć w 6 modułach; overlay na każdej szerokości, modalny tylko ≤1380 |
| Button | wspólny | 441 użyć/35 plików; `iconOnly` omija bezpieczniejszy `IconButton` |
| IconButton | zadeklarowany, nieadoptowany | 0 konsumentów; 121 wystąpień `iconOnly`, 112 poza biblioteką |
| Input / Select / DatePicker | wspólne | 129/111/37 użyć; Select ma niespójne 28/38/44 px; 2 lokalne selecty w Nutrition Analysis |
| Textarea | **brak wspólnego komponentu** | 15 surowych `<textarea>` w 10 plikach |
| Modal | wspólny i behawioralnie mocny | 46 użyć/22 pliki; spec szerokości/backdropu/borderu jest nieaktualna |
| ConfirmDialog | zduplikowany | wspólny UI, lokalny o tej samej nazwie w Celach i 5 `window.confirm` callsites |
| Menu / popover | wspólne z lokalnymi wrapperami | nawigacja klawiaturowa dobra; modal z odmontowanego menu traci return focus |
| Record list/row | częściowo wspólne | `ui-list-row` istnieje, lecz Sport buduje pseudo-tabele z błędną ARIA |
| Empty/Loading State | wspólne | 37 EmptyState; spec dashed vs runtime solid; route states semantyczne |
| Progress/Stat | zadeklarowane, nieadoptowane | `ProgressBar`, `StatCard`, `StatGrid` bez konsumentów; lokalne wizualizacje |
| Table | **brak wspólnego kontraktu** | Kalendarz ma poprawny grid; Sport niepełne role `row` |
| Chart | **brak wspólnego kontraktu implementacyjnego** | tokeny istnieją, Nutrition/Sport używają osobnych modeli |
| Toast/undo | **brak wspólnego komponentu** | lokalne implementacje w Zadaniach, Kalendarzu, Celach, Notatkach, Pracy, Sport, Odżywianiu, JDG i Podróżach |
| Tooltip | wspólny wzorzec częściowo | ikonowe akcje nie są wymuszane typem; pełnej ręcznej macierzy tooltipów nie wykonano |

### 4.4 Wskaźniki egzekwowania

- 236 literalnych `style={{…}}` w 30 plikach; 248 wszystkich `style={…}` w 33 plikach.
- Governance raportuje 95 poza siedmioma plikami wyjątków; wyjątki ukrywają kolejne 141 literalnych obiektów.
- 69 arbitrary typography; wszystkie użyte wartości mają już tokeny.
- 93 media queries, w tym niezarejestrowane 600 px.
- Zero bezpośrednich importów `ui/components/*`; wszystkie przechodzą przez barrel.
- Zero niezarejestrowanych raw hex/rgb w feature CSS; 49/49 `z-index` token-backed.

## 5. Porównanie między modułami

| Archetyp | Moduły porównane | Co jest wspólne i warto zachować | Najważniejsza różnica / ryzyko |
| --- | --- | --- | --- |
| Dashboard dnia | Dzisiaj vs nagłówki modułów | wspólny ContentHeader, lokalne statusy, płaskie wiersze | Dzisiaj celowo nie ma module sidebar — to dobra różnica; hero powtarza jednak te same 25/15/6 |
| Listy zadań/rekordów | Zadania, Praca, Sprawy, Sport libraries | gęste wiersze, akcje po prawej, lokalny status, mało cieni | Sport używa niepełnych ról tabeli; Praca ma P0 zapisu; wysokości/metadane są bardziej lokalne |
| Kalendarz/plan | Kalendarz, Sport Cykl, Praca Tydzień | czytelna temporalność i lokalny kolor; wspólny shell | Sport obcina sześć fragmentów tekstu w cyklu; kalendarz ma lokalny 15 px radius |
| Kolekcja + detail panel | Zadania, Praca, Cele, Sprawy, Notatki, Sport | panel 408 px, zamknięcie, shared surface | szeroki panel przykrywa treść zamiast zajmować track; semantyka zmienia się przy 1380 |
| Długi formularz modalny | Cele, Odżywianie, Praca, Sprawy, Podróże | wspólny Modal, Escape, trap | tylko część ma dirty guard; GoalForm ma przyciętą stopkę i niewidoczny scroll |
| Destrukcyjne akcje | wszystkie moduły danych | część używa confirm lub undo | trzy systemy confirm; undo od pełnego kosza po brak ochrony dla pomiaru masy |
| Biblioteki/rekord tables | Sport Szablony/Ćwiczenia, Work Active, Affairs All | podobny skan kolumnowy | brak wspólnego `RecordTable`; semantyka i klikane komórki różnią się |
| Analiza i wykresy | Zadania Podsumowanie, Sport Analiza, Odżywianie Analiza | spokojny kolor i tekstowe podsumowania | osobne geometrie, tokeny chart bez adopcji, niespójne role/focus |
| Empty state | wszystkie moduły | zwykle jasny kolejny krok, bez ozdobnego nadmiaru | spec mówi dashed border, runtime solid; różnica dokumentacyjna, nie jakościowa |
| Context sidebar | większość modułów, Sport, Podróże | stabilne 220 px, kategorie i count | `DESIGN.md` twierdzi, że Sport/Travel nie używają sidebara; runtime używa go konsekwentnie |
| URL/back/reload | Cele, Notatki, Sport, Praca, Sprawy | Cele/Notatki/Sport mają dojrzały URL/draft state | JDG, Kalendarz, Nutrition date i część selection pozostają lokalne lub niespójne |

Celowe różnice zostały zachowane w rekomendacjach: dashboard Dzisiaj nie powinien być zmuszany do trzech kolumn modułowych, a Kalendarz, planer Sportu i analiza Odżywiania nie powinny otrzymać identycznego layoutu tylko dlatego, że pokazują kolekcje.

## 6. Rejestr wszystkich problemów

Rejestr jest posortowany najpierw według priorytetu, a następnie zasięgu. Problemy pokrewne zostały scalone, aby nie liczyć tego samego źródła kilka razy. Bilans: **1×P0, 9×P1, 17×P2, 4×P3**. P0 oznacza awarię/utratę danych/blokadę; P1 — problem systemowy, poważną niespójność lub istotną przeszkodę; P2 — zauważalny problem lokalny; P3 — polish/cleanup. RTN-002/003 są P1 ze względu na zasięg procesu i setki callsites, nie dlatego, że bieżący motyw wygląda źle. Nie znaleziono drugiego P0.

### RTN-001 — Praca traci świeżą zmianę przy szybkiej nawigacji

| Pole | Wartość |
| --- | --- |
| ID | RTN-001 |
| Priorytet | **P0** |
| Kategoria | functional |
| Lokalizacja | `/praca`; quick entry i mutacje edytora; przejście do innego modułu w oknie <260 ms |
| Porównanie | Sport flushuje workspace na `pagehide`, hidden i unmount; Praca tylko anuluje timer debounce. |
| Oczekiwane | Zmiana widoczna w UI trafia do kolejki persistence przed opuszczeniem modułu. |
| Faktyczne | Wpis jest widoczny przed nawigacją i znika po powrocie; `visibleBefore=1`, `visibleAfter=0`. |
| Dowód | `src/app/pages/Praca.tsx:172–187,201–205,436–455,489–610`; kontrast `Sport.tsx:330–351`; celowany live DOM probe. |
| Skala | Wszystkie mutacje korzystające z tego 260 ms adaptera Pracy; co najmniej quick task i edycje company/project/task. |
| Przyczyna | Cleanup anuluje timer, zanim snapshot zostanie przekazany do `localRepository`; globalny flush nie ma czego zapisać. |
| Rekomendacja | Flushować aktualny snapshot w cleanup/pagehide/hidden albo użyć kolejki, której unmount nie anuluje; dodać test nawigacji bez czekania. |
| Koszt | S–M |
| Pewność | **Wysoka** |

### RTN-002 — paleta i motywy mają dwa normatywne źródła prawdy

| Pole | Wartość |
| --- | --- |
| ID | RTN-002 |
| Priorytet | **P1** |
| Kategoria | token |
| Lokalizacja | cały produkt; `DESIGN.md` frontmatter vs `tokens.css` i sześć theme scopes |
| Porównanie | Dokument: shell `#101214`, card `#20242A`, text `#F2F3F5`; runtime: `#15181b`, `#24292f`, `#f1f0ec`; dokument mówi o jednym graphite, kod o sześciu motywach. |
| Oczekiwane | Jedno generowane źródło semantycznych ról i jawny status literalnych wartości dokumentu. |
| Faktyczne | `DESIGN.md` nazywa normatywnymi zarówno frontmatter, jak i `tokens.css`; wartości się różnią. |
| Dowód | `DESIGN.md:4–35,515–524,533–535`; `src/styles/tokens.css:5–40,221–512`; `src/app/theme/appTheme.ts:1–49`. |
| Skala | Każdy ekran i każdy motyw; 74 role kolorystyczne. |
| Przyczyna | Rozwój themingu po powstaniu dokumentu bez migracji/generowania specyfikacji. |
| Rekomendacja | Podjąć decyzję właścicielską, następnie generować dokumentację z semantycznych tokenów; nie przywracać mechanicznie starszej palety. |
| Koszt | M |
| Pewność | **Wysoka** |

### RTN-003 — kontrakty najczęstszych komponentów nie zgadzają się z runtime

| Pole | Wartość |
| --- | --- |
| ID | RTN-003 |
| Priorytet | **P1** |
| Kategoria | component |
| Lokalizacja | Button, Modal, Select/Menu, Badge, EmptyState, Checkbox w całej aplikacji |
| Porównanie | Button: biały vs ciemny `on-primary`; Modal: default 520 vs 680, border/backdrop/radius inne; Select: 28 px w docs, 38 px CSS, 44 px pozycjoner; Badge 4×8 vs 2×8; EmptyState dashed vs solid. |
| Oczekiwane | Specyfikacja, token, implementacja i test renderu opisują ten sam kontrakt. |
| Faktyczne | Dokumentacja nie może służyć jako wiarygodna specyfikacja QA ani handoff. |
| Dowód | `DESIGN.md:131–137,402–471,507–510`; `Modal.tsx:31–47`; `Select.tsx:112–131`; `ui.css:20–36,204–240,292–304,787–801,898–912`. |
| Skala | Button 441/35 plików, Select 111/25, Badge 81/18, Modal 46/22, EmptyState 37/13. |
| Przyczyna | Komponenty ewoluowały niezależnie od normatywnych tabel i tokenów component geometry. |
| Rekomendacja | Rozstrzygnąć pięć kontraktów produktowo, a potem atomowo zsynchronizować docs → token → komponent → regression. |
| Koszt | M–L |
| Pewność | **Wysoka** |

### RTN-004 — bramki jakości są czerwone, a dokumentacja twierdzi, że są zielone

| Pole | Wartość |
| --- | --- |
| ID | RTN-004 |
| Priorytet | **P1** |
| Kategoria | functional |
| Lokalizacja | CI/local quality gate, design governance i desktop Playwright |
| Porównanie | `DESIGN.md` deklaruje pusty detector i `check PASS 68/314`; obecnie unit to 48/254, `check` zatrzymuje lint, governance FAIL, desktop ma 5 fail. |
| Oczekiwane | Zielony, wiarygodny gate i dokumentacja generowana z bieżącego wyniku. |
| Faktyczne | 6 lint warnings w `SportPlanner.tsx`, niezarejestrowane 600 px i 4 nieaktualne/niestabilne testy tworzą fałszywe alarmy; realny clipping Sportu ginie w szumie. |
| Dowód | uruchomione komendy; `SportPlanner.tsx:9,708–709,746–748`; `DESIGN.md:352–354`; `e2e/goals.spec.ts`, `production-validation.spec.ts`. |
| Skala | Cały pipeline; każde wydanie i każdy autor. |
| Przyczyna | Brak utrzymywania fixtures/baselines razem z kontraktem domenowym oraz drift governance. |
| Rekomendacja | Przywrócić zielony gate: usunąć warnings, poprawić seedy/selektory/failure injection, odświeżyć zatwierdzone baseline’y i raportować aktualne liczby. |
| Koszt | M |
| Pewność | **Wysoka** |

### RTN-005 — potwierdzenia i odwracalność tworzą trzy konkurencyjne systemy

| Pole | Wartość |
| --- | --- |
| ID | RTN-005 |
| Priorytet | **P1** |
| Kategoria | component |
| Lokalizacja | Cele, Sport, Zadania/Nawyki, Sprawy, Odżywianie, Podróże i inne akcje destrukcyjne |
| Porównanie | Wspólny `ui/ConfirmDialog`; drugi `goals/ConfirmDialog` o innej geometrii; 5 callsites `window.confirm`; undo od pełnego kosza po brak confirm/undo dla pomiaru masy. |
| Oczekiwane | Jeden wzorzec confirm z jasnym skutkiem, konsekwentną kolejnością akcji, return focus i polityką undo zależną od odwracalności. |
| Faktyczne | Analogiczne usunięcia mają inny wygląd, język, focus i możliwość cofnięcia. |
| Dowód | `ui/components/ConfirmDialog.tsx`; `goals/GoalDialogs.tsx:853–883`; `Sport.tsx:682,918,1361`; `SportTemplates.tsx:458`; `TaskSecondaryViews.tsx:823`; RF-08. |
| Skala | Co najmniej 10 przepływów w ponad 6 modułach; 3 mechanizmy techniczne. |
| Przyczyna | Lokalne implementacje powstały przed/obok wspólnego prymitywu; brak polityki destructive/undo. |
| Rekomendacja | Ustalić matrycę archive/delete/purge/undo i przenieść wszystkie potwierdzenia do jednego komponentu bez natywnych dialogów. |
| Koszt | M |
| Pewność | **Wysoka** |

### RTN-006 — ochrona niezapisanych formularzy jest systemowo nierówna

| Pole | Wartość |
| --- | --- |
| ID | RTN-006 |
| Priorytet | **P1** |
| Kategoria | UX |
| Lokalizacja | GoalForm/progress/milestone, Odżywianie, Sprawy, Podróże, częściowo Praca; porównanie z Notatkami i Sport Cykl |
| Porównanie | Notatki i Sport mają session draft, `beforeunload` i ograniczone guardy wewnętrzne; nie blokują jednak każdej globalnej nawigacji SPA. Pozostałe closery najczęściej tylko zerują local state. |
| Oczekiwane | Jeden kontrakt dirty/draft dla długich formularzy: close, backdrop, Escape, route, back, reload. |
| Faktyczne | GoalForm (~20 pól, 2 callsites), ≥6 rodzin formularzy Nutrition i wielotypowe edytory Affairs/Travel mogą utracić szkic bez ostrzeżenia. |
| Dowód | `Notatki.tsx:254–328,422–481`; `Sport.tsx:369–505`; `GoalDialogs.tsx:239–259,300–632`; `Sprawy.tsx:436–439,1641–1670`; `Podroze.tsx:366–369,1473–1656`; `Odzywanie.tsx:276–299`. |
| Skala | 5 modułów problemowych, ≥10 rodzin formularzy; Praca chroni tylko zamknięcie własnego modala. |
| Przyczyna | Brak wspólnego hooka/protokołu draft lifecycle na poziomie Modal/route. |
| Rekomendacja | Zdefiniować `useDraftGuard`/baseline + politykę autosave; zastosować najpierw do formularzy wielopolowych i route transitions. |
| Koszt | L |
| Pewność | **Wysoka** |

### RTN-007 — szeroki DetailPanel przeczy kontraktowi docked/overlay

| Pole | Wartość |
| --- | --- |
| ID | RTN-007 |
| Priorytet | **P1** |
| Kategoria | component |
| Lokalizacja | wszystkie ekrany z `DetailPanel`; pomiary Zadania przy 1379/1381 oraz 1366/1440/1920/2560/zoom |
| Porównanie | `DESIGN.md` wymaga dockowania >1380; runtime używa `position:absolute` i grid track 0 px także >1380. |
| Oczekiwane | Zatwierdzony jeden model: trzecia kolumna na szerokim ekranie lub jawnie opisany niemodalny overlay. |
| Faktyczne | 1379: modalny drawer z backdropem/trapem; 1381: ten sam overlay bez `role=dialog`, backdropu i containment. Panel przecina `.ui-module-main` we wszystkich 6 profilach. |
| Dowód | [`targeted-breakpoint-1379__task-detail.png`](audit-visual-agent-c/targeted-breakpoint-1379__task-detail.png), [`targeted-breakpoint-1381__task-detail.png`](audit-visual-agent-c/targeted-breakpoint-1381__task-detail.png), [`targeted-data.json`](audit-visual-agent-c/targeted-data.json); `DESIGN.md:314,488`; `experience.css:761–770`. |
| Skala | 8 użyć w 6 modułach: Zadania, Sport, Praca, Cele, Sprawy, Notatki. |
| Przyczyna | Późny globalny override świadomie unika reflow, ale docs i semantyka nie zostały dostosowane. |
| Rekomendacja | Najpierw decyzja właściciela systemu; dopiero potem zmiana layoutu albo formalna specyfikacja overlayu i jego dostępności. |
| Koszt | M |
| Pewność | **Wysoka** |

### RTN-008 — mały tekst nie osiąga 4,5:1 w pięciu podwidokach

| Pole | Wartość |
| --- | --- |
| ID | RTN-008 |
| Priorytet | **P1** |
| Kategoria | accessibility |
| Lokalizacja | Zadania Nawyki, Kalendarz, Sport Cykl/Historia/Analiza przy 1440×900 |
| Porównanie | Większość metadanych przechodzi axe; konkretne stany completed/today/week-range/neutral badge nie. |
| Oczekiwane | WCAG 1.4.3 AA: 4,5:1 dla małego tekstu normalnego. |
| Faktyczne | 3,73; 3,36; pięć × 3,53–3,59; 4,22; 3,81:1. |
| Dowód | [`audit-data.json`](audit-visual-agent-c/audit-data.json), [`1440x900__tasks-habits.png`](audit-visual-agent-c/1440x900__tasks-habits.png), [`1440x900__calendar.png`](audit-visual-agent-c/1440x900__calendar.png), [`1440x900__sport-cycle.png`](audit-visual-agent-c/1440x900__sport-cycle.png). |
| Skala | 9 węzłów, 5 podwidoków, 3 obszary produktu. |
| Przyczyna | Kombinacje tertiary/completed opacity, muted week range i neutral badge; Kalendarz używa `C.text` na `C.blue` zamiast on-accent. |
| Rekomendacja | Dodać role `text-completed-readable`, `text-on-accent`, `badge-neutral-text`; testować je na każdej powierzchni i w każdym motywie. |
| Koszt | S–M |
| Pewność | **Wysoka** |

### RTN-009 — pseudo-tabele Sportu mają krytycznie błędną strukturę ARIA

| Pole | Wartość |
| --- | --- |
| ID | RTN-009 |
| Priorytet | **P1** |
| Kategoria | accessibility |
| Lokalizacja | `/sport?widok=templates` i `/sport?widok=exercises`, 1440×900 |
| Porównanie | Kalendarz ma pełne `grid → rowgroup → row → gridcell`; Sport dodaje tylko `role=row`. |
| Oczekiwane | Natywna tabela albo kompletna struktura ARIA; alternatywnie zwykła lista bez fałszywych ról. |
| Faktyczne | Wiersze nie mają rodzica table/grid/rowgroup ani dzieci cell/columnheader; axe `aria-required-parent/children`, impact critical. |
| Dowód | [`1440x900__sport-templates.png`](audit-visual-agent-c/1440x900__sport-templates.png), [`1440x900__sport-exercises.png`](audit-visual-agent-c/1440x900__sport-exercises.png); `SportTemplates.tsx:182–204`; `SportExercises.tsx:157–175`. |
| Skala | 21 unikalnych wierszy: 6 w Szablonach, 15 w Ćwiczeniach. |
| Przyczyna | Częściowa semantyzacja wizualnego gridu bez wspólnego `RecordTable`. |
| Rekomendacja | Utworzyć dostępny `RecordTable` z native semantics; jeżeli to nie tabela, usunąć wszystkie niepełne role. |
| Koszt | M |
| Pewność | **Wysoka** |

### RTN-010 — dwie kanoniczne trasy Odżywiania mogą zwracać 404 na Vercel

| Pole | Wartość |
| --- | --- |
| ID | RTN-010 |
| Priorytet | **P1** |
| Kategoria | functional |
| Lokalizacja | bezpośrednie otwarcie/reload `/odzywianie/posilki` i `/odzywianie/analiza` na Vercel |
| Porównanie | Cloudflare ma `single-page-application` fallback; Vercel rewrite obejmuje tylko `/odzywianie` i nie ma catch-all. |
| Oczekiwane | Każda trasa routera działa po bookmarku, paste URL i reloadzie. |
| Faktyczne | Router zna obie nested routes, ale Vercel nie mapuje ich do SPA; smoke ich nie sprawdza. |
| Dowód | `src/app/routes.ts:71–73`; `vercel.json:6–22`; `wrangler.jsonc:6–12`; `scripts/smoke-production.mjs:12–19`. |
| Skala | 2 kanoniczne podtrasy na jednym wspieranym celu wdrożenia. |
| Przyczyna | Ręczna lista rewrite i niepełny production smoke. |
| Rekomendacja | Dodać catch-all SPA rewrite albo generować listę tras; rozszerzyć smoke o oba URL-e. |
| Koszt | S |
| Pewność | Wysoka dla kodu / średnia dla realnego Vercel bez wdrożenia live |

### RTN-011 — inline styles i arbitrary typography tworzą równoległy system

| Pole | Wartość |
| --- | --- |
| ID | RTN-011 |
| Priorytet | **P2** |
| Kategoria | token |
| Lokalizacja | 33 pliki TSX; szczególnie Goals, Kalendarz, Zadania, Recovery, Nutrition i Praca |
| Porównanie | Dynamiczne `transform`, portal position i data color są uzasadnione; statyczne padding/font/radius w tych samych plikach omijają tokeny. |
| Oczekiwane | Wyjątki dotyczą konkretnego rodzaju deklaracji, nie całego pliku; statyczna typografia używa istniejącej skali. |
| Faktyczne | 236 literalnych `style={{…}}`, 248 wszystkich `style={…}`; governance widzi tylko 95. Do tego 69 arbitrary typography, mimo że wszystkie wartości mają tokeny. |
| Dowód | `docs/design-system-exceptions.json`, wynik `design-system:audit`; top: `GoalWorkspaceViews` 62, `Kalendarz` 22, `Zadania` 21, `GoalDialogs` 19. |
| Skala | 30 plików z literalnymi objects, 33 z dowolnym style expression. |
| Przyczyna | Wyjątki rejestrowane na poziomie pliku legalizują także niepowiązane statyczne deklaracje. |
| Rekomendacja | Podzielić wyjątki na dynamic position/transform/color/custom property; statyczne layout/font/radius przenieść do klas lub komponentów. |
| Koszt | L |
| Pewność | **Wysoka** |

### RTN-012 — publiczne API prymitywów jest niepełne lub nieadoptowane

| Pole | Wartość |
| --- | --- |
| ID | RTN-012 |
| Priorytet | **P2** |
| Kategoria | component |
| Lokalizacja | icon-only actions, formularze multiline, stat/progress, Nutrition Analysis |
| Porównanie | `IconButton` wymaga `aria-label`, ale nie ma konsumentów; `Button iconOnly` nie wymusza nazwy. Input/Select mają contract label/hint/error, Textarea nie. |
| Oczekiwane | Publiczne API albo jest obowiązującą ścieżką i ma konsumentów, albo nie jest eksportowane jako pozorna gwarancja. |
| Faktyczne | `IconButton` 0 vs 121 `iconOnly` (112 poza UI); 15 raw textarea/10 plików; ProgressBar/StatCard/StatGrid/PageToolbar 0; 2 native selecty w Nutrition Analysis. |
| Dowód | `IconButton.tsx:4–24`; `Button.tsx:6–13`; `NutritionAnalysis.tsx:410–416,479–485`; skan JSX. |
| Skala | 21 plików z `iconOnly`, 10 z textarea, kilka martwych eksportów. |
| Przyczyna | Biblioteka rozrosła się szybciej niż migracja callsites i egzekwowanie typów. |
| Rekomendacja | Wymusić accessible name dla icon-only; dodać wspólny Textarea; przyjąć albo usunąć martwe stat/progress APIs; zastąpić duplikaty Select. |
| Koszt | M–L |
| Pewność | **Wysoka** |

### RTN-013 — feedback i undo są implementowane lokalnie w wielu modułach

| Pole | Wartość |
| --- | --- |
| ID | RTN-013 |
| Priorytet | **P2** |
| Kategoria | component |
| Lokalizacja | Zadania, Kalendarz, Cele, Notatki, Praca, Sport, Odżywianie, JDG, Podróże oraz reminder centers |
| Porównanie | Każdy moduł tworzy własną klasę, timer, rolę live, wariant przycisku i pozycję; wspólnego Toast/Undo brak. |
| Oczekiwane | Jeden kontrakt kolejki komunikatów, czasu, dismiss, undo, live region i reduced motion. |
| Faktyczne | `task-bulk-undo`, `calendar-undo`, `notes-undo`, `work-toast`, `sport-undo-toast`, `jdg-undo`, `travel-trip-undo` i inne działają niezależnie. |
| Dowód | `Zadania.tsx:1268`; `Kalendarz.tsx:1044`; `Cele.tsx:905`; `Notatki.tsx:1319`; `Praca.tsx:1777`; `Sport.tsx:1422–1436`; `Jdg.tsx:808`; `Podroze.tsx:941`. |
| Skala | Co najmniej 9 modułów i kilkanaście powierzchni feedbacku. |
| Przyczyna | Brak platformowego hosta/queue i polityki undo. |
| Rekomendacja | Wprowadzić wspólny `FeedbackHost`/`Toast` z semantycznymi wariantami i opcjonalną akcją undo; pozostawić lokalne treści domenowe. |
| Koszt | M |
| Pewność | **Wysoka** |

### RTN-014 — breakpoint governance ma cztery rozjechane rejestry

| Pole | Wartość |
| --- | --- |
| ID | RTN-014 |
| Priorytet | **P2** |
| Kategoria | token |
| Lokalizacja | `experience.css`, `breakpoints.ts`, exceptions JSON, mirror tokens i docs |
| Porównanie | Oficjalne 1380/1180/980/760 są spójne w runtime; feature exceptions nie są spójne między rejestrami. |
| Oczekiwane | Jedno źródło breakpointów i generowane mirrors/exceptions. |
| Faktyczne | 600 px jest niezarejestrowane; 1280 istnieje tylko w TS; JSON ma 1040 dla nieistniejącego `assistant.css`; audit FAIL. |
| Dowód | `experience.css:213–220`; `breakpoints.ts:8–30`; `design-system-exceptions.json:2–39`; `tokens.css:594–603`. |
| Skala | 4 rejestry, 93 media queries. |
| Przyczyna | Ręczne utrzymywanie CSS, TS, JSON i dokumentacji. |
| Rekomendacja | Wybrać jeden manifest, generować pozostałe artefakty i usuwać wyjątki razem z właścicielem pliku. |
| Koszt | S–M |
| Pewność | **Wysoka** |

### RTN-015 — secondary token contracts są deklarowane, lecz implementacja je omija

| Pole | Wartość |
| --- | --- |
| ID | RTN-015 |
| Priorytet | **P2** |
| Kategoria | token |
| Lokalizacja | density, checkbox/menu geometry, taxonomy colors, runtime aliases |
| Porównanie | Tokeny checkbox 18/16 i menu row 28 istnieją, ale CSS wpisuje wartości literalnie; density redefiniuje globalną skalę poza `tokens.css`. |
| Oczekiwane | Zmiana tokenu zmienia runtime; warianty density są pierwszorzędnym, udokumentowanym trybem. |
| Faktyczne | Component tokens są martwe, `experience.css:904–914` nadpisuje row heights, 88 raw color hits są wyciszone wyjątkami, 8/11 alias groups nie ma konsumentów. |
| Dowód | `tokens.css:120–127,549–590`; `ui.css:898–912`; `experience.css:904–914`; `src/app/ui/tokens.ts`; exception registry. |
| Skala | Cała warstwa density; 88 trafień regex poza `tokens.css` (70 w danych/modelach/migracjach i 18 w preview motywów, także komentarze/stare wartości); 8 grup API. |
| Przyczyna | Tokeny dodano bez migracji konsumentów; taxonomy przechowuje prezentacyjne hex. |
| Rekomendacja | Podłączyć component geometry, opisać density jako wariant, zastąpić persisted hex semantycznym ID przy kolejnej migracji, usunąć martwe aliases. |
| Koszt | M–L |
| Pewność | Wysoka |

### RTN-016 — reduced motion działa, ale kontrakt jest zbyt globalny

| Pole | Wartość |
| --- | --- |
| ID | RTN-016 |
| Priorytet | **P2** |
| Kategoria | accessibility |
| Lokalizacja | global `prefers-reduced-motion` i preference override; spinnery/ambient/skeleton |
| Porównanie | Runtime na 5 ekranach nie ma aktywnych animacji; jednocześnie dwa catch-all ustawiają każdą transition/animation na 0,01/1 ms z `!important`. |
| Oczekiwane | Ruch transformacyjny/dekoracyjny jest redukowany, a potrzebny feedback stanu zachowany. |
| Faktyczne | Reguła kasuje wszystkie rodzaje ruchu; feature CSS dodaje 6 surowych czasów 700–1400 ms. |
| Dowód | `app-shell.css:1001–1009`; `experience.css:993–999`; `experience.css:18`; `nutrition.css:1083`; `app-shell.css:987`; `app-base.css:113`. |
| Skala | Całe drzewo aplikacji, wszystkie motywy i moduły. |
| Przyczyna | Bezpieczny fallback powstał bez semantycznych kategorii motion. |
| Rekomendacja | Dodać role motion decorative/spatial/feedback i ograniczyć catch-all; objąć testem zarówno brak ruchu, jak i widoczność zmiany stanu. |
| Koszt | M |
| Pewność | Wysoka |

### RTN-017 — chart system jest phantom API

| Pole | Wartość |
| --- | --- |
| ID | RTN-017 |
| Priorytet | **P2** |
| Kategoria | component |
| Lokalizacja | Odżywianie Analiza, Sport Analiza, task summary/progress |
| Porównanie | Design system deklaruje 7 ról chart i `uiChartColors`; żaden renderujący konsument ich nie używa. |
| Oczekiwane | Minimalny wspólny kontrakt: grid/axis/goal/average/series, rola/label/fallback/focus, bez narzucania jednej geometrii. |
| Faktyczne | Nutrition ma własne SVG i geometrię 720 px; Sport div chart z lokalnym `scaleY`; wspólny ProgressBar ma 0 konsumentów. |
| Dowód | `tokens.css:134–141`; `tokens.ts:156–164`; `NutritionAnalysis.tsx:48,423–524`; `SportInsights.tsx:993–1037`; `ProgressBar.tsx`. |
| Skala | Co najmniej 3 dialekty wizualizacji w 3 obszarach. |
| Przyczyna | Tokeny powstały bez komponentowego/adopcyjnego planu. |
| Rekomendacja | Zdefiniować dostępny chart contract i migrować istniejące wykresy stopniowo; nie budować jednego monolitycznego wykresu. |
| Koszt | M |
| Pewność | Wysoka |

### RTN-018 — deep linki i powrót nie zachowują obiecanego kontekstu

| Pole | Wartość |
| --- | --- |
| ID | RTN-018 |
| Priorytet | **P2** |
| Kategoria | functional |
| Lokalizacja | JDG `month`; stale `/praca?projekt=`; goal → linked task; Dzisiaj → Nutrition date; pełny cel → back |
| Porównanie | Cele list i Notatki kodują bogaty state w URL; pięć słabszych wejść psuje kontekst na różne sposoby: JDG generuje niekonsumowany parametr, dwa linki nie przekazują potrzebnego kontekstu, Work nie waliduje ID, a back z celu hardkoduje trasę domyślną. |
| Oczekiwane | CTA/deep link otwiera dokładnie wskazany rekord, datę i kontekst; invalid ID ma jawny fallback. |
| Faktyczne | JDG ignoruje `month`; stale project daje pusty workspace; linked task otwiera ogólne `/zadania`; Nutrition może pokazać zapamiętany inny dzień; back z celu resetuje listę, a invalid goal ma tylko `h2`. |
| Dowód | `Jdg.tsx:139,189–195,463–476`; `workPresentation.tsx:257–277`; `Praca.tsx:250–256,1398–1400`; `CelSzczegoly.tsx:89–100,234,304–308`; `Dzisiaj.tsx:497–508,709–711`; `Odzywanie.tsx:95–143`. |
| Skala | 5 przepływów w 5 obszarach produktu. |
| Przyczyna | Niespójny podział state między path/query/module memory/local state. |
| Rekomendacja | Zdefiniować route-state contract dla daty, selection i `from`; walidować/canonical replace invalid params. |
| Koszt | M |
| Pewność | Wysoka dla kodu, średnia dla nieuruchomionych kombinacji |

### RTN-019 — inicjalny remote sync może bezterminowo zasłonić aplikację

| Pole | Wartość |
| --- | --- |
| ID | RTN-019 |
| Priorytet | **P2** |
| Kategoria | functional |
| Lokalizacja | start zalogowanej sesji Supabase, `RemotePersistenceProvider` |
| Porównanie | Jawny błąd przechodzi do local-first; promise, który nigdy się nie rozstrzyga, nie ma timeoutu ani „Kontynuuj lokalnie”. |
| Oczekiwane | Ograniczony czas oczekiwania, retry/cancel i local mode. |
| Faktyczne | Globalny loader trwa, dopóki `readyUserId` nie zrówna się z user ID. |
| Dowód | `src/infrastructure/supabase/RemotePersistenceProvider.tsx:35–106`. |
| Skala | Każda zalogowana sesja przy zawieszonym backendzie/sieci. |
| Przyczyna | Error path istnieje, timeout/hang path nie. |
| Rekomendacja | Timeout z czytelnym fallbackiem, retry i telemetrią czasu inicjalnego sync. |
| Koszt | S–M |
| Pewność | Wysoka dla kodu / średnia dla realnego hang bez backendu |

### RTN-020 — modal „Edytuj cel” przycina główne akcje i ukrywa scroll

| Pole | Wartość |
| --- | --- |
| ID | RTN-020 |
| Priorytet | **P2** |
| Kategoria | UX |
| Lokalizacja | Cele → menu karty → Edytuj przy 1366×768 i 1440×900 |
| Porównanie | Nowy szablon Sportu mieści stopkę; GoalForm przekracza max-height o 55 px i nie pokazuje scrollbar. |
| Oczekiwane | Body jest jedynym scroll ownerem, a primary/secondary actions pozostają widoczne w sticky footer. |
| Faktyczne | 1366: 676/731 px, CTA ~20,5/40 px wewnątrz clipu; 1440: 792/847, ~21,4/40. Wheel odsłania stopkę, więc flow nie jest całkiem zablokowany. |
| Dowód | [`targeted-1366x768__goal-edit-initial.png`](audit-visual-agent-c/targeted-1366x768__goal-edit-initial.png), [`targeted-1440x900__goal-edit-initial.png`](audit-visual-agent-c/targeted-1440x900__goal-edit-initial.png), [`targeted-data.json`](audit-visual-agent-c/targeted-data.json); `ui.css:794–801`; `GoalDialogs.tsx:627–630`. |
| Skala | 1 długi modal, 2 najciaśniejsze wymagane viewporty, 2 główne callsites. |
| Przyczyna | Akcje są w body całego scrollującego modala; `scrollbar-width:none`. |
| Rekomendacja | Użyć `Modal.footer` sticky i przewijać wyłącznie body; pozostawić sygnał dalszej treści. |
| Koszt | S–M |
| Pewność | **Wysoka** |

### RTN-021 — modal otwarty z menu nie przywraca fokusu do triggera

| Pole | Wartość |
| --- | --- |
| ID | RTN-021 |
| Priorytet | **P2** |
| Kategoria | accessibility |
| Lokalizacja | Cele overview → menu karty → Edytuj → Escape; 1366 i 1440 |
| Porównanie | Modal Sportu otwarty bezpośrednim CTA wraca do CTA; modal celu zapisuje odmontowany `menuitem`. |
| Oczekiwane | Focus wraca do stabilnego przycisku „Więcej opcji”. |
| Faktyczne | Po Escape aktywny element to `BODY`; `returnedToTrigger=false` w obu viewportach. |
| Dowód | [`targeted-data.json`](audit-visual-agent-c/targeted-data.json); `Modal.tsx:59,112–116`. |
| Skala | 1 potwierdzony przepływ; potencjalnie każde menu → modal. |
| Przyczyna | Zapamiętany element menu jest odmontowany przed cleanupem modala. |
| Rekomendacja | Dodać `returnFocusRef`/invoker contract i test menu → modal → Escape. |
| Koszt | S |
| Pewność | **Wysoka** |

### RTN-022 — kontener grup Zadań używa niedozwolonego `aria-label`

| Pole | Wartość |
| --- | --- |
| ID | RTN-022 |
| Priorytet | **P2** |
| Kategoria | accessibility |
| Lokalizacja | Zadania: Jutro, 7 dni, 30 dni |
| Porównanie | Nazwane kolekcje używają `section/nav/group`; `.task-groups` jest zwykłym `div`. |
| Oczekiwane | Accessible name tylko na elemencie/roli, która go wspiera. |
| Faktyczne | `<div class="task-groups" aria-label="Grupy zadań">`; axe serious. |
| Dowód | [`audit-data.json`](audit-visual-agent-c/audit-data.json); `Zadania.tsx:1465`. |
| Skala | 3 podwidoki. |
| Przyczyna | Częściowa semantyzacja lokalnego kontenera. |
| Rekomendacja | Użyć `<section aria-label>` albo uzasadnionego `role=group`; zachować sens struktury czytnika. |
| Koszt | S |
| Pewność | **Wysoka** |

### RTN-023 — linki źródeł danych w Nutrition odróżnia prawie wyłącznie kolor

| Pole | Wartość |
| --- | --- |
| ID | RTN-023 |
| Priorytet | **P2** |
| Kategoria | accessibility |
| Lokalizacja | Odżywianie → Dodaj produkt → stopka attribution |
| Porównanie | Inne linki mają underline/border; Open Food Facts i USDA są częścią szarego akapitu bez underline. |
| Oczekiwane | Stałe podkreślenie lub różnica koloru ≥3:1 względem tekstu otoczenia. |
| Faktyczne | Różnica link/tekst 1,16:1; axe `link-in-text-block`, serious. |
| Dowód | [`1440x900__state-nutrition-add-product-dialog.png`](audit-visual-agent-c/1440x900__state-nutrition-add-product-dialog.png); `Odzywanie.tsx:1507–1512`; `nutrition.css:1092–1102`. |
| Skala | 2 linki w jednym kluczowym formularzu. |
| Przyczyna | Ustawiono underline offset, ale nie `text-decoration`. |
| Rekomendacja | Włączyć stały underline i zachować focus/hover; attribution pozostawić. |
| Koszt | S |
| Pewność | **Wysoka** |

### RTN-024 — Cykl Sportu przycina sześć fragmentów informacji

| Pole | Wartość |
| --- | --- |
| ID | RTN-024 |
| Priorytet | **P2** |
| Kategoria | Visual |
| Lokalizacja | `/sport?widok=cycle`, desktop 1440 i ciaśniejsze układy |
| Porównanie | Inne schedule/grid views zachowują pełne nazwy lub świadome ellipsis; test clipping wykrywa teksty tygodni/metadane dnia. |
| Oczekiwane | Tekst istotny dla planu mieści się, zawija kontrolowanie albo ma pełną nazwę dostępną. |
| Faktyczne | `e2e/clipping.spec.ts` zgłasza 6 przyciętych elementów; to jedyny realny defekt produktu wśród 5 desktopowych failure’ów. |
| Dowód | uruchomienie `playwright --project=desktop-1440`; [`1440x900__sport-cycle.png`](audit-visual-agent-c/1440x900__sport-cycle.png); CSS week tabs/day metadata. |
| Skala | 1 podwidok, 6 elementów; kluczowy planer treningowy. |
| Przyczyna | Stałe/ciasne kolumny i zbyt dużo meta w jednym rzędzie. |
| Rekomendacja | Ustalić priorytet informacji, dać min-width lub świadome dwuwierszowe meta; zachować pełną accessible name. |
| Koszt | S–M |
| Pewność | Wysoka |

### RTN-025 — główne CTA Odżywiania nazywa inny obiekt niż otwierany formularz

| Pole | Wartość |
| --- | --- |
| ID | RTN-025 |
| Priorytet | **P2** |
| Kategoria | content |
| Lokalizacja | `/odzywianie`, ContentHeader → „Dodaj posiłek” |
| Porównanie | Modal mówi „Dodaj produkt”, lokalna akcja „Dodaj produkt do: Śniadanie”, primary „Dodaj do dziennika”. |
| Oczekiwane | Etykieta wejścia opisuje dokładny rezultat albo uruchamia rzeczywisty flow posiłku wieloelementowego. |
| Faktyczne | „Dodaj posiłek” otwiera formularz produktu/wpisu. |
| Dowód | [`1440x900__nutrition-today.png`](audit-visual-agent-c/1440x900__nutrition-today.png), [`1440x900__state-nutrition-add-product-dialog.png`](audit-visual-agent-c/1440x900__state-nutrition-add-product-dialog.png); `Odzywanie.tsx:1049–1050,1365`. |
| Skala | 1 główne CTA w codziennym kluczowym flow. |
| Przyczyna | Copy headera używa pojęcia domenowego „posiłek”, formularz operuje wpisem/produktem. |
| Rekomendacja | Ujednolicić na „Dodaj produkt/wpis” albo zmienić zachowanie na prawdziwe tworzenie posiłku. |
| Koszt | S |
| Pewność | **Wysoka** |

### RTN-026 — Dzisiaj powtarza te same trzy metryki w czterech strefach

| Pole | Wartość |
| --- | --- |
| ID | RTN-026 |
| Priorytet | **P2** |
| Kategoria | content |
| Lokalizacja | `/dzisiaj`: ContentHeader, hero, ring, zaległości i rejestr modułów |
| Porównanie | Rejestr daje lokalny drill-down; hero powinien dawać jedną syntezę, a nie powtarzać headline. |
| Oczekiwane | Jeden nadrzędny odczyt każdej metryki plus szczegół lokalny. |
| Faktyczne | 25 pozostało, 15 zaległych i 6 wymagających uwagi powtarzają się w nagłówku/hero/ringu/panelu, potem ponownie per moduł. |
| Dowód | [`1440x900__today.png`](audit-visual-agent-c/1440x900__today.png); [`copy-checks.json`](audit-visual-agent-c/copy-checks.json). |
| Skala | 3 metryki, 4 strefy jednego pierwszego viewportu. |
| Przyczyna | Niezależne agregatory ContentHeader, living-day hero i module register. |
| Rekomendacja | Zachować po jednej liczbie hero/alert i pełny drill-down w wierszach; usunąć liczby z meta headera albo centrum ring. |
| Koszt | S–M |
| Pewność | **Wysoka** |

### RTN-027 — dokumentacja produktu i inwentarze nie opisują bieżącej aplikacji

| Pole | Wartość |
| --- | --- |
| ID | RTN-027 |
| Priorytet | **P2** |
| Kategoria | content |
| Lokalizacja | `PRODUCT.md`, `README.md`, brakujące dokumenty inwentarza i approved surface briefs |
| Porównanie | PRODUCT mówi „bez kont/backendu, sync w przyszłości”; README/kod mają opcjonalne Supabase auth/sync. Brief oczekiwał IA/screen/component/copy inventories, których pod tymi nazwami brak. |
| Oczekiwane | Dokument produktu opisuje aktualny capability set, a inwentarze są generowane z routera/barrela lub jawnie zastąpione. |
| Faktyczne | Źródła pomagają, ale są częściowe i rozproszone; Goals visual baseline nie odpowiada zatwierdzonemu „Następne kroki”. |
| Dowód | `PRODUCT.md`; `README.md`; `src/infrastructure/supabase`; `docs/design-system-*`; `.impeccable/*`; `e2e/goals.spec.ts`. |
| Skala | Produkt, onboarding contributorów i QA wszystkich modułów. |
| Przyczyna | Dokumenty ręczne nie są sprzężone z route/component registries i decyzjami. |
| Rekomendacja | Utworzyć generowane IA/screen/component inventories oraz aktualizować PRODUCT/decision log przy zmianie capability. |
| Koszt | M |
| Pewność | Wysoka |

### RTN-028 — meta Zadań i placeholdery Sportu są przypadkowo ucinane

| Pole | Wartość |
| --- | --- |
| ID | RTN-028 |
| Priorytet | **P3** |
| Kategoria | Visual |
| Lokalizacja | Zadania Dziś przy 1366/1440; Sport Szablony/Ćwiczenia przy 1440 |
| Porównanie | Pełna data mieści się przy 1920/2560; placeholder ma 238,6 px tekstu w polu ~167 px. |
| Oczekiwane | Świadomy krótki format zamiast losowego urwania słowa. |
| Faktyczne | Task meta 189/215 i 206/215 px; placeholder pokazuje „Szukaj po nazwie, ćwicz…”. |
| Dowód | [`copy-checks.json`](audit-visual-agent-c/copy-checks.json); screenshoty `tasks-today`, `sport-templates`, `sport-exercises`. |
| Skala | 3 podwidoki, w tym referencyjny viewport. |
| Przyczyna | Zatłoczony slot headera i zbyt opisowy placeholder w stałej kolumnie. |
| Rekomendacja | Data `pon., 10 sie`; placeholdery „Szukaj szablonów…” / „Szukaj ćwiczeń…”, pełny zakres w label/hint. |
| Koszt | S |
| Pewność | **Wysoka** |

### RTN-029 — martwe preferencje i metadane tras rozchodzą się z runtime

| Pole | Wartość |
| --- | --- |
| ID | RTN-029 |
| Priorytet | **P3** |
| Kategoria | functional |
| Lokalizacja | Tasks view mode/filter persistence, `ROUTE_LAYOUT_AUDIT` 404, invalid `widok` Spraw |
| Porównanie | Runtime 404 ma `h1`, audit mówi `none`; Tasks zapisuje preferencje bez ich odtwarzania; Sprawy fallbackuje widok, ale nie kanonizuje URL. |
| Oczekiwane | Rejestr i persistence mają aktywnego konsumenta albo są usunięte; invalid query jest replace’owany. |
| Faktyczne | Trzy małe kontrakty są martwe lub niekanoniczne. |
| Dowód | `taskPageModel.ts:143–207`; `Zadania.tsx:103–110`; `Kalendarz.tsx:253–316`; `routes.ts:49`; `RouteStates.tsx:127–145`; `affairsPresentation.ts:289–299`. |
| Skala | 3 kontrakty w 2 modułach i globalnym audycie tras. |
| Przyczyna | Ewolucja zachowania bez cleanupu helperów/metadata. |
| Rekomendacja | Zdecydować, czy Tasks ma pamiętać state; poprawić metadata i canonical replace; usunąć martwy kod. |
| Koszt | S |
| Pewność | Wysoka |

### RTN-030 — lokalny dług CSS/API zwiększa koszt zmian bez obecnej regresji

| Pole | Wartość |
| --- | --- |
| ID | RTN-030 |
| Priorytet | **P3** |
| Kategoria | token |
| Lokalizacja | `ui.css`, Kalendarz/Zadania radius, layer names, dead PageHeader/API aliases |
| Porównanie | Aktywny shell działa i radius jest prawie w pełni tokenowy; kod zawiera dwie ery layoutu i kilka martwych kontraktów. |
| Oczekiwane | Jedna aktywna topologia CSS i publiczne API z realnymi konsumentami. |
| Faktyczne | flex block `ui.css:430–477` + późny grid `1151–1249`; radius 15/20; `page-header-height`, ContextSidebar, PageToolbar i 8 alias groups martwe; 24 layer names trudne do przewidzenia. |
| Dowód | wskazane pliki i skan konsumentów; `experience.css:279`; `Kalendarz.tsx:1242–1298`; `Zadania.tsx:1305–1308`. |
| Skala | Globalna biblioteka + 3 lokalne bypassy. |
| Przyczyna | Kompatybilność i migracje pozostawione obok końcowego kontraktu. |
| Rekomendacja | Cleanup dopiero po decyzjach P1/P2; nie mieszać go z funkcjonalnymi hotfixami. |
| Koszt | M |
| Pewność | Wysoka |

### RTN-031 — część dismissali jest wyłącznie stanem komponentu

| Pole | Wartość |
| --- | --- |
| ID | RTN-031 |
| Priorytet | **P3** |
| Kategoria | UX |
| Lokalizacja | wybrane reminder/toast dismissals w centrach Zadań/Spraw i lokalnych modułach |
| Porównanie | Niektóre akcje są trwałe/undoable, inne wracają po reloadzie bez jawnej polityki. |
| Oczekiwane | Dismiss ma zdefiniowany czas życia: komunikat, sesja, dzień lub trwały. |
| Faktyczne | Część zamknięć żyje tylko w local component state. |
| Dowód | `TaskReminderCenter.tsx`, `AffairsReminderCenter.tsx` i lokalne stany toast/dismiss; pełna intencja produktu nieudokumentowana. |
| Skala | Kilka klas komunikatów w co najmniej 2 centrach i modułach lokalnych. |
| Przyczyna | Brak platformowej polityki feedback/dismiss. |
| Rekomendacja | Ustalić lifecycle w ramach wspólnego FeedbackHost; nie utrwalać wszystkich dismissali automatycznie. |
| Koszt | S–M |
| Pewność | Średnia |

## 7. Raport zbędnych i powtarzalnych treści

| Treść / lokalizacja | Decyzja | Dowód i uzasadnienie | Co użytkownik traci | Co użytkownik zyskuje / gdzie informacja zostaje |
| --- | --- | --- | --- | --- |
| Dzisiaj: „25 pozostało” w headerze, hero i ringu | **połączyć** | [`1440x900__today.png`](audit-visual-agent-c/1440x900__today.png); trzy prezentacje tej samej sumy w pierwszym viewportcie | Jedno z trzech powtórzeń, nie samą metrykę | szybszy skan; liczba pozostaje jako headline, ring może pokazywać wyłącznie rozkład |
| Dzisiaj: „15 zaległych” w subtitle i osobnym panelu | **uprościć** | osobny panel ma CTA i jest właściwym miejscem działania | powtórzenie w subtitle | jeden wyraźny alert z „Przejrzyj zaległe”; szczegół pozostaje w wierszach Zadania/Praca |
| Dzisiaj: „6 wymaga uwagi” w headerze i hero | **połączyć** | ta sama informacja na dwóch poziomach hierarchii | redundantne meta headera lub hero | jedno czytelne wskazanie; lokalne przyczyny pozostają w rejestrze modułów |
| Dzisiaj: zaległości per Zadania/Praca | **zachować** | to lokalny kontekst i wejście do działania, nie tylko suma | nic | użytkownik widzi, gdzie jest problem i może wejść w moduł |
| Praca: 0 dziś / 4 overdue w sidebarze, summary i sekcji | **uprościć** | liczby nawigacyjne i treść sekcji częściowo opisują ten sam zakres | jedno globalne powtórzenie | count zostaje przy właściwym widoku/sekcji; mniej konkurujących alertów |
| Sport Cykl: „Tydzień 1 z 12” w aktywnym planie, karuzeli i zakładce | **uprościć** | aktywny plan potrzebuje zakresu, nawigator już wskazuje bieżący tydzień | jedno zdanie pomocnicze | stan nadal wynika z aktywnej zakładki i nagłówka planu |
| Odżywianie: `0 produktów · 0/2300 kcal` w headerze i karta bilansu | **przenieść** do karty bilansu | header powinien identyfikować datę/akcję, karta ma kontekst celu i trendu | szybki odczyt w headerze | czytelniejsza hierarchia; pełne 0/2300 pozostaje obok celu i makro |
| Odżywianie: „Dodaj posiłek” → „Dodaj produkt” | **zmienić**, nie usuwać | RTN-025; nazwa obiektu zmienia się w jednym flow | nieprecyzyjne słowo „posiłek” | przewidywalność; użytkownik wie, że dodaje produkt/wpis do slotu |
| Odżywianie: cztery puste sekcje posiłków z lokalnym CTA | **zachować** | każda akcja ma inny kontekst slotu i zmniejsza liczbę kroków | nic | szybkie dodanie dokładnie do śniadania/obiadu/kolacji/przekąski |
| Attribution Open Food Facts/USDA | **zachować**, poprawić linki | buduje zaufanie i może być wymagane licencyjnie; RTN-023 dotyczy stylu | nic | źródło danych pozostaje jawne, a link staje się rozpoznawalny |
| Zadania: pełna data w zatłoczonym headerze | **skrócić kontrolowanie** | przy 1366/1440 losowe ellipsis; RTN-028 | pełna nazwa dnia/miesiąca w tym miejscu | stabilny „pon., 10 sie”; pełna data może zostać w accessible name/tooltipie |
| Sport: długie placeholdery wyszukiwania | **uprościć** | placeholder jest zawsze ucięty; zakres działania może być hintem | enumerację wszystkich pól w samym placeholderze | czytelne „Szukaj szablonów…” / „Szukaj ćwiczeń…”, pełny zakres w label/hint |
| Sport: helper „Zawartość widoczna…” | **zachować** | wyjaśnia różnicę browse/edit i wspiera pierwszy kontakt | nic | mniejsze ryzyko błędnej interpretacji trybu |
| Notatki: counts w nawigacji i kolekcji | **zachować** | count nawigacyjny opisuje zakres, count listy aktualny wynik/filter | nic | orientacja w IA i wyniku wyszukiwania |
| Cele: progress w sidebarze i na kartach | **zachować** | poziomy mają inny zakres: agregat vs konkretny cel | nic | porównanie portfela i szczegółu bez dodatkowej nawigacji |

Nie rekomenduje się usuwania treści tylko dlatego, że liczba pojawia się dwa razy. Powtórzenie jest uzasadnione, gdy jedno miejsce służy nawigacji/agregacji, a drugie decyzji lokalnej. Redukcja dotyczy wyłącznie przypadków, w których źródło, zakres i następna akcja są identyczne.

## 8. Sprzeczności dokumentacji i implementacji

Poniższa tabela nie wybiera cicho jednej wersji. „Rekomendowane źródło prawdy” oznacza proces rozstrzygnięcia, nie automatyczne uznanie obecnego kodu za poprawny design.

| Temat | Dokument / zatwierdzony obraz | Implementacja / runtime | Faktyczne użycie | Rekomendowane źródło prawdy |
| --- | --- | --- | --- | --- |
| Paleta graphite | `DESIGN.md` frontmatter z `#101214/#20242A/#F2F3F5` | aktywne `#15181b/#24292f/#f1f0ec` i 6 theme scopes | runtime korzysta z tokenów | decyzja design ownera, następnie semantyczny `tokens.css` jako generator docs |
| Liczba motywów | dokument czyta się jak jeden graphite | `appTheme.ts` i `tokens.css` mają 6 pełnych motywów, w tym Warm Linen | wszystkie role są theme-aware | theme registry + generowana macierz ról; frontmatter bez ręcznych snapshotów |
| Button/Modal/Select/Badge/EmptyState | wartości opisane w `DESIGN.md` | inne foreground, width, backdrop, row height, padding, border | setki callsites używają runtime | decyzja per komponent; test renderu i props API po zatwierdzeniu |
| DetailPanel | docked >1380, overlay ≤1380 | absolute overlay na każdej szerokości; modalny tylko ≤1380 | 8 użyć w 6 modułach | ADR/decision record dla docked vs overlay; potem jeden Shell contract |
| Sport i Travel sidebar | `DESIGN.md:306` sugeruje tabs/filters bez context sidebar | oba używają 220 px ModuleSidebar | runtime jest spójny z resztą shell | potwierdzić intencję IA; zaktualizować DESIGN lub zmienić oba archetypy razem |
| Konta/backend | `PRODUCT.md`: brak kont/backendu, sync przyszły | README i kod mają opcjonalne Supabase auth/sync | provider działa jako capability | aktualna capability matrix w PRODUCT; roadmap oddzielona od stanu wdrożonego |
| Quality gate | `DESIGN.md`: detector `[]`, check 68/314 PASS | lint/governance FAIL; testy 48/254 | bieżące komendy są rozstrzygające | CI jako źródło wyniku; dokument generowany, bez ręcznych liczb |
| Breakpointy | docs/JSON zawierają 1040 assistant | pliku `assistant.css` brak; TS ma 1280; CSS dodał 600 | runtime 4 głównych progów stabilny | jeden manifest + generowane TS/JSON/docs/mirrors |
| Goals screenshot/default | stary visual regression oczekuje `.goal-card-more`/grid | zatwierdzony surface brief i runtime używa „Następne kroki” | test timeoutuje, ekran jest spójny | design owner potwierdza aktualny default, potem baseline jest odświeżany |
| Route audit 404 | `ROUTE_LAYOUT_AUDIT`: `h1:none` | `RouteNotFoundState` renderuje `h1` | runtime jest semantycznie lepszy | komponent runtime + automatyczny semantic route test |
| PageHeader | dokument mówi, że globalny PageHeader usunięto | `--page-header-height` i `uiLayout.pageHeaderHeight` nadal istnieją | brak konsumenta | decyzja jest już udokumentowana; usunąć stale API w cleanupie |
| Missing inventories | brak plików `INFORMATION_ARCHITECTURE`, `SCREEN_INVENTORY`, `COMPONENT_INVENTORY`, `COPY_GUIDELINES_PL` pod oczekiwanymi nazwami | informacje są rozproszone w routerze, registry, UI README, docs i surface briefs | dało się odtworzyć, ale ręcznie | generowane inwentarze z route registry/UI barrel + jawny indeks dokumentów |

## 9. Quick wins — maksymalnie 10

1. **Flush zapisu Pracy przy cleanup/pagehide** i dodać test nawigacji <260 ms — najwyższy efekt, przewidywany koszt S–M.
2. **Dodać SPA catch-all na Vercel** oraz smoke obu nested routes Odżywiania — koszt S.
3. **Naprawić `.task-groups`** przez semantyczne `<section aria-label>` lub uzasadnione `role=group` — koszt S.
4. **Dodać stałe underline do linków attribution Nutrition** — koszt S.
5. **Podmienić trzy zestawy tokenów kontrastu** dla completed/on-accent/neutral badge i uruchomić axe na pięciu podwidokach — koszt S–M.
6. **Dodać `returnFocusRef` do modali otwieranych z menu** i test menu → modal → Escape — koszt S.
7. **Przenieść GoalForm actions do sticky `Modal.footer`** z jednym scroll ownerem — koszt S–M.
8. **Oczyścić breakpoint registry**: zarejestrować albo usunąć 600, usunąć stale 1040/assistant i zsynchronizować 1280 — koszt S.
9. **Przywrócić zielony sygnał QA**: usunąć 6 lint warnings, poprawić seed wolumenu, selektor hydration i kontrolowany lazy failure; zatwierdzić aktualny baseline Goals — koszt M.
10. **Ujednolicić trzy krótkie teksty**: „Dodaj produkt/wpis”, responsywna data Zadań i krótkie placeholdery Sportu — koszt S.

Nie umieszczono tu pełnej migracji inline styles, wspólnego Toast ani przebudowy RecordTable: mają duży efekt, ale nie są zmianami o małym koszcie.

## 10. Pięcioetapowy plan naprawczy

### Etap 1 — fundamenty i tokeny

**Najpierw:** naprawić RTN-001 jako release gate. Następnie zatwierdzić hierarchy source of truth, paletę sześciu motywów, docked/overlay decision oraz kontrakty Button/Modal/Select. Ujednolicić manifest breakpointów, role kontrastu i density. Przywrócić zielone `check`/governance.

**Rezultat:** jedna decyzja dla każdej roli, brak czerwonych bramek, test regresyjny P0.  
**Kryterium wyjścia:** `npm run check` i design-system audit przechodzą; dokument nie zawiera ręcznie rozbieżnych wartości.

### Etap 2 — komponenty współdzielone

Wprowadzić jeden ConfirmDialog i politykę destructive/undo; wspólny Textarea, dostępny RecordTable, FeedbackHost/Toast, przyjęty IconButton contract, sticky Modal footer i `returnFocusRef`. Zdecydować o Progress/Stat/Chart APIs i usunąć pozorne eksporty, których zespół nie chce adoptować.

**Rezultat:** analogiczne akcje wyglądają i zachowują się analogicznie.  
**Kryterium wyjścia:** brak `window.confirm`, brak drugiego `ConfirmDialog`, Sport bez krytycznych ról ARIA, icon-only name wymuszane typem.

### Etap 3 — layout i archetypy ekranów

Wdrożyć zatwierdzony kontrakt DetailPanel, skorygować Cykl Sportu, ujednolicić jeden scroll owner w długich modalach i uporządkować dualne reguły shell. Zachować celowe archetypy: Dzisiaj jako dashboard, Calendar jako grid, Sport jako planer, a nie jeden uniwersalny layout.

**Rezultat:** stabilna geometria bez przykrywania ważnej treści i bez przypadkowego clippingu.  
**Kryterium wyjścia:** snapshoty 1366/1440/1920/2560 oraz 1379/1381 przechodzą dla wszystkich panel archetypes.

### Etap 4 — lokalne problemy UX i copy

Wdrożyć wspólny dirty/draft lifecycle dla Celów, Odżywiania, Spraw, Podróży i całej Pracy. Naprawić deep-link state, timeout initial sync, politykę undo/dismiss i redukcję treści Dzisiaj. Ujednolicić nazwy obiektów oraz świadome skróty dat/placeholderów.

**Rezultat:** użytkownik nie traci pracy ani kontekstu, a każdy komunikat ma jedną rolę.  
**Kryterium wyjścia:** matrix close/back/reload dla długich formularzy oraz deep-link tests przechodzą; content review zatwierdza redukcje bez utraty informacji.

### Etap 5 — visual regression i zabezpieczenie spójności

Rozszerzyć CI o wszystkie subview axe, semantic route matrix, data factories 0/1/5/20/100, long Polish strings, wszystkie aktywne motywy, zoom/reflow, reduced motion i screenshoty overlay states. Oddzielić testy kontraktu domenowego od kruchych selektorów strukturalnych; generować inventories i dokumentować liczby z CI.

**Rezultat:** system nie tylko wygląda spójnie, lecz potrafi wykryć regresję przed merge.  
**Kryterium wyjścia:** zielony pipeline bez expected false alarms, zatwierdzone baseline’y i jawna lista niewspieranych scenariuszy.

## 11. Nieweryfikowalne i częściowo zweryfikowane obszary

Poniższych obszarów **nie uznano za poprawne**:

- Prawdziwy deployment Vercel i Cloudflare, w tym reload nested routes; oceniono konfigurację i lokalny router.
- Prawdziwa sesja Supabase z długim hangiem, konfliktami wielu urządzeń, wygaśnięciem tokenu i realnym latency; oceniono kod i unit tests.
- Manualna sesja NVDA/JAWS/VoiceOver; dostępność opiera się na DOM, axe i klawiaturze.
- Systemowy zoom interfejsu Chrome; użyto repozytoryjnych profili skalowanego CSS viewport + DPR 125/150 oraz testów do 200%.
- Pełna wizualna macierz pozostałych pięciu motywów. Ich role sprawdzono w kodzie, ale screenshoty audytowe pochodzą z aktywnego motywu graphite.
- Setki rekordów i ekstremalnie długie syntetyczne wartości we wszystkich modułach. Zrealizowano 0/1/5/20/100 dla Zadań, istniejące 19 zadań, 14 ćwiczeń i realne długie tytuły.
- Wszystkie kombinacje filtr × sort × search × date × back/forward w każdym module; zinwentaryzowano kontrakty i wykonano scenariusze reprezentatywne.
- Każdy backdrop click, nested popover, tooltip icon-only i return focus. Wspólny Modal zweryfikowano w kodzie, a wybrane przepływy w runtime.
- Wszystkie destrukcyjne akcje, save formularzy i undo na istniejących danych — nie wykonywano mutacji użytkownika poza izolowanymi/testowymi probe’ami.
- Realny brak miejsca, odmowa permission, offline browser API i recovery na urządzeniu; zachowanie ma unit/code evidence.
- Role i brak uprawnień: ogólny model ról/ACL nie jest zaimplementowany; nie da się ocenić nieistniejącego UI jako poprawnego.
- Wydajność odczuwalna na słabym CPU/GPU i sieci. Build ostrzega o vendor chunk 539,64 kB, ale nie wykonano profilowania LCP/INP ani production trace.
- Aktualny status „zatwierdzenia” historycznych screenshotów Goals. Znaleziono drift baseline/runtime; wymaga decyzji właściciela designu.
- Pełna macierz i18n. Produkt jest polski; nie badano innych języków ani znacznie dłuższych tłumaczeń.
- Mobile poniżej 760 px poza pomocniczymi probe’ami 759/761 — nie był częścią zamówionego audytu desktopowego.

### Ograniczenie narzędziowe

Wbudowana przeglądarka aplikacji zwróciła „No browser is available”, a lista backendów była pusta także po wymaganym bootstrap troubleshooting. Dlatego pomiary wykonano repozytoryjnym Playwrightem/Chromium w izolowanym kontekście. Nie wpływa to na DOM, axe i screenshoty, ale nie zapewnia istniejącej, zalogowanej sesji systemowej.

### Kluczowe artefakty

- [`audit-visual-agent-c/`](audit-visual-agent-c/) — 128 screenshotów, `audit-data.json`, `targeted-data.json`, `copy-checks.json`.
- [`audit-task-volume-check.mjs`](audit-task-volume-check.mjs) — poprawiony, odczytowy probe 0/1/5/20/100.
- Najważniejsze obrazy: [`Dzisiaj 1440`](audit-visual-agent-c/1440x900__today.png), [`Goal modal 1366`](audit-visual-agent-c/targeted-1366x768__goal-edit-initial.png), [`DetailPanel 1920`](audit-visual-agent-c/targeted-1920x1080__task-detail.png), [`Sport templates`](audit-visual-agent-c/1440x900__sport-templates.png), [`Sport exercises`](audit-visual-agent-c/1440x900__sport-exercises.png).

**Końcowy warunek wydania:** RTN-001 musi zostać naprawiony i zabezpieczony testem. Następnie należy zamknąć RTN-002/003/007 jako decyzje źródła prawdy, ponieważ bez nich lokalne poprawki nadal będą tworzyć kolejne rozjazdy.
