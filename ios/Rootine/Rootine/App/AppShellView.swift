import SwiftUI

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
            } else if environment.isWorking {
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
    }
}

/// Native product shell. Each tab owns its navigation stack so feature details
/// can be added without changing the root navigation contract.
struct RootineMainView: View {
    @EnvironmentObject private var environment: AppEnvironment
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
        ZStack(alignment: .bottom) {
            Group {
                switch selection {
                case .today:
                    NavigationStack { TodayView() }
                case .tasks:
                    NavigationStack { TasksView() }
                case .calendar:
                    NavigationStack { CalendarView() }
                case .nutrition:
                    NavigationStack { NutritionView() }
                case .more:
                    NavigationStack {
                        if let module = RootineMainView.initialModule {
                            MoreModuleView(module: module)
                        } else {
                            MoreLandingView()
                        }
                    }
                }
            }
            // NavigationStack can extend through the bottom safe area. Reserve
            // the bar's visual height explicitly so scroll content never sits
            // underneath it.
            .padding(.bottom, 96)

            RootineBottomBar(selection: $selection) {
                isShowingQuickAdd = true
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .transition(.opacity)
        .background(RootineTheme.ColorToken.canvas.ignoresSafeArea())
        .tint(RootineTheme.ColorToken.action)
        .animation(.easeInOut(duration: 0.28), value: selection)
        .sheet(isPresented: $isShowingQuickAdd) {
            QuickAddSheet()
                .presentationDetents([.medium])
        }
    }
}

private struct RootineBottomBar: View {
    @Binding var selection: RootineTab
    let onAdd: () -> Void

    var body: some View {
        HStack(spacing: 0) {
            ForEach(RootineTab.allCases) { tab in
                RootineBottomTabItem(tab: tab, selection: $selection)
            }

            Button(action: onAdd) {
                VStack(spacing: 4) {
                    Image(systemName: "plus.circle.fill")
                        .font(.system(size: 20, weight: .semibold))
                    Text("Dodaj")
                        .font(.system(size: 9.5, weight: .semibold))
                        .lineLimit(1)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 7)
                .foregroundStyle(RootineTheme.ColorToken.action)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .frame(minWidth: 0, maxWidth: .infinity)
            .accessibilityLabel("Dodaj")
        }
        .padding(.horizontal, 5)
        .padding(.vertical, 7)
        .background(.ultraThinMaterial)
        .background(RootineTheme.ColorToken.surface.opacity(0.92))
        .clipShape(Capsule())
        .overlay {
            Capsule().stroke(RootineTheme.ColorToken.separator, lineWidth: 1)
        }
        .padding(.horizontal, 10)
        .padding(.bottom, 6)
    }
}

private struct RootineBottomTabItem: View {
    let tab: RootineTab
    @Binding var selection: RootineTab

    var body: some View {
        Button {
            withAnimation(.easeInOut(duration: 0.22)) {
                selection = tab
            }
        } label: {
            VStack(spacing: 4) {
                Image(systemName: tab.systemImage)
                    .font(.system(size: 19, weight: .semibold))
                Text(tab.label)
                    .font(.system(size: 9.5, weight: .semibold))
                    .lineLimit(1)
                    .allowsTightening(true)
                    .minimumScaleFactor(0.52)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 7)
            .foregroundStyle(selection == tab ? RootineTheme.ColorToken.action : RootineTheme.ColorToken.primaryText)
            .background(selection == tab ? RootineTheme.ColorToken.action.opacity(0.16) : .clear)
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .frame(minWidth: 0, maxWidth: .infinity)
        .accessibilityAddTraits(selection == tab ? .isSelected : [])
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
        .preferredColorScheme(.dark)
    }
}

private struct MoreLandingView: View {
    @EnvironmentObject private var environment: AppEnvironment
    @State private var isShowingAccount = false
    @State private var hasAppeared = false

    private var activeTasks: Int {
        environment.taskWorkspace.tasks.filter { $0.deleted != true && !$0.done }.count
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
            withAnimation(.easeOut(duration: 0.42)) { hasAppeared = true }
        }
        .sheet(isPresented: $isShowingAccount) {
            MoreAccountSheet()
                .presentationDetents([.medium])
                .presentationDragIndicator(.visible)
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

    var id: String { rawValue }
    var title: String {
        switch self {
        case .notes: return "Notatki"
        case .sport: return "Sport"
        case .goals: return "Cele"
        case .work: return "Praca"
        case .travel: return "Podróże"
        case .health: return "Zdrowie"
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
        }
    }

    var tint: Color {
        switch self {
        case .notes: return Color(red: 0.52, green: 0.58, blue: 1.0)
        case .sport: return Color(red: 0.34, green: 0.82, blue: 0.64)
        case .goals: return Color(red: 1.0, green: 0.67, blue: 0.30)
        case .work: return Color(red: 0.44, green: 0.70, blue: 1.0)
        case .travel: return Color(red: 0.72, green: 0.56, blue: 1.0)
        case .health: return Color(red: 1.0, green: 0.40, blue: 0.48)
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
        .preferredColorScheme(.dark)
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
