---
version: 1
slug: "src-app-pages-odzywanie-tsx"
primary_target: "src/app/pages/Odzywanie.tsx"
related_targets: ["src/app/data/nutritionWorkspace.ts"]
---

Mode: Operate

Audience: użytkownik lokalnego MVP, który chce szybko zapisać rzeczywiście zjedzone produkty i porównać sumę z własnym celem dnia.

Job: wybierz dzień, dodaj lub popraw produkt we właściwym posiłku, sprawdź kalorie, makroskładniki i nawodnienie, a w razie potrzeby zmień cele.

Primary action: „Dodaj produkt”. Dane produktu wymagają nazwy i kalorii; porcja oraz makroskładniki mogą być uzupełniane stopniowo. Ostatnie własne produkty przyspieszają ponowny wpis.

Content and states: cztery stałe pory posiłków, prawdziwy pusty dzień, jawnie oznaczony przykład uruchamiany na żądanie, edycja i usuwanie wpisu, dzienny bilans, przekroczenie celu, nawodnienie, błąd zapisu lokalnego, bezpieczne odzyskiwanie uszkodzonego magazynu, walidacja formularza i cofnięcie usunięcia.

Direction: dzienny arkusz budżetu żywieniowego. Rejestr jest semantyczną, pogrupowaną tabelą na szerokim ekranie i zbiorem czytelnych rekordów na telefonie; bilans oraz woda tworzą spokojny panel pomocniczy. Widok odrzuca układ wielkich kafli KPI.

Memorable moment: po dodaniu lub edycji produktu wszystkie wartości budżetu aktualizują się w tym samym widoku, bez przejścia do osobnego raportu.

Constraints: wyłącznie lokalny zapis i ustalony system Routine; bez kont, backendu, bazy produktów, integracji, synchronizacji ani porad medycznych. Uszkodzony zapis nigdy nie jest nadpisywany bez świadomej decyzji użytkownika.

Unresolved: źródło katalogu produktów, jednostki porcji i sposób późniejszego łączenia wpisów między urządzeniami.
