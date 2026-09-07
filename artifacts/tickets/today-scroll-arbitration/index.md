---
kind: ticket
title: "Napraw natychmiastowe przewijanie widoku Dzisiaj"
status: 2
---

## Cel

Pionowy ruch rozpoczęty na dowolnej części wiersza zadania ma natychmiast należeć do nadrzędnego `ScrollView`. Długi przytrzymany drag może uzbroić się dopiero po opóźnieniu i progu ruchu, bez blokowania zwykłego scrolla.

## Zakres

`TodayView.swift`, gesty wiersza, testy arbitrażu. Nie zmieniać wyglądu podsumowania, arkuszy ani modelu danych.

## Kryteria akceptacji

- pionowy scroll po tekście, godzinie, checkboxie i pustym fragmencie wiersza jest responsywny;
- pionowy drag nie otwiera edycji, nie wykonuje zadania i nie uruchamia przełożenia;
- long press drag pozostaje możliwy po świadomym przytrzymaniu;
- dodany test obejmuje rzeczywistą decyzję ścieżki produkcyjnej, nie tylko nieużywany helper.

## Zależności

Brak. Weryfikacja przed rozpoczęciem zadania 2.
