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
                await environment.start()
            }
#else
            await environment.start()
#endif
        }
        .onOpenURL { url in
            Task { await environment.receiveAuthCallback(url) }
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active, !isPreviewLaunch else { return }
            Task { await environment.refreshActiveSession() }
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

    var body: some View {
        List {
            Section("Konto") {
                LabeledContent("E-mail", value: environment.session?.user.email ?? "Nie podano")
                LabeledContent("Identyfikator", value: environment.session?.user.id ?? "Lokalnie")
            }
            Section("Połączenie") {
                ConfigurationStatusRow(title: "Logowanie", ready: environment.configuration.isAuthComplete)
                ConfigurationStatusRow(title: "Backend danych", ready: environment.configuration.isComplete)
                if let refreshed = environment.realtimeLastRefresh {
                    LabeledContent("Ostatnie uzgodnienie", value: refreshed.formatted(date: .omitted, time: .shortened))
                }
            }
            Section {
                Text("Rootine zapisuje zmiany lokalnie i synchronizuje je dopiero po potwierdzeniu sesji. Brak sieci nie blokuje pracy.")
                    .font(.footnote)
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
            }
        }
        .navigationTitle("Profil")
        .navigationBarTitleDisplayMode(.inline)
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
    @AppStorage("rootine.appearance") private var appearance = "system"

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
            Section("Zachowanie") {
                Label("Aplikacja respektuje Reduce Motion i Dynamic Type ustawione w systemie.", systemImage: "accessibility")
                    .font(.footnote)
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                Label("Wszystkie akcje dotykowe mają co najmniej 44 punkty.", systemImage: "hand.tap")
                    .font(.footnote)
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
            }
            Section("Dane") {
                Text("Kopie, import, eksport i pliki odzyskiwania są dostępne w sekcji „Kopie i odzyskiwanie” w profilu.")
                    .font(.footnote)
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
            }
        }
        .navigationTitle("Ustawienia")
        .navigationBarTitleDisplayMode(.inline)
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
