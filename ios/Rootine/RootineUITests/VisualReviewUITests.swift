import XCTest

final class VisualReviewUITests: XCTestCase {
    @MainActor
    func testCapturePrimaryTabs() throws {
        let app = XCUIApplication(bundleIdentifier: "app.rootine.mobile")
        app.launchArguments = ["--rootine-preview"]
        app.launch()
        addTeardownBlock { app.terminate() }

        XCTAssertTrue(
            app.tabBars.buttons["Dzisiaj"].waitForExistence(timeout: 12),
            "Preview launch did not reach the primary tab bar"
        )
        waitForPreviewReady(app, tabID: "today")

        capture(named: "01-today")
        try tapAndCapture(app, tab: "Zadania", named: "02-tasks")
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
        waitForPreviewReady(app, tabID: tabID(for: tab))
        capture(named: named)
    }

    @MainActor
    private func waitForPreviewReady(_ app: XCUIApplication, tabID: String) {
        let markerID = "rootine.preview.\(tabID).ready"
        let marker = app.descendants(matching: .any)
            .matching(identifier: markerID)
            .firstMatch
        XCTAssertTrue(
            marker.waitForExistence(timeout: 12),
            "Preview content did not become ready for tab: \(tabID)"
        )
    }

    private func tabID(for label: String) -> String {
        switch label {
        case "Zadania": return "tasks"
        case "Kalendarz": return "calendar"
        case "Odżywianie": return "nutrition"
        case "Więcej": return "more"
        default: return "today"
        }
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
