# Rootine — Calm Layered Workspace / Variant A

Status: **APPROVED AND IMPLEMENTED**

Date: **2026-08-06**

Selected direction: **Variant A**

## Calm Layered Workspace / Variant A

Variant A is the approved and implemented contract. Surface 0 is the canvas; Surface 1 is the shared `SectionSurface` for grouped rows; Surface 2 is reserved for standalone object/widget cards. Overlays are used only for floating surfaces.

Category tint stays local and restrained (typically 2–4%), while semantic tint communicates real status only and never floods an entire section. At `<=760px`, page, section, object, and widget titles wrap naturally. Shared primitives are `SectionSurface`, `FilterBar`, and `Pagination`.

## Kontekst i pewność oceny

Analiza obejmuje osiem głównych modułów desktopowego MVP, ich bieżącą implementację, działające ekrany 1440 × 900, dokumentację produktu i systemu UI oraz uwagi właściciela produktu. Nie zastępuje badań z użytkownikami; wnioski o odczuciu spokoju i kontroli opierają się na dostarczonym feedbacku oraz audycie heurystycznym.

## Diagnoza

Ostatnie spłaszczenie usunęło nie tylko zbędne karty, lecz również część potrzebnego grupowania. W prostych, jednorodnych kolekcjach — szczególnie w Zadaniach — płaski model działa dobrze. W złożonych modułach tekst i wiersze zaczęły jednak unosić się bez wyraźnego kontekstu na niemal czarnym canvasie.

Najważniejsze problemy:

1. Brakuje poziomu pośredniego między canvasem a pojedynczym rekordem.
2. Podobne kolekcje używają różnych geometrii i zachowań w różnych modułach.
3. Biały tekst jest najsilniejszym bodźcem na ekranie, bo powierzchnie są za słabo zaznaczone.
4. Kolor niekiedy opisuje cały moduł lub status, zamiast być lokalnym sygnałem.
5. Sidebar, rekord, chevron i panel szczegółów nie zawsze mają jednoznacznie rozdzielone role.
6. Sprawy nie potrzebują identycznych ekranów, ale potrzebują identycznej gramatyki ekranów.

Audyt nie wykazał P0 ani zwodniczych wzorców. Najważniejsze problemy są klasy P1: spójność, hierarchia i przewidywalność interakcji.

## Zatwierdzony system powierzchni

### Poziom 0 — Canvas

Tło całego workspace, nagłówków i odstępów między niezależnymi sekcjami. Jednorodne listy, takie jak Zadania, mogą działać bez dodatkowego opakowania.

### Poziom 1 — SectionSurface

Spokojna grafitowa powierzchnia z cienkim obramowaniem i promieniem 12 px. Grupuje kilka wierszy, które wspólnie tworzą jeden obiekt poznawczy: posiłek, agenda treningowa, status w Pracy, kroki jednego celu lub rejestr Spraw.

Wiersze wewnątrz pozostają transparentne i używają separatorów. Nie powstają karty w kartach.

### Poziom 2 — ObjectCard

Karta rzeczywiście samodzielnego obiektu lub podsumowania: bilans dnia, aktywny trening, cel w siatce, pojazd, podróż, miesiąc JDG lub notatka.

### Poziom 3 — FloatingSurface

Panel szczegółów, modal, menu, popover i toast. Tylko ten poziom działa jako overlay i otrzymuje wyraźny cień.

### Kolor

- pełny akcent: główna akcja, focus i postęp;
- 8–12% akcentu: badge lub ikona;
- 2–4% akcentu: opcjonalny tint kategorii;
- semantyczne czerwienie, zielenie i błękity nie wypełniają całych sekcji;
- tekst podstawowy jest ciepłą złamaną bielą, a nie ostrą bielą na czerni.

## Kontrakt interakcji

- Sidebar zmienia zakres głównego workspace; nie otwiera automatycznie panelu szczegółów.
- Kliknięcie rekordu wybiera rekord i może otworzyć szybkie szczegóły.
- Chevron wyłącznie rozwija treść w miejscu.
- Pełny ekran szczegółów ma jawną akcję „Otwórz”; dwuklik nie jest wymagany.
- Jedna główna akcja bieżącego widoku stoi po prawej stronie nagłówka.
- Drag and drop zmienia plan, lecz nie nadpisuje historii wykonania.
- **Praca:** kliknięcie tożsamości firmy lub projektu otwiera jej zakres; chevron wyłącznie rozwija podgląd.
- **Cele:** sidebar zmienia zakres bez otwierania szczegółu; głębokość następnych kroków wynosi 1, 2 albo 3.
- **Sprawy:** IA korzysta z archetypów agenda, register i workspace, w tym dla JDG i Podróży.
- **Notatki:** siatka ma równe karty o stałej wysokości i lokalny scroll treści; lista pozostaje płaska.
- **Sport:** bezpieczne przeplanowanie dotyczy kwalifikujących się przeszłych sesji bez przepisywania ukończonej lub aktywnej historii; Historia pokazuje 10 pozycji na stronę.

## Moduły

### Dzisiaj

Bez zasadniczej zmiany. Jedna karta bilansu dnia pozostaje punktem skupienia. Lista obszarów pozostaje spokojna i zwarta; może otrzymać bardzo subtelną wspólną powierzchnię, ale nie osobne karty dla każdego obszaru.

### Zadania

Bez zasadniczej zmiany. To referencyjny model jednorodnej kolekcji: nagłówki czasu, wiersze i separatory.

### Odżywianie

Wybrany i wdrożony wariant A: każdy posiłek jest jedną miękką `SectionSurface`, produkty pozostają płaskimi wierszami. Po prawej Bilans dnia, Nawodnienie i Masa ciała używają tej samej geometrii kart.

Nawodnienie: wartość znajduje się w prawym górnym rogu pod ikonami ołówka i ustawień; używa dokładnie tej samej typografii liczbowej co makroskładniki. Pod nią znajduje się informacja o pozostałej ilości.

### Sport

- Dzisiaj: powierzchnia dzisiejszego planu ma pierwszeństwo nad tygodniem; proporcja wizualna około 60/40.
- Plan treningowy: przycisk dodania jest zawsze dosunięty do prawej strony dnia.
- Przeszły niezrealizowany trening można przeplanować. Trening wykonany lub aktywny pozostaje nieruchomy; przełożenie pominiętego treningu wymaga jednej atomowej operacji aktualizującej outcome, sesję i historię.
- Szablony i Ćwiczenia korzystają ze wspólnego wzorca `LibraryTable`.
- Historia: pięć filtrów w jednym rzędzie na szerokim desktopie, adaptacyjne „Więcej filtrów” niżej, 10 treningów na stronę oraz paginacja na dole.

### Praca

Każdy status jest subtelną `SectionSurface`: Po terminie, Dzisiaj, Bez terminu i Ukończone. Kolor pozostaje na ikonie i liczniku. W widoku firmy kliknięcie projektu otwiera projekt, a chevron wyłącznie rozwija podgląd zadań korzystający z tego samego `WorkTaskRow`.

### Cele

Następne kroki są grupowane według celu. Każda grupa ma nagłówek celu, postęp i 1, 2 albo 3 kroki zgodnie z przełącznikiem. Siatka jest domyślna przy braku zapisanej preferencji. Kliknięcie celu w sidebarze zmienia zakres workspace i nie otwiera automatycznie prawego panelu.

### Sprawy

Docelowa IA:

- Plan: Dzisiaj, Ten tydzień, Wszystkie;
- Finanse: Jednorazowe, Cykliczne, Subskrypcje, Budżet;
- Rejestry: Dokumenty, Pojazdy;
- Obszary: JDG, Podróże.

Podwidoki korzystają z trzech archetypów: `AgendaView`, `RegisterView` i `WorkspaceView`. Każdy zachowuje ten sam `ContentHeader`, filtry, nagłówek sekcji, anatomię rekordu i panel szczegółów.

### Notatki

Widok siatki używa stałej wysokości kart. Karta ma układ: akcent → nieruchomy nagłówek → przewijalna treść → nieruchoma stopka. Scroll dotyczy tylko środka karty i ma cienki widoczny pasek. Widok listy pokazuje 1–2 linie podglądu bez zagnieżdżonego scrolla.

## Zakres wdrożenia

1. Tokeny powierzchni i wspólne `SectionSurface`, `FilterBar`, `Pagination`.
2. Odżywianie i Sport Dzisiaj jako referencyjne złożone ekrany.
3. Praca i grupowanie kroków Celów.
4. Wspólne archetypy Spraw.
5. Równe Notatki, Historia Sportu i biblioteki Szablony/Ćwiczenia.
6. Osobny pakiet integralności dla przeplanowania przeszłych treningów.

## Verification

- `npm run check` — **PASS** (68 files / 314 tests)
- relevant Playwright matrix — **PASS** (114)
- pagination package — **PASS** (6/6)
- post-review mobile — **PASS** (20/20)
- detector — `[]`
- independent reviewer — **PASS**

## Plansze

- [Odżywianie A — miękkie karty kategorii](./nutrition-a-soft-category-cards.png)
- [Odżywianie B — jeden spokojny rejestr](./nutrition-b-one-calm-ledger.png)
- [Odżywianie C — strefy tonalne](./nutrition-c-tonal-zones.png)
- [Dzisiaj i Zadania](./proposal-today-tasks.png)
- [Odżywianie i Sport](./proposal-nutrition-sport.png)
- [Praca i Cele](./proposal-work-goals.png)
- [Sprawy i Notatki](./proposal-affairs-notes.png)

## Decyzja

1. **Variant A selected.**
2. System `Canvas → SectionSurface → ObjectCard → FloatingSurface` is approved.
3. The direction is implemented and this document is the binding contract.
