---
version: 1
slug: "ios-rootine-features-tasksview-swift"
primary_target: "ios/Rootine/Rootine/Features/TasksView.swift"
related_targets: ["ios/Rootine/Rootine/Features/TodayView.swift","ios/Rootine/Rootine/App/AppShellView.swift","ios/Rootine/Rootine/Core/Design/RootineTheme.swift"]
---

# Zadania — iOS

- Scope: natywna zakładka `Zadania` na iPhone.
- Visitor mode: Operate.
- Audience and job: szybko uporządkować backlog albo rytm nawyków bez budowania drugiego widoku `Dzisiaj`.
- Primary task: znaleźć właściwą kolejkę i wykonać lub przełożyć element jednym gestem.
- Direction: ekran bez tytułu zakładki zaczyna się od lekkiego przełącznika `Zadania / Nawyki`, stale dostępnego wyszukiwania i właściwej listy. Nie pokazuje karty statystyk przed zadaniami. Domyślny `Atrament`, tonalne grafity, subtelna linia i błękit wyłącznie dla aktywnego wyboru oraz działania. Pojedyncze zadania są czytelnymi, lekko zaokrąglonymi wierszami na powierzchni `surface`, inspirowanymi dostarczonymi referencjami, ale bez ich dużego tytułu ekranu. Ukończone zadania są domyślnie całkowicie ukryte wraz z nagłówkiem sekcji i dostępne przez filtr `Ukończone`. Bez gradientów, szkła, dekoracji i systemowego segmented control.
- Gestures: w prawo wykonaj/cofnij, w lewo przełóż lub edytuj, przytrzymanie otwiera pełne menu, zmiany odwracalne pokazują `Cofnij`.
- Constraints: Dynamic Type, Reduce Motion, cele dotykowe 44 pt, systemowy powrót od krawędzi, gest nigdy nie jest jedyną drogą.
