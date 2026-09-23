import XCTest

@MainActor
final class CalendarNavigationUITests: XCTestCase {
    func testCalendarViewsFiltersAndSelectedDateComposer() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--rootine-preview-calendar"]
        app.launch()
        let menu = app.buttons["calendar-view-menu"]
        XCTAssertTrue(menu.waitForExistence(timeout: 30))
        XCTAssertTrue(menu.label.contains("Miesiąc"))
        capture(app, "Calendar month")
        for mode in ["day", "threeDays", "week", "year", "list", "month"] {
            menu.tap()
            if mode == "day" { capture(app, "Calendar view menu") }
            let item = app.buttons["calendar-mode-\(mode)"]
            XCTAssertTrue(item.waitForExistence(timeout: 5))
            item.tap()
            if mode == "threeDays" || mode == "year" { capture(app, "Calendar \(mode)") }
        }
        app.buttons["Filtry kalendarza"].tap()
        XCTAssertTrue(app.switches["Pokaż zakończone"].waitForExistence(timeout: 5))
        let completedSwitch = app.switches["Pokaż zakończone"]
        completedSwitch.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.5)).tap()
        XCTAssertEqual(completedSwitch.value as? String, "0")
        capture(app, "Calendar filters")
        app.buttons["Gotowe"].tap()
        XCTAssertTrue(app.buttons["Aktywne filtry"].waitForExistence(timeout: 5))
        app.buttons["Wyczyść"].tap()
        let day = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'calendar-date-'")).element(boundBy: 10)
        XCTAssertTrue(day.exists)
        day.tap()
        XCTAssertTrue(app.buttons["Zwiń plan dnia"].waitForExistence(timeout: 5))
        app.buttons["calendar-add"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["calendar-task-title"].firstMatch.waitForExistence(timeout: 5))
        capture(app, "Calendar selected date composer")
        app.terminate()
    }

    func testInlineDayQuickComposerAndScheduleEditor() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--rootine-preview-calendar"]
        app.launch()
        XCTAssertTrue(app.buttons["calendar-view-menu"].waitForExistence(timeout: 30))
        let tomorrow = Calendar.current.date(byAdding: .day, value: 1, to: Date())!
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        app.buttons["calendar-date-\(formatter.string(from: tomorrow))"].tap()
        XCTAssertTrue(app.buttons["Zwiń plan dnia"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.scrollViews["calendar-inline-agenda"].exists)
        XCTAssertLessThan(app.scrollViews["calendar-inline-agenda"].frame.minY, app.frame.height * 0.5)
        capture(app, "Inline selected day")
        app.buttons["calendar-add"].tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5))
        if app.buttons["Continue"].exists { app.buttons["Continue"].tap() }
        XCTAssertTrue(app.buttons["calendar-task-date"].label.contains("Jutro"))
        capture(app, "Quick task composer")
        app.buttons["calendar-task-date"].tap()
        XCTAssertTrue(app.buttons["Zatwierdź termin"].waitForExistence(timeout: 5))
        capture(app, "Schedule date")
        app.segmentedControls.buttons["Czas trwania"].tap()
        app.switches["Cały dzień"].coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.5)).tap()
        capture(app, "Schedule duration")
        app.buttons["Zatwierdź termin"].tap()
        XCTAssertTrue(app.buttons["calendar-task-date"].waitForExistence(timeout: 5))
        app.buttons["calendar-task-date"].tap()
        app.buttons["Anuluj termin"].tap()
        XCTAssertTrue(app.buttons["calendar-task-date"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["calendar-task-date"].label.contains("Jutro"))
        app.buttons["calendar-task-date"].tap()
        app.buttons["calendar-schedule-clear"].tap()
        XCTAssertTrue(app.buttons["calendar-task-date"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.buttons["calendar-task-date"].label, "Data")
        app.terminate()
    }

    private func capture(_ app: XCUIApplication, _ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}

@MainActor
final class TodayGesturesUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUp() async throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments = ["--rootine-preview"]
        app.launch()
        XCTAssertTrue(app.staticTexts["Plan dnia"].waitForExistence(timeout: 30))
    }

    private func task(_ title: String) -> XCUIElement {
        app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", title)).firstMatch
    }

    func testTodayQuickTaskUsesCurrentDateAndSharedScheduleEditor() {
        app.buttons["Dodaj zadanie"].tap()
        let dateButton = app.buttons["calendar-task-date"]
        XCTAssertTrue(dateButton.waitForExistence(timeout: 5))
        XCTAssertTrue(dateButton.label.contains("Dzisiaj"))
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5))
        if app.buttons["Continue"].exists { app.buttons["Continue"].tap() }
        XCTAssertTrue(app.buttons["Priorytet"].exists)
        XCTAssertTrue(app.buttons["Tagi"].exists)
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "Today shared task composer"
        screenshot.lifetime = .keepAlways
        add(screenshot)
        dateButton.tap()
        XCTAssertTrue(app.buttons["Zatwierdź termin"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.segmentedControls.buttons["Czas trwania"].exists)
        app.buttons["Anuluj termin"].tap()
        XCTAssertTrue(dateButton.waitForExistence(timeout: 5))
        XCTAssertTrue(dateButton.label.contains("Dzisiaj"))
    }

    func testSeparateHabitsCreateCompletePauseResumeEditAndDelete() {
        let options = app.buttons["Opcje nawyków"]
        for _ in 0..<6 {
            if options.isHittable { break }
            app.swipeUp()
        }
        XCTAssertTrue(options.isHittable)
        app.swipeUp()
        let section = XCTAttachment(screenshot: app.screenshot())
        section.name = "Today separate habits"
        section.lifetime = .keepAlways
        add(section)

        app.buttons["Szczegóły: Poranna szklanka wody"].tap()
        XCTAssertTrue(app.staticTexts["Regularność"].waitForExistence(timeout: 5))
        let detail = XCTAttachment(screenshot: app.screenshot())
        detail.name = "Habit history and schedule"
        detail.lifetime = .keepAlways
        add(detail)
        app.buttons["Gotowe"].tap()

        let name = "Test nawyku " + String(UUID().uuidString.prefix(6))
        app.buttons["Dodaj nawyk"].tap()
        let field = app.textFields["Nazwa nawyku"]
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        field.tap()
        field.typeText(name)
        app.navigationBars["Dodaj nawyk"].buttons["Dodaj"].tap()
        let row = app.buttons["Szczegóły: \(name)"]
        XCTAssertTrue(row.waitForExistence(timeout: 5))
        if !row.isHittable { app.swipeUp() }
        row.tap()
        let toggle = app.buttons["habit-detail-toggle"]
        XCTAssertTrue(toggle.waitForExistence(timeout: 5))
        toggle.tap()
        XCTAssertEqual(toggle.label, "Dzisiaj wykonany")
        let pause = app.buttons["habit-pause-resume"]
        if !pause.isHittable { app.swipeUp() }
        pause.tap()
        XCTAssertEqual(pause.label, "Wznów od dzisiaj")
        app.buttons["Gotowe"].tap()
        XCTAssertFalse(row.exists)
        options.tap()
        app.buttons["Zarządzaj nawykami"].tap()
        XCTAssertTrue(app.navigationBars["Wszystkie nawyki"].waitForExistence(timeout: 5))
        app.buttons.containing(.staticText, identifier: name).firstMatch.tap()
        XCTAssertTrue(app.staticTexts["Nawyk wstrzymany"].waitForExistence(timeout: 5))
        if !pause.isHittable { app.swipeUp() }
        pause.tap()
        app.swipeDown()
        XCTAssertTrue(toggle.waitForExistence(timeout: 5))
        XCTAssertEqual(toggle.label, "Dzisiaj wykonany")
        app.buttons["Edytuj"].tap()
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        field.tap()
        field.typeText(" zmieniony")
        app.navigationBars["Edytuj nawyk"].buttons["Zapisz"].tap()
        XCTAssertTrue(app.staticTexts[name + " zmieniony"].waitForExistence(timeout: 5))
        deletePresentedHabit()
        XCTAssertTrue(app.navigationBars["Wszystkie nawyki"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.staticTexts[name + " zmieniony"].exists)
        app.buttons["Gotowe"].tap()
    }

    private func deletePresentedHabit() {
        let delete = app.buttons["Usuń nawyk"]
        for _ in 0..<4 {
            if delete.isHittable { break }
            app.swipeUp()
        }
        delete.tap()
        let confirmation = app.buttons.matching(identifier: "Usuń nawyk")
            .allElementsBoundByIndex.first { $0.isHittable }
        XCTAssertNotNil(confirmation)
        confirmation?.tap()
        XCTAssertTrue(app.navigationBars["Wszystkie nawyki"].waitForExistence(timeout: 5))
    }

    func testHabitSectionPreview() {
        let options = app.buttons["Opcje nawyków"]
        for _ in 0..<6 {
            if options.isHittable { break }
            app.swipeUp()
        }
        app.swipeUp()
        XCTAssertTrue(app.buttons["Szczegóły: Spacer bez telefonu"].isHittable)
        let section = XCTAttachment(screenshot: app.screenshot())
        section.name = "Habits final section"
        section.lifetime = .keepAlways
        add(section)
        app.buttons["Szczegóły: Poranna szklanka wody"].tap()
        XCTAssertTrue(app.buttons["Edytuj"].waitForExistence(timeout: 5))
        let detail = XCTAttachment(screenshot: app.screenshot())
        detail.name = "Habits final details"
        detail.lifetime = .keepAlways
        add(detail)
        app.buttons["Gotowe"].tap()
    }

    func testSummaryCountersNavigateToPlan() {
        XCTAssertTrue(app.buttons["today-summary-overdue"].exists)
        XCTAssertTrue(app.buttons["today-summary-today"].exists)
        XCTAssertTrue(app.buttons["today-summary-completed"].exists)
        XCTAssertFalse(app.buttons["today-add-task"].exists)
        app.buttons["today-summary-completed"].tap()
        XCTAssertTrue(app.buttons["today-toggle-task-2"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["today-toggle-task-2"].isHittable)
    }

    func testTapSwipeAndLongPress() {
        let row = task("Zarezerwować wizytę kontrolną")
        XCTAssertTrue(row.waitForExistence(timeout: 10))
        row.tap()
        XCTAssertTrue(app.buttons["Anuluj"].waitForExistence(timeout: 5))
        app.buttons["Anuluj"].tap()

        let checkbox = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Oznacz Zarezerwować'")).firstMatch
        if checkbox.value as? String == "Ukończone" { checkbox.tap() }
        let initialValue = checkbox.value as? String
        row.swipeRight()
        expectation(for: NSPredicate(format: "value == 'Ukończone'"), evaluatedWith: checkbox)
        waitForExpectations(timeout: 5)
        XCTAssertFalse(app.navigationBars["Szczegóły zadania"].exists)
        row.swipeRight()
        expectation(for: NSPredicate(format: "value == %@", initialValue ?? ""), evaluatedWith: checkbox)
        waitForExpectations(timeout: 5)

        row.swipeLeft()
        XCTAssertTrue(app.buttons["Przełóż"].waitForExistence(timeout: 5))
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "Przesunięcie w lewo"
        attachment.lifetime = .keepAlways
        add(attachment)
        app.buttons["Przełóż"].tap()
        XCTAssertTrue(app.navigationBars["Przełóż zadanie"].waitForExistence(timeout: 5))
        app.buttons["Anuluj"].tap()

        row.press(forDuration: 1)
        XCTAssertTrue(app.buttons["Edytuj"].waitForExistence(timeout: 5))
        let menu = XCTAttachment(screenshot: app.screenshot())
        menu.name = "Menu przytrzymania"
        menu.lifetime = .keepAlways
        add(menu)
        app.buttons["Edytuj"].tap()
        XCTAssertTrue(app.buttons["Anuluj"].waitForExistence(timeout: 5))
    }

    func testDraggingTimedTaskOpensTimeSelectionWithoutChangingIt() {
        let source = task("Zarezerwować wizytę kontrolną")
        let target = task("Przygotować prezentację")
        XCTAssertTrue(source.waitForExistence(timeout: 10))
        source.press(forDuration: 0.6, thenDragTo: target)
        XCTAssertTrue(app.navigationBars["Przełóż zadanie"].waitForExistence(timeout: 8))
        XCTAssertTrue(app.datePickers.firstMatch.exists)
        app.buttons["Anuluj"].tap()
        XCTAssertTrue(source.exists)
    }
}

/// These tests inspect the real local preview workspace. The navigation matrix
/// never saves an editor; gesture tests create and remove their own items.
@MainActor
final class RemainingSpacesUITests: XCTestCase {
    override func setUp() async throws {
        continueAfterFailure = false
    }

    func testProfileAccessPreservesTodayAndCalendarControls() {
        let app = XCUIApplication()
        defer { app.terminate() }
        app.launchArguments = ["--rootine-preview"]
        app.launch()
        XCTAssertTrue(app.navigationBars["Dzisiaj"].waitForExistence(timeout: 30))
        XCTAssertTrue(app.buttons["Dodaj zadanie"].exists)
        let profile = app.buttons["rootine-profile"].firstMatch
        XCTAssertTrue(profile.isHittable)
        XCTAssertLessThan(profile.frame.midX, app.frame.width * 0.3)
        settle(app)
        capture(app, "Spaces today profile")
        profile.tap()
        XCTAssertTrue(app.navigationBars["Profil"].waitForExistence(timeout: 5))
        app.navigationBars["Profil"].buttons["Gotowe"].tap()
        XCTAssertTrue(app.buttons["Dodaj zadanie"].waitForExistence(timeout: 5))

        app.terminate()
        app.launchArguments = ["--rootine-preview-calendar"]
        app.launch()
        let viewMenu = app.buttons["calendar-view-menu"]
        XCTAssertTrue(viewMenu.waitForExistence(timeout: 30))
        XCTAssertTrue(app.navigationBars["Kalendarz"].exists)
        XCTAssertTrue(profile.isHittable)
        XCTAssertLessThan(profile.frame.midX, app.frame.width * 0.35)
        viewMenu.tap()
        XCTAssertTrue(app.buttons["calendar-mode-month"].waitForExistence(timeout: 5))
        app.buttons["calendar-mode-month"].tap()
        app.buttons["Filtry kalendarza"].tap()
        XCTAssertTrue(app.navigationBars["Filtry"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.switches["Pokaż zakończone"].exists)
        app.navigationBars["Filtry"].buttons["Gotowe"].tap()
        settle(app)
        capture(app, "Spaces calendar profile")
        profile.tap()
        XCTAssertTrue(app.navigationBars["Profil"].waitForExistence(timeout: 5))
        capture(app, "Spaces calendar profile menu")
        app.navigationBars["Profil"].buttons["Gotowe"].tap()
        XCTAssertTrue(viewMenu.waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["calendar-add"].exists)
    }

    func testNutritionSummaryDirectAddAndProfileSettings() {
        let app = launch("--rootine-preview-nutrition", title: "Odżywianie")
        defer { app.terminate() }
        capture(app, "Spaces nutrition")
        captureNutritionDiagnostics(app, name: "Spaces nutrition initial accessibility")
        XCTAssertTrue(app.staticTexts["Zjedzone"].exists)
        XCTAssertTrue(app.buttons["Dodaj 250 ml wody"].exists)
        XCTAssertTrue(app.buttons["nutrition-add-breakfast"].exists)

        app.buttons["nutrition-add-breakfast"].tap()
        XCTAssertTrue(app.navigationBars["Dodaj do dziennika"].waitForExistence(timeout: 5))
        app.buttons["Wpis ręczny"].tap()
        dismissNutritionKeyboard(app)
        let meal = app.descendants(matching: .any)["nutrition-entry-meal"].firstMatch
        reveal(meal, in: app)
        XCTAssertTrue((meal.label + " " + (meal.value as? String ?? "")).contains("Śniadanie"))
        capture(app, "Spaces nutrition add breakfast")
        app.navigationBars["Dodaj do dziennika"].buttons["Anuluj"].tap()

        for mealID in ["lunch", "dinner", "snack"] {
            let add = app.buttons["nutrition-add-\(mealID)"]
            reveal(add, in: app)
            XCTAssertTrue(add.isHittable)
        }
        capture(app, "Spaces nutrition meal categories")

        app.buttons["rootine-profile"].firstMatch.tap()
        XCTAssertTrue(app.navigationBars["Profil"].waitForExistence(timeout: 5))
        capture(app, "Spaces profile")
        app.buttons["Ustawienia"].tap()
        XCTAssertTrue(app.navigationBars["Ustawienia"].waitForExistence(timeout: 5))
        capture(app, "Spaces settings")
    }

    func testMorePreviewAndAddChooser() {
        let app = launch("--rootine-preview-more", title: "Więcej")
        defer { app.terminate() }
        XCTAssertTrue(app.buttons["space-notes"].exists)
        XCTAssertFalse(app.staticTexts["Twój rytm"].exists)
        capture(app, "Spaces more")
        app.buttons["rootine-add"].firstMatch.tap()
        XCTAssertTrue(app.navigationBars["Co chcesz dodać?"].waitForExistence(timeout: 5))
        capture(app, "Spaces more add")
        app.buttons["Dodaj notatkę"].tap()
        XCTAssertTrue(app.navigationBars["Nowa notatka"].waitForExistence(timeout: 8))
        app.navigationBars["Nowa notatka"].buttons["Anuluj"].tap()
        XCTAssertTrue(app.navigationBars["Notatki"].waitForExistence(timeout: 5))
    }

    func testNotesFromMoreHubKeepsOneHeaderAndWorkingProfileAndAdd() {
        let app = launch("--rootine-preview-more", title: "Więcej")
        defer { app.terminate() }
        let notes = app.buttons["space-notes"]
        reveal(notes, in: app)
        notes.tap()
        let navigation = app.navigationBars["Notatki"]
        XCTAssertTrue(navigation.waitForExistence(timeout: 5))
        settle(app)
        let profile = app.buttons["rootine-profile"].firstMatch
        let add = app.buttons["rootine-add"].firstMatch
        XCTAssertTrue(profile.isHittable)
        XCTAssertTrue(add.isHittable)
        XCTAssertEqual(app.buttons.matching(identifier: "rootine-profile").allElementsBoundByIndex.filter(\.isHittable).count, 1)
        XCTAssertEqual(app.buttons.matching(identifier: "rootine-add").allElementsBoundByIndex.filter(\.isHittable).count, 1)
        capture(app, "Spaces notes from hub")
        let titleMatches = app.staticTexts.matching(identifier: "Notatki").allElementsBoundByIndex
        let titleDiagnostics = titleMatches.enumerated().map { index, element in
            "Match \(index): label=\(element.label), identifier=\(element.identifier), frame=\(element.frame), hittable=\(element.isHittable)"
        }.joined(separator: "\n")
        let navigationDiagnostics = XCTAttachment(string: navigation.debugDescription + "\n\nGlobal Notatki text matches:\n" + titleDiagnostics)
        navigationDiagnostics.name = "Spaces notes from hub navigation diagnostics"
        navigationDiagnostics.lifetime = .keepAlways
        self.add(navigationDiagnostics)
        XCTAssertEqual(app.staticTexts.matching(identifier: "Notatki").allElementsBoundByIndex.filter(\.isHittable).count, 1)
        let heading = navigation.staticTexts["Notatki"].firstMatch
        XCTAssertTrue(heading.exists)
        XCTAssertEqual(heading.frame.midX, app.frame.midX, accuracy: 24)
        profile.tap()
        XCTAssertTrue(app.navigationBars["Profil"].waitForExistence(timeout: 5))
        app.navigationBars["Profil"].buttons["Gotowe"].tap()
        XCTAssertTrue(add.waitForExistence(timeout: 5))
        add.tap()
        XCTAssertTrue(app.navigationBars["Nowa notatka"].waitForExistence(timeout: 5))
        app.navigationBars["Nowa notatka"].buttons["Anuluj"].tap()
        XCTAssertTrue(navigation.waitForExistence(timeout: 5))
    }

    func testNotesPreviewAndAdd() {
        previewModule("notes", title: "Notatki", editorTitle: "Nowa notatka")
    }

    func testSportPreviewAndAdd() {
        previewModule("sport", title: "Sport", editorTitle: "Zaplanuj trening")
    }

    func testGoalsPreviewAndAdd() {
        previewModule("goals", title: "Cele", editorTitle: "Dodaj cel")
    }

    func testWorkPreviewAndAdd() {
        previewModule("work", title: "Praca", editorTitle: "Dodaj zadanie")
    }

    func testTravelPreviewAndAdd() {
        previewModule("travel", title: "Podróże", editorTitle: "Dodaj podróż")
    }

    func testHealthPreviewAndAdd() {
        previewModule("health", title: "Zdrowie", editorTitle: "Dodaj przypomnienie")
    }

    func testAffairsPreviewAndAdd() {
        let app = launch("--rootine-preview-module=affairs", title: "Pozostałe")
        defer { app.terminate() }
        capture(app, "Spaces affairs")
        app.buttons["rootine-add"].firstMatch.tap()
        if app.buttons["Sprawę lub termin"].waitForExistence(timeout: 2) {
            capture(app, "Spaces affairs add choice")
            app.buttons["Sprawę lub termin"].tap()
        }
        XCTAssertTrue(app.navigationBars["Nowa sprawa"].waitForExistence(timeout: 5))
        capture(app, "Spaces affairs add")
        app.navigationBars["Nowa sprawa"].buttons["Anuluj"].tap()
    }

    func testNutritionDragMovePersistsAndSwipeDeleteRemovesOnlyTemporaryEntry() {
        // Continue to cleanup after a failed assertion; no seeded entry is used.
        continueAfterFailure = true
        let app = launch("--rootine-preview-nutrition", title: "Odżywianie")
        let name = "UI Nutrition " + String(UUID().uuidString.prefix(8))
        var created = false
        defer {
            if created { removeTemporaryNutritionEntry(named: name, from: app) }
            app.terminate()
        }

        capture(app, "Spaces nutrition before gesture entry")
        captureNutritionDiagnostics(app, name: "Spaces nutrition gesture initial accessibility")
        app.buttons["nutrition-add-breakfast"].tap()
        guard app.navigationBars["Dodaj do dziennika"].waitForExistence(timeout: 5) else {
            XCTFail("Nutrition add editor did not open")
            return
        }
        app.buttons["Wpis ręczny"].tap()
        dismissNutritionKeyboard(app)
        let nameField = app.textFields["nutrition-entry-name"]
        reveal(nameField, in: app)
        guard nameField.isHittable else { XCTFail("Name field is not reachable"); return }
        nameField.tap()
        nameField.typeText(name)
        dismissNutritionKeyboard(app)
        let calories = app.textFields["Kalorie (kcal)"]
        reveal(calories, in: app)
        calories.tap()
        calories.typeText("123")
        dismissNutritionKeyboard(app)
        app.navigationBars["Dodaj do dziennika"].buttons["Dodaj"].tap()
        created = true
        guard app.navigationBars["Dodaj do dziennika"].waitForNonExistence(timeout: 8) else {
            XCTFail("Temporary nutrition entry did not save")
            return
        }

        let row = nutritionRow(named: name, in: app)
        reveal(row, in: app)
        let destination = app.buttons["nutrition-add-lunch"]
        for _ in 0..<5 {
            if row.isHittable && destination.isHittable { break }
            shortScrollUp(app)
        }
        guard row.isHittable && destination.isHittable else {
            XCTFail("Both the dragged entry and lunch target must be visible")
            return
        }
        row.press(forDuration: 0.6, thenDragTo: destination)
        Thread.sleep(forTimeInterval: 0.5)
        capture(app, "Spaces nutrition after drag")
        XCTAssertTrue(verifyNutritionMeal(named: name, equals: "Obiad", in: app))

        app.terminate()
        app.launch()
        XCTAssertTrue(app.buttons["rootine-add"].firstMatch.waitForExistence(timeout: 30))
        settle(app)
        XCTAssertTrue(verifyNutritionMeal(named: name, equals: "Obiad", in: app), "Meal move must survive relaunch")
        // Defer performs the swipe-left confirmation and verifies disappearance.
    }

    func testNotesLongPressPinAndSwipeArchiveRestorePersist() {
        continueAfterFailure = true
        let app = launch("--rootine-preview-module=notes", title: "Notatki")
        let name = "UI Note " + String(UUID().uuidString.prefix(8))
        var created = false
        defer {
            if created { removeTemporaryNote(named: name, from: app) }
            app.terminate()
        }

        app.buttons["rootine-add"].firstMatch.tap()
        let editor = app.navigationBars["Nowa notatka"]
        guard editor.waitForExistence(timeout: 5) else { XCTFail("Note editor did not open"); return }
        let title = app.textFields["Tytuł"]
        title.tap()
        title.typeText(name)
        created = true
        editor.buttons["Zapisz"].tap()
        guard editor.waitForNonExistence(timeout: 8) else { XCTFail("Temporary note did not save"); return }

        let row = noteRow(named: name, in: app)
        reveal(row, in: app)
        guard row.isHittable else { XCTFail("Temporary note is not reachable"); return }
        row.press(forDuration: 1)
        let pin = app.buttons["Przypnij"]
        guard pin.waitForExistence(timeout: 5) else { XCTFail("Long press did not expose note actions"); return }
        capture(app, "Spaces notes hold menu")
        pin.tap()
        reveal(row, in: app)
        row.tap()
        let edit = app.navigationBars["Edytuj notatkę"]
        guard edit.waitForExistence(timeout: 5) else { XCTFail("Pinned note cannot be opened"); return }
        let pinned = app.switches["Przypnij na górze"]
        reveal(pinned, in: app)
        XCTAssertEqual(pinned.value as? String, "1", "Long-press action must pin the note")
        edit.buttons["Anuluj"].tap()
        reveal(row, in: app)
        row.swipeLeft()
        guard row.waitForNonExistence(timeout: 5) else { XCTFail("Swipe did not archive the note"); return }

        guard showNoteArchive(true, in: app) else { return }
        guard row.waitForExistence(timeout: 5) else { XCTFail("Archived note is missing from the archive"); return }
        reveal(row, in: app)
        capture(app, "Spaces notes archived temporary note")
        row.swipeLeft()
        guard row.waitForNonExistence(timeout: 5) else { XCTFail("Swipe did not restore the archived note"); return }
        guard showNoteArchive(false, in: app) else { return }
        XCTAssertTrue(row.waitForExistence(timeout: 5), "Restored note must return to active notes")

        app.terminate()
        app.launch()
        guard app.navigationBars["Notatki"].waitForExistence(timeout: 30) else { XCTFail("Notes did not reopen"); return }
        settle(app)
        reveal(row, in: app)
        guard row.isHittable else { XCTFail("Restored note did not survive relaunch"); return }
        row.tap()
        guard edit.waitForExistence(timeout: 5) else { XCTFail("Restored note cannot be opened"); return }
        XCTAssertEqual(app.textFields["Tytuł"].value as? String, name, "Restoration must preserve the note")
        reveal(pinned, in: app)
        XCTAssertEqual(pinned.value as? String, "0", "Archiving clears the pin; restoration must preserve that state after relaunch")
        edit.buttons["Anuluj"].tap()
    }

    func testSportDragReschedulesAndSwipeCompletesAndReopensWorkout() {
        continueAfterFailure = true
        let app = launch("--rootine-preview-module=sport", title: "Sport")
        let name = "UI Workout " + String(UUID().uuidString.prefix(8))
        var created = false
        defer {
            if created { removeTemporaryWorkout(named: name, from: app) }
            app.terminate()
        }

        app.buttons["rootine-add"].firstMatch.tap()
        let editor = app.navigationBars["Zaplanuj trening"]
        guard editor.waitForExistence(timeout: 5) else { XCTFail("Workout editor did not open"); return }
        app.textFields["Nazwa"].tap()
        app.textFields["Nazwa"].typeText(name)
        created = true
        editor.buttons["Zapisz"].tap()
        guard editor.waitForNonExistence(timeout: 8) else { XCTFail("Temporary workout did not save"); return }

        let row = app.buttons["Szczegóły treningu: \(name)"]
        reveal(row, in: app)
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: Date())
        let todayOffset = (calendar.component(.weekday, from: today) + 5) % 7
        let destinationOffset = (todayOffset + 1) % 7
        let destinationDate = calendar.date(byAdding: .day, value: destinationOffset - todayOffset, to: today)!
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.dateFormat = "yyyy-MM-dd"
        let expectedDate = formatter.string(from: destinationDate)
        let destination = app.buttons["sport.day.\(destinationOffset)"]
        guard row.isHittable && destination.isHittable else {
            XCTFail("Workout and destination weekday must both be visible for dragging")
            return
        }
        row.press(forDuration: 0.6, thenDragTo: destination)
        XCTAssertTrue(verifyWorkoutDate(named: name, equals: expectedDate, in: app))
        capture(app, "Spaces sport after weekday drag")

        app.terminate()
        app.launch()
        guard app.navigationBars["Sport"].waitForExistence(timeout: 30) else { XCTFail("Sport did not reopen"); return }
        settle(app)
        XCTAssertTrue(verifyWorkoutDate(named: name, equals: expectedDate, in: app), "Dragged workout date must survive relaunch")
        reveal(row, in: app)
        guard row.isHittable else { XCTFail("Rescheduled workout is not reachable"); return }
        row.swipeRight()
        guard row.waitForNonExistence(timeout: 5) else { XCTFail("Swipe did not complete the workout"); return }
        let history = app.segmentedControls["sport.mode"].buttons["Historia"]
        reveal(history, in: app)
        history.tap()
        guard row.waitForExistence(timeout: 5) else { XCTFail("Completed workout did not enter history"); return }
        reveal(row, in: app)
        capture(app, "Spaces sport completed temporary workout")
        row.swipeRight()
        guard row.waitForNonExistence(timeout: 5) else { XCTFail("Swipe did not undo workout completion"); return }
        app.segmentedControls["sport.mode"].buttons["Plan"].tap()
        XCTAssertTrue(row.waitForExistence(timeout: 5), "Reopened workout must return to the plan")
    }

    private func noteRow(named name: String, in app: XCUIApplication) -> XCUIElement {
        app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'notes.row.' AND label CONTAINS %@", name)).firstMatch
    }

    @discardableResult
    private func showNoteArchive(_ archived: Bool, in app: XCUIApplication) -> Bool {
        let filters = app.buttons["Filtry i sortowanie notatek"]
        for _ in 0..<5 {
            if filters.isHittable { break }
            app.swipeDown()
        }
        guard filters.isHittable else { XCTFail("Note filters are not reachable"); return false }
        filters.tap()
        let action = app.buttons[archived ? "Pokaż archiwum" : "Pokaż aktywne"]
        guard action.waitForExistence(timeout: 5) else { XCTFail("Note archive action is missing"); return false }
        action.tap()
        return true
    }

    private func verifyWorkoutDate(named name: String, equals expected: String, in app: XCUIApplication) -> Bool {
        let row = app.buttons["Szczegóły treningu: \(name)"]
        reveal(row, in: app)
        guard row.isHittable else { return false }
        row.tap()
        let detail = app.navigationBars["Szczegóły treningu"]
        guard detail.waitForExistence(timeout: 5) else { return false }
        let matches = app.staticTexts[expected].waitForExistence(timeout: 5)
        detail.buttons["Gotowe"].tap()
        return matches
    }

    private func removeTemporaryNote(named name: String, from app: XCUIApplication) {
        // Relaunch resets any open editor, context menu and filter after a failure.
        app.terminate()
        app.launch()
        guard app.navigationBars["Notatki"].waitForExistence(timeout: 30) else { XCTFail("Cannot clean up temporary note"); return }
        settle(app)
        let row = noteRow(named: name, in: app)
        if !row.exists {
            guard showNoteArchive(true, in: app) else { return }
        }
        reveal(row, in: app)
        guard row.isHittable else { XCTFail("Temporary note could not be found for cleanup"); return }
        row.tap()
        let editor = app.navigationBars["Edytuj notatkę"]
        guard editor.waitForExistence(timeout: 5) else { XCTFail("Note editor did not open for cleanup"); return }
        let delete = app.buttons["Usuń notatkę"]
        reveal(delete, in: app)
        guard delete.isHittable else { XCTFail("Note delete action is missing"); return }
        delete.tap()
        guard editor.waitForNonExistence(timeout: 5) else { XCTFail("Note editor did not dismiss for deletion"); return }
        let confirmation = app.buttons["Usuń notatkę"]
        guard confirmation.waitForExistence(timeout: 5) else { XCTFail("Note delete confirmation is missing"); return }
        confirmation.tap()
        XCTAssertTrue(row.waitForNonExistence(timeout: 5), "Temporary note must be removed")
    }

    private func removeTemporaryWorkout(named name: String, from app: XCUIApplication) {
        app.terminate()
        app.launch()
        guard app.navigationBars["Sport"].waitForExistence(timeout: 30) else { XCTFail("Cannot clean up temporary workout"); return }
        settle(app)
        let row = app.buttons["Szczegóły treningu: \(name)"]
        if !row.exists { app.segmentedControls["sport.mode"].buttons["Historia"].tap() }
        reveal(row, in: app)
        guard row.isHittable else { XCTFail("Temporary workout could not be found for cleanup"); return }
        row.tap()
        let detail = app.navigationBars["Szczegóły treningu"]
        guard detail.waitForExistence(timeout: 5) else { XCTFail("Workout details did not open for cleanup"); return }
        let delete = app.buttons["Usuń trening"]
        reveal(delete, in: app)
        guard delete.isHittable else { XCTFail("Workout delete action is missing"); return }
        delete.tap()
        guard app.staticTexts["Usunąć trening?"].waitForExistence(timeout: 5),
              let detailConfirmation = app.buttons.matching(identifier: "Usuń trening").allElementsBoundByIndex.first(where: \.isHittable)
        else { XCTFail("Workout detail delete confirmation is missing"); return }
        detailConfirmation.tap()
        guard detail.waitForNonExistence(timeout: 5) else { XCTFail("Workout details did not dismiss for deletion"); return }
        XCTAssertTrue(row.waitForNonExistence(timeout: 5), "Temporary workout must be removed")
    }

    private func previewModule(_ module: String, title: String, editorTitle: String) {
        let app = launch("--rootine-preview-module=\(module)", title: title)
        defer { app.terminate() }
        capture(app, "Spaces \(module)")
        app.buttons["rootine-add"].firstMatch.tap()
        XCTAssertTrue(app.navigationBars[editorTitle].waitForExistence(timeout: 5))
        capture(app, "Spaces \(module) add")
        app.navigationBars[editorTitle].buttons["Anuluj"].tap()
        XCTAssertTrue(app.buttons["rootine-add"].firstMatch.waitForExistence(timeout: 5))
    }

    private func launch(_ argument: String, title: String) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = [argument]
        app.launch()
        XCTAssertTrue(app.navigationBars[title].waitForExistence(timeout: 30))
        settle(app)
        let profile = app.buttons["rootine-profile"].firstMatch
        let add = app.buttons["rootine-add"].firstMatch
        XCTAssertTrue(profile.isHittable)
        XCTAssertTrue(add.isHittable)
        XCTAssertLessThan(profile.frame.midX, app.frame.width * 0.3)
        XCTAssertGreaterThan(add.frame.midX, app.frame.width * 0.7)
        let heading = app.navigationBars[title].staticTexts[title].firstMatch
        XCTAssertTrue(heading.exists)
        if heading.exists {
            XCTAssertEqual(heading.frame.midX, app.frame.midX, accuracy: 24)
            XCTAssertLessThan(heading.frame.minY, 170)
        }
        return app
    }

    private func settle(_ app: XCUIApplication) {
        // Let file-backed preview data replace the initial in-memory snapshot.
        Thread.sleep(forTimeInterval: 1)
        let banner = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Tryb offline'")).firstMatch
        if banner.exists { _ = banner.waitForNonExistence(timeout: 8) }
    }

    private func captureNutritionDiagnostics(_ app: XCUIApplication, name: String) {
        let breakfastMatches = app.descendants(matching: .any).matching(NSPredicate(
            format: "identifier == 'nutrition-add-breakfast' OR identifier == 'nutrition-meal-breakfast' OR label == 'Dodaj do: Śniadanie'"
        )).allElementsBoundByIndex.map { element in
            "type=\(element.elementType.rawValue), label=\(element.label), identifier=\(element.identifier), frame=\(element.frame), hittable=\(element.isHittable)"
        }.joined(separator: "\n")
        let attachment = XCTAttachment(string: "Launch arguments: \(app.launchArguments)\n\nBreakfast matches:\n" + breakfastMatches + "\n\n" + app.debugDescription)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func dismissNutritionKeyboard(_ app: XCUIApplication) {
        if app.buttons["Continue"].exists { app.buttons["Continue"].tap() }
        let done = app.buttons["nutrition-keyboard-done"]
        if done.waitForExistence(timeout: 2), done.isHittable { done.tap() }
    }

    private func reveal(_ element: XCUIElement, in app: XCUIApplication) {
        for _ in 0..<8 {
            if element.exists && element.isHittable { return }
            shortScrollUp(app)
        }
    }

    private func shortScrollUp(_ app: XCUIApplication) {
        let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.72))
        let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.42))
        start.press(forDuration: 0.02, thenDragTo: end)
    }

    private func nutritionRow(named name: String, in app: XCUIApplication) -> XCUIElement {
        app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Edytuj wpis: \(name),")).firstMatch
    }

    private func verifyNutritionMeal(named name: String, equals expected: String, in app: XCUIApplication) -> Bool {
        let row = nutritionRow(named: name, in: app)
        reveal(row, in: app)
        guard row.isHittable else { return false }
        row.tap()
        guard app.navigationBars["Edytuj wpis"].waitForExistence(timeout: 5) else { return false }
        let picker = app.descendants(matching: .any)["nutrition-entry-meal"].firstMatch
        reveal(picker, in: app)
        let value = picker.label + " " + (picker.value as? String ?? "")
        app.navigationBars["Edytuj wpis"].buttons["Anuluj"].tap()
        return value.contains(expected)
    }

    private func removeTemporaryNutritionEntry(named name: String, from app: XCUIApplication) {
        if app.alerts.firstMatch.exists, app.alerts.buttons["OK"].exists { app.alerts.buttons["OK"].tap() }
        for title in ["Dodaj do dziennika", "Edytuj wpis"] {
            let cancel = app.navigationBars[title].buttons["Anuluj"]
            if cancel.exists && cancel.isHittable { cancel.tap() }
        }
        let row = nutritionRow(named: name, in: app)
        for _ in 0..<4 { app.swipeDown() }
        reveal(row, in: app)
        guard row.exists && row.isHittable else { return }
        row.swipeLeft()
        let confirmation = app.buttons["Usuń wpis"]
        if confirmation.waitForExistence(timeout: 5) { confirmation.tap() }
        XCTAssertTrue(row.waitForNonExistence(timeout: 5), "Temporary nutrition entry must be removed")
    }

    private func capture(_ app: XCUIApplication, _ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
