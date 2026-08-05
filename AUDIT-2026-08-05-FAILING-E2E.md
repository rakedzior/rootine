# Pięć padających testów e2e — naprawione

Stan: **naprawione.** Cały zestaw `desktop-1440` + `mobile-390` przechodzi,
`npm run typecheck`, `npm run lint` i `npm run test` (277 testów) są czyste.

> Liczba testów w tym zestawie wynosiła 112 w chwili pisania; później w tej samej sesji
> `clipping.spec.ts` został rozbity na test per trasa i jest ich 146. Aktualny stan całości
> opisuje `HANDOVER-2026-08-05.md`.

Diagnoza wstępna z poprzedniej sesji okazała się trafna w dwóch punktach i **myląca w dwóch**.
Poniżej co naprawdę było przyczyną.

---

## Wspólny mianownik: `PageShell` po cichu połyka propsy nagłówka

Commit `14d7e97` („Remove global page headers…") zostawił w `PageShell` sygnaturę przyjmującą
`title`, `subtitle`, `leading`, `meta`, `actions` i `header`, ale **nic ich nie renderuje** —
wpadają do `..._legacyHeaderProps` i giną (`src/app/ui/components/PageShell.tsx:27`).

`ModuleShell` nadal je przyjmuje i przekazuje dalej, więc każde call site wygląda poprawnie,
kompiluje się i nie generuje ostrzeżenia — a treść znika z ekranu.

**Trzy z pięciu padających testów to ta jedna przyczyna.** Nie były to usterki testów.
Testy wykrywały prawdziwą regresję, tylko diagnoza szukała jej w złym miejscu.

---

## 1. `goals.spec.ts:30` — przycisk powrotu ✅

Przyczyna: oba warianty „Wróć do celów" w `CelSzczegoly` szły przez `ModuleShell`
(`leading` i `header`), więc żaden się nie renderował. **Widok szczegółów celu nie miał
w ogóle powrotu do listy** — poza przyciskiem wstecz przeglądarki.

Naprawa: przycisk przeniesiony do slotu `leading` w `ContentHeader`, który faktycznie go
renderuje (`ContentHeader.tsx:46`). Martwy `PageHeader` i `leading` na `ModuleShell` usunięte.

## 2. `interactions.spec.ts:4` — Escape i powrót fokusu ✅

Jedyny przypadek, który **naprawdę był usterką testu**, i to podwójną:

1. Trigger nazywał się „Nowy szablon"; paczka 06 przemianowała go na „Dodaj szablon".
2. Po poprawce nazwy wyszła druga usterka: `getByRole("textbox", { name: "Nazwa" })` łapał
   **dwa** pola — „Nazwa" i „Nazwa nowej sekcji" (strict mode violation). Dodane `exact: true`.

Powrót fokusu na trigger działał przez cały czas — `Modal.tsx:115` robi to poprawnie.
Diagnoza podejrzewała tu problem z fokusem; nie było go.

## 3. `production-validation.spec.ts:150` — stan błędu trasy ✅

Diagnoza mówiła, że tekst istnieje, ale jako `<h2>` zamiast `<h1>`. **Było gorzej:**
`RouteStateFrame` przekazywał `title` i `description` do `PageShell`, więc stan błędu
renderował **wyłącznie eyebrow, ikonę i przyciski** — komunikat nie pojawiał się wcale.

Dowód, że to regresja, a nie decyzja projektowa: `app-base.css:217` i `:226` nadal stylują
`.app-route-state h1` oraz `.app-route-state__description`. Reguły osierocone przez refaktor.

Naprawa: `<h1>` i opis renderowane bezpośrednio w panelu. Pełnoekranowy stan trasy zastępuje
cały workspace, więc jest naturalnym właścicielem jedynego `<h1>` strony.

## 4. `production-validation.spec.ts:218` — nieudany zapis lokalny ✅

**Diagnoza była błędna.** Twierdziła, że to luka produktowa: „Odżywianie nie ma odpowiednika"
badge'a „Brak zapisu lokalnego". Odżywianie **ma** ten badge — `Odzywanie.tsx:829`, w zmiennej
`headerMeta`. Był martwy, bo szedł przez `PageHeader meta` → `ModuleShell` → `PageShell`.

Nie trzeba było więc żadnej decyzji produktowej ani nowego komponentu. Naprawa:
`meta={headerMeta}` na `ContentHeader`, który już tam był.

---

## Zrobione w drugim commicie: pułapka zamknięta

Po naprawie piątki okazało się, że martwe propsy zabrały znacznie więcej niż badge'e zapisu.
**Sześć modułów nie miało w ogóle akcji tworzenia**, bo cała `actions` szła przez `PageHeader`:

| Moduł | Co było niedostępne | Czy istniała inna droga |
| --- | --- | --- |
| `Cele` | „Dodaj cel", import, eksport, ustawienia | tylko empty state — z celami na liście **nie dało się dodać kolejnego**; import i eksport **całkiem** nieosiągalne |
| `Praca` | menu „Dodaj" (firma / projekt / zadanie) | „Dodaj firmę" **nieosiągalne**; projekt i zadanie tylko z empty state |
| `Zadania` | „Dodaj zadanie", „Opróżnij kosz" | dodawanie — inline composer; **„Opróżnij kosz" nieosiągalne** |
| `Dzisiaj` | „Dodaj" | tak — przycisk w sidebarze (Ctrl K) |
| `Kalendarz` | „Dodaj zadanie" | tak — klik w komórkę dnia |
| `Notatki` | „Dodaj notatkę" | tak — empty state i widok listy |

Wszystko wróciło do `ContentHeader` odpowiedniego modułu. Wskaźnik `Brak zapisu lokalnego`
działa teraz w **dziewięciu** modułach (`Cele`, `Zadania`, `Kalendarz`, `Notatki`, `Podroze`,
`Sport`, `Jdg`, `Sprawy`, `Odzywanie`) plus `CelSzczegoly`.

Sama pułapka też zniknęła:

- `PageShell` i `ModuleShell` **nie przyjmują** już `title`, `subtitle`, `leading`, `meta`,
  `actions` ani `header`. Po usunięciu propsów kompilator wskazał 10 nieaktualnych call sites,
  które wcześniej wyglądały poprawnie.
- `ModuleShell` renderuje `PageShell` zawsze (wcześniej zależało to od obecności `title`).
- Komponent `PageHeader` jest **usunięty** razem z ~140 liniami osieroconego CSS.

Weryfikacja: `desktop-1440` + `mobile-390` 112 passed / 4 skipped, 277 testów jednostkowych,
`typecheck`, `lint` i `clip-audit` (0 przycięć) czyste.

### Matryca viewportów — 13 porażek, wszystkie po stronie testów (naprawione)

Potwierdzone `git stash`em jako wcześniejsze. Po zdiagnozowaniu okazało się, że **żadna
nie była usterką produktu** — każda kodyfikowała stan sprzed decyzji projektowych:

| Test | Oczekiwał | Rzeczywistość | Naprawa |
| --- | --- | --- | --- |
| `design-system.spec.ts:124` (7 szerokości) | tekst ≥ 11px | `--text-nano: 10px` to udokumentowany krok rampy (DESIGN.md, „metadana gęsta"), dodany w paczce 10 i użyty przez `.task-group-heading__count` | próg 11 → 10 |
| `layout-consistency.spec.ts:51` (4 moduły @1024) | widoczny sidebar modułu | `breakpoints.ts:11` — `context: 1180` „Context sidebar collapses"; 1024 < 1180, więc sidebar **ma** być schowany, a nawigację przejmuje select w nagłówku | asercja tylko powyżej 1180px |
| `design-system.spec.ts:86` (zmienne szerokości) | nagłówek na osi treści | **pomiar w trakcie animacji wejścia** — `useSubtabTransition` przesuwa `.ui-module-main` o 8px na 240ms; stąd dokładnie 8px odchyłki | `openRootineRoute` czeka na wyciszenie przejścia |

Trzeci przypadek był najciekawszy: `/cele` mierzone bezpośrednio ma odchyłkę **0**.
Pojedyncze odczekanie nie wystarczyło, bo Cele dopisują `widok` do query stringa **po**
montażu, co zmienia klucz przejścia i uruchamia animację już po sprawdzeniu. Dlatego
helper wymaga, żeby element **pozostał** wyciszony przez 200 ms, a nie był wyciszony raz.

Wynik: matryca viewportów **245/245**, matryca zoomu **9/9**.

### Domknięte w tej samej sesji

- `stylelint goals.css:143` — okazało się, że to nie kwestia konfiguracji. Konwencją w tym
  kodzie jest **deklarowanie domyślnej wartości zmiennej runtime na regule komponentu**
  (`.work-detail-subtask` tak robi); `--goal-detail-progress` jako jedyna to pomijała.
  Deklaracja dodana na `.goal-detail-progress-track`. `css:lint` czysty bez wyjątków.
- `clipping.spec.ts:90` — rozbity na osobny test per trasa. Zamiast jednego przebiegu ~19 s
  ocierającego się o limit 30 s jest 18 testów po ~2 s, które workery liczą równolegle.

## Pozostaje: brak `<h1>` poza stanami trasy

Stan błędu trasy ma teraz `<h1>`, ale **pozostałe trasy nadal nie mają żadnego**.
Pomiar `h1Count === 0` z audytu 2026-08-04 wynikał częściowo z tego samego mechanizmu —
moduły oddawały tytuł do `PageShell`, który go nie renderował. Po tej zmianie tytuł ekranu
jest już w `ContentHeader`, ale jako `headingLevel={false}`, czyli `<div role="presentation">`.

Czyli struktura nagłówków jest teraz spójna i jawna, tylko zaczyna się od `<h2>`.
`ContentHeader` przyjmuje `2 | 3 | false` — dodanie `1` i przestawienie głównego
`ContentHeader` każdej trasy byłoby jedną zmianą na moduł.

**To osobna decyzja o semantyce nagłówków na ~38 trasach, nie kontynuacja tej naprawy** —
dlatego nie została podjęta tutaj. Warto ją rozstrzygnąć razem z audytem dostępności.

---

## Powiązane dokumenty

- `AUDIT-2026-08-04-TRIAGE.md` — pełny triage audytu UI, decyzje AD-1..AD-11, wyniki paczek 01–14
- `scripts/clip-audit.mjs` — detektor przycinania treści (5 szerokości)
- `e2e/clipping.spec.ts`, `e2e/data-integrity.spec.ts` — testy regresji dodane w paczkach 01–03
