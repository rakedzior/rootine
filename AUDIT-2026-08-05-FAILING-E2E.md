# Pięć padających testów e2e — diagnoza wstępna

Stan: **zdiagnozowane, nienaprawione.** Ten dokument istnieje po to, żeby praca dała się podjąć
z zupełnie czystym kontekstem.

Kontekst: te testy padały **przed** pracami nad design systemem (paczki 01–14, commit `40750c1`).
Potwierdzone przez uruchomienie na `git stash` z nietkniętym `src/` na początku tamtej sesji.
Nie są regresjami tamtej pracy — z jednym wyjątkiem opisanym niżej.

Uruchomienie: `npx playwright test --project=desktop-1440` przy dev serverze na `127.0.0.1:4174`
(`node ./node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4174`).

---

## 1. `goals.spec.ts:30` — „double-clicking a goal opens its full view" (desktop + mobile)

```
Locator: getByRole('button', { name: 'Wróć do celów' })
Expected: visible — element(s) not found
```

Asercja `toHaveURL(/\/cele\/[^/?]+/)` w linii 35 **przechodzi**, więc nawigacja działa.
Nie renderuje się przycisk powrotu.

Przycisk istnieje w dwóch miejscach:

- `src/app/pages/CelSzczegoly.tsx:96` — widoczny `<Button variant="primary">Wróć do celów</Button>`,
  ale tylko w stanie „nie znaleziono celu"
- `src/app/pages/CelSzczegoly.tsx:230` — `aria-label="Wróć do celów"` na `<Button iconOnly>`
  w slocie `leading` nagłówka

**Do sprawdzenia najpierw:** który z dwóch wariantów `ContentHeader` w `CelSzczegoly` faktycznie
się renderuje po dwukliku (są dwa: linie ~230 i ~238) i czy `leading` trafia do drzewa.
Podejrzenie: renderuje się gałąź bez slotu `leading`, albo cel nie zostaje znaleziony i wchodzi
stan pusty o innej treści.

**Uwaga:** paczka 04 usuwała slot `leading` z Pracy, JDG i Podróży — **nie** z `CelSzczegoly`.
Ten test padał wcześniej, więc to nie jest skutek tamtej zmiany, ale warto to potwierdzić
`git stash`em przed diagnozą.

---

## 2. `interactions.spec.ts:4` — „Escape closes and returns focus to its trigger"

```
locator.click: Test timeout of 30000ms exceeded
waiting for getByRole('button', { name: 'Nowy szablon' })
```

**To jedyny przypadek, w którym praca nad design systemem zmieniła obraz błędu.**
Paczka 06 ujednoliciła czasownik akcji tworzenia na „Dodaj" (36:11 na korzyść „Dodaj"),
więc przycisk nazywa się teraz **„Dodaj szablon"**.

Powiązana literówka w treści została już naprawiona: `SportPlanner.tsx:220` odwoływał się do
nieistniejącego przycisku „Nowy szablon" — poprawione na „Dodaj szablon".

**Do zrobienia:**

1. Zaktualizować test na „Dodaj szablon" (linia 7 i 10 — również tytuł dialogu, który
   pozostał „Nowy szablon", bo nazywa tworzony obiekt, nie akcję).
2. **Dopiero wtedy zobaczymy pierwotną przyczynę**, bo ten test padał również przed zmianą nazwy.
   Test sprawdza powrót fokusu na trigger po zamknięciu modala Escape'em.

---

## 3. `production-validation.spec.ts:150` — „a failed lazy route module is contained by the route error state"

```
Locator: getByRole('heading', { name: 'Nie możemy wyświetlić tego widoku', level: 1 })
Expected: visible — element(s) not found
```

Tekst **istnieje** w `src/app/RouteStates.tsx:106`, ale jako prop `title`, nie jako `<h1>`.

Pomiar z audytu 2026-08-04: **`h1Count === 0` na każdej z 38 tras.** Aplikacja nie renderuje
`<h1>` nigdzie — `ContentHeader` używa `<h2>` albo `<div role="presentation">`.

Czyli test oczekuje `level: 1`, a stan błędu trasy renderuje inny poziom.

**Decyzja do podjęcia:** czy stan błędu ma dostać prawdziwy `<h1>` (lepsze dla czytników ekranu
i spójne z tym, że to pełnoekranowy stan, a nie sekcja), czy test ma zejść na faktyczny poziom.
Skłaniałbym się do pierwszego — pełnoekranowy komunikat błędu to naturalne miejsce na `h1`.

---

## 4. `production-validation.spec.ts:218` — „a local write failure is surfaced without discarding the in-memory change"

```
Locator: getByText('Brak zapisu lokalnego', { exact: true })
Expected: visible — element(s) not found
```

Test działa na **module Odżywianie** (klika `+250 ml` w nawodnieniu), ale komunikat
„Brak zapisu lokalnego" istnieje wyłącznie w module **Cele**:

- `src/app/pages/Cele.tsx:330`
- `src/app/pages/CelSzczegoly.tsx:248`

Odżywianie nie ma odpowiednika. Globalnie jest tylko
`src/app/layout/Layout.tsx:1074` → „Zapis wymaga uwagi — otwórz Centrum odzyskiwania".

**To nie jest usterka testu — to luka w produkcie.** Cele informują o nieudanym zapisie
lokalnym w miejscu, w którym użytkownik pracuje; Odżywianie nie.

**Decyzja do podjęcia:** czy dodać spójny wskaźnik nieudanego zapisu do wszystkich modułów
(wtedy warto zrobić z tego jeden komponent, nie trzeci wariant), czy uznać globalny toast
za wystarczający i przepisać asercję testu.

---

## Kolejność, którą proponuję

1. **#2** — najtańsze: poprawić nazwę w teście, zobaczyć prawdziwą przyczynę problemu z fokusem.
2. **#3** — decyzja o `<h1>`; przy okazji warto sprawdzić, czy brak `h1` w całej aplikacji
   nie jest osobnym problemem dostępności (audyt to zmierzył, ale nie rozstrzygnął).
3. **#1** — wymaga diagnozy w przeglądarce, którą z gałęzi `CelSzczegoly` renderuje.
4. **#4** — wymaga decyzji produktowej, więc na końcu.

Punkty #3 i #4 dotyczą **zachowania i dostępności**, nie wyglądu — inna klasa problemu
niż paczki 01–14 i warto trzymać je w osobnych commitach.

---

## Powiązane dokumenty

- `AUDIT-2026-08-04-TRIAGE.md` — pełny triage audytu UI, decyzje AD-1..AD-11, wyniki paczek 01–14
- `scripts/clip-audit.mjs` — detektor przycinania treści (5 szerokości)
- `e2e/clipping.spec.ts`, `e2e/data-integrity.spec.ts` — testy regresji dodane w paczkach 01–03
