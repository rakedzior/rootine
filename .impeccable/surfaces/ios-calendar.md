---
version: 1
slug: "ios-calendar"
primary_target: "ios/Rootine/Rootine/Features/CalendarView.swift"
related_targets: ["ios/Rootine/Rootine/App/AppShellView.swift"]
---

# iOS Calendar

- Visitor mode: Operate.
- Scope: Native SwiftUI only; Windows is the editing workspace, Mac builds and simulator screenshots verify the result.
- Primary task: See commitments across a whole month, inspect a date and create a task on that date.
- Authority: User's supplied mobile calendar screenshots establish the layout and view choices. Retain Rootine's existing semantic colours and system typography.
- Direction: Compact Kalendarz navigation title, view menu on the left, filters on the right. A second compact row holds the period and navigation. The month grid fills the remaining screen with task titles in day cells and a floating add action. Today is a blue circle; completed tasks are muted and overdue tasks use the warning colour.
- Views: Month by default; List, Day, 3 Days, Week and Year remain available. Day and multi-day views use hourly columns, an untimed lane and a current-time marker. Year opens a chosen month. Tapping a month date highlights its column, scrolls its week to the top and expands the agenda directly below that week. The following week remains visible; selecting the same day or using the collapse control restores the month.
- Data and states: Actual shared task records and recurring occurrences. Completion, text, priority, list and tag filters apply across views. Empty agenda, save failure, local-only notice and sync conflict are explicit. No simulated subscription or sharing controls.
- Creation: A compact bottom composer opens above the keyboard with task text and date, priority, tags, list and note shortcuts. The date shortcut opens a separate Data / Czas trwania sheet. Date selection, start/end time, all-day mode, reminder and recurrence remain draft values until confirmed; cancel leaves the existing draft intact and clear removes its schedule. Completion targets the selected occurrence date.
