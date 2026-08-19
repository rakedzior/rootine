import SwiftUI

/// Accepted navigation contract. Product tabs are materialized only as their
/// screens are separately reviewed and approved.
enum RootineTab: String, CaseIterable, Identifiable {
    case today
    case tasks
    case nutrition
    case notes

    var id: String { rawValue }

    var label: String {
        switch self {
        case .today: return "Dzisiaj"
        case .tasks: return "Zadania"
        case .nutrition: return "Odżywianie"
        case .notes: return "Notatki"
        }
    }
}

struct RootineEntryView: View {
    @EnvironmentObject private var environment: AppEnvironment

    var body: some View {
        Group {
            if environment.isLaunching {
                AuthLaunchView(message: "Sprawdzam sesję konta…")
            } else if environment.isPasswordRecovery {
                AuthenticationFlowView()
            } else if environment.session == nil {
                AuthenticationFlowView()
            } else if environment.isWorking {
                AuthLaunchView(message: "Przygotowuję Twoje dane…")
            } else {
                FoundationStatusView(
                    configured: environment.configuration.isComplete,
                    hasStoredSession: true,
                    message: environment.foundationMessage
                )
            }
        }
        .task { await environment.start() }
        .onOpenURL { url in
            Task { await environment.receiveAuthCallback(url) }
        }
    }
}
