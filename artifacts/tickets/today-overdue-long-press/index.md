---
kind: ticket
title: "Napraw przenoszenie zaległości do dzisiaj"
status: 0
---

## Cel

Przytrzymanie zaległego zadania i przeciągnięcie przez separator do sekcji `Dzisiaj` ma zmienić datę na dzisiejszą bez otwierania arkusza.

## Zakres

Koordynator sekcji, geometria drop targetów i ścieżka `onMoveTask` dla `.overdue -> .today`. Nie zmieniać gestu poziomego poza koniecznym rozdzieleniem osi.

## Kryteria akceptacji

- drag startuje po świadomym przytrzymaniu;
- wskaźnik celu pokazuje sekcję Dzisiaj;
- po dropie zadanie znika z zaległości i pojawia się dzisiaj;
- anulowanie pozostawia zadanie bez zmian;
- zadania cykliczne nie zmieniają kotwicy serii.

## Zależności

Po wszystkich wcześniejszych ticketach, szczególnie `today-scroll-arbitration`.
