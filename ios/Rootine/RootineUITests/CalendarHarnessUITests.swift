import XCTest

final class CalendarHarnessUITests: XCTestCase {
    @MainActor
    private func launchCalendar(scenario: String? = nil) -> XCUIApplication {
        continueAfterFailure = false
        let app = XCUIApplication(bundleIdentifier: "app.rootine.mobile")
        var arguments = ["--rootine-preview-calendar"]
        if let scenario { arguments.append("--rootine-preview-calendar-scenario=\(scenario)") }
        app.launchArguments = arguments
        app.launch()
        addTeardownBlock { app.terminate() }
        XCTAssertTrue(app.buttons["calendar-view-menu"].waitForExistence(timeout: 12))
        return app
    }

    @MainActor
    func testCalendarPreviewAcceptsRealTapNavigation() throws {
        let app = launchCalendar()
        app.tabBars.buttons["Dzisiaj"].tap()
        XCTAssertTrue(app.tabBars.buttons["Dzisiaj"].isSelected)

        app.tabBars.buttons["Kalendarz"].tap()
        selectMode("day", in: app)
        let period = app.staticTexts["calendar-period-title"]
        let originalPeriod = period.label
        app.buttons["Następny okres"].tap()
        XCTAssertNotEqual(period.label, originalPeriod)
        app.buttons["Poprzedni okres"].tap()
        XCTAssertEqual(period.label, originalPeriod)
    }

    @MainActor
    func testCalendarAgendaCompletesAndUndoesRecurringOccurrence() throws {
        let app = launchCalendar(scenario: "agenda")
        selectMode("list", in: app)
        let completion = app.buttons["calendar-complete-704-\(dateKey(Date()))"]
        XCTAssertTrue(completion.waitForExistence(timeout: 5))
        reveal(completion, in: app)
        XCTAssertEqual(completion.label, "Ukończ: Codzienny przegląd planu")
        completion.tap()
        waitForLabel("Cofnij ukończenie: Codzienny przegląd planu", on: completion)
        let undo = app.buttons["Cofnij"]
        XCTAssertTrue(undo.waitForExistence(timeout: 5))
        undo.tap()
        waitForLabel("Ukończ: Codzienny przegląd planu", on: completion)
    }

    @MainActor
    func testCalendarAddsTaskOnSelectedDayThenEditsCanonicalTask() throws {
        let app = launchCalendar(scenario: "empty")
        selectMode("day", in: app)
        app.buttons["Następny okres"].tap()
        let selectedPeriod = app.staticTexts["calendar-period-title"].label
        app.buttons["calendar-add"].tap()
        let title = "Przygotować materiał do weryfikacji"
        let editedTitle = "Przygotować materiał — gotowe"
        let input = app.descendants(matching: .any)["calendar-task-title"].firstMatch
        XCTAssertTrue(input.waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["calendar-task-date"].label.contains("Jutro"))
        input.tap()
        input.typeText(title)
        app.buttons["calendar-task-save"].tap()

        let calendarTask = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", title)).firstMatch
        XCTAssertTrue(calendarTask.waitForExistence(timeout: 5))
        calendarTask.tap()
        let editor = app.descendants(matching: .any)["Nazwa zadania"].firstMatch
        XCTAssertTrue(editor.waitForExistence(timeout: 5))
        editor.tap()
        editor.typeKey("a", modifierFlags: .command)
        editor.typeText(editedTitle)
        app.navigationBars["Szczegóły zadania"].buttons["Zapisz"].tap()

        let editedTask = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", editedTitle)).firstMatch
        XCTAssertTrue(editedTask.waitForExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts["calendar-period-title"].label, selectedPeriod)
        let canonicalIdentifier = editedTask.identifier
        XCTAssertTrue(canonicalIdentifier.hasSuffix(dateKey(Calendar.current.date(byAdding: .day, value: 1, to: Date())!)))

        selectMode("list", in: app)
        let sameTask = app.buttons[canonicalIdentifier]
        XCTAssertTrue(sameTask.waitForExistence(timeout: 5))
        XCTAssertTrue(sameTask.label.contains(editedTitle), "List and day views must read the same edited task")
        sameTask.tap()
        XCTAssertTrue(editor.waitForExistence(timeout: 5))
        XCTAssertEqual(editor.value as? String, editedTitle)
    }

    @MainActor
    private func selectMode(_ mode: String, in app: XCUIApplication) {
        app.buttons["calendar-view-menu"].tap()
        let option = app.buttons["calendar-mode-\(mode)"]
        XCTAssertTrue(option.waitForExistence(timeout: 5))
        option.tap()
    }

    @MainActor
    private func reveal(_ element: XCUIElement, in app: XCUIApplication) {
        for _ in 0..<5 {
            if element.isHittable { return }
            app.swipeUp()
        }
        XCTAssertTrue(element.isHittable)
    }

    @MainActor
    private func waitForLabel(_ label: String, on element: XCUIElement) {
        let changed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label == %@", label), object: element)
        XCTAssertEqual(XCTWaiter.wait(for: [changed], timeout: 5), .completed)
    }

    private func dateKey(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }
}
