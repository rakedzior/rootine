---
kind: spec
title: "Plan zmian listy zadań i przewijania"
---

## Zakres

Zmiany dotyczą widoku Dzisiaj oraz listy zadań: hierarchii podsumowania, przenoszenia zadań gestem, animacji przesuwania, wyrównania wierszy, rozwijania ukończonych, przewijania dotykowego i odraczania zaległości.

## Kolejność pojedynczych zadań — bieżąca iteracja

| # | Zadanie | Oczekiwany rezultat | Model / rozumowanie | Tryb |
|---|---|---|---|---|
| 1 | Natychmiastowe przewijanie po zadaniu | Pionowy ruch po dowolnym miejscu wiersza zawsze oddaje gest `ScrollView`; długi przytrzymany drag uzbraja się dopiero po opóźnieniu i nie blokuje scrolla. | `gpt-5.6-luna` / max | fast |
| 2 | Przebudowa podsumowania dnia | `5 z 6`, `83%` i pasek postępu mają spójną hierarchię; procent jest w tej samej linii co wynik, a pasek znajduje się poniżej. | `gpt-5.6-luna` / medium | fast |
| 3 | Niezależnie zwijane sekcje osi czasu | Usunięty osobny panel; nagłówki „ZALEGŁOŚCI”, „DZISIAJ” i „UKOŃCZONE” niezależnie zwijają sekcje. Zaległości i dzisiaj są domyślnie rozwinięte, ukończone zwinięte; zaległości są od najstarszych do najświeższych. | `gpt-5.6-luna` / high | fast |
| 4 | Nowy ekran edycji zadania | Edycja zadania odwzorowuje dostarczony screenshot: tytuł, treść, data/godzina i dolny pasek akcji są czytelne w natywnym arkuszu. | `gpt-5.6-luna` / high | fast |
| 5 | Nowy ekran przekładania zadania | Przesunięcie w lewo otwiera arkusz przekładania w stylu dostarczonego screenshotu, z zachowaniem wyboru daty i anulowania. | `gpt-5.6-luna` / high | fast |
| 6 | Izolacja gestów od otwierania edycji | Swipe w lewo/prawo nie wywołuje `onSelectTask`; edycja otwiera się wyłącznie po tapnięciu po zakończeniu rozpoznania gestu. | `gpt-5.6-luna` / max | fast |
| 7 | Etykiety akcji swipe | Pod ikoną/obok ikony pojawia się „Wykonano” po przesunięciu w prawo i „Przełóż” po przesunięciu w lewo; etykieta skaluje się wraz z offsetem. | `gpt-5.6-luna` / medium | fast |
| 8 | Przenoszenie zaległości do dzisiaj | Przytrzymanie zaległego zadania i przeciągnięcie przez separator do „Dzisiaj” zmienia datę bez arkusza; stan i drop indicator są widoczne podczas gestu. | `gpt-5.6-luna` / max | fast |

Zadania są wykonywane ściśle sekwencyjnie. Kolejne zadanie startuje dopiero po zakończeniu i krótkiej weryfikacji poprzedniego.

## Stan poprzedniej iteracji

- T1 został ponownie wyrównany po regresji w `Dzisiaj v0`: `be9b75c`.
- T2–T5 i T7 zostały zachowane z wcześniejszej sekwencji w `Dzisiaj v0`.
- T6 otrzymał krytyczną poprawkę arbitrażu gestów w `966bdad` oraz barierę przeciw drugiej akcji w `b1a0059`.
- `build-for-testing` z jawnym SDK i świeżym derived data przeszedł po każdym końcowym kroku (`/tmp/rootine-final-build`, `/tmp/rootine-final2-build`).
- XCTest pozostaje do ponowienia: wcześniejszy runner CoreSimulator/testmanager zawieszał się przed uruchomieniem `xctest` (kontrolowany timeout/exit 142).

## Stan bieżącej iteracji

- Zakres i kolejność zostały zaktualizowane po ręcznej weryfikacji na iPhonie.
- Zadanie 1 zostało wdrożone w `e10c9c9` i potwierdzone ręcznie na iPhonie: przewijanie działa po tytule, godzinie i checkboxie.
- Zadanie 2 zostało wdrożone w `42e7105`: podsumowanie pokazuje `N z M wykonane`, procent po prawej w tej samej linii i pasek poniżej.
- Zadania 3–8 czekają na sekwencyjną implementację i weryfikację; nie uruchamiamy kolejnego agenta przed raportem ukończenia poprzedniego.
- Ostatni deploy `b1a0059` został zainstalowany i uruchomiony na iPhonie; ta iteracja zaczyna się od reprodukcji problemu z przewijaniem.
