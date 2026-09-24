import XCTest

final class VisualReviewUITests: XCTestCase {
    @MainActor
    func testCapturePrimaryTabs() throws {
        continueAfterFailure = false
        let app = XCUIApplication(bundleIdentifier: "app.rootine.mobile")
        app.launchArguments = ["--rootine-preview"]
        app.launch()
        addTeardownBlock { app.terminate() }

        XCTAssertTrue(
            app.tabBars.buttons["Dzisiaj"].waitForExistence(timeout: 12),
            "Preview launch did not reach the primary tab bar"
        )
        XCTAssertTrue(app.buttons["Dodaj zadanie"].waitForExistence(timeout: 12))

        capture(named: "01-today")
        try tapAndCapture(app, tab: "Kalendarz", named: "03-calendar")
        try tapAndCapture(app, tab: "Odżywianie", named: "04-nutrition")
        try tapAndCapture(app, tab: "Więcej", named: "05-more")
    }

    @MainActor
    private func tapAndCapture(
        _ app: XCUIApplication,
        tab: String,
        named: String
    ) throws {
        let button = app.tabBars.buttons[tab]
        XCTAssertTrue(button.waitForExistence(timeout: 5), "Missing tab: \(tab)")
        button.tap()
        XCTAssertTrue(button.isSelected, "Tab did not become selected: \(tab)")
        let content: XCUIElement
        switch tab {
        case "Kalendarz": content = app.buttons["calendar-view-menu"]
        case "Odżywianie": content = app.buttons["nutrition-add-breakfast"]
        default: content = app.buttons["space-notes"]
        }
        XCTAssertTrue(content.waitForExistence(timeout: 12), "Missing content for tab: \(tab)")
        capture(named: named)

        if tab == "Kalendarz" {
            XCTAssertTrue(app.buttons["calendar-add"].isHittable, "Calendar add must remain above the tab bar")
            app.buttons["calendar-view-menu"].tap()
            app.buttons["calendar-mode-list"].tap()
            // Keep the CI artifact name; the task list now lives in Calendar.
            capture(named: "02-tasks")
            app.buttons["calendar-view-menu"].tap()
            app.buttons["calendar-mode-month"].tap()
        } else if tab == "Odżywianie" {
            assertLastMealIsReachable(app)
        }
    }

    @MainActor
    private func assertLastMealIsReachable(_ app: XCUIApplication) {
        let lastMeal = app.buttons["nutrition-add-snack"]

        for _ in 0..<12 {
            if lastMeal.exists && lastMeal.isHittable { return }
            app.swipeUp()
        }

        XCTAssertTrue(
            lastMeal.exists && lastMeal.isHittable,
            "The last meal's add action was not reachable above the tab bar"
        )
    }

    @MainActor
    private func capture(named: String) {
        let screenshot = XCUIScreen.main.screenshot()

        let attachment = XCTAttachment(screenshot: screenshot)
        attachment.name = "visual-\(named)"
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
