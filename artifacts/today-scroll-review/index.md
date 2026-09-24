---
kind: review
title: "Today scroll and gesture arbitration review"
---

## Verdict

FAIL — P1 scroll regression remains in the latest native iOS Today view.

`TodayTimelineItemRow` composes `LongPressGesture(...).sequenced(before:)` with an unrestricted `DragGesture(minimumDistance: 20)` through `exclusively`. A vertical finger movement beyond 20 pt before the 0.55 s hold causes the long-press branch to fail and the swipe drag to recognize. The handler guard ignores the callback but cannot transfer recognition back to the parent `ScrollView`, so vertical scrolling can be delayed or captured.

The horizontal offset, 72 pt swipe threshold, full-row motion, and 0.55 s duration are otherwise statically present. `isDominantVertical` is covered by helper tests but is not used by the production gesture path, and there is no deterministic contract test for vertical drag pass-through.

Review location: `ios/Rootine/Rootine/Features/TodayView.swift` around the row gesture (lines 1679–1710) and scroll container (around lines 856–892).

## Follow-up

The fix is now in `966bdad`: the long-press sequence is no longer exclusive with
the swipe recognizer, and the swipe recognizer is attached with
`simultaneousGesture` while rejecting dominant vertical translations before
updating row state. The duplicate-action cancellation barrier and its helper
contract were added in `b1a0059`. The latest `build-for-testing` passed; the
CoreSimulator test runner remains a separate environment blocker.
