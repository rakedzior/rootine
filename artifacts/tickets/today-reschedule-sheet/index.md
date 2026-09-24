---
kind: ticket
title: "Dostosuj ekran przekładania zadania"
status: 0
---

## Cel

Zastąpić obecny confirmation dialog arkuszem przekładania zgodnym z dostarczonym screenshotem, z opcjami Dziś, Jutro, Pojutrze, Za tydzień, Wybierz datę, Bez daty i Wyczyść.

## Zakres

`TodayTimelineItemRow`, `TodayRescheduleDateSheet` i nowy komponent arkusza. Zachować istniejącą semantykę `TodayRescheduleOption`.

## Kryteria akceptacji

- swipe w lewo otwiera nowy arkusz;
- anulowanie nie modyfikuje zadania;
- wybór opcji zapisuje datę i zamyka arkusz;
- arkusz działa na małym ekranie i obsługuje Dynamic Type.

## Zależności

Po `today-task-editor-sheet`.
