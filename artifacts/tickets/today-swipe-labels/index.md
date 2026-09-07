---
kind: ticket
title: "Dodaj etykiety akcji swipe"
status: 0
---

## Cel

Podczas przesunięcia w prawo pokazuj ikonę i tekst `Wykonano`; podczas przesunięcia w lewo ikonę i tekst `Przełóż`. Oba elementy mają płynnie skalować się wraz z offsetem.

## Zakres

Wizualny feedback `TodayTimelineItemRow` i accessibility. Nie zmieniać progów akcji.

## Kryteria akceptacji

- przyciemnione tło obejmuje cały wiersz;
- tekst jest widoczny bez zasłaniania tytułu i godziny;
- animacja respektuje Reduce Motion;
- po puszczeniu następuje dokładnie jedna akcja.

## Zależności

Po `today-gesture-isolation`.
