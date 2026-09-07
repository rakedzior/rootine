import XCTest

final class CalendarHarnessUITests: XCTestCase {
    @MainActor
    private func launchCalendar(scenario: String? = nil) -> XCUIApplication {
        let app = XCUIApplication(bundleIdentifier: "app.rootine.mobile")
        var arguments = ["--rootine-preview-calendar"]
        if let scenario { arguments.append("--rootine-preview-calendar-scenario=\(scenario)") }
        app.launchArguments = arguments
        app.launch()
        addTeardownBlock { app.terminate() }
        XCTAssertTrue(app.tabBars.buttons["Kalendarz"].waitForExistence(timeout: 12))
        return app
    }

    @MainActor
    func testCalendarPreviewAcceptsRealTapNavigation() throws {
        let app = launchCalendar()
        app.tabBars.buttons["Zadania"].tap()
        XCTAssertTrue(app.tabBars.buttons["Zadania"].isSelected)

        app.tabBars.buttons["Kalendarz"].tap()
        XCTAssertTrue(app.buttons["calendar.nextDay"].waitForExistence(timeout: 5))
        app.buttons["calendar.nextDay"].tap()
        XCTAssertTrue(app.buttons["calendar.previousDay"].exists)
    }

    @MainActor
    func testCalendarAgendaCompletesAndUndoesRecurringOccurrence() throws {
        let app = launchCalendar(scenario: "agenda")
        let completion = app.buttons["Oznacz Codzienny przegląd planu jako wykonane"]
        XCTAssertTrue(completion.waitForExistence(timeout: 5))
        completion.tap()
        let undo = app.buttons["Cofnij"]
        XCTAssertTrue(undo.waitForExistence(timeout: 5))
        undo.tap()
        XCTAssertTrue(app.buttons["calendar.task.704"].waitForExistence(timeout: 5))
    }

    @MainActor
    func testCalendarAddsTaskOnSelectedDayThenEditsCanonicalTask() throws {
        let app = launchCalendar(scenario: "empty")
        app.buttons["calendar.nextDay"].tap()
        app.buttons["calendar.addTask"].tap()
        let title = "Przygotować materiał do weryfikacji"
        let editedTitle = "Przygotować materiał — gotowe"
        let input = app.textFields["Co chcesz zrobić?"]
        XCTAssertTrue(input.waitForExistence(timeout: 5))
        input.tap()
        input.typeText(title)
        app.buttons["Dodaj"].tap()

        let calendarTask = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", title)).firstMatch
        XCTAssertTrue(calendarTask.waitForExistence(timeout: 5))
        calendarTask.tap()
        let editor = app.textFields["Nazwa zadania"]
        XCTAssertTrue(editor.waitForExistence(timeout: 5))
        editor.tap()
        editor.typeKey("a", modifierFlags: .command)
        editor.typeText(editedTitle)
        app.buttons["Gotowe"].tap()

        app.tabBars.buttons["Zadania"].tap()
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label CONTAINS %@", editedTitle)).firstMatch.waitForExistence(timeout: 5))
    }
}
