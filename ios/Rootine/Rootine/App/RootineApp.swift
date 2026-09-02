import SwiftUI
import UIKit
import UserNotifications

@main
struct RootineApp: App {
    @UIApplicationDelegateAdaptor(RootineAppDelegate.self) private var appDelegate
    @StateObject private var environment = AppEnvironment()
    @AppStorage("rootine.appearance") private var appearance = "system"

    var body: some Scene {
        WindowGroup {
            RootineEntryView()
                .environmentObject(environment)
                .tint(RootineTheme.ColorToken.action)
                .preferredColorScheme(appearance == "light" ? .light : appearance == "dark" ? .dark : nil)
        }
        .backgroundTask(.appRefresh("app.rootine.sync.refresh")) {
            await environment.performBackgroundRefresh()
        }
    }
}

final class RootineAppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        RootineObservability.shared.installCrashReporter()
        // B09 observes the user's existing authorization state; it does not
        // request permission. The delegate only receives APNs callbacks once
        // a later permission flow has authorized notifications.
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        RootinePushRegistry.shared.update(tokenData: deviceToken)
        RootineObservability.shared.record(
            name: "device_health",
            outcome: .success,
            attributes: [
                "status": "token_received",
                "environment": RootineAPNsEnvironment.currentBuild.rawValue
            ]
        )
        NotificationCenter.default.post(name: .rootineAPNsTokenDidRegister, object: nil)
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        // Registration failures are expected in simulator/offline builds and
        // must not block local-first sync. Do not log the error or token.
        RootineObservability.shared.record(
            name: "device_health",
            outcome: .failure,
            attributes: ["error": String(describing: error)]
        )
    }
}

extension RootineAppDelegate: UNUserNotificationCenterDelegate {}
