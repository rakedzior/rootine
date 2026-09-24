---
kind: ticket
title: "Niezależnie zwijane sekcje osi Today"
status: 1
---

## Cel

Usunąć osobny panel ukończonych. Oś czasu ma trzy niezależne nagłówki: `ZALEGŁOŚCI`, `DZISIAJ` i `UKOŃCZONE`. Kliknięcie nagłówka zwija albo rozwija wyłącznie jego sekcję. Zaległości i dzisiaj są domyślnie rozwinięte, a ukończone domyślnie zwinięte.

Rozwinięte ukończone elementy pojawiają się w tej samej osi czasu.

Zaległości są uporządkowane od najstarszych do najświeższych: największa liczba dni opóźnienia jest na górze.

## Zakres

`TodayTimelineCard`, `TodayCompletedDisclosure`, sortowanie i identyfikatory dostępności. Zachować osobną akcję `Przełóż` przy niepustych zaległościach oraz istniejące gesty wierszy.

## Kryteria akceptacji

- brak stałego osobnego panelu na dole;
- ukończone elementy są umieszczone chronologicznie w osi czasu po rozwinięciu;
- zaległe zadania są sortowane malejąco według wieku zaległości (najstarsze pierwsze);
- nagłówki `ZALEGŁOŚCI`, `DZISIAJ` i `UKOŃCZONE` zwijają/rozwijają sekcje niezależnie od siebie;
- domyślnie `ZALEGŁOŚCI` i `DZISIAJ` są rozwinięte, a `UKOŃCZONE` zwinięte;
- `Przełóż` pojawia się wyłącznie przy istniejących zaległościach i nie przełącza sekcji;
- zmiana nie psuje przenoszenia i edycji ukończonych elementów.

## Zależności

Po `today-summary-layout`.
