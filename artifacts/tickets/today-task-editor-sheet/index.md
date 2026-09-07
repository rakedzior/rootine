---
kind: ticket
title: "Dostosuj ekran edycji zadania"
status: 1
---

## Cel

Przebudować `TaskDetailSheet` zgodnie z dostarczonym screenshotem: ciemny natywny arkusz z górnym wierszem daty/godziny i akcją `Gotowe`, czytelnym tytułem, treścią oraz dolnym paskiem ikon/akcji.

## Zakres

`TasksView.swift` i ewentualne współdzielone komponenty edytora. Zachować istniejące zapisy, datę, godzinę, priorytet, listę, tagi, ukończenie i usuwanie.

## Kryteria akceptacji

- ekran wygląda jak załączony wzorzec na iPhonie;
- data i godzina są widoczne w górnym wierszu arkusza;
- dolny pasek udostępnia akcje `Priorytet`, `Lista`, `Tagi`, `Ukończone` i `Usuń`;
- `Gotowe` zapisuje ostatni stan przed zamknięciem;
- wszystkie obecne pola i akcje są dostępne.

## Zależności

Po `today-completed-timeline`.
