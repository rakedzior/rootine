import SwiftUI
import UniformTypeIdentifiers

/// Accepted navigation contract. Product tabs are materialized only as their
/// screens are separately reviewed and approved.
enum RootineTab: String, CaseIterable, Identifiable {
    case today
    case tasks
    case calendar
    case nutrition
    case more

    var id: String { rawValue }

    var label: String {
        switch self {
        case .today: return "Dzisiaj"
        case .tasks: return "Zadania"
        case .calendar: return "Kalendarz"
        case .nutrition: return "Odżywianie"
        case .more: return "Więcej"
        }
    }

    var systemImage: String {
        switch self {
        case .today: return "sun.max.fill"
        case .tasks: return "checklist"
        case .calendar: return "calendar"
        case .nutrition: return "fork.knife"
        case .more: return "ellipsis.circle"
        }
    }
}

struct RootineEntryView: View {
    @EnvironmentObject private var environment: AppEnvironment
    @Environment(\.scenePhase) private var scenePhase

    private var isPreviewLaunch: Bool {
#if DEBUG
        return CommandLine.arguments.contains("--rootine-preview")
            || CommandLine.arguments.contains(where: { $0.hasPrefix("--rootine-preview-") })
#else
        return false
#endif
    }

    var body: some View {
        Group {
            if isPreviewLaunch {
                RootineMainView()
            } else if environment.isLaunching {
                AuthLaunchView(message: "Sprawdzam sesję konta…")
            } else if environment.isPasswordRecovery {
                AuthenticationFlowView()
            } else if environment.session == nil {
                AuthenticationFlowView()
            } else if environment.isWorking && !environment.isImportingWorkspace {
                AuthLaunchView(message: "Przygotowuję Twoje dane…")
            } else {
                RootineMainView()
            }
        }
        .task {
#if DEBUG
            if isPreviewLaunch {
                await environment.loadPreviewData()
            } else {
                environment.registerBackgroundRefreshTask()
                await environment.start()
            }
#else
            environment.registerBackgroundRefreshTask()
            await environment.start()
#endif
        }
        .onOpenURL { url in
            Task { await environment.receiveAuthCallback(url) }
        }
        .onReceive(NotificationCenter.default.publisher(for: .rootineAPNsTokenDidRegister)) { _ in
            guard !isPreviewLaunch else { return }
            Task { await environment.registerDeviceForCurrentSession() }
        }
        .onChange(of: scenePhase) { _, phase in
            guard !isPreviewLaunch else { return }
            let rootinePhase: RootineScenePhase
            switch phase {
            case .active: rootinePhase = .active
            case .inactive: rootinePhase = .inactive
            case .background: rootinePhase = .background
            @unknown default: rootinePhase = .inactive
            }
            environment.scenePhaseDidChange(rootinePhase)
        }
    }
}

/// Native product shell. Each tab owns its navigation stack so feature details
/// can be added without changing the root navigation contract.
struct RootineMainView: View {
    @State private var selection: RootineTab = RootineMainView.initialSelection
    @State private var isShowingQuickAdd = false

    private static var initialSelection: RootineTab {
#if DEBUG
        if initialModule != nil { return .more }
        if CommandLine.arguments.contains("--rootine-preview-more") { return .more }
        if CommandLine.arguments.contains("--rootine-preview-tasks") { return .tasks }
        if CommandLine.arguments.contains("--rootine-preview-calendar") { return .calendar }
        if CommandLine.arguments.contains("--rootine-preview-nutrition") { return .nutrition }
#endif
        return .today
    }

    private static var initialModule: MoreModule? {
#if DEBUG
        guard let argument = CommandLine.arguments.first(where: { $0.hasPrefix("--rootine-preview-module=") }) else { return nil }
        let rawValue = String(argument.dropFirst("--rootine-preview-module=".count))
        return MoreModule(rawValue: rawValue)
#else
        return nil
#endif
    }

    var body: some View {
        TabView(selection: $selection) {
            rootTab(.today) {
                TodayView()
            }
            rootTab(.tasks) {
                TasksView()
            }
            rootTab(.calendar) {
                CalendarView()
            }
            rootTab(.nutrition) {
                NutritionView()
            }
            rootTab(.more) {
                if let module = RootineMainView.initialModule {
                    MoreModuleView(module: module)
                } else {
                    MoreLandingView()
                }
            }
        }
        .tint(RootineTheme.ColorToken.action)
        .sheet(isPresented: $isShowingQuickAdd) {
            QuickAddSheet()
                .presentationDetents([.medium])
                .presentationDragIndicator(.visible)
        }
    }

    private func rootTab<Content: View>(
        _ tab: RootineTab,
        @ViewBuilder content: () -> Content
    ) -> some View {
        NavigationStack {
            content()
                .navigationTitle(tab.label)
                .navigationBarTitleDisplayMode(.large)
                .toolbar {
                    ToolbarItem(placement: .primaryAction) {
                        Button {
                            isShowingQuickAdd = true
                        } label: {
                            Image(systemName: "plus")
                                .frame(minWidth: 44, minHeight: 44)
                                .contentShape(Rectangle())
                        }
                        .accessibilityLabel("Dodaj")
                        .accessibilityHint("Otwiera wybór nowego zadania lub nawyku")
                    }
                }
        }
        .tag(tab)
        .tabItem {
            Label(tab.label, systemImage: tab.systemImage)
        }
    }
}

private struct QuickAddSheet: View {
    @EnvironmentObject private var environment: AppEnvironment
    @Environment(\.dismiss) private var dismiss
    @State private var mode: QuickAddMode?

    private enum QuickAddMode: Identifiable {
        case task
        case habit

        var id: String { String(describing: self) }
    }

    var body: some View {
        NavigationStack {
            List {
                Section("Dodaj do Rootine") {
                    Button { mode = .task } label: {
                        Label("Zadanie", systemImage: "checklist")
                    }
                    Button { mode = .habit } label: {
                        Label("Nawyk", systemImage: "flame")
                    }
                    Label("Posiłki dodasz bezpośrednio w zakładce Odżywianie.", systemImage: "info.circle")
                        .font(.footnote)
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                }
            }
            .scrollContentBackground(.hidden)
            .background(RootineTheme.ColorToken.canvas)
            .navigationTitle("Dodaj")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Anuluj") { dismiss() }
                }
            }
            .sheet(item: $mode) { mode in
                Group {
                    switch mode {
                    case .task: AddTaskSheet()
                    case .habit: AddHabitSheet()
                    }
                }
                .environmentObject(environment)
            }
        }
    }
}

private struct MoreLandingView: View {
    @EnvironmentObject private var environment: AppEnvironment
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var isShowingAccount = false
    @State private var hasAppeared = false

    private var activeTasks: Int {
        environment.taskWorkspace.tasks.filter {
            $0.deleted != true && !rootineTaskIsDoneOnDate($0, dateKey: RootineDate.localDate())
        }.count
    }

    private var activeHabits: Int {
        environment.taskWorkspace.habits.filter {
            rootineHabitIsScheduledOnDate($0, dateKey: RootineDate.localDate())
                && !rootineHabitIsDoneOnDate($0, dateKey: RootineDate.localDate())
        }.count
    }

    private var activeNotes: Int {
        environment.notesWorkspace.notes.filter { !$0.archived }.count
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: RootineTheme.Spacing.large) {
                MoreLandingSyncStatusBanner()
                MoreAccountCard(message: environment.foundationMessage) {
                    isShowingAccount = true
                }
                .offset(y: hasAppeared ? 0 : 12)
                .opacity(hasAppeared ? 1 : 0)

                MorePulseCard(activeTasks: activeTasks, activeHabits: activeHabits, activeNotes: activeNotes)
                    .offset(y: hasAppeared ? 0 : 16)
                    .opacity(hasAppeared ? 1 : 0)

                VStack(alignment: .leading, spacing: RootineTheme.Spacing.medium) {
                    Text("Twoje przestrzenie")
                        .font(.title3.weight(.bold))
                        .foregroundStyle(RootineTheme.ColorToken.primaryText)

                    LazyVGrid(
                        columns: [GridItem(.flexible(), spacing: RootineTheme.Spacing.small), GridItem(.flexible(), spacing: RootineTheme.Spacing.small)],
                        spacing: RootineTheme.Spacing.small
                    ) {
                        ForEach(Array(MoreModule.allCases.enumerated()), id: \.element.id) { index, module in
                            NavigationLink {
                                MoreModuleView(module: module)
                            } label: {
                                MoreModuleTile(module: module)
                            }
                            .buttonStyle(.plain)
                            .offset(y: hasAppeared ? 0 : CGFloat(18 + index * 3))
                            .opacity(hasAppeared ? 1 : 0)
                        }
                    }
                }
            }
            .padding(.horizontal, RootineTheme.Spacing.medium)
            .padding(.top, RootineTheme.Spacing.medium)
            .padding(.bottom, RootineTheme.Spacing.xLarge)
        }
        .scrollIndicators(.hidden)
        .background(RootineTheme.ColorToken.canvas.ignoresSafeArea())
        .onAppear {
            if reduceMotion {
                hasAppeared = true
            } else {
                withAnimation(.easeOut(duration: 0.42)) { hasAppeared = true }
            }
        }
        .sheet(isPresented: $isShowingAccount) {
            MoreAccountSheet()
                .presentationDetents([.medium])
                .presentationDragIndicator(.visible)
        }
    }
}

private struct MoreLandingSyncStatusBanner: View {
    @EnvironmentObject private var environment: AppEnvironment

    var body: some View {
        Group {
            if case .conflict = environment.workspaceSyncStatus {
                RootineErrorState(
                    title: "Konflikt synchronizacji",
                    message: "Zmiany są bezpieczne lokalnie. Spróbuj ponownie, gdy połączenie będzie stabilne.",
                    onRetry: { Task { await environment.flushPendingMutations() } }
                )
            } else if case .localOnly(let pending) = environment.workspaceSyncStatus {
                RootineOfflineBanner(message: offlineMessage(pending: pending))
            }
        }
    }

    private func offlineMessage(pending: Int) -> String {
        switch pending {
        case 1: return "Tryb offline · 1 zmiana czeka na synchronizację"
        case 2...4: return "Tryb offline · \(pending) zmiany czekają na synchronizację"
        case 5...: return "Tryb offline · \(pending) zmian czeka na synchronizację"
        default: return "Tryb offline · zmiany zapisują się na tym iPhonie"
        }
    }
}

enum MoreModule: String, CaseIterable, Identifiable {
    case notes
    case sport
    case goals
    case work
    case travel
    case health
    case affairs

    var id: String { rawValue }
    var title: String {
        switch self {
        case .notes: return "Notatki"
        case .sport: return "Sport"
        case .goals: return "Cele"
        case .work: return "Praca"
        case .travel: return "Podróże"
        case .health: return "Zdrowie"
        case .affairs: return "Pozostałe"
        }
    }
    var systemImage: String {
        switch self {
        case .notes: return "note.text"
        case .sport: return "figure.run"
        case .goals: return "target"
        case .work: return "briefcase"
        case .travel: return "airplane"
        case .health: return "heart.text.square"
        case .affairs: return "checklist.checked"
        }
    }

    var subtitle: String {
        switch self {
        case .notes: return "Myśli i szybkie zapiski"
        case .sport: return "Ruch i regeneracja"
        case .goals: return "Kierunek na dziś"
        case .work: return "Skupienie bez chaosu"
        case .travel: return "Plany poza rutyną"
        case .health: return "Samopoczucie i energia"
        case .affairs: return "Sprawy, płatności i ważne terminy"
        }
    }

    var tint: Color {
        switch self {
        case .notes: return Color(uiColor: .systemIndigo)
        case .sport: return Color(uiColor: .systemGreen)
        case .goals: return Color(uiColor: .systemOrange)
        case .work: return Color(uiColor: .systemBlue)
        case .travel: return Color(uiColor: .systemPurple)
        case .health: return Color(uiColor: .systemPink)
        case .affairs: return Color(uiColor: .systemTeal)
        }
    }
}

private struct MoreAccountCard: View {
    let message: String
    let onOpen: () -> Void

    var body: some View {
        Button(action: onOpen) {
            HStack(spacing: RootineTheme.Spacing.medium) {
                ZStack {
                    Circle()
                        .fill(RootineTheme.ColorToken.action.opacity(0.18))
                    Image(systemName: "person.crop.circle.fill")
                        .font(.title2)
                        .foregroundStyle(RootineTheme.ColorToken.action)
                }
                .frame(width: 52, height: 52)

                VStack(alignment: .leading, spacing: RootineTheme.Spacing.xSmall) {
                    Text("Twoje Rootine")
                        .font(.title3.weight(.semibold))
                    Text(message)
                        .font(.caption)
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                        .lineLimit(2)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
            }
            .foregroundStyle(RootineTheme.ColorToken.primaryText)
        }
        .buttonStyle(.plain)
        .rootineSurface()
    }
}

private struct MorePulseCard: View {
    let activeTasks: Int
    let activeHabits: Int
    let activeNotes: Int

    var body: some View {
        VStack(alignment: .leading, spacing: RootineTheme.Spacing.medium) {
            HStack {
                VStack(alignment: .leading, spacing: RootineTheme.Spacing.xSmall) {
                    Text("Twój rytm")
                        .font(.headline)
                    Text("Małe kroki, które trzymają dzień w ruchu.")
                        .font(.caption)
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                }
                Spacer()
                Image(systemName: "sparkles")
                    .font(.title2)
                    .foregroundStyle(RootineTheme.ColorToken.warning)
            }

            HStack(spacing: RootineTheme.Spacing.small) {
                MorePulseMetric(value: activeTasks, label: "zadania", tint: RootineTheme.ColorToken.action)
                MorePulseMetric(value: activeHabits, label: "nawyki", tint: RootineTheme.ColorToken.success)
                MorePulseMetric(value: activeNotes, label: "notatki", tint: RootineTheme.ColorToken.warning)
            }
        }
        .foregroundStyle(RootineTheme.ColorToken.primaryText)
        .rootineSurface()
    }
}

private struct MorePulseMetric: View {
    let value: Int
    let label: String
    let tint: Color

    var body: some View {
        VStack(alignment: .leading, spacing: RootineTheme.Spacing.xSmall) {
            Text("\(value)")
                .font(.title2.weight(.bold))
                .foregroundStyle(tint)
                .contentTransition(.numericText())
            Text(label)
                .font(.caption)
                .foregroundStyle(RootineTheme.ColorToken.secondaryText)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, RootineTheme.Spacing.small)
        .padding(.horizontal, RootineTheme.Spacing.small)
        .background(RootineTheme.ColorToken.elevated.opacity(0.8))
        .clipShape(RoundedRectangle(cornerRadius: RootineTheme.Radius.control, style: .continuous))
    }
}

private struct MoreModuleTile: View {
    let module: MoreModule

    var body: some View {
        VStack(alignment: .leading, spacing: RootineTheme.Spacing.small) {
            HStack {
                Image(systemName: module.systemImage)
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(module.tint)
                    .frame(width: 34, height: 34)
                    .background(module.tint.opacity(0.16))
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                Spacer()
                Image(systemName: "arrow.up.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
            }
            Text(module.title)
                .font(.headline)
                .foregroundStyle(RootineTheme.ColorToken.primaryText)
            Text(module.subtitle)
                .font(.caption)
                .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                .lineLimit(2)
        }
        .frame(maxWidth: .infinity, minHeight: 122, alignment: .topLeading)
        .padding(RootineTheme.Spacing.medium)
        .background(RootineTheme.ColorToken.surface)
        .clipShape(RoundedRectangle(cornerRadius: RootineTheme.Radius.surface, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: RootineTheme.Radius.surface, style: .continuous)
                .stroke(module.tint.opacity(0.22), lineWidth: 1)
        }
    }
}

private struct MoreModuleRow: View {
    let module: MoreModule

    var body: some View {
        HStack(spacing: RootineTheme.Spacing.medium) {
            Image(systemName: module.systemImage)
                .font(.title3)
                .foregroundStyle(RootineTheme.ColorToken.action)
                .frame(width: 28)
            Text(module.title)
                .font(.body.weight(.medium))
                .foregroundStyle(RootineTheme.ColorToken.primaryText)
            Spacer()
            Image(systemName: "arrow.up.right")
                .font(.caption.weight(.semibold))
                .foregroundStyle(RootineTheme.ColorToken.secondaryText)
        }
        .padding(.vertical, RootineTheme.Spacing.small)
        .contentShape(Rectangle())
    }
}

private struct MoreAccountSheet: View {
    @EnvironmentObject private var environment: AppEnvironment
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: RootineTheme.Spacing.large) {
                Label("Synchronizacja", systemImage: "arrow.triangle.2.circlepath")
                    .font(.headline)
                Text(environment.foundationMessage)
                    .font(.subheadline)
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                NavigationLink {
                    RootineProfileView()
                } label: {
                    Label("Profil i dane konta", systemImage: "person.crop.circle")
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .frame(minHeight: 44)
                NavigationLink {
                    RootineDataCenterView()
                } label: {
                    Label("Kopie i odzyskiwanie", systemImage: "externaldrive.badge.icloud")
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .frame(minHeight: 44)
                NavigationLink {
                    RootineSettingsView()
                } label: {
                    Label("Ustawienia aplikacji", systemImage: "gearshape")
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .frame(minHeight: 44)
                NavigationLink {
                    RootineHelpView()
                } label: {
                    Label("Pomoc i prywatność", systemImage: "questionmark.circle")
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .frame(minHeight: 44)
                Button {
                    Task { await environment.flushPendingMutations() }
                } label: {
                    Label("Synchronizuj teraz", systemImage: "arrow.clockwise")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(RootineTheme.ColorToken.action)

                Button("Wyloguj się", role: .destructive) {
                    environment.signOutFoundationSession()
                    dismiss()
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(RootineTheme.Spacing.large)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(RootineTheme.ColorToken.canvas)
            .foregroundStyle(RootineTheme.ColorToken.primaryText)
            .navigationTitle("Konto")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Gotowe") { dismiss() }
                }
            }
        }
    }
}

// MARK: Konto, ustawienia i dane

private struct RootineProfileView: View {
    @EnvironmentObject private var environment: AppEnvironment
    @State private var displayName = ""
    @State private var isSavingProfile = false
    @State private var profileMessage: String?
    @State private var profileError: String?
    @State private var deleteConfirmation = ""
    @State private var isDeletingAccount = false

    private var currentDisplayName: String {
        guard let metadata = environment.session?.user.userMetadata else {
            return environment.session?.user.email ?? ""
        }
        for key in ["full_name", "name", "display_name"] {
            if case .string(let value) = metadata[key], !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                return value
            }
        }
        return environment.session?.user.email ?? ""
    }

    private var linkedProviders: Set<String> {
        let identityProviders = environment.session?.user.identities?.map { $0.provider.lowercased() } ?? []
        if !identityProviders.isEmpty { return Set(identityProviders) }
        if case .string(let provider) = environment.session?.user.appMetadata?["provider"] {
            return [provider.lowercased()]
        }
        return []
    }

    private var privacySafeEmail: String {
        guard environment.profilePreferences.privacyMode else {
            return environment.session?.user.email ?? "Nie podano"
        }
        return "Ukryto w trybie prywatnym"
    }

    private var privacySafeAccountID: String {
        guard environment.profilePreferences.privacyMode else {
            return environment.session?.user.id ?? "Lokalnie"
        }
        return "Ukryto w trybie prywatnym"
    }

    var body: some View {
        List {
            Section("Profil") {
                TextField("Nazwa wyświetlana", text: $displayName)
                    .textInputAutocapitalization(.words)
                    .autocorrectionDisabled()
                Button {
                    Task { await saveProfile() }
                } label: {
                    Label("Zapisz profil", systemImage: "checkmark.circle")
                }
                .disabled(isSavingProfile || displayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                LabeledContent("E-mail", value: privacySafeEmail)
                if let profileMessage {
                    Label(profileMessage, systemImage: "checkmark.circle.fill")
                        .foregroundStyle(RootineTheme.ColorToken.success)
                }
                if let profileError {
                    Label(profileError, systemImage: "exclamationmark.triangle")
                        .foregroundStyle(RootineTheme.ColorToken.destructive)
                }
            }
            Section("Dostawcy logowania") {
                ProviderStatusRow(title: "Google", isLinked: linkedProviders.contains("google"))
                ProviderStatusRow(title: "Apple", isLinked: linkedProviders.contains("apple"))
                Text("Łączenie dodatkowych dostawców wymaga osobnego kontraktu Supabase. Rootine nie uruchamia tu ponownego logowania, które mogłoby przełączyć konto.")
                    .font(.footnote)
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
            }
            Section("Subskrypcje i integracje") {
                Label("Niedostępne w tej wersji", systemImage: "minus.circle")
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                Text("Nie aktywujemy planów płatnych ani zewnętrznych integracji bez zatwierdzonego kontraktu API i bezpiecznego przepływu konta.")
                    .font(.footnote)
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
            }
            Section("Bezpieczeństwo") {
                NavigationLink {
                    RootinePasswordSettingsView()
                } label: {
                    Label("Zmień hasło", systemImage: "key.fill")
                }
                NavigationLink {
                    RootineDiagnosticsView()
                } label: {
                    Label("Diagnostyka i synchronizacja", systemImage: "stethoscope")
                }
            }
            Section("Urządzenie") {
                LabeledContent("To urządzenie", value: environment.currentDeviceIdentifier ?? "Brak aktywnej sesji")
                LabeledContent("Powiadomienia systemowe", value: notificationPermissionLabel(environment.notificationPermissionState))
                if let registration = environment.deviceRegistration {
                    LabeledContent("Rejestracja", value: registration.revokedAt == nil ? "Aktywna" : "Wycofana")
                } else {
                    Text("Urządzenie zostanie zarejestrowane po udzieleniu zgody na powiadomienia.")
                        .font(.footnote)
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                }
                Button {
                    Task { await environment.registerDeviceForCurrentSession() }
                } label: {
                    Label("Odśwież rejestrację", systemImage: "arrow.clockwise")
                }
                Button {
                    Task { await environment.revokeCurrentDevice() }
                } label: {
                    Label("Wyrejestruj urządzenie", systemImage: "bell.slash")
                }
                .foregroundStyle(RootineTheme.ColorToken.destructive)
            }
            Section("Połączenie") {
                ConfigurationStatusRow(title: "Logowanie", ready: environment.configuration.isAuthComplete)
                ConfigurationStatusRow(title: "Backend danych", ready: environment.configuration.isComplete)
                if let refreshed = environment.realtimeLastRefresh {
                    LabeledContent("Ostatnie uzgodnienie", value: refreshed.formatted(date: .omitted, time: .shortened))
                }
                Text("Identyfikator konta jest używany tylko do rozdzielenia danych. Nie pokazujemy tokenów sesji ani tokenów APNs.")
                    .font(.footnote)
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
            }
            Section("Konto") {
                LabeledContent("Identyfikator", value: privacySafeAccountID)
                Button("Wyloguj się", role: .destructive) {
                    environment.signOutFoundationSession()
                }
                Text("Wylogowanie nie usuwa lokalnych danych. Zostają one przypisane do tego konta i nie są przekazywane następnej sesji.")
                    .font(.footnote)
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
            }
            Section("Usuń konto") {
                Text("Usunięcie konta jest nieodwracalne. Najpierw wyeksportuj kopię w sekcji Kopie i odzyskiwanie, jeśli chcesz zachować dane.")
                    .font(.footnote)
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                SecureField("Wpisz DELETE", text: $deleteConfirmation)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                Button("Usuń konto i dane lokalne", role: .destructive) {
                    Task { await deleteAccount() }
                }
                .disabled(isDeletingAccount || deleteConfirmation != "DELETE")
            }
        }
        .navigationTitle("Profil")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            displayName = currentDisplayName
            await environment.refreshProfileSettings()
            await environment.refreshNotificationPermissionState()
        }
    }

    private func saveProfile() async {
        isSavingProfile = true
        profileMessage = nil
        profileError = nil
        do {
            try await environment.updateProfileDisplayName(displayName)
            profileMessage = "Profil został zapisany"
        } catch {
            profileError = error.localizedDescription
        }
        isSavingProfile = false
    }

    private func deleteAccount() async {
        isDeletingAccount = true
        profileError = nil
        do {
            try await environment.deleteAccountAndSignOut()
        } catch {
            profileError = error.localizedDescription
            isDeletingAccount = false
        }
    }
}

private struct ProviderStatusRow: View {
    let title: String
    let isLinked: Bool

    var body: some View {
        Label {
            Text(title)
            Text(isLinked ? "Połączone" : "Dostępne przy logowaniu")
                .font(.caption)
                .foregroundStyle(RootineTheme.ColorToken.secondaryText)
        } icon: {
            Image(systemName: isLinked ? "checkmark.circle.fill" : "circle.dashed")
                .foregroundStyle(isLinked ? RootineTheme.ColorToken.success : RootineTheme.ColorToken.secondaryText)
        }
    }
}

private func notificationPermissionLabel(_ state: RootineNotificationPermissionState) -> String {
    switch state {
    case .authorized: return "Dozwolone"
    case .provisional: return "Tymczasowe"
    case .ephemeral: return "Tymczasowe (App Clip)"
    case .denied: return "Odrzucone"
    case .notDetermined: return "Nieustalone"
    case .unknown: return "Niedostępne"
    }
}

private struct ConfigurationStatusRow: View {
    let title: String
    let ready: Bool

    var body: some View {
        Label(title, systemImage: ready ? "checkmark.circle.fill" : "exclamationmark.circle")
            .foregroundStyle(ready ? RootineTheme.ColorToken.success : RootineTheme.ColorToken.warning)
    }
}

private struct RootineSettingsView: View {
    @EnvironmentObject private var environment: AppEnvironment
    @AppStorage("rootine.appearance") private var appearance = "system"
    @State private var profile = RootineProfilePreferences.current
    @State private var notifications = RootineNotificationPreferences()

    private var timezoneOptions: [String] {
        let preferred = [
            "Europe/Warsaw", "Europe/London", "Europe/Berlin", "America/New_York",
            "America/Los_Angeles", "Asia/Tokyo", "UTC"
        ]
        let current = profile.timezoneIdentifier
        return Array(Set(preferred + [current])).sorted()
    }

    var body: some View {
        Form {
            Section("Wygląd") {
                Picker("Motyw", selection: $appearance) {
                    Text("Systemowy").tag("system")
                    Text("Jasny").tag("light")
                    Text("Ciemny").tag("dark")
                }
                .pickerStyle(.navigationLink)
            }
            Section("Formaty") {
                Picker("Strefa czasowa", selection: timezoneBinding) {
                    ForEach(timezoneOptions, id: \.self) { timezone in
                        Text(timezone).tag(timezone)
                    }
                }
                .pickerStyle(.navigationLink)
                Picker("Język i format", selection: localeBinding) {
                    Text("Polski (Polska)").tag("pl-PL")
                    Text("English (United States)").tag("en-US")
                }
                .pickerStyle(.navigationLink)
                Picker("Waluta", selection: currencyBinding) {
                    Text("PLN — złoty").tag("PLN")
                    Text("EUR — euro").tag("EUR")
                    Text("USD — dolar").tag("USD")
                    Text("GBP — funt").tag("GBP")
                }
                .pickerStyle(.navigationLink)
                Picker("Jednostki", selection: unitsBinding) {
                    Text("Metryczne (kg, km)").tag(true)
                    Text("Imperialne (lb, mi)").tag(false)
                }
                .pickerStyle(.navigationLink)
            }
            Section("Powiadomienia") {
                Toggle("Przypomnienia", isOn: notificationEnabledBinding)
                Toggle("Zadania", isOn: taskNotificationsBinding)
                    .disabled(!notifications.enabled)
                Toggle("Nawyki", isOn: habitNotificationsBinding)
                    .disabled(!notifications.enabled)
                Toggle("Szczegóły na ekranie blokady", isOn: showDetailsBinding)
                    .disabled(!notifications.enabled)
                Button {
                    Task { await environment.requestNotificationPermissionFromSettings() }
                } label: {
                    Label("Zarządzaj zgodą systemową", systemImage: "bell.badge")
                }
                Text("Domyślnie treść zadania nie trafia na ekran blokady. Zmiana strefy czasowej aktualizuje plan przypomnień.")
                    .font(.footnote)
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
            }
            Section("Prywatność") {
                Toggle("Tryb prywatny", isOn: privacyBinding)
                Text("Tryb prywatny ogranicza informacje pokazywane w podglądzie konta. Eksport i dane domenowe pozostają niezmienione.")
                    .font(.footnote)
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
            }
            Section("Zachowanie") {
                Label("Aplikacja respektuje Reduce Motion i Dynamic Type ustawione w systemie.", systemImage: "accessibility")
                    .font(.footnote)
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                Label("Wszystkie akcje dotykowe mają co najmniej 44 punkty.", systemImage: "hand.tap")
                    .font(.footnote)
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
            }
            Section("Dane") {
                NavigationLink {
                    RootineDataCenterView()
                } label: {
                    Label("Kopie i odzyskiwanie", systemImage: "externaldrive.badge.icloud")
                }
                NavigationLink {
                    RootineDiagnosticsView()
                } label: {
                    Label("Diagnostyka", systemImage: "stethoscope")
                }
                Text("Eksport obejmuje wszystkie workspace’y tego konta. Dane aplikacji pozostają lokalne do czasu potwierdzonej synchronizacji.")
                    .font(.footnote)
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
            }
        }
        .navigationTitle("Ustawienia")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            profile = environment.profilePreferences
            notifications = environment.notificationPreferences
            await environment.refreshNotificationPermissionState()
        }
        .onChange(of: environment.profilePreferences) { _, next in
            profile = next
        }
        .onChange(of: environment.notificationPreferences) { _, next in
            notifications = next
        }
    }

    private var timezoneBinding: Binding<String> {
        Binding(
            get: { profile.timezoneIdentifier },
            set: { next in
                profile.timezoneIdentifier = next
                saveProfile()
            }
        )
    }

    private var localeBinding: Binding<String> {
        Binding(
            get: { profile.localeIdentifier },
            set: { next in
                profile.localeIdentifier = next
                saveProfile()
            }
        )
    }

    private var currencyBinding: Binding<String> {
        Binding(
            get: { profile.currencyCode },
            set: { next in
                profile.currencyCode = next
                saveProfile()
            }
        )
    }

    private var unitsBinding: Binding<Bool> {
        Binding(
            get: { profile.usesMetricUnits },
            set: { next in
                profile.usesMetricUnits = next
                saveProfile()
            }
        )
    }

    private var privacyBinding: Binding<Bool> {
        Binding(
            get: { profile.privacyMode },
            set: { next in
                profile.privacyMode = next
                saveProfile()
            }
        )
    }

    private var notificationEnabledBinding: Binding<Bool> {
        Binding(
            get: { notifications.enabled },
            set: { next in
                notifications.enabled = next
                saveNotifications()
            }
        )
    }

    private var taskNotificationsBinding: Binding<Bool> {
        Binding(
            get: { notifications.taskRemindersEnabled },
            set: { next in
                notifications.taskRemindersEnabled = next
                saveNotifications()
            }
        )
    }

    private var habitNotificationsBinding: Binding<Bool> {
        Binding(
            get: { notifications.habitRemindersEnabled },
            set: { next in
                notifications.habitRemindersEnabled = next
                saveNotifications()
            }
        )
    }

    private var showDetailsBinding: Binding<Bool> {
        Binding(
            get: { notifications.showTaskDetails },
            set: { next in
                notifications.showTaskDetails = next
                saveNotifications()
            }
        )
    }

    private func saveProfile() {
        Task { await environment.updateProfilePreferences(profile) }
    }

    private func saveNotifications() {
        Task { await environment.updateNotificationPreferences(notifications) }
    }
}

private struct RootinePasswordSettingsView: View {
    @EnvironmentObject private var environment: AppEnvironment
    @State private var password = ""
    @State private var confirmation = ""
    @State private var message: String?
    @State private var errorMessage: String?
    @State private var isSaving = false

    var body: some View {
        Form {
            Section("Nowe hasło") {
                SecureField("Nowe hasło (min. 8 znaków)", text: $password)
                    .textContentType(.newPassword)
                SecureField("Powtórz nowe hasło", text: $confirmation)
                    .textContentType(.newPassword)
                Button {
                    Task { await save() }
                } label: {
                    Label(isSaving ? "Zapisuję…" : "Zmień hasło", systemImage: "key.fill")
                }
                .disabled(isSaving || password.isEmpty || password != confirmation)
            }
            Section {
                Text("Hasło jest przekazywane wyłącznie do Supabase przez bezpieczną sesję. Rootine nie zapisuje go w Keychain, plikach ani diagnostyce.")
                    .font(.footnote)
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
            }
            if let message {
                Section {
                    Label(message, systemImage: "checkmark.circle.fill")
                        .foregroundStyle(RootineTheme.ColorToken.success)
                }
            }
            if let errorMessage {
                Section {
                    Label(errorMessage, systemImage: "exclamationmark.triangle")
                        .foregroundStyle(RootineTheme.ColorToken.destructive)
                }
            }
        }
        .navigationTitle("Bezpieczeństwo")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func save() async {
        isSaving = true
        message = nil
        errorMessage = nil
        do {
            try await environment.updateAccountPassword(password)
            message = "Hasło zostało zmienione"
            password = ""
            confirmation = ""
        } catch {
            errorMessage = error.localizedDescription
        }
        isSaving = false
    }
}

private struct RootineDiagnosticsView: View {
    @EnvironmentObject private var environment: AppEnvironment

    var body: some View {
        List {
            Section("Synchronizacja") {
                LabeledContent("Stan danych", value: workspaceSyncStatusLabel(environment.workspaceSyncStatus))
                LabeledContent("Realtime", value: realtimeStatusLabel(environment.realtimeStatus))
                LabeledContent("Koordynator", value: syncCoordinatorStatusLabel(environment.syncCoordinatorStatus))
                if let refreshed = environment.realtimeLastRefresh {
                    LabeledContent("Ostatnie uzgodnienie", value: refreshed.formatted(date: .abbreviated, time: .shortened))
                }
                if let fallback = environment.normalizedReadFallbackReason {
                    Text("Odczyt relacyjny używa trybu zgodności: \(fallback)")
                        .font(.footnote)
                        .foregroundStyle(RootineTheme.ColorToken.warning)
                }
                Button {
                    Task { await environment.refreshActiveSession() }
                } label: {
                    Label("Synchronizuj teraz", systemImage: "arrow.clockwise")
                }
            }
            Section("Konfiguracja") {
                ConfigurationStatusRow(title: "Logowanie", ready: environment.configuration.isAuthComplete)
                ConfigurationStatusRow(title: "Backend danych", ready: environment.configuration.isComplete)
                ConfigurationStatusRow(title: "Dokumenty prawne", ready: environment.configuration.hasLegalDocuments)
                LabeledContent("Środowisko", value: environment.configuration.environment)
            }
            Section("Powiadomienia") {
                LabeledContent("Zgoda systemowa", value: notificationPermissionLabel(environment.notificationPermissionState))
                LabeledContent("Rejestracja urządzenia", value: environment.deviceRegistration == nil ? "Brak aktywnej" : "Aktywna")
                Text("Diagnostyka nie zawiera tokenu sesji, tokenu APNs, treści powiadomień ani pełnego identyfikatora urządzenia.")
                    .font(.footnote)
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
            }
        }
        .navigationTitle("Diagnostyka")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private func workspaceSyncStatusLabel(_ status: WorkspaceSyncStatus) -> String {
    switch status {
    case .unavailable: return "Niedostępna"
    case .localOnly(let pending): return pending > 0 ? "Lokalnie (\(pending) oczekujących)" : "Tylko lokalnie"
    case .syncing(let pending): return pending > 0 ? "Synchronizuję (\(pending))" : "Synchronizuję"
    case .synced: return "Zsynchronizowano"
    case .conflict(let keys): return "Konflikt (\(keys.count))"
    case .schemaMismatch: return "Niezgodny kontrakt"
    case .unauthorized: return "Sesja wygasła"
    case .error: return "Błąd"
    }
}

private func realtimeStatusLabel(_ status: RootineRealtimeStatus) -> String {
    switch status {
    case .stopped: return "Zatrzymany"
    case .connecting: return "Łączenie"
    case .connected: return "Połączony"
    case .reconnecting: return "Ponowne łączenie"
    case .degraded: return "Ograniczony"
    case .failed: return "Błąd"
    }
}

private func syncCoordinatorStatusLabel(_ status: RootineSyncCoordinatorStatus) -> String {
    switch status {
    case .ready: return "Gotowy"
    case .syncing: return "Synchronizuje"
    case .degraded: return "Ograniczony"
    case .stopped: return "Zatrzymany"
    }
}

private struct RootineHelpView: View {
    @EnvironmentObject private var environment: AppEnvironment

    var body: some View {
        List {
            Section("Najczęstsze pytania") {
                DisclosureGroup("Czy dane działają offline?") {
                    Text("Tak. Zmiany zapisują się lokalnie, a kolejka synchronizacji wysyła je po odzyskaniu połączenia.")
                        .font(.footnote)
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                }
                DisclosureGroup("Co zrobić przy konflikcie?") {
                    Text("Nie zamykaj aplikacji. Twoja lokalna kopia pozostaje bezpieczna; spróbuj synchronizacji ponownie po ustabilizowaniu sieci.")
                        .font(.footnote)
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                }
                DisclosureGroup("Jak odzyskać dane?") {
                    Text("Otwórz Profil → Kopie i odzyskiwanie. Przed importem Rootine zapisuje poprzedni stan w Recovery.")
                        .font(.footnote)
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                }
            }
            Section("Prywatność i warunki") {
                if let privacyURL = environment.configuration.privacyURL {
                    Link("Polityka prywatności", destination: privacyURL)
                } else {
                    Label("Polityka prywatności nie jest jeszcze skonfigurowana.", systemImage: "lock.shield")
                        .font(.footnote)
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                }
                if let termsURL = environment.configuration.termsURL {
                    Link("Warunki korzystania", destination: termsURL)
                } else {
                    Label("Warunki korzystania nie są jeszcze skonfigurowane.", systemImage: "doc.text")
                        .font(.footnote)
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                }
            }
        }
        .navigationTitle("Pomoc i prywatność")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct RootineDataCenterView: View {
    @EnvironmentObject private var environment: AppEnvironment
    @State private var exportDocument = RootineJSONDocument()
    @State private var isExporting = false
    @State private var isImporting = false
    @State private var isConfirmingClear = false
    @State private var isConfirmingRestore = false
    @State private var restoreCandidate: WorkspaceRecoveryFile?
    @State private var errorMessage: String?

    var body: some View {
        List {
            Section("Kopia danych") {
                Text("Eksport zawiera wszystkie lokalne workspace’y w jednym pliku JSON. Przed importem bieżący stan zostaje zachowany w Recovery.")
                    .font(.footnote)
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                Button {
                    do {
                        exportDocument = try RootineJSONDocument(data: environment.exportWorkspaceArchive())
                        isExporting = true
                    } catch {
                        errorMessage = "Nie udało się przygotować kopii: \(error.localizedDescription)"
                    }
                } label: {
                    Label("Eksportuj kopię JSON", systemImage: "square.and.arrow.up")
                        .frame(minHeight: 44, alignment: .leading)
                }
                Button { isImporting = true } label: {
                    Label("Importuj kopię JSON", systemImage: "square.and.arrow.down")
                        .frame(minHeight: 44, alignment: .leading)
                }
                .disabled(environment.isWorking)
                if environment.isImportingWorkspace {
                    HStack(spacing: RootineTheme.Spacing.small) {
                        ProgressView()
                        Text("Import trwa — zapisy są chwilowo wstrzymane")
                            .font(.footnote)
                            .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("Import danych trwa, zapisy są chwilowo wstrzymane")
                }
            }
            Section("Recovery") {
                if environment.recoveryFiles.isEmpty {
                    Label("Brak lokalnych kopii odzyskiwania", systemImage: "checkmark.shield")
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                } else {
                    ForEach(environment.recoveryFiles, id: \.name) { file in
                        HStack(spacing: RootineTheme.Spacing.small) {
                            Image(systemName: "doc.badge.clock")
                                .foregroundStyle(RootineTheme.ColorToken.warning)
                            Text(file.name)
                                .font(.caption)
                                .lineLimit(2)
                            Spacer()
                            if file.isRestorable {
                                Button {
                                    restoreCandidate = file
                                    isConfirmingRestore = true
                                } label: {
                                    Image(systemName: "arrow.counterclockwise")
                                        .frame(width: 44, height: 44)
                                }
                                .buttonStyle(.plain)
                                .foregroundStyle(RootineTheme.ColorToken.action)
                                .accessibilityLabel("Przywróć kopię \(file.name)")
                            } else {
                                Label("Diagnostyka", systemImage: "stethoscope")
                                    .font(.caption2)
                                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                                    .accessibilityHint("Plik pomocniczy dla wsparcia; nie można go przywrócić jako kopii danych.")
                            }
                            Button(role: .destructive) {
                                Task { await environment.deleteRecoveryFile(file) }
                            } label: {
                                Image(systemName: "trash")
                                    .frame(width: 44, height: 44)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Usuń kopię \(file.name)")
                        }
                    }
                }
            }
            Section {
                Button("Usuń dane lokalne i wyloguj", role: .destructive) {
                    isConfirmingClear = true
                }
                .frame(minHeight: 44, alignment: .leading)
            } footer: {
                Text("Ta akcja usuwa lokalne kopie dla bieżącego konta. Użyj eksportu, jeśli chcesz zachować dane.")
            }
            if let errorMessage {
                Section {
                    Label(errorMessage, systemImage: "exclamationmark.triangle")
                        .foregroundStyle(RootineTheme.ColorToken.destructive)
                }
            }
        }
        .navigationTitle("Kopie i odzyskiwanie")
        .navigationBarTitleDisplayMode(.inline)
        .task { await environment.refreshRecoveryFiles() }
        .fileExporter(
            isPresented: $isExporting,
            document: exportDocument,
            contentType: .json,
            defaultFilename: "rootine-backup-\(RootineDate.localDate())"
        ) { result in
            if case .failure(let error) = result {
                errorMessage = "Eksport nie został zapisany: \(error.localizedDescription)"
            }
        }
        .fileImporter(isPresented: $isImporting, allowedContentTypes: [.json], allowsMultipleSelection: false) { result in
            guard case .success(let urls) = result, let url = urls.first else { return }
            let accessed = url.startAccessingSecurityScopedResource()
            defer { if accessed { url.stopAccessingSecurityScopedResource() } }
            do {
                let data = try Data(contentsOf: url)
                Task {
                    do {
                        try await environment.importWorkspaceArchive(data)
                    } catch {
                        errorMessage = "Import nieudany: \(error.localizedDescription)"
                    }
                }
            } catch {
                errorMessage = "Nie udało się odczytać pliku: \(error.localizedDescription)"
            }
        }
        // Keep the current screen visible while an import runs, but do not
        // allow recovery/delete/export actions to interleave with its
        // transaction. The progress row above remains visible and voiced.
        .disabled(environment.isWorking)
        .confirmationDialog("Usunąć lokalne dane?", isPresented: $isConfirmingClear, titleVisibility: .visible) {
            Button("Usuń i wyloguj", role: .destructive) {
                Task {
                    do {
                        try await environment.clearLocalDataAndSignOut()
                    } catch {
                        errorMessage = "Nie udało się usunąć danych: \(error.localizedDescription)"
                    }
                }
            }
            Button("Anuluj", role: .cancel) {}
        } message: {
            Text("Ta operacja jest nieodwracalna bez wcześniej zapisanej kopii.")
        }
        .confirmationDialog(
            "Przywrócić kopię danych?",
            isPresented: $isConfirmingRestore,
            titleVisibility: .visible
        ) {
            Button("Przywróć i zastąp dane", role: .destructive) {
                guard let restoreCandidate else { return }
                Task {
                    do {
                        try await environment.restoreRecoveryFile(restoreCandidate)
                    } catch {
                        errorMessage = "Nie udało się przywrócić kopii: \(error.localizedDescription)"
                    }
                }
            }
            Button("Anuluj", role: .cancel) {}
        } message: {
            Text(restoreCandidate.map { "Zostanie przywrócony plik \($0.name). Bieżący stan trafi najpierw do Recovery." } ?? "")
        }
    }
}

private struct RootineJSONDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.json] }
    static var writableContentTypes: [UTType] { [.json] }

    var data: Data

    init(data: Data = Data()) {
        self.data = data
    }

    init(configuration: ReadConfiguration) throws {
        data = configuration.file.regularFileContents ?? Data()
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: data)
    }
}

private struct RootinePlaceholderView: View {
    let title: String
    let systemImage: String

    var body: some View {
        ContentUnavailableView {
            Label(title, systemImage: systemImage)
        } description: {
            Text("Ten ekran dołączy do kolejnego etapu natywnej aplikacji.")
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.large)
    }
}
