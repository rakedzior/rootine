import SwiftUI

/// Internal-only diagnostic surface. It proves the app target, configuration,
/// environment object, dark tokens, and async bootstrap work without pretending
/// that any product screen has already been designed or accepted.
struct FoundationStatusView: View {
    let configured: Bool
    let hasStoredSession: Bool
    let message: String

    var body: some View {
        VStack(alignment: .leading, spacing: RootineTheme.Spacing.large) {
            Text("Rootine iOS")
                .font(.largeTitle.bold())
                .foregroundStyle(RootineTheme.ColorToken.primaryText)

            Text("Szkielet techniczny")
                .font(.title2.weight(.semibold))

            VStack(alignment: .leading, spacing: RootineTheme.Spacing.medium) {
                status("Konfiguracja klienta", ready: configured)
                status("Sesja w Keychain", ready: hasStoredSession)
                status("Kontrakty Codable", ready: true)
                status("Persistence i kolejka CAS", ready: true)
            }
            .rootineSurface()

            Text(message)
                .font(.footnote)
                .foregroundStyle(RootineTheme.ColorToken.secondaryText)

            Text("Natywne ekrany Rootine są gotowe do ręcznego przeglądu.")
                .font(.footnote)
                .foregroundStyle(RootineTheme.ColorToken.success)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(RootineTheme.Spacing.large)
        .background(RootineTheme.ColorToken.canvas.ignoresSafeArea())
    }

    private func status(_ label: String, ready: Bool) -> some View {
        Label(label, systemImage: ready ? "checkmark.circle.fill" : "circle.dashed")
            .foregroundStyle(ready ? RootineTheme.ColorToken.success : RootineTheme.ColorToken.secondaryText)
    }
}

// MARK: - More module designs

/// Native surfaces for the spaces exposed from the "Więcej" hub. Every module
/// reads and writes through `AppEnvironment`, which owns the local snapshot
/// and the shared offline mutation queue.
struct MoreModuleView: View {
    let module: MoreModule
    var startsAdding = false
    @EnvironmentObject private var environment: AppEnvironment

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: RootineTheme.Spacing.large) {
                ModuleSyncStatusBanner()

                switch module {
                case .notes:
                    NotesModuleContent()
                case .sport:
                    SportModuleContent()
                case .goals:
                    GoalsModuleContent()
                case .work:
                    WorkModuleContent()
                case .travel:
                    TravelModuleContent()
                case .health:
                    HealthModuleContent()
                case .affairs:
                    AffairsModuleContent()
                }
            }
            .padding(.horizontal, RootineTheme.Spacing.medium)
            .padding(.top, RootineTheme.Spacing.medium)
            .padding(.bottom, RootineTheme.Spacing.xLarge)
        }
        .scrollIndicators(.hidden)
        .background(RootineTheme.ColorToken.canvas.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
        .environment(\.rootineInitialAdd, startsAdding)
    }
}

struct ModuleSyncStatusBanner: View {
    @EnvironmentObject private var environment: AppEnvironment

    var body: some View {
        Group {
            if case .conflict = environment.workspaceSyncStatus {
                RootineErrorState(
                    title: "Konflikt synchronizacji",
                    message: "Zmiany w tym module są bezpieczne lokalnie. Spróbuj ponownie, gdy połączenie będzie stabilne.",
                    onRetry: { Task { await environment.flushPendingMutations() } }
                )
            } else if case .localOnly(let pending) = environment.workspaceSyncStatus {
                RootineOfflineBanner(message: offlineMessage(pending: pending))
            }
        }
    }

    func offlineMessage(pending: Int) -> String {
        switch pending {
        case 1: return "Tryb offline · 1 zmiana czeka na synchronizację"
        case 2...4: return "Tryb offline · \(pending) zmiany czekają na synchronizację"
        case 5...: return "Tryb offline · \(pending) zmian czeka na synchronizację"
        default: return "Tryb offline · zmiany zapisują się na tym iPhonie"
        }
    }
}

struct ModuleSectionTitle: View {
    let title: String
    let systemImage: String

    var body: some View {
        Label(title, systemImage: systemImage)
            .font(.headline)
            .foregroundStyle(RootineTheme.ColorToken.primaryText)
    }
}

struct ModuleActionButton: View {
    let title: String
    let systemImage: String
    let tint: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label(title, systemImage: systemImage)
                .font(.subheadline.weight(.semibold))
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .tint(tint)
        .frame(minHeight: 48)
        .accessibilityHint("Otwiera formularz dodawania")
    }
}

// MARK: Notes

struct ModuleEmptyCard: View {
    let title: String
    let detail: String
    let systemImage: String
    let tint: Color

    var body: some View {
        HStack(spacing: RootineTheme.Spacing.medium) {
            Image(systemName: systemImage)
                .font(.title2)
                .foregroundStyle(tint)
            VStack(alignment: .leading, spacing: RootineTheme.Spacing.xSmall) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(RootineTheme.ColorToken.primaryText)
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
            }
            Spacer(minLength: 0)
        }
        .frame(minHeight: 72, alignment: .leading)
        .rootineSurface()
        .accessibilityElement(children: .combine)
    }
}

// MARK: Pozostałe / Sprawy

func rootineDate(from key: String) -> Date? {
    let parts = key.split(separator: "-").compactMap { Int($0) }
    guard parts.count == 3,
          String(format: "%04d-%02d-%02d", parts[0], parts[1], parts[2]) == key else { return nil }
    let calendar = Calendar.current
    let components = DateComponents(year: parts[0], month: parts[1], day: parts[2])
    guard let date = calendar.date(from: components) else { return nil }
    let normalized = calendar.dateComponents([.year, .month, .day], from: date)
    guard normalized.year == parts[0], normalized.month == parts[1], normalized.day == parts[2] else { return nil }
    return date
}
