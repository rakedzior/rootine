---
kind: ticket
title: "Przebuduj podsumowanie dnia"
status: 2
---

## Cel

Wynik `5 z 6`, procent `83%` i pasek postępu tworzą jedną hierarchię: wynik i procent w jednej linii, pasek poniżej. Sekcja priorytetów zachowuje wyrównanie.

## Zakres

`TodaySummaryCard` i lokalne testy/layout helpers. Nie zmieniać gestów ani osi czasu.

## Kryteria akceptacji

- wynik i procent nie rozjeżdżają się przy typowym i większym Dynamic Type;
- pasek postępu jest pod linią wyniku;
- prawa sekcja priorytetów pozostaje czytelna i wyrównana.

## Zależności

Po `today-scroll-arbitration`.
