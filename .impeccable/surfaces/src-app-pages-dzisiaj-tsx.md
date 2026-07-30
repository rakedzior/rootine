---
version: 1
slug: "src-app-pages-dzisiaj-tsx"
primary_target: "src/app/pages/Dzisiaj.tsx"
related_targets: ["src/styles/today.css","src/app/data/todayWeather.ts","src/app/data/nutritionWorkspace.ts","src/app/pages/Zadania.tsx","src/styles/task-habits.css","src/app/routes.ts","src/app/layout/Layout.tsx"]
---

# Dzisiaj

- Scope: `src/app/pages/Dzisiaj.tsx`
- Visitor mode: Operate.
- Audience and job: Osoba zarządzająca codziennymi zobowiązaniami chce natychmiast zobaczyć, ile pracy faktycznie pozostało, oraz rozpoznać moduły wymagające reakcji.
- Primary task: Odczytać liczbę pozostałych elementów, ich łączny postęp i przejść do pierwszego aktywnego obszaru.
- Content and states: Kompaktowa pogoda dla Warszawy, liczba pozostałych pozycji, liczba zaplanowanych i wykonanych, zaległości, cele wymagające uwagi oraz wiersze zadań, nawyków, celów, pracy, sportu, spraw i finansów oraz odżywiania. Każdy wiersz rozróżnia stan aktywny, brak planu oraz pełne wykonanie; Odżywianie staje się wykonane dopiero po ręcznym zamknięciu dnia w module źródłowym.
- Constraints: Lokalny MVP, język polski, dane z modułów źródłowych, prognoza z Open-Meteo z widoczną atrybucją, identyczne kolumny wierszy oraz pełna szerokość i wysokość dostępnego obszaru roboczego. Na desktopie bilans i siedem modułów mają mieścić się bez przewijania dzięki płynnej wysokości i odstępom; na tablecie i telefonie układ przechodzi w naturalny przepływ z przewijaniem. Suma obejmuje elementy do wykonania, a odżywianie pozostaje osobnym wskaźnikiem dziennego celu.
- Direction: Jeden zwarty bilans dnia z liczbą pozostałych elementów i osobną liczbą obszarów wymagających reakcji, a pod nim gęsty rejestr poziomych wierszy. Liczba „pozostało” jest typograficznie drugorzędna. Moduły zawsze zachowują kolejność preferencji użytkownika; puste są neutralne, a ukończone pozostają na swoim miejscu i są mocno wygaszone niemal do tonu tła, z jedynie śladowym seledynowym sygnałem wykonania. Kolor służy tylko postępowi, ostrzeżeniom i potwierdzeniu ukończenia.
- Memorable moment: Pierwsza liczba odpowiada dokładnie na pytanie „ile jeszcze zostało?”, osobny licznik pokazuje skalę wymaganej reakcji, a stała kolejność modułów pozostaje przewidywalna przez cały dzień.
- Unresolved goals: Docelowo lokalizacja pogody może zostać przeniesiona do ustawień użytkownika zamiast stałego miasta aplikacji.
