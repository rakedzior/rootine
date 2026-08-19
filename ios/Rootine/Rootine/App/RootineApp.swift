import SwiftUI

@main
struct RootineApp: App {
    @StateObject private var environment = AppEnvironment()

    var body: some Scene {
        WindowGroup {
            RootineEntryView()
                .environmentObject(environment)
                .preferredColorScheme(.dark)
                .tint(RootineTheme.ColorToken.action)
        }
    }
}
