import SwiftUI

@main
struct RootineApp: App {
    @StateObject private var environment = AppEnvironment()
    @AppStorage("rootine.appearance") private var appearance = "system"

    var body: some Scene {
        WindowGroup {
            RootineEntryView()
                .environmentObject(environment)
                .tint(RootineTheme.ColorToken.action)
                .preferredColorScheme(appearance == "light" ? .light : appearance == "dark" ? .dark : nil)
        }
    }
}
