---
target: Plan treningowy
total_score: 29
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 2
timestamp: 2026-07-31T14-01-45Z
slug: src-app-sport-sportplanner-tsx
---
## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 3/4 | Stan zapisu, wybrany tydzień i cofnięcie przesunięcia są widoczne, ale status jest rozproszony między nagłówkiem, kartą cyklu i toolbar’em. |
| 2 | Match System / Real World | 3/4 | Metafora tygodnia i dni jest naturalna; skróty „T1” i „3 tr.” wymagają interpretacji. |
| 3 | User Control and Freedom | 3/4 | Są strzałki, klawiatura i „Cofnij”; brak prostego, bezpośredniego wyboru celu przeniesienia poza drag-and-drop. |
| 4 | Consistency and Standards | 3/4 | Ton, tokeny i wspólne komponenty są spójne, ale planner ma własne, gęste kafle i skróty. |
| 5 | Error Prevention | 3/4 | Guard przed utratą szkicu i walidacja zapisu pomagają; przeciągnięcie całego przycisku łatwo wykonać przypadkiem. |
| 6 | Recognition Rather Than Recall | 3/4 | Daty, liczniki i etykiety dyscyplin są obecne, lecz brak jednoznacznego znacznika „dziś” po przejściu do innego tygodnia. |
| 7 | Flexibility and Efficiency | 3/4 | Drag-and-drop i skróty Alt+strzałki są dobrym akceleratorem, ale nie ma alternatywy dotykowej ani operacji seryjnej. |
| 8 | Aesthetic and Minimalist Design | 3/4 | Grafitowa hierarchia jest spokojna i czytelna, lecz siedem powtarzalnych wierszy, puste sloty i podsumowanie wydłużają skanowanie. |
| 9 | Error Recovery | 3/4 | Cofnięcie przesunięcia/usunięcia i ostrzeżenie o zmianie w innej karcie są mocne; odzyskanie po błędzie zapisu jest mniej konkretne. |
| 10 | Help and Documentation | 2/4 | Jest krótka instrukcja przenoszenia, ale brak kontekstowego objaśnienia cyklu, tygodni bazowych i różnicy między zapisem planu a akcjami operacyjnymi. |
| **Total** |  | **29/40** | **Good, ale z kilkoma problemami do rozwiązania przed dalszym rozbudowywaniem planera.** |

## Design Specificity Verdict

**LLM assessment:** Widok jest wyraźnie osadzony w Rootine: grafitowe warstwy, 4-pikselowy rytm, małe porcje danych, niebieski tylko dla aktywnego wyboru i wspólne komponenty. Nie jest jednak jeszcze szczególnie charakterystyczny jako planner — układ „podsumowanie → pasek tygodni → siedem dni → podsumowanie” mógłby pojawić się w dowolnej aplikacji treningowej. Największa szansa na własny język leży w lepszym pokazaniu rytmu planu i statusu realizacji, nie w dodawaniu dekoracji.

**Deterministic scan:** `detect.mjs --json src/app/sport/SportPlanner.tsx` zakończył się kodem 0, wynik `[]` (0 findings). Statycznie obecne są semantyczne `tablist`/`tabpanel`, `aria-selected`, obsługa Arrow/Home/End oraz `aria-keyshortcuts` w `SportPlanner.tsx:277–428`.

## Overall Impression

To solidny, operacyjny fundament. Użytkownik rozumie, że buduje jeden cykl, wybiera tydzień i rozkłada treningi po dniach. Największa luka nie dotyczy koloru, tylko modelu interakcji: przenoszenie treningu jest wygodne dla osoby z myszką, ale kruche i mało odkrywalne dla pozostałych.

## What's Working

- `CyclePlanner` ma dobrą hierarchię danych: cykl, aktywny tydzień, dni, konkretne treningi (`SportPlanner.tsx:442–530`).
- Liczniki treningów w pasku tygodni i tygodniowe podsumowanie wspierają szybkie skanowanie bez wykresowego hałasu.
- Jawny szkic i zapis planu, `beforeunload`, komunikat o zmianie w innej karcie oraz „Cofnij” zmniejszają ryzyko utraty pracy (`Sport.tsx:286–330`, `1095–1113`).

## Priority Issues

### [P1] Przenoszenie zależy od drag-and-drop

**Dlaczego:** Każdy trening jest jednocześnie pełnym przyciskiem wyboru i elementem `draggable` (`SportPlanner.tsx:370–427`). Na dotyku nie ma równoważnej ścieżki, a instrukcja klawiaturowa nie rozwiązuje problemu użytkownika mobilnego.

**Fix:** Dodaj w panelu szczegółów lub menu akcji „Przenieś do…” z wyborem tygodnia i dnia. Drag-and-drop zostaw jako akcelerator; po przeniesieniu pokaż konkretny komunikat „Góra A → środa, Tydzień 2” z „Cofnij”.

**Suggested command:** `$impeccable audit` + `$impeccable adapt`

### [P1] Aktywny tydzień nie ma wystarczającego kontekstu „dziś”

**Dlaczego:** Paski pokazują skróty `T1`, `T2`… i liczbę `tr.`, ale po przejściu do innego tygodnia znika odpowiedź na pytanie, gdzie jestem względem bieżącego dnia. `activeWeek` startuje od tygodnia dzisiejszego, lecz interfejs tego nie komunikuje.

**Fix:** Oznacz tydzień bieżący subtelnym „Dziś”/markerem daty; zamień skróty na `Tydz. 1` albo pokaż numer i zakres dat w tooltipie/aria-label. Zachowaj kompaktowość, ale nie każ użytkownikowi tłumaczyć „T1”.

**Suggested command:** `$impeccable clarify` + `$impeccable layout`

### [P2] Zbyt wiele równorzędnych poziomów i powtórzeń

**Dlaczego:** Karta cyklu zawiera trzy fakty i dwie akcje, pod nią są strzałki, do 12 zakładek, siedem wierszy dni z powtarzanym „Dodaj trening”, a na dole kolejne podsumowanie. To podnosi koszt skanowania i spycha kluczową decyzję „co zmienić w tym tygodniu” w dół ekranu.

**Fix:** Zostaw jedno podsumowanie tygodnia przy nagłówku planszy; przenieś dyscypliny i `Aktywne dni` do zwijanego „Więcej o tygodniu”. W pustych dniach użyj cichego pola „+ Dodaj” zamiast siedmiu pełnych przycisków o tej samej wadze.

**Suggested command:** `$impeccable distill` + `$impeccable layout`

### [P2] Niejasna granica między wyborem a przeciąganiem

**Dlaczego:** Kliknięcie całego kafla otwiera szczegóły, a ten sam kafel można przeciągać. Mała ikona chwytu w prawym górnym rogu nie ustanawia wyraźnego „uchwytu”; łatwo rozpocząć drag, gdy użytkownik chciał tylko otworzyć rekord.

**Fix:** Wydziel uchwyt jako osobny, oznaczony element i dodaj w menu „Przenieś”. Na hover/focus pokaż krótki opis akcji, ale nie zwiększaj wizualnego ciężaru karty.

**Suggested command:** `$impeccable polish`

## Persona Red Flags

**Alex (Power User):** Skróty Alt+strzałki są dobrym początkiem, ale brak przenoszenia wielu treningów naraz i brak szybkiej komendy „przenieś do dnia”. Przy większym cyklu Alex wykona wiele identycznych operacji.

**Sam (Accessibility-Dependent):** Semantyka tabów i focus są dobre, ale `aria-keyshortcuts` nie zastępuje widocznej instrukcji ani dotykowej/klawiaturowej alternatywy wyboru celu. Trzeba sprawdzić, czy status niezapisanych zmian i drop-target są ogłaszane po zmianie.

**Casey (Mobile):** CSS układa dni pionowo, ale główna operacja planera nadal zakłada drag-and-drop. Na telefonie Casey może dodać trening, lecz nie ma jasnej ścieżki jego przeniesienia na inny dzień.

## Minor Observations

- „Dodaj trening” z karty podsumowania domyślnie otwiera formularz dla poniedziałku (`SportPlanner.tsx:489–491`), choć użytkownik nie wybrał dnia.
- Status zapisu jest powtórzony jako badge w karcie cyklu, tekst w toolbarze i warunkowy przycisk w `PageHeader`; jedna główna reprezentacja byłaby spokojniejsza.
- Podsumowanie używa mikrotypografii i skrótów (`tr.`), które dobrze pasują do gęstości, ale warto utrzymać pełne etykiety w aria-labelach i na mobile.

## Questions to Consider

- Czy „Plan treningowy” ma przede wszystkim służyć szybkiemu przesuwaniu treningów, czy konfiguracji całego cyklu? Od tego zależy, czy plansza powinna być gęstsza, czy bardziej instruktażowa.
- Co jeśli każda karta treningu miała jedną oczywistą akcję „Przenieś”, a drag-and-drop pozostał opcjonalnym skrótem?
- Czy podsumowanie tygodnia powinno pokazywać realizację względem wykonanych treningów, a nie tylko planowaną objętość?
