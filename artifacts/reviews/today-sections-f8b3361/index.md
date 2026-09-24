---
kind: review
title: "Fresh review — Today disclosure sections (f8b3361)"
---

## Verdict

FAIL — commit `f8b3361f16596dc4b3a263518577c9a22461660c` kompiluje się, a trzy sekcje mają niezależny stan rozwinięcia, ale regresja pustego stanu sprawia, że `Dzisiaj` może być pustą sekcją bez komunikatu. Dodatkowo pusty nagłówek `Zaległości` nadal oferuje akcję masowego przełożenia.

Sprawdzono względem planu `today-task-redesign-plan` oraz kontraktów sekcji, gestów, wskaźnika dropu i arbitrażu scrolla. Nie znaleziono zmian modelu danych ani odłączenia istniejących callbacków drag/drop, swipe, VoiceOver lub Reduce Motion.

## Findings

### P1 — pusty stan `Dzisiaj` zależy od zaległości, więc znika w częstym scenariuszu

`TimelineEntries.hasOpenEntries` obejmuje `overdue`, `timed` i `untimed` (`TodayView.swift:1448`). Po rozdzieleniu sekcji ten predykat jest nadal używany do wyboru treści wewnątrz sekcji `Dzisiaj` (`TodayView.swift:1537–1547`). Gdy użytkownik ma co najmniej jedną zaległość, ale nie ma żadnego otwartego zadania/habitu przypisanego na dziś, warunek jest fałszywy: pod nagłówkiem `Dzisiaj` nie pojawia się ani wiersz, ani `Brak otwartych zobowiązań…`. Sekcja wygląda jak uszkodzona lub pusta bez wyjaśnienia. Warunek powinien opierać się wyłącznie na `timed` i `untimed`, niezależnie od `overdue`.

### P2 — `Przełóż` jest aktywne także dla pustej sekcji `Zaległości`

`TodayTimelineSectionLabel` dla `Zaległości` jest renderowane bez sprawdzenia `timeline.overdue.isEmpty` (`TodayView.swift:1478–1493`), a przekazany callback zawsze pokazuje dialog masowego przełożenia (`TodayView.swift:1856–1875`). Przy zerowej liczbie zaległości użytkownik może więc wywołać potwierdzenie operacji, po czym dostać alert `Nie ma zaległych zadań do przełożenia.`. Poprzednio akcja nie była renderowana dla pustej listy. Przycisk powinien być ukryty albo disabled z adekwatną semantyką, przy zachowaniu samego pustego drop targetu.

## Contract checks

- Niezależne rozwijanie: PASS statycznie — `isOverdueExpanded`, `isTodayExpanded` i `isCompletedExpanded` są osobnymi stanami; wartości domyślne to odpowiednio `true`, `true`, `false` (`TodayView.swift:1394–1396`).
- Osobny przycisk `Przełóż`: PASS dla niepustych zaległości; P2 opisuje niepożądany przypadek pustej sekcji.
- Drag/drop i istniejące scroll/swipe: PASS statycznie — wszystkie cztery grupy wierszy nadal przekazują `requestMove`, `handleDragEvent` i `dragResetToken`; commit nie zmienia rozpoznawania gestów ani resolverów geometrii.
- Drop do pustej/zwiniętej sekcji: PASS statycznie — `minimumHeight` i `TodayTaskDropIndicatorResolver` nadal zapewniają bounds oraz środkowy wskaźnik dla pustego targetu.
- Accessibility/Reduce Motion: PASS statycznie — nagłówki mają osobne identyfikatory, etykiety, wartości, hinty i hit target min. 44 pt; animacje disclosure respektują `accessibilityReduceMotion`, a dekoracyjny drop indicator pozostaje ukryty dla VoiceOver.
- Puste sekcje: FAIL jak wyżej dla `Dzisiaj`; `Ukończone` i `Zaległości` pokazują sam nagłówek przy zerowej zawartości, co jest akceptowalne jako drop target, ale nie powinno udostępniać operacji masowej bez danych.

## Verification

- `git diff f8b3361^ f8b3361 --check`: PASS.
- `xcodebuild -project ios/Rootine/Rootine.xcodeproj -scheme Rootine -configuration Development -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' build-for-testing CODE_SIGNING_ALLOWED=NO`: PASS (`** TEST BUILD SUCCEEDED **`).
- Brak testów UI/kontraktowych obejmujących niezależne przełączanie trzech sekcji oraz kombinację `overdue > 0`, `today == 0`; ten przypadek powinien zostać dodany przy poprawce.
