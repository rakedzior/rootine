# Pięć padających testów e2e — naprawione

Stan: **naprawione.** Cały zestaw `desktop-1440` + `mobile-390` przechodzi (112 passed, 4 skipped),
`npm run typecheck`, `npm run lint` i `npm run test` (277 testów) są czyste.

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

## Co zostaje do zrobienia: osiem modułów z martwym wskaźnikiem zapisu

To samo `Brak zapisu lokalnego` jest podpięte pod martwy `PageHeader meta` w **ośmiu** modułach.
Każdy z nich ma własny `ContentHeader`, więc naprawa jest taka sama jak w Odżywianiu:

| Moduł | Martwy badge | Docelowy `ContentHeader` |
| --- | --- | --- |
| `Cele.tsx` | `:329` | `:422` |
| `Zadania.tsx` | `:779` | `:1173` |
| `Kalendarz.tsx` | `:842` | `:958` |
| `Notatki.tsx` | `:1260` | `:1270` |
| `Podroze.tsx` | `:870` | `:877` |
| `Sport.tsx` | `:1163` | `:1210` |
| `Jdg.tsx` | `:371` | `:377` |
| `Sprawy.tsx` | `:833`, `:848` | `:869` |

Uwaga: `Cele.tsx:329` gubi też `Oryginał danych zabezpieczony` i status importu, a `Jdg`
i `Podroze` renderują się przez `layout(header, content)` z `Sprawy`, więc tam trzeba usunąć
również nieużywany parametr `header`.

**To nie jest kosmetyka — użytkownik nie dowiaduje się, że jego zmiana nie została zapisana.**
Zostaje tylko globalny toast z `Layout.tsx:1074`.

## Druga sprawa: pułapka w sygnaturze

Dopóki `PageShell` i `ModuleShell` przyjmują propsy, których nie renderują, każdy kolejny
`title`/`meta`/`actions` zniknie tak samo cicho. Warto usunąć te propsy z sygnatur, żeby
kompilator wskazał wszystkie call sites, zamiast pozwalać im wyglądać na poprawne.
`h1Count === 0` na wszystkich 38 trasach (pomiar z audytu 2026-08-04) to prawdopodobnie
ten sam mechanizm — moduły oddają tytuł do `PageShell`, który go nie renderuje.

---

## Powiązane dokumenty

- `AUDIT-2026-08-04-TRIAGE.md` — pełny triage audytu UI, decyzje AD-1..AD-11, wyniki paczek 01–14
- `scripts/clip-audit.mjs` — detektor przycinania treści (5 szerokości)
- `e2e/clipping.spec.ts`, `e2e/data-integrity.spec.ts` — testy regresji dodane w paczkach 01–03
