# Rootine — audyt design systemu i implementacji (Agent B)

**Data audytu:** 2026-08-10  
**Rewizja:** `24f8800`  
**Zakres:** wyłącznie odczytowy audyt źródeł prawdy, tokenów, CSS, wspólnych komponentów i ich użycia w `C:\dev\rootine`.  
**Poza zakresem:** ocena pikselowa uruchomionej aplikacji, kompletna dostępność i funkcjonalność ekranów — te obszary wymagają osobnych przebiegów.  
**Zmiany w produkcji:** brak.

## Werdykt

Rootine ma już mocny szkielet systemu: sześć motywów korzysta ze wspólnych ról semantycznych, `z-index` jest w 100% nazwany tokenami, importy wspólnych komponentów przechodzą przez jeden barrel, najważniejsze komponenty są szeroko używane, a lint CSS, TypeScript i audyt architektury przechodzą. Największym ryzykiem nie jest brak design systemu, lecz rozszczepienie jego autorytetu: dokumentacja opisuje starszą paletę i kilka starszych kontraktów komponentów, podczas gdy aktywne tokeny i komponenty realizują inne decyzje.

Stan można streścić jako **dobry system semantyczny z niedokończoną migracją i rozjechanym kontraktem dokumentacja → token → komponent**.

### Ocena 0–4

| Wymiar | Ocena | Uzasadnienie |
|---|---:|---|
| Źródła prawdy i decyzje | 2/4 | Hierarchia jest opisana, ale normatywny frontmatter `DESIGN.md`, aktywne tokeny i część komponentów podają różne wartości. |
| Tokeny i theming | 3/4 | 223 unikalne custom properties, sześć pełnych palet, wysoka zgodność kolorów/radiusów/warstw; dług w aliasach i martwych rolach. |
| Wspólne komponenty | 2/4 | Bardzo dobra adopcja rdzenia, ale część nowych prymitywów ma zero użyć, brakuje `Textarea`, a kilka kontraktów nie zgadza się z dokumentacją. |
| Responsywność i warstwy | 3/4 | Oficjalne breakpointy i tokeny warstw są scentralizowane; jeden nowy breakpoint 600px łamie governance, rejestry wyjątków się rozchodzą. |
| Integralność implementacji | 2/4 | Lint/typy/architektura przechodzą, ale jest 236 inline style objects, 69 arbitrary typography, duża lokalna geometria i niewykorzystany kontrakt chartów. |

**Łącznie: 12/20 (2,4/4).**

### Priorytety w skrócie

- **P0:** brak.
- **P1:** rozstrzygnąć i zsynchronizować normatywną paletę oraz kontrakty najczęściej używanych komponentów.
- **P2:** naprawić governance breakpointów, ograniczyć inline/arbitrary typography, domknąć API prymitywów, ruch i warstwę chartów.
- **P3:** uporządkować aliasy, martwe tokeny, eksporty i lokalne drobne wartości.

## Metoda i zasięg skanu

Przejrzano statycznie:

- 22 pliki CSS, łącznie 27 259 linii;
- 84 nietestowe pliki TSX w `src/app`;
- `DESIGN.md`, `src/app/ui/README.md`, `tokens.css`, `tokens.ts`, wszystkie komponenty `src/app/ui/components`;
- rejestr wyjątków i baseline governance;
- shell, sidebar, detail panel, modal, select/menu, checkbox, chart, motion, breakpointy i motywy;
- surowe kolory, style inline, klasy arbitrary, lokalne wymiary, radiusy, z-index, transitions/animations i surowe elementy formularzy.

Skan leksykalny jest celowo szerszy niż lista naruszeń. Liczba surowych elementów HTML lub wartości literalnych nie oznacza automatycznie błędu — wyniki zostały zweryfikowane kontekstowo, a false positives są opisane osobno.

## Wyniki automatyczne

| Polecenie | Wynik | Najważniejszy rezultat |
|---|---|---|
| `npm run design-system:audit` | **FAIL** | `inlineStyles=95`, `arbitraryTypography=69`, `mediaQuery=93`, `rawTransition=2`, `unregisteredMedia=1`; nowy breakpoint `src/styles/experience.css:213` (600px). |
| `node .agents/skills/impeccable/scripts/detect.mjs src` | **1 finding** | `src/styles/experience.css:279` — radius z `calc(... - 2px)`; wynik to 6px, więc wizualnie odpowiada tokenowi `--radius-sm`. |
| detektor `--no-config` | **5 findings** | 3 false positives dla `stroke-width` i 2 świadome użycia udokumentowanego fontu Plus Jakarta Sans. |
| `npm run css:lint` | **PASS** | Brak błędów stylelint. |
| `npm run architecture:audit` | **PASS** | Entrypointy stron ≤1800 linii, `app.css` 14 linii/344 B, ownership CSS tras zachowany. |
| `npm run typecheck:app` | **PASS** | TypeScript bez błędów. |

Ważne rozróżnienie: **95 nie jest całkowitą liczbą stylów inline**. Skrypt governance liczy 95 obiektów `style={{…}}` poza plikami zatwierdzonymi jako wyjątki. W kodzie istnieje **236 literalnych `style={{…}}` w 30 plikach** oraz **248 wszystkich `style={…}` w 33 plikach**. Siedem plików wyjątków ukrywa 141 literalnych obiektów, dlatego 236 − 141 = 95.

Baseline (`docs/design-system-baseline.json:3-13`) pozwala obecnie na 108 pozycji governance inline i 72 arbitrary typography. Aktualne 95 i 69 to poprawa względem baseline, ale nadal dług, nie „zero problemów”. Media queries wzrosły z 92 do 93 i dlatego audyt słusznie zatrzymuje pipeline.

## Hierarchia źródeł prawdy

`src/app/ui/README.md:53-61` deklaruje kolejność:

1. konstytucja i decyzje produktowe;
2. `src/styles/tokens.css` oraz rejestr wyjątków;
3. kontrakty `src/app/ui/components`;
4. implementacja modułu z zatwierdzonym wyjątkiem;
5. dokumentacja pomocnicza.

Ta hierarchia jest sensowna. Problem polega na tym, że `DESIGN.md` jednocześnie:

- zawiera frontmatter przedstawiony jako normatywna paleta (`DESIGN.md:4-35`);
- nazywa `tokens.css` źródłem prawdy (`DESIGN.md:515-524`);
- mówi, że wartości normatywne znajdują się w frontmatterze (`DESIGN.md:533-535`).

W praktyce te dwa źródła nie są zgodne. Dodatkowo sekcja weryfikacyjna `DESIGN.md:352-354` nadal twierdzi, że detektor zwraca pustą listę i pełne `npm run check` przechodzi, co nie odpowiada stanowi rewizji 24f8800.

### Konflikt palety domyślnej

| Rola | `DESIGN.md` | Aktywny token | Uwagi |
|---|---|---|---|
| shell / app background | `#101214` (`DESIGN.md:10,13`) | `#15181b` (`tokens.css:6`) | Istotna zmiana temperatury i jasności. |
| sidebar | `#0B0D0F` (`DESIGN.md:11`) | `#101316` (`tokens.css:7`) | Dokumentacja opisuje starszy, ciemniejszy sidebar. |
| input / panel | `#1A1D21` (`DESIGN.md:12,14`) | `#1d2125` (`tokens.css:8`) | Alias `graphite-input/panel` mapuje się dziś do surface-1. |
| card | `#20242A` (`DESIGN.md:15`) | `#24292f` (`tokens.css:9`) | Różnica widoczna na każdej powierzchni obiektu. |
| hover | `#282D35` (`DESIGN.md:16`) | `#2b3138` (`tokens.css:10`) | Stary frontmatter. |
| text primary | `#F2F3F5` (`DESIGN.md:19`) | `#f1f0ec` (`tokens.css:13`) | Aktywny tekst jest cieplejszy. |
| text secondary | `#AEB3BB` (`DESIGN.md:20`) | `#b6b8bb` (`tokens.css:14`) | Aktywny token jest jaśniejszy. |
| text muted/disabled | `#818791` (`DESIGN.md:21-22`) | `#92979e` (`tokens.css:15,34`) | Znacząca różnica kontrastu. |
| primary foreground | kredowa biel (`DESIGN.md:131-137,402-405`) | `#0b1020` przez `--color-on-primary` (`tokens.css:21`, `ui.css:36`) | Implementacja używa ciemnego tekstu na kobalcie. |

`src/app/theme/appTheme.ts:1-49` definiuje sześć rzeczywistych motywów, w tym jasny Warm Linen. `tokens.css:221-512` zawiera ich pełne nadpisania. `DESIGN.md` nadal czyta się jak dokument jednego „grafitowego” motywu; nie zawiera macierzy ról dla sześciu palet ani jasnej informacji, że frontmatter jest tylko historycznym snapshotem.

### Konflikty kontraktów komponentów

| Komponent | Kontrakt dokumentacji | Implementacja | Skala wpływu |
|---|---|---|---|
| Button primary | biały tekst, 40px (`DESIGN.md:131-137,402-409`) | 40px jest zgodne, tekst używa ciemnego `--color-on-primary` (`tokens.css:21`, `ui.css:20-36`) | 441 użyć `Button` w 35 plikach poza biblioteką. |
| Modal | radius 16, mocna linia, backdrop 60–62%, szerokość 460–700, domyślnie 520 (`DESIGN.md:452-458`) | border 0, backdrop domyślnie 72%, rozmiary 500/680/780/960; domyślny 680 (`Modal.tsx:31-47`, `ui.css:794-801`) | 46 użyć w 22 plikach. |
| Select | wiersze 28px i menu padding 4px (`DESIGN.md:437-448`; `README.md:93`) | opcja ma min-height 38px i padding 7×10 (`ui.css:204-240`), pozycjoner szacuje 44px/opcję (`Select.tsx:112-131`) | 111 użyć w 25 plikach. |
| Menu | token `--component-menu-row-height:28px` (`tokens.css:121-125`) | `MenuItem` używa `--control-height-sm` 28px, token wiersza nie ma konsumenta (`ui.css:326-340`) | Wartość końcowa jest zgodna, ale źródło komponentowe jest martwe. |
| Badge | padding 4×8 (`DESIGN.md:467-471`) | padding 2×8, min-height 22 (`ui.css:292-304`) | 81 użyć w 18 plikach. |
| EmptyState | subtelny dashed border (`DESIGN.md:507-510`) | zwykły solid border (`ui.css:787-792`) | 37 użyć w 13 plikach. |
| Checkbox shared | tokeny 18/16 (`tokens.css:124-125`) | wartości 18/16 są wpisane literalnie (`ui.css:898-912`) | Komponent działa, ale omija własne tokeny. |

Najbardziej niebezpieczny jest kontrakt `Select`: dokumentacja mówi 28px, CSS renderuje minimum 38px, a logika pozycjonowania kalkuluje 44px. To są trzy różne „prawdy” w jednym wspólnym komponencie.

## Mapa tokenów

### Warstwy abstrakcji

**Primitive / scale**

- fonty, rozmiary tekstu, line-height, wagi i tracking: `tokens.css:43-57,549-581`;
- radiusy: `tokens.css:58-63`;
- spacing: `tokens.css:65-71`;
- cienie/focus: `tokens.css:78-86`;
- warstwy: `tokens.css:89-118`;
- motion/easing: `tokens.css:143-158`;
- wysokości kontrolek/wierszy i szerokości: `tokens.css:182-218,583-592`;
- breakpoint mirrors: `tokens.css:594-603`.

**Semantic**

- canvas/sidebar/surface/border/text/primary/status: `tokens.css:5-40`;
- surface 0/1/2 i veiled surfaces: `tokens.css:182-201`;
- stany hover/selected/focus/disabled/completed: `tokens.css:128-132`;
- role chartów: `tokens.css:134-141`;
- role kompatybilności „graphite/precision” → semantyka: `tokens.css:516-546`;
- sześć theme scopes: `tokens.css:221-512`.

**Component / layout**

- menu, checkbox, progress: `tokens.css:120-127`;
- PageShell 1280/1480, task measure 1120, sidebary 204/220, detail 408;
- runtime aliases: `src/app/ui/tokens.ts:5-170`;
- komponenty publiczne: `src/app/ui/index.ts:1-75`.

### Pokrycie deklarowanych tokenów

W `tokens.css` są **487 deklaracje** (powtórzenia wynikają z motywów) i **223 unikalne nazwy**. Skan bezpośrednich `var(--token)` poza `tokens.css` znajduje 197/223 nazw. Metryka uwzględnia `src/app/ui/tokens.ts`, więc „użyty” może oznaczać samo wystawienie przez runtime alias, a nie renderującego konsumenta. Odwrotnie, „brak bezpośredniego użycia” nie zawsze oznacza martwy token: breakpointy są mirrorami dokumentacyjnymi, a część theme roles zasila inne tokeny pośrednio.

| Grupa | Unikalne tokeny | Bezpośrednio użyte poza `tokens.css` | Pokrycie | Najważniejsze uwagi |
|---|---:|---:|---:|---|
| Kolory | 74 | 74 | 100% | Wszystkie role są co najmniej podłączone do CSS lub runtime aliasu; nie gwarantuje to renderującego call site. |
| Typografia | 26 | 24 | 92% | Bez konsumenta: `--text-heading-md`, `--leading-relaxed`. |
| Spacing | 7 | 7 | 100% | Skala 4–28 jest żywa. |
| Radius | 6 | 6 | 100% | Brak arbitrary radius w klasach; wyjątki są w inline. |
| Shadow/focus | 7 | 7 | 100% | Role są konsekwentnie używane. |
| Layer | 24 | 24 | 100% | `uiLayers` wystawia cały słownik; niezależnie 49/49 deklaracji `z-index` używa tokenów. |
| Motion/easing | 15 | 15 | 100% | Użycie nie oznacza spójności czasów; są też raw animations. |
| State/opacity | 8 | 7 | 88% | `--opacity-decorative` nie ma konsumenta. |
| Component/layout | 28 | 23 | 82% | Martwe: menu row, oba checkbox sizes, control-lg, rail-width. |
| Theme/ambient | 15 | 6 | 40% bezpośrednio | 9 ról nie ma zewnętrznego konsumenta; brand/focus są użyte pośrednio. |
| Print | 4 | 4 | 100% | Oddzielny medium contract jest czytelny. |
| Breakpoint mirrors | 9 | 0 | 0% bezpośrednio | Oczekiwane w CSS; custom properties nie działają w media queries. Muszą być synchronizowane z TS/JSON. |

Po odjęciu 9 breakpoint mirrors oraz 2 theme roles użytych pośrednio pozostaje około 15 nazw bez aktualnego konsumenta albo utrzymywanych jako rezerwa. Najbardziej konkretne długi to tokeny component geometry, które istnieją, ale implementacja wpisuje tę samą wartość literalnie.

### Pokrycie deklaracji CSS tokenami

Proxy: deklaracja jest „token-backed”, jeśli jej wartość zawiera `var(--...)`. To metryka higieny, nie automatyczny werdykt; `0`, `auto`, `transparent`, procenty i geometria wykresów często są poprawnymi literalami.

| Kategoria | Wszystkie deklaracje | Token-backed | Literały | Pokrycie | Interpretacja |
|---|---:|---:|---:|---:|---|
| Kolor/background/border/fill/stroke | 2539 | 2292 | 247 | 90,3% | 211 literalów to `transparent`, 21 `inherit`, 8 `currentColor`; brak niezarejestrowanego raw hex/rgb w CSS produktu. |
| Core typography | 1707 | 1646 | 61 | 96,4% | CSS jest dobry; dług siedzi głównie w `goals.css` i klasach TSX. |
| Spacing/position | 2525 | 1599 | 926 | 63,3% | 364 × `0`, 87 × 2px, 70 × 3px, 50 × `auto`; po odjęciu neutralnych wartości nadal dużo lokalnej geometrii. |
| Width/height/min/max | 1688 | 103 | 1585 | 6,1% | Rozmiary są najsłabiej tokenizowane; część to naturalne `0`, `100%` i SVG/chart geometry. |
| Radius | 468 | 380 | 88 | 81,2% | Wszystkie 88 literalów CSS to `0`, `inherit` lub `50%` — bardzo dobry wynik. |
| Shadow | 105 | 88 | 17 | 83,8% | 16 z 17 to `none`/`none !important`. |
| z-index | 49 | 49 | 0 | 100% | Najmocniejszy obszar systemu. |
| Motion | 134 | 103 | 31 | 76,9% | Literały obejmują reduced-motion, `none` i kilka raw animation durations. |

## Kolory, powierzchnie i statusy

### Co działa

- Wszystkie aktywne role kolorystyczne są tokenizowane.
- Sześć motywów nadpisuje role semantyczne, zamiast duplikować CSS komponentów.
- `Badge` oferuje semantyczne tony neutral/primary/success/warning/danger/violet (`Badge.tsx:1-17`, `ui.css:292-312`) i jest używany w wielu modułach z sensownym mapowaniem statusu, np. `RecoveryCenter.tsx:303,395,463,535`, `Cele.tsx:640` i `Sprawy.tsx:1078`.
- Statusy sukces/ostrzeżenie/błąd nie dziedziczą primary; komentarz kompatybilności `tokens.css:516-519` świadomie tego pilnuje.

### Dług

Regex kolorów znajduje **374 trafienia w 6 plikach**:

| Plik | Trafienia | Charakter |
|---|---:|---|
| `src/styles/tokens.css` | 286 | Prawidłowe miejsce definicji palet. |
| `src/app/goals/goalsModel.ts` | 33 | Taxonomy, dane demo, migracje starych wartości. |
| `src/styles/settings.css` | 18 | 6 motywów × 3 swatche preview (`settings.css:114-120`). |
| `src/app/data/workWorkspace.ts` | 15 | Dane i migracje kategorii. |
| `src/app/data/taskWorkspace.ts` | 13 | Dane, komentarze i kolory kategorii (`taskWorkspace.ts:144-159`). |
| `src/app/work/workPresentation.tsx` | 9 | Kolory firm i migracje (`workPresentation.tsx:11-16`). |

Poza `tokens.css` są 88 trafienia i wszystkie są objęte rejestrem `rawColors` (`docs/design-system-exceptions.json:40-62`), więc audit raportuje `rawColor=0`. To nie jest fałszywa zgodność, ale świadomy dług: regex obejmuje również komentarze i wartości migracyjne, natomiast część kolorów jest serializowana jako prezentacja w danych. W długiej perspektywie stabilniejszy jest semantyczny identyfikator kategorii + mapowanie theme-aware niż trwały hex.

Alias kompatybilności pozostaje dominującym językiem CSS: poza `tokens.css` jest około **346 użyć `--color-graphite-*`**, wobec 48 użyć `--color-surface-*` i 36 użyć `--color-section/object-*`. Funkcjonalnie aliasy przełączają się z motywem, ale nazwy „graphite” są mylące w Warm Linen i utrudniają rozumienie poziomu powierzchni.

## Typografia

### Skala

Aktywna skala odpowiada w większości frontmatterowi: 10, 11, 12, 13, 14, 16, 20, 24, 28 i 36px (`tokens.css:43-57,574-581`). Plus Jakarta Sans i DM Mono są zdefiniowane jako role (`tokens.css:44-45`). Detektor bez configu zgłasza Plus Jakarta Sans jako „overused font”, ale `.impeccable/config.json:25-28` prawidłowo dokumentuje go jako świadomą decyzję brandingową — to false positive, nie rekomendacja zmiany kroju.

### Ominięcia

Governance wykrywa **69 arbitrary typography**:

- 52 × `text-[11px]`;
- 9 × `text-[12px]`;
- 6 × `text-[13px]`;
- 2 × `tracking-[0.16em]`.

Każda z tych wartości ma istniejący token. To czyste ominięcie API, nie brak skali.

Top pliki:

| Plik | Liczba |
|---|---:|
| `src/app/recovery/RecoveryCenter.tsx` | 26 |
| `src/app/goals/GoalWorkspaceViews.tsx` | 20 |
| `src/app/pages/Cele.tsx` | 8 |
| `src/app/goals/GoalDialogs.tsx` | 7 |
| `src/app/pages/Zadania.tsx` | 5 |
| `TaskViews.tsx` / `Jdg.tsx` / `Odzywanie.tsx` | po 1 |

Szeroki skan klas arbitrary znajduje 143 trafienia: 60 jest token-backed przez `var(--...)`, 69 to powyższa typografia, a 14 to inne literały layoutu, m.in. 4 × `max-w-[70ch]` oraz pojedyncze `w-[30px]`, `h-[30px]`, `min-w-[150px]`, `max-w-[680px]`, `max-w-[1180px]`.

W czystym CSS jest 61 nietokenizowanych deklaracji core typography. `src/styles/goals.css` odpowiada za 20. W tym pliku występują m.in. raw `font-weight:600/500/400` oraz line-height `1.3, 1.4, 1.45, 1.55, 1.6, 1.7`, mimo że `tokens.css:556-567` deklaruje `1.2, 1.35, 1.5, 1.65` i wagi 400/500/600. Część to zamierzone strojenie, ale skala staje się lokalnym dialektem.

## Spacing, grid, szerokości, wysokości i radius

### Pozytywy

- `PageShell` stosuje wspólne szerokości 1280/1480/fluid i padding tokenowy (`ui.css:1173-1182`).
- Shell ma tokenowe szerokości 204/220/408 (`tokens.css:73-76`).
- CSS nie zawiera surowych pikselowych radiusów poza skalą; literały to wyłącznie 0, inherit i 50%.
- Design-system audit ma `arbitraryRadius=0`.

### Główne źródła magic numbers

1. **Select positioning:** `Select.tsx:116-128` używa 12, 320, 44, 10, 180, 48, 148 i 6. Część to właściwa geometria viewportu, ale 44px/opcję jest niespójne z CSS 38px i dokumentacją 28px.
2. **Zakotwiczony scheduler:** `TaskSchedulePicker.tsx:299-315` buduje lokalną floating surface inline; padding i microcopy są dalej literalne (`TaskSchedulePicker.tsx:337,366`).
3. **Kalendarz:** dwa zakotwiczone panele mają `borderRadius:15` (`Kalendarz.tsx:1242-1255,1285-1298`), choć skala ma 12 i 16. Sam wzorzec anchored detail jest zgodny z `DESIGN.md:490`; problemem jest wartość.
4. **Tag nowego zadania:** `Zadania.tsx:1305-1308` używa `borderRadius:20` zamiast pill tokenu i lokalnej typografii 11/500.
5. **Density:** `experience.css:904-914` redefiniuje globalne `--row-height-*` poza `tokens.css` do 42/50/60 i 32/38/48. To celowa funkcja produktu, ale łamie komentarz `tokens.css:549-553` „anything outside these scales is a bug” i tworzy drugie miejsce definicji skali.

Detektor zgłasza `experience.css:279`, ponieważ widzi literalne 2px w `calc(var(--radius-md) - 2px)`. Wartość wynikowa to 6px, czyli dokładnie `--radius-sm`. To **częściowy false positive**: wynik nie jest poza skalą, lecz zapis niepotrzebnie omija bezpośredni token.

## Inline styles

### Rzeczywisty stan

- **236** literalnych `style={{…}}` w 30 plikach;
- **248** wszystkich `style={…}` w 33 plikach;
- **95** poza zarejestrowanymi wyjątkami — tyle raportuje audit;
- **141** jest w 7 plikach wyjątków.

Top pliki po literalnym `style={{…}}`:

| Plik | Liczba | Rejestr wyjątku |
|---|---:|---|
| `GoalWorkspaceViews.tsx` | 62 | tak |
| `Kalendarz.tsx` | 22 | tak |
| `Zadania.tsx` | 21 | nie |
| `GoalDialogs.tsx` | 19 | tak |
| `TaskViews.tsx` | 14 | tak |
| `Cele.tsx` | 13 | nie |
| `CelSzczegoly.tsx` | 13 | nie |
| `TaskSummaryReport.tsx` | 11 | tak |
| `TaskSchedulePicker.tsx` | 8 | tak |
| `Odzywanie.tsx` | 7 | nie |
| `Praca.tsx` | 7 | nie |
| `Podroze.tsx` | 6 | nie |
| `SportInsights.tsx` | 5 | nie |
| `TaskSecondaryViews.tsx` | 5 | tak |

Nie każdy inline style powinien zniknąć: pozycjonowanie portalu, `transform:scaleX/Y`, custom properties dla danych i kolory taxonomy są naturalnie dynamiczne. Problemem są statyczne deklaracje kompozycji, fontów, paddingów i radiusów w tych samych obiektach. Rejestr wyjątków jest plikowy, więc dynamiczna potrzeba legalizuje również niezwiązane statyczne wartości w całym pliku.

## Wspólne komponenty i realna adopcja

### Mocny rdzeń

Wszystkie importy wspólnych komponentów przechodzą przez `src/app/ui/index.ts`: `directUiImport=0`. Najczęściej używane komponenty poza ich własnymi plikami:

| Komponent | Użycia JSX | Pliki |
|---|---:|---:|
| Button | 441 | 35 |
| Input | 129 | 18 |
| Select | 111 | 25 |
| Badge | 81 | 18 |
| MenuItem | 49 | 12 |
| Modal | 46 | 22 |
| ContextNavItem | 38 | 9 |
| DatePicker | 37 | 11 |
| EmptyState | 37 | 13 |
| SectionHeader | 21 | 11 |
| Menu | 20 | 11 |
| SectionSurface | 20 | 6 |
| Card | 18 | 8 |
| ContentHeader | 16 | 13 |
| ModuleMain | 15 | 11 |
| ModuleShell | 14 | 11 |

Thin lokalne wrappery są przeważnie zdrowe:

- `goals/GoalDialogs.tsx:39-73` — `ThemedSelect` tylko upraszcza event wspólnego `Select`;
- `sport/Shared.tsx:28-34` — lokalne `Modal` i `EmptyState` delegują do UI;
- `tasks/TaskSecondaryViews.tsx:1023-1044` — `InputFloatMenu` deleguje zachowanie do `Menu` i dodaje wyłącznie anchor geometry.

### Nieużyte lub niepełne API

Brak zewnętrznych konsumentów mają:

- `IconButton`;
- `ProgressBar`;
- `StatCard` i `StatGrid`;
- `PageToolbar`;
- eksporty wewnętrzne `WorkspaceLayout` i `MainContent`;
- deprecated alias `ContextSidebar`.

Najważniejszy konflikt to `IconButton`:

- komponent wymaga `aria-label` typem (`IconButton.tsx:4-7`);
- deleguje do `Button iconOnly` (`IconButton.tsx:17-24`);
- ma **0 użyć** poza biblioteką;
- jednocześnie w źródłach jest **121 wystąpień słowa `iconOnly`**, w tym 112 poza `ui/components` w 21 plikach;
- `ButtonProps.iconOnly` nie wymaga nazwy dostępności na poziomie typu (`Button.tsx:6-13`).

Nie dowodzi to, że 112 przycisków nie ma `aria-label` — wiele ma. Dowodzi natomiast, że prymityw stworzony po to, by tę gwarancję wymusić, nie jest adoptowany, a publiczne API `Button` pozwala go omijać.

Drugą luką jest brak wspólnego `Textarea`. Jest **15 surowych `<textarea>` w 10 plikach**. Najwięcej ma `Praca.tsx` (5), `TaskViews.tsx` ma 2, pozostałe po 1. Część ręcznie stosuje `ui-field/ui-field__control`, część posiada własne `sport-field` lub lokalne wrappery. `Input` i `Select` mają jednolity label/hint/error/focus contract, ale textarea go nie ma.

### Surowe kontrolki — inwentarz, nie automatyczny błąd

Poza `ui/components` występuje:

- 199 surowych `<button>` w 29 plikach;
- 43 surowe `<input>` w 22 plikach;
- 2 surowe `<select>` w 1 pliku;
- 15 surowych `<textarea>` w 10 plikach;
- 6 raw checkboxów w 5 plikach, wszystkie zatwierdzone jako wyjątki;
- 5 lokalnych `role="dialog"` w 4 plikach.

Rozkład inputów: 21 bez stałego `type`/dynamiczne, 6 checkbox, 5 number, 4 text, 3 file, 2 time, 1 search, 1 radio. Wiele jest specjalizowanych i nie powinno zostać ślepo zamienione na `Input`.

Realnym duplikatem jest `NutritionAnalysis.tsx:410-416,479-485`: dwa natywne selecty z lokalną implementacją powierzchni `nutrition.css:2994-3017`, mimo istniejącego wspólnego `Select`. Z kolei `TaskSchedulePicker` jest złożonym anchored composite i wymaga raczej wspólnego kontraktu popover/dialog positioning niż prostego zamienienia komponentu.

## Shell, sidebar i detail panel

### Pozytywy

- `ModuleShell` składa `WorkspaceLayout → MainContent → PageShell` w jednym miejscu (`Shell.tsx:153-197`).
- `ModuleSidebar` i `ContextNavItem` zapewniają wspólną semantykę i `aria-current` (`Shell.tsx:226-274`).
- `DetailPanel` korzysta z oficjalnego breakpointu `detail`, przechodzi w dialog, dodaje backdrop, Escape, focus trap i restoration (`Shell.tsx:293-416`).
- CSS realizuje 220px sidebar i 408px detail panel tokenami; overlay detail włącza się przy 1380 (`ui.css:826-847`).
- Sidebar kontekstowy znika przy 1180, a ContentHeader przejmuje compact navigation (`ui.css:1223-1233`).

### Dług

`ui.css` zawiera dwa pokolenia reguł layoutu:

- wcześniejsze `.ui-module-shell__body` jako flex i `.ui-main-content` jako container (`ui.css:430-477`);
- końcowy kontrakt grid, celowo umieszczony na końcu (`ui.css:1151-1249`).

Komentarz wyjaśnia intencję, więc nie jest to przypadkowy override. Nadal zwiększa koszt rozumienia kaskady i ryzyko, że kolejna zmiana trafi do starszego bloku. To dług P3, nie obecny błąd funkcjonalny.

`--page-header-height:70px` i `uiLayout.pageHeaderHeight` pozostały mimo jawnego usunięcia `PageHeader` (`DESIGN.md:300-304`, `README.md:30-32`). Brak konsumenta runtime `uiLayout` potwierdza, że jest to stale API.

## Modal i warstwy nakładane

Zachowanie `Modal` jest mocne: portal do body, topmost-dialog check, Escape, Tab trap, focus containment i restoration (`Modal.tsx:58-117`), prawidłowe `role="dialog"`/`aria-modal` (`Modal.tsx:119-146`).

Problem jest kontraktowy, nie behawioralny:

- domyślny `md=680` zamiast 520;
- `lg=780` i `xl=960` wychodzą poza udokumentowane 700;
- brak mocnej linii;
- aktywny backdrop dla domyślnego motywu ma 72%, a inne theme scopes zakres około 46–76%;
- mobilnie modal staje się bottom sheet (`ui.css:803-824`), czego opis komponentu nie eksponuje.

Warstwy są technicznie wzorowe:

- 24 nazwane `--layer-*` (`tokens.css:95-118`);
- 49/49 deklaracji `z-index` używa `var(--layer-...)`;
- brak numerycznych `zIndex` w TS/TSX;
- dynamiczne portale używają `uiLayers` (`Menu.tsx:125`, `DatePicker.tsx:310`, `TaskSchedulePicker.tsx:308`).

Nazewnictwo jest jednak nadmiernie rozbudowane: `--layer-floating` aliasuje `ambient` na 250, `system-overlay` ma 9999, a `nested-popover` 10001. Kolejność działa, ale nazwa „system overlay” nie oznacza najwyższej warstwy, a „floating” jest powiązany z historycznym ambientem. To ryzyko utrzymaniowe P3.

## Responsywność i breakpointy

Oficjalne JS breakpointy to 1380, 1180, 980 i 760 (`breakpoints.ts:1-17`). Feature exceptions w TS: 560, 1100, 1120, 1200, 1280 (`breakpoints.ts:19-30`).

Aktualny rozkład 93 media queries:

| Wartość | Liczba | Status |
|---:|---:|---|
| 560 | 2 | zarejestrowany wyjątek |
| 600 | 1 | **niezarejestrowany** |
| 760 | 45 | oficjalny |
| 761 | 7 | dopełnienie min-width |
| 980 | 14 | oficjalny |
| 1100 | 2 | zarejestrowany wyjątek |
| 1101 | 1 | dopełnienie |
| 1120 | 2 | zarejestrowany wyjątek |
| 1121 | 1 | dopełnienie |
| 1180 | 12 | oficjalny |
| 1181 | 1 | dopełnienie |
| 1200 | 1 | zarejestrowany wyjątek |
| 1380 | 3 | oficjalny |
| 1381 | 1 | dopełnienie |

Nowe 600px znajduje się w `experience.css:213-220` i zmienia Command Center do jednej kolumny/min-height 58. To sensowna lokalna korekta, ale łamie jawny kontrakt governance.

Rejestry nie są zsynchronizowane:

- `breakpoints.ts` zawiera 1280/ambient, JSON wyjątków go nie zawiera;
- JSON zawiera 1040 dla nieistniejącego `src/styles/assistant.css` (`exceptions.json:10-16`), którego nie ma w aktualnym drzewie;
- `tokens.css` mirroruje 9 wartości, ale nie 600;
- `scripts/design-system-audit.mjs:10,56,100-105` traktuje JSON i cztery liczby oficjalne jako osobne źródło;
- `DESIGN.md:354` nadal deklaruje zielony audit.

To nie jest tylko pojedynczy brak wpisu, lecz drift czterech rejestrów: CSS, TS, JSON i dokumentacji.

## Motion

Tokeny czasu to 90, 140, 240, 360, 420, 680ms oraz komponentowe 500, 700, 150, 160ms (`tokens.css:143-154`). Dwie gęste grupy — 140/150/160 i 680/700 — mają różne nazwy intencji, ale praktycznie niemal identyczne czasy.

Raw animations poza tokenami:

- `experience.css:18` — spinner 700ms;
- `nutrition.css:1083` — spinner 800ms;
- `app-shell.css:987` — spinner 900ms;
- `ambient.css:40` — arrival 720ms z powtórzonym cubic-bezier;
- `ambient.css:126` — signal 680ms z powtórzonym cubic-bezier;
- `app-base.css:113` — skeleton 1400ms.

`app-shell.css:1001-1009` globalnie ustawia wszystkim elementom animation/transition duration na 0.01ms dla reduced motion. `experience.css:993-999` dokłada drugi catch-all 1ms dla preferencji aplikacji. To zapewnia bezpieczny fallback, ale jest zbyt tępe: usuwa również użyteczną informację o zmianie stanu i wymusza `!important` na całym drzewie. Lepszy kontrakt powinien rozróżnić ruch dekoracyjny, transformacyjny i feedback stanów. Jest to problem systemowy P2.

Detektor bez configu zgłasza trzy „layout transitions” w `experience.css:428,436,451`. Wszystkie dotyczą SVG `stroke-width`, nie CSS `width` — prawidłowo zapisany false positive w `.impeccable/config.json:16-22`.

## Charty i wizualizacja danych

Design system deklaruje siedem semantycznych ról chartów (`tokens.css:134-141`) i runtime mapę `uiChartColors` (`tokens.ts:156-164`). **`uiChartColors` nie ma żadnego konsumenta poza eksportem.**

Funkcje tworzą własne dialekty:

- Nutrition ma stałą geometrię `CHART={width:720,left:48,right:28,top:24}` (`NutritionAnalysis.tsx:48`), własne klasy axis/grid/goal/average i lokalne selecty;
- Nutrition poprawnie daje SVG `role="img"`, etykietę, fokusowalne markery i `<title>` (`NutritionAnalysis.tsx:423-467,491-524`);
- Sport buduje chart z divów, lokalnym `scaleY` i kolorami taxonomy inline (`SportInsights.tsx:993-1037`); kontener ma `aria-label`, ale bez roli wykresu;
- ProgressBar ma dobrze zaprojektowane API i semantykę (`ProgressBar.tsx:7-62`), ale zero konsumentów.

Wniosek: istnieje deklaracja wspólnego języka chartów, lecz nie wspólny kontrakt implementacyjny ani adopcja. To phantom API — utrzymywane tokeny nie zapobiegają rozjazdowi osi, legend, celu, średniej, focusu i fallbacku tekstowego.

## Runtime aliases `src/app/ui/tokens.ts`

Plik eksportuje 11 grup. Realnie używane poza samym plikiem/barrelem są:

- `uiColors` — szeroko, głównie modele prezentacyjne Celów, Sportu, Zadań, Kalendarza i Nutrition;
- `uiLayers` — Menu, DatePicker i zakotwiczone portale;
- `uiShadows` — `taskPageModel.ts`.

Bez konsumentów pozostaje 8/11 grup:

- `uiRadii`;
- `uiSpacing`;
- `uiMotion`;
- `uiTypography`;
- `uiFocus`;
- `uiStates`;
- `uiChartColors`;
- `uiLayout`.

Komentarz `tokens.ts:1-4` mówi, że aliasy służą istniejącym stylom inline, ale większość stylów inline wpisuje `var(--token)` ręcznie lub literalną wartość. Publiczny runtime surface obiecuje więcej standaryzacji, niż faktycznie zapewnia.

## Findings według priorytetu

### P0 — blocker

Brak potwierdzonego P0 w zakresie design system/code.

### P1 — major

#### B-01. Dwa normatywne źródła palety i brak dokumentacji sześciu motywów

**Dowód:** `DESIGN.md:4-35,515-524,533-535` kontra `tokens.css:5-40,221-512` i `appTheme.ts:1-49`.  
**Wpływ:** każdy nowy ekran lub audyt bazujący na frontmatterze może odtworzyć starszą paletę, pogorszyć kontrast i wprowadzić wartości, których aktywny theme system nie używa.  
**Decyzja potrzebna przed poprawką:** czy frontmatter ma zostać wygenerowany z tokenów, czy ma opisywać wyłącznie semantyczne role bez literalnych kolorów.

#### B-02. Kontrakty wspólnych komponentów nie zgadzają się z implementacją

**Dowód:** Button, Modal, Select, Badge i EmptyState w tabeli wyżej; szczególnie `Modal.tsx:31-36` i `Select.tsx:116-128`.  
**Wpływ:** dotyczy komponentów mających dziesiątki lub setki użyć; dokumentacja nie może służyć jako spec dla QA ani nowych implementacji.  
**Kolejność:** podjąć decyzję produktową o prawidłowym wariancie, potem zsynchronizować token/komponent/dokument, a nie mechanicznie „przywracać” starsze wartości.

### P2 — systemic

#### B-03. Governance breakpointów obecnie nie przechodzi i ma cztery rozjechane rejestry

**Dowód:** `experience.css:213`, `breakpoints.ts:8-30`, `exceptions.json:2-39`, `tokens.css:594-603`, wynik audytu.  
**Wpływ:** `npm run check` zostaje zablokowany; kolejne lokalne breakpointy mogą być dopisywane ad hoc.

#### B-04. Inline styles i arbitrary typography nadal stanowią równoległy system

**Dowód:** 236 wszystkich literalnych inline objects / 95 governance; 69 arbitrary typography; top pliki wyżej.  
**Wpływ:** tokeny nie propagują się automatycznie, theme/spacing/motion zmienia się nierównomiernie, wyjątek plikowy ukrywa wartości niezwiązane z pierwotną przyczyną wyjątku.

#### B-05. Publiczne API prymitywów nie jest domknięte ani adoptowane

**Dowód:** `IconButton` 0 użyć vs 121 `iconOnly`; brak `Textarea` przy 15 raw textarea; `ProgressBar`/`StatCard`/`StatGrid` 0 użyć.  
**Wpływ:** dostępnościowe i wizualne gwarancje istnieją na papierze, ale call sites mogą je omijać. Publiczny barrel rośnie bez realnego zastępowania lokalnych wzorców.

#### B-06. Tokeny component geometry istnieją, ale komponenty ich nie konsumują

**Dowód:** `--component-checkbox-size`, `--component-checkbox-size-sm`, `--component-menu-row-height` bez bezpośrednich konsumentów; literalne 18/16 w `ui.css:903-912`; Select 38/44 vs token 28.  
**Wpływ:** zmiana tokenu nie zmieni UI, więc token daje fałszywe poczucie kontroli.

#### B-07. Chart system jest deklaracją bez adopcji

**Dowód:** 7 chart roles i `uiChartColors` bez konsumenta; trzy lokalne wzorce chart/progress.  
**Wpływ:** niespójne kolory celu/średniej, geometria, focus, role i tekstowe fallbacki; większy koszt theme QA.

#### B-08. Reduced-motion i czasy animacji tworzą drugi, zbyt globalny kontrakt

**Dowód:** `app-shell.css:1001-1009`, `experience.css:993-999`, sześć raw animation durations.  
**Wpływ:** globalne `!important` może usuwać użyteczny feedback, a feature CSS nadal wprowadza własne czasy/easing.

#### B-09. Density redefiniuje globalne tokeny poza źródłem prawdy

**Dowód:** `experience.css:904-914` kontra `tokens.css:588-590` i komentarz `tokens.css:549-553`.  
**Wpływ:** wartość tokenu zależy od kolejności importów i data attribute, a dokumentacja skali nie opisuje wariantów.

#### B-10. Wyjątki raw color łączą dane i prezentację

**Dowód:** 88 trafień poza `tokens.css`, wszystkie wyciszone przez plikowe wyjątki.  
**Wpływ:** persisted hex jest trudniejszy do migracji, theme-aware presentation i walidacji niż semantyczny ID.

### P3 — cleanup

#### B-11. Pojedyncze off-scale radiusy i zapis calc

`Kalendarz.tsx:1253,1296` ma 15px, `Zadania.tsx:1307` ma 20px, `experience.css:279` oblicza 6px zamiast użyć tokenu. Nie jest to szeroka wada skali, ale niepotrzebnie omija role.

#### B-12. Dwie ery CSS shell w jednym pliku

`ui.css:469-477` i `ui.css:1151-1249` opisują tę samą topologię w dwóch miejscach. Końcowy kontrakt jest jawny i działa; cleanup zmniejszy koszt zmian.

#### B-13. Zbyt szerokie nazewnictwo warstw

24 tokeny zapewniają 100% zgodności, ale alias `floating=ambient` oraz `nested-popover > system-overlay` są trudne do przewidzenia z nazw.

#### B-14. Martwe eksporty i stale tokeny

`ContextSidebar` deprecated, `PageToolbar`/`WorkspaceLayout`/`MainContent` bez zewnętrznych konsumentów, `page-header-height` po usunięciu PageHeader, 8/11 runtime alias groups bez użycia.

## False positives i ostrożność interpretacji

1. `experience.css:279` — detektor mówi „radius poza skalą”; wynik 6px jest w skali. Pozostaje drobny bypass, nie naruszenie wizualne.
2. `experience.css:428,436,451` — „transition width” to dopasowanie podciągu `stroke-width` w SVG.
3. `fonts.css:3,29` — „overused Plus Jakarta Sans” jest świadomym fontem produktu.
4. 199 raw `button` nie oznacza 199 duplikatów `Button`; dużo z nich to komórki, drag/drop, listbox options i wyspecjalizowane kontrolki.
5. 43 raw inputy zawierają file/time/search/radio i ukryte natywne semantics; nie wszystkie pasują do wizualnego `Input`.
6. 88 raw color hits poza tokenami obejmuje komentarze i wartości migracyjne, nie tylko renderowane kolory.
7. Niskie pokrycie width/height nie oznacza, że każda geometria ma być tokenem; SVG/chart/100%/viewport math musi pozostać lokalne.

## Najmocniejsze pozytywy

- **Warstwy:** zero numerycznych z-index poza tokenami; 49/49 CSS declarations token-backed.
- **Kolory CSS:** brak niezarejestrowanego raw hex/rgb w feature CSS; pozostałe literały to głównie semantyczne keywordy.
- **Radius:** brak raw pikselowych radiusów w CSS; skala 3/6/8/12/16/pill jest szeroko przestrzegana.
- **Barrel:** zero bezpośrednich importów z `ui/components/*`.
- **Adopcja rdzenia:** Button/Input/Select/Badge/Modal są faktycznie wspólne, nie tylko zadeklarowane.
- **Focus/overlay behavior:** Modal i responsive DetailPanel mają Escape, trap, restoration i topmost checks.
- **Shell:** szerokości i główna topologia są scentralizowane; layout audit przechodzi.
- **Theme architecture:** sześć palet nadpisuje semantyczne role, a nie komponenty.
- **Trend governance:** inline governance spadło 108 → 95, arbitrary typography 72 → 69.
- **Quality gates:** CSS lint, architecture audit i typecheck przechodzą.

## Zalecana kolejność decyzji

1. Ustalić jeden mechanizm generowania/utrzymywania źródła prawdy dla palet i komponent specs.
2. Rozstrzygnąć pięć kontraktów o największym zasięgu: Button, Modal, Select/Menu, Badge, EmptyState.
3. Naprawić rejestr breakpointów i usunąć stale `assistant.css/1040` albo formalnie odtworzyć jego właściciela.
4. Podzielić wyjątki inline na węższe, wzorcowe kategorie: dynamic position, data-driven transform/color/custom property; statyczne layout/font/radius nie powinny być ukrywane razem.
5. Zdecydować, czy `IconButton` i nowe stat/progress primitives są obowiązującym API. Jeśli tak, zaplanować migrację; jeśli nie, nie utrzymywać równoległych publicznych kontraktów.
6. Dodać wspólny Textarea contract spójny z Input/Select albo jawnie udokumentować, dlaczego textarea pozostaje klasowym patternem.
7. Zdefiniować minimalny chart contract: role kolorów, axis/grid/goal/average, label/role/fallback/focus, bez narzucania jednej geometrii.
8. Opisać density i reduced-motion jako pierwszorzędne warianty tokenów, zamiast późnych globalnych override’ów.
9. Dopiero po decyzjach usuwać aliasy „graphite/precision”, martwe tokeny i duplikaty CSS shell.

## Komendy reprodukcyjne

```powershell
npm run design-system:audit
npm run architecture:audit
npm run css:lint
npm run typecheck:app
node .agents/skills/impeccable/scripts/detect.mjs src
node .agents/skills/impeccable/scripts/detect.mjs --no-config src
rg -n "style\s*=\s*\{\{" src/app --glob "*.tsx" --glob "!**/*.test.*"
rg --pcre2 -n "\b(?:text|tracking|leading)-\[(?!var\(--)[^\]]+\]" src
rg -n "z-index\s*:" src --glob "*.css"
```

---

Raport nie modyfikuje `src` ani produkcji. Jedynym utworzonym plikiem jest ten artefakt.
