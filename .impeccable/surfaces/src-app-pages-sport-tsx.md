---
version: 1
slug: "src-app-pages-sport-tsx"
primary_target: "src/app/pages/Sport.tsx"
related_targets: ["src/app/sport/SportPlanner.tsx","src/app/sport/SportInsights.tsx","src/app/sport/plannerModel.ts","src/app/sport/model.ts"]
---

Mode: Operate

Audience: użytkownik lokalnego MVP, który chce szybko ułożyć prosty plan treningowy, wykonać go seria po serii i wracać do automatycznie budowanej historii bez zarządzania wieloma aktywnymi planami.

Job: sprawdź trening na dziś i bieżący tydzień; rozpocznij aktywną sesję; zapisuj wykonane serie, obciążenie, powtórzenia, RIR lub ból, notatki i przerwy; utwórz szablony przypisane do kategorii sportu; zbuduj jeden cykl treningowy; rozłóż treningi na kolejne tygodnie; przejrzyj automatyczną historię oraz regularność.

Primary action: w widoku Dzisiaj — „Rozpocznij trening”; w planerze — „Zapisz plan”. Po starcie interfejs przechodzi w skupiony tryb aktywnej sesji.

Content and states: pięć widoków w drugim lewym sidebarze — Dzisiaj, Cykl treningowy, Szablony, Historia i Analiza; wszystkie treningi dnia i bieżący tydzień; akcje startu, oznaczenia wykonania oraz przesunięcia na jutro; skupiony ekran aktywnej sesji z czasem całkowitym, postępem, nawigacją po ćwiczeniach i seriach, timerem przerw, notatkami i metrykami; biblioteka szablonów pogrupowana według kategorii sportu; ustawienia nazwy, startu i długości cyklu; pasek wszystkich tygodni z liczbą treningów; plansza siedmiu dni; przypisanie jednorazowe, cotygodniowe albo tylko do wybranych tygodni; drag and drop; panel szczegółów; edycja jednego wystąpienia lub całej serii; jawny stan niezapisanych zmian, pusty cykl, brak szablonów i błąd zapisu lokalnego.

Direction: grafitowy pulpit treningowy w istniejącym warsztacie Routine. Główny moduł Dzisiaj ma dwuczęściową kompozycję: zwarty kontekst dnia po lewej i pełnoszeroką agendę treningów po prawej; na wąskich ekranach części układają się liniowo. Planer zachowuje hierarchię: cykl, tygodnie, dni, treningi. Szablony są osobnym prostym widokiem, nie kolejnym poziomem nawigacji.

Memorable moment: rozpoczęcie dzisiejszego treningu zmienia pulpit w precyzyjną konsolę wykonania, a każda seria uruchamia timer przerwy i zachowuje stan po opuszczeniu ekranu.

Constraints: aplikacja przechowuje lokalnie jedną bibliotekę szablonów, najwyżej jeden aktywny cykl, najwyżej jedną aktywną sesję, jej timer oraz historię. Każdy zaplanowany trening pozostaje osobnym rekordem, ale powtórzenia mają wspólny identyfikator serii. Usunięcie szablonu nie usuwa treningów już umieszczonych w cyklu. Zmiany planistyczne wymagają jawnego zapisu; działania operacyjne, wykonanie i przesunięcie na jutro zapisują się automatycznie.

Resolved: uproszczono wyłącznie planowanie do szablonów i jednego aktywnego cyklu. Zachowano Dzisiaj, Historię i Analizę oraz przywrócono pełny tryb wykonania treningu z ćwiczeniami, seriami, timerem przerw i automatycznym zapisem wyniku.

Unresolved: integracje z zegarkami i zewnętrznymi serwisami sportowymi nie należą obecnie do tego przepływu. Historia i analiza bazują na lokalnych rekordach sesji.
