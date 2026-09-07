---
kind: ticket
title: "Odizoluj swipe od otwierania edycji"
status: 0
---

## Cel

Gest lewo/prawo ma uruchamiać wyłącznie akcję swipe. Nie może równocześnie otwierać `TaskDetailSheet`; edycja ma otwierać się tylko po tapnięciu.

## Zakres

Rozpoznawanie gestów i hit testing `TodayTimelineItemRow`. Zachować checkbox i dostępność.

## Kryteria akceptacji

- poziomy swipe nie powoduje `onSelectTask`;
- pionowy scroll nie powoduje żadnej akcji;
- zwykły tap nadal otwiera edycję;
- po anulowaniu gestu nie występuje druga akcja.

## Zależności

Po `today-reschedule-sheet`.
