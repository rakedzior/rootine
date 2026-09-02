import SwiftUI
import AVFoundation
import UIKit

/// Daily nutrition is deliberately a quick log, not a spreadsheet. The first
/// screen answers "how am I doing?" and keeps the next useful action within one
/// tap. The detailed input remains in a native sheet so keyboard focus and
/// dismissal follow the system conventions.
struct NutritionView: View {
    @EnvironmentObject private var environment: AppEnvironment
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @State private var selectedDate = Date()
    @State private var selectedMeal: NutritionMealKind = .breakfast
    @State private var isShowingAddEntry = false
    @State private var editorTarget: NutritionEditorTarget?
    @State private var hasAppeared = false
    @State private var entryToDelete: DeletedNutritionEntry?
    @State private var deletedEntry: DeletedNutritionEntry?
    @State private var resolvedBarcodeRequest: NutritionBarcodeRequest?

    private var dateKey: String { RootineDate.localDate(selectedDate) }
    private var day: NutritionDay {
        environment.nutritionWorkspace.days[dateKey] ?? .empty(date: dateKey)
    }
    private var goals: NutritionGoals { environment.nutritionWorkspace.goals }
    private var entries: [NutritionEntry] {
        day.entries.breakfast + day.entries.lunch + day.entries.snack + day.entries.dinner
    }
    private var calories: Double { entries.reduce(0) { $0 + $1.calories } }
    private var protein: Double { entries.reduce(0) { $0 + $1.protein } }
    private var carbs: Double { entries.reduce(0) { $0 + $1.carbs } }
    private var fat: Double { entries.reduce(0) { $0 + $1.fat } }
    private var calorieDelta: Double { goals.calories - calories }

    var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            LazyVStack(alignment: .leading, spacing: RootineTheme.Spacing.large) {
                NutritionDateRail(date: $selectedDate)
                    .transition(.move(edge: .top).combined(with: .opacity))

                if case .localOnly = environment.workspaceSyncStatus {
                    RootineOfflineBanner(message: "Dane są zapisane na tym iPhonie. Synchronizacja wróci online automatycznie.")
                } else if case .conflict = environment.workspaceSyncStatus {
                    RootineOfflineBanner(message: "Wykryto konflikt synchronizacji. Twoje lokalne wpisy są bezpieczne.")
                }

                if let pendingBarcodes = environment.nutritionWorkspace.pendingBarcodeLookups,
                   !pendingBarcodes.isEmpty {
                    let resolved = pendingBarcodes.filter { $0.resolvedProduct != nil }
                    let waiting = pendingBarcodes.filter { $0.resolvedProduct == nil }
                    if !resolved.isEmpty {
                        resolvedBarcodeSection(resolved)
                    }
                    if !waiting.isEmpty {
                        RootineOfflineBanner(
                            message: waiting.count == 1
                                ? "Kod produktu zapisany lokalnie. Ponowimy wyszukiwanie po połączeniu."
                                : "\(waiting.count) kody produktów zapisane lokalnie. Ponowimy wyszukiwanie po połączeniu."
                        )
                    }
                }

                NutritionSummaryCard(
                    calories: calories,
                    calorieDelta: calorieDelta,
                    goals: goals,
                    protein: protein,
                    carbs: carbs,
                    fat: fat
                )
                .offset(y: hasAppeared ? 0 : 12)
                .opacity(hasAppeared ? 1 : 0)

                RootinePrimaryButton("Dodaj produkt", systemImage: "plus", isWorking: environment.isWorking) {
                    selectedMeal = suggestedMeal
                    isShowingAddEntry = true
                }
                .frame(minHeight: 48)
                .accessibilityHint("Otwiera katalog produktów i formularz ręcznego wpisu")

                NutritionWaterCard(
                    current: day.waterMl,
                    goal: goals.waterMl,
                    onChange: { amount in
                        performAnimated {
                            _Concurrency.Task<Void, Never> {
                                await environment.addWater(dateKey: dateKey, amountMl: amount)
                            }
                        }
                    }
                )
                .offset(y: hasAppeared ? 0 : 18)
                .opacity(hasAppeared ? 1 : 0)

                NutritionQuickLinks(goals: goals, calories: calories, water: day.waterMl, dateKey: dateKey, meal: selectedMeal)

                VStack(alignment: .leading, spacing: RootineTheme.Spacing.small) {
                    HStack(alignment: .firstTextBaseline) {
                        Text("Dziennik posiłków")
                            .font(.title3.weight(.bold))
                        Spacer(minLength: RootineTheme.Spacing.small)
                        Text("\(entries.count) \(entries.count == 1 ? "wpis" : "wpisów")")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    }

                    ForEach(Array(NutritionMealKind.allCases.enumerated()), id: \.element.id) { index, meal in
                        NutritionMealCard(
                            meal: meal,
                            entries: entries(for: meal),
                            onAdd: {
                                selectedMeal = meal
                                isShowingAddEntry = true
                            },
                            onDelete: { entry in
                                requestDelete(entry: entry, from: meal)
                            },
                            onEdit: { entry in
                                editorTarget = NutritionEditorTarget(dateKey: dateKey, meal: meal, entry: entry)
                            }
                        )
                        .offset(y: hasAppeared ? 0 : CGFloat(24 + index * 6))
                        .opacity(hasAppeared ? 1 : 0)
                    }
                }

                RootineSecondaryButton(
                    day.closedAt == nil ? "Zamknij dzień" : "Otwórz dzień ponownie",
                    systemImage: day.closedAt == nil ? "checkmark.seal" : "arrow.uturn.backward"
                ) {
                    performAnimated {
                        _Concurrency.Task<Void, Never> {
                            await environment.toggleNutritionDayClosed(dateKey: dateKey)
                        }
                    }
                }
                .tint(day.closedAt == nil ? RootineTheme.ColorToken.action : RootineTheme.ColorToken.success)
                .frame(maxWidth: .infinity, minHeight: 48)
            }
            .padding(.horizontal, RootineTheme.Spacing.medium)
            .padding(.top, RootineTheme.Spacing.small)
            .padding(.bottom, RootineTheme.Spacing.xLarge)
        }
        .scrollIndicators(.hidden)
        .background(RootineTheme.ColorToken.canvas.ignoresSafeArea())
        .overlay(alignment: .bottom) {
            if let deletedEntry {
                RootineUndoBanner(message: "Usunięto \(deletedEntry.entry.name)") {
                    undoDelete(deletedEntry)
                }
                .padding(.horizontal, RootineTheme.Spacing.medium)
                .padding(.bottom, RootineTheme.Spacing.small)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .onAppear {
            if reduceMotion {
                hasAppeared = true
            } else {
                withAnimation(.easeOut(duration: 0.42)) { hasAppeared = true }
            }
        }
        .task {
            await environment.retryPendingNutritionBarcodes()
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            Task { await environment.retryPendingNutritionBarcodes() }
        }
        .sheet(isPresented: $isShowingAddEntry, onDismiss: {
            resolvedBarcodeRequest = nil
        }) {
            AddNutritionEntrySheet(
                dateKey: dateKey,
                meal: selectedMeal,
                existingEntry: nil,
                prefilledProduct: resolvedBarcodeRequest?.resolvedProduct,
                barcodeToConsume: resolvedBarcodeRequest?.barcode
            )
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
        }
        .sheet(item: $editorTarget) { target in
            AddNutritionEntrySheet(dateKey: target.dateKey, meal: target.meal, existingEntry: target.entry)
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
        }
        .confirmationDialog(
            "Usunąć wpis?",
            isPresented: Binding(
                get: { entryToDelete != nil },
                set: { isPresented in
                    if !isPresented { entryToDelete = nil }
                }
            ),
            titleVisibility: .visible
        ) {
            if let entryToDelete {
                Button("Usuń wpis", role: .destructive) {
                    delete(entry: entryToDelete.entry, from: entryToDelete.meal)
                    self.entryToDelete = nil
                }
            }
            Button("Anuluj", role: .cancel) {}
        }
    }

    private var suggestedMeal: NutritionMealKind {
        let hour = Calendar.current.component(.hour, from: Date())
        switch hour {
        case 5..<11: return .breakfast
        case 11..<15: return .lunch
        case 15..<19: return .snack
        default: return .dinner
        }
    }

    private func resolvedBarcodeSection(_ requests: [NutritionBarcodeRequest]) -> some View {
        VStack(alignment: .leading, spacing: RootineTheme.Spacing.small) {
            Label("Produkty znalezione po skanowaniu", systemImage: "barcode.viewfinder")
                .font(.headline)
                .foregroundStyle(RootineTheme.ColorToken.primaryText)

            ForEach(requests) { request in
                if let product = request.resolvedProduct {
                    Button {
                        selectedMeal = suggestedMeal
                        resolvedBarcodeRequest = request
                        isShowingAddEntry = true
                    } label: {
                        HStack(spacing: RootineTheme.Spacing.small) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(product.name)
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(RootineTheme.ColorToken.primaryText)
                                Text("Kod \(request.barcode) · gotowy do dodania")
                                    .font(.caption)
                                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                            }
                            Spacer(minLength: RootineTheme.Spacing.small)
                            Label("Dodaj", systemImage: "plus.circle.fill")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(RootineTheme.ColorToken.action)
                        }
                        .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Dodaj znaleziony produkt: \(product.name)")
                    .accessibilityHint("Otwiera formularz z zachowaną porcją i wartościami produktu")
                }
            }
        }
        .padding(RootineTheme.Spacing.medium)
        .rootineSurface()
    }

    private func entries(for meal: NutritionMealKind) -> [NutritionEntry] {
        switch meal {
        case .breakfast: return day.entries.breakfast
        case .lunch: return day.entries.lunch
        case .snack: return day.entries.snack
        case .dinner: return day.entries.dinner
        }
    }

    private func performAnimated(_ action: () -> Void) {
        if reduceMotion {
            action()
        } else {
            withAnimation(.spring(response: 0.35, dampingFraction: 0.82)) { action() }
        }
    }

    private func delete(entry: NutritionEntry, from meal: NutritionMealKind) {
        deletedEntry = DeletedNutritionEntry(entry: entry, meal: meal, dateKey: dateKey)
        performAnimated {
            _Concurrency.Task<Void, Never> {
                await environment.deleteNutritionEntry(dateKey: dateKey, meal: meal.rawValue, id: entry.id)
            }
        }
    }

    private func requestDelete(entry: NutritionEntry, from meal: NutritionMealKind) {
        entryToDelete = DeletedNutritionEntry(entry: entry, meal: meal, dateKey: dateKey)
    }

    private func undoDelete(_ deleted: DeletedNutritionEntry) {
        self.deletedEntry = nil
        _Concurrency.Task<Void, Never> {
            await environment.restoreNutritionEntry(
                dateKey: deleted.dateKey,
                meal: deleted.meal.rawValue,
                entry: deleted.entry
            )
        }
    }
}

private struct DeletedNutritionEntry: Identifiable {
    let entry: NutritionEntry
    let meal: NutritionMealKind
    let dateKey: String
    var id: String { entry.id }
}

private struct NutritionEditorTarget: Identifiable {
    let dateKey: String
    let meal: NutritionMealKind
    let entry: NutritionEntry

    var id: String { "\(dateKey)-\(meal.rawValue)-\(entry.id)" }
}

private struct NutritionDateRail: View {
    @Binding var date: Date

    var body: some View {
        HStack(spacing: RootineTheme.Spacing.small) {
            Button { shift(-1) } label: {
                Image(systemName: "chevron.left")
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.borderless)
            .accessibilityLabel("Poprzedni dzień")

            DatePicker("Dzień", selection: $date, displayedComponents: .date)
                .datePickerStyle(.compact)
                .labelsHidden()
                .frame(maxWidth: .infinity)
                .accessibilityLabel("Wybrany dzień")

            Button { shift(1) } label: {
                Image(systemName: "chevron.right")
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.borderless)
            .accessibilityLabel("Następny dzień")
        }
        .font(.headline)
        .foregroundStyle(RootineTheme.ColorToken.primaryText)
        .padding(.horizontal, RootineTheme.Spacing.small)
        .rootineSurface()
    }

    private func shift(_ days: Int) {
        date = Calendar.current.date(byAdding: .day, value: days, to: date) ?? date
    }
}

private struct NutritionSummaryCard: View {
    let calories: Double
    let calorieDelta: Double
    let goals: NutritionGoals
    let protein: Double
    let carbs: Double
    let fat: Double

    private var calorieProgress: Double {
        min(1, goals.calories > 0 ? calories / goals.calories : 0)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: RootineTheme.Spacing.medium) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: RootineTheme.Spacing.xSmall) {
                    Text("Bilans dnia")
                        .font(.headline)
                    Text("\(Int(calories.rounded())) kcal")
                        .font(.largeTitle.weight(.bold))
                        .monospacedDigit()
                        .contentTransition(.numericText())
                    Text(calorieStatusText)
                        .font(.subheadline)
                        .foregroundStyle(calorieStatusColor)
                }
                Spacer(minLength: RootineTheme.Spacing.medium)
                VStack(alignment: .trailing, spacing: RootineTheme.Spacing.xSmall) {
                    Text("Cel")
                        .font(.caption)
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    Text("\(Int(goals.calories.rounded())) kcal")
                        .font(.subheadline.weight(.semibold))
                    Text("\(Int(calorieProgress * 100))%")
                        .font(.title3.weight(.bold))
                        .foregroundStyle(RootineTheme.ColorToken.action)
                }
            }

            ProgressView(value: calorieProgress)
                .tint(calorieDelta < 0 ? RootineTheme.ColorToken.warning : RootineTheme.ColorToken.action)
                .accessibilityLabel("Realizacja celu kalorii")
                .accessibilityValue(calorieStatusText)

            ViewThatFits(in: .horizontal) {
                HStack(spacing: RootineTheme.Spacing.small) {
                    MacroValue(label: "Białko", value: protein, goal: goals.protein, tint: RootineTheme.ColorToken.success)
                    MacroValue(label: "Węgle", value: carbs, goal: goals.carbs, tint: RootineTheme.ColorToken.warning)
                    MacroValue(label: "Tłuszcz", value: fat, goal: goals.fat, tint: RootineTheme.ColorToken.action)
                }
                VStack(alignment: .leading, spacing: RootineTheme.Spacing.small) {
                    HStack {
                        MacroValue(label: "Białko", value: protein, goal: goals.protein, tint: RootineTheme.ColorToken.success)
                        MacroValue(label: "Węgle", value: carbs, goal: goals.carbs, tint: RootineTheme.ColorToken.warning)
                    }
                    HStack {
                        MacroValue(label: "Tłuszcz", value: fat, goal: goals.fat, tint: RootineTheme.ColorToken.action)
                        Spacer()
                    }
                }
            }
        }
        .foregroundStyle(RootineTheme.ColorToken.primaryText)
        .rootineSurface()
    }

    private var calorieStatusText: String {
        if calorieDelta > 0 { return "Pozostało \(Int(calorieDelta.rounded())) kcal" }
        if calorieDelta == 0 { return "Cel kalorii osiągnięty" }
        return "Przekroczono o \(Int(abs(calorieDelta).rounded())) kcal"
    }

    private var calorieStatusColor: Color {
        if calorieDelta < 0 { return RootineTheme.ColorToken.warning }
        if calorieDelta == 0 { return RootineTheme.ColorToken.success }
        return RootineTheme.ColorToken.secondaryText
    }
}

private struct MacroValue: View {
    let label: String
    let value: Double
    let goal: Double
    let tint: Color

    var body: some View {
        VStack(alignment: .leading, spacing: RootineTheme.Spacing.xSmall) {
            Text(label)
                .font(.caption)
                .foregroundStyle(RootineTheme.ColorToken.secondaryText)
            Text("\(Int(value.rounded())) g")
                .font(.subheadline.weight(.semibold))
                .monospacedDigit()
            Text("z \(Int(goal.rounded()))")
                .font(.caption2)
                .foregroundStyle(tint)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(label), \(Int(value.rounded())) gramów z \(Int(goal.rounded()))")
    }
}

private struct NutritionWaterCard: View {
    let current: Double
    let goal: Double
    let onChange: (Double) -> Void

    private var progress: Double { min(1, goal > 0 ? current / goal : 0) }

    var body: some View {
        VStack(alignment: .leading, spacing: RootineTheme.Spacing.medium) {
            HStack(alignment: .firstTextBaseline) {
                Label("Woda", systemImage: "drop.fill")
                    .font(.headline)
                Spacer(minLength: RootineTheme.Spacing.small)
                Text("\(Int(current.rounded())) / \(Int(goal.rounded())) ml")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(RootineTheme.ColorToken.action)
                    .monospacedDigit()
                    .contentTransition(.numericText())
            }

            ProgressView(value: progress)
                .tint(RootineTheme.ColorToken.action)
                .accessibilityLabel("Realizacja celu wody")
                .accessibilityValue("\(Int(progress * 100)) procent")

            ViewThatFits(in: .horizontal) {
                HStack(spacing: RootineTheme.Spacing.small) { actionButtons }
                VStack(spacing: RootineTheme.Spacing.small) { actionButtons }
            }
        }
        .foregroundStyle(RootineTheme.ColorToken.primaryText)
        .rootineSurface()
    }

    @ViewBuilder
    private var actionButtons: some View {
        ForEach([250.0, 500.0, 750.0], id: \.self) { amount in
            Button("+\(Int(amount)) ml") { onChange(amount) }
                .font(.subheadline.weight(.semibold))
                .frame(maxWidth: .infinity, minHeight: 44)
                .background(RootineTheme.ColorToken.elevated)
                .clipShape(RoundedRectangle(cornerRadius: RootineTheme.Radius.control, style: .continuous))
                .accessibilityHint("Dodaje \(Int(amount)) mililitrów")
        }
        Button { onChange(-250) } label: {
            Image(systemName: "minus")
                .frame(minWidth: 44, minHeight: 44)
        }
        .buttonStyle(.bordered)
        .tint(RootineTheme.ColorToken.secondaryText)
        .accessibilityLabel("Odejmij 250 ml")
    }
}

private struct NutritionQuickLinks: View {
    let goals: NutritionGoals
    let calories: Double
    let water: Double
    let dateKey: String
    let meal: NutritionMealKind

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: RootineTheme.Spacing.small) { links }
            VStack(spacing: RootineTheme.Spacing.small) { links }
        }
    }

    @ViewBuilder
    private var links: some View {
        NavigationLink {
            NutritionGoalsView(goals: goals)
        } label: {
            Label("Cele", systemImage: "target")
                .frame(maxWidth: .infinity, minHeight: 44)
        }
        .buttonStyle(.bordered)
        .tint(RootineTheme.ColorToken.success)

        NavigationLink {
            NutritionAnalysisView(goals: goals, calories: calories, water: water)
        } label: {
            Label("Analiza", systemImage: "chart.bar.xaxis")
                .frame(maxWidth: .infinity, minHeight: 44)
        }
        .buttonStyle(.bordered)
        .tint(RootineTheme.ColorToken.action)

        NavigationLink {
            NutritionCustomMealsView(dateKey: dateKey, meal: meal)
        } label: {
            Label("Własne posiłki", systemImage: "fork.knife.circle")
                .frame(maxWidth: .infinity, minHeight: 44)
        }
        .buttonStyle(.bordered)
        .tint(RootineTheme.ColorToken.warning)
    }
}

private struct NutritionGoalsView: View {
    @EnvironmentObject private var environment: AppEnvironment
    let goals: NutritionGoals
    @State private var calories: String
    @State private var protein: String
    @State private var carbs: String
    @State private var fat: String
    @State private var water: String

    init(goals: NutritionGoals) {
        self.goals = goals
        _calories = State(initialValue: String(Int(goals.calories.rounded())))
        _protein = State(initialValue: String(Int(goals.protein.rounded())))
        _carbs = State(initialValue: String(Int(goals.carbs.rounded())))
        _fat = State(initialValue: String(Int(goals.fat.rounded())))
        _water = State(initialValue: String(Int(goals.waterMl.rounded())))
    }

    var body: some View {
        Form {
            Section("Dzisiejsze cele") {
                numericGoalField("Kalorie", text: $calories, unit: "kcal", image: "flame.fill", tint: RootineTheme.ColorToken.action)
                numericGoalField("Białko", text: $protein, unit: "g", image: "bolt.fill", tint: RootineTheme.ColorToken.success)
                numericGoalField("Węglowodany", text: $carbs, unit: "g", image: "leaf.fill", tint: RootineTheme.ColorToken.warning)
                numericGoalField("Tłuszcz", text: $fat, unit: "g", image: "drop.fill", tint: RootineTheme.ColorToken.action)
                numericGoalField("Woda", text: $water, unit: "ml", image: "drop.circle.fill", tint: RootineTheme.ColorToken.action)
            }
            Section {
                Button("Zapisz cele") {
                    Task {
                        await environment.updateNutritionGoals(
                            NutritionGoals(
                                calories: number(calories),
                                protein: number(protein),
                                carbs: number(carbs),
                                fat: number(fat),
                                waterMl: number(water)
                            )
                        )
                    }
                }
            }
        }
        .navigationTitle("Cele żywieniowe")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func numericGoalField(_ title: String, text: Binding<String>, unit: String, image: String, tint: Color) -> some View {
        HStack {
            Label(title, systemImage: image)
                .foregroundStyle(tint)
            Spacer()
            TextField(unit, text: text)
                .multilineTextAlignment(.trailing)
                .keyboardType(.decimalPad)
                .frame(width: 92)
                .monospacedDigit()
        }
    }

    private func number(_ value: String) -> Double {
        max(0, Double(value.replacingOccurrences(of: ",", with: ".")) ?? 0)
    }
}

private struct NutritionAnalysisView: View {
    @EnvironmentObject private var environment: AppEnvironment
    let goals: NutritionGoals
    let calories: Double
    let water: Double
    @State private var isShowingWeightEntry = false

    var body: some View {
        List {
            Section("Dzisiaj") {
                analysisRow(title: "Kalorie", current: calories, goal: goals.calories, unit: "kcal")
                analysisRow(title: "Woda", current: water, goal: goals.waterMl, unit: "ml")
            }
            Section("Masa ciała") {
                if environment.nutritionWorkspace.weightMeasurements.isEmpty {
                    Text("Dodaj pierwszy pomiar, aby zobaczyć trend.")
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                } else {
                    ForEach(environment.nutritionWorkspace.weightMeasurements.values.sorted { $0.date > $1.date }, id: \.date) { measurement in
                        HStack {
                            Text(measurement.date)
                            Spacer()
                            Text("\(measurement.weightKg, specifier: "%.1f") kg")
                                .font(.subheadline.weight(.semibold))
                                .monospacedDigit()
                        }
                    }
                }
                Button {
                    isShowingWeightEntry = true
                } label: {
                    Label("Dodaj pomiar masy", systemImage: "scalemass")
                }
            }
            Section("Zapisane posiłki") {
                let count = environment.nutritionWorkspace.customMeals?.count ?? 0
                Label(count == 0 ? "Brak zapisanych posiłków" : "\(count) zapisanych posiłków", systemImage: "fork.knife.circle")
            }
            Section("Jak czytać bilans") {
                Label("Trzymaj regularne porcje i wracaj do dziennika po każdym posiłku.", systemImage: "lightbulb")
                Label("Cele są orientacyjne — dopasuj je do zaleceń specjalisty.", systemImage: "info.circle")
            }
        }
        .navigationTitle("Analiza")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $isShowingWeightEntry) {
            WeightMeasurementSheet { weight, date, note in
                Task { await environment.addWeightMeasurement(weightKg: weight, dateKey: date, note: note) }
            }
            .presentationDetents([.medium])
        }
    }

    private func analysisRow(title: String, current: Double, goal: Double, unit: String) -> some View {
        let progress = goal > 0 ? min(1, current / goal) : 0
        return VStack(alignment: .leading, spacing: RootineTheme.Spacing.small) {
            HStack {
                Text(title)
                Spacer()
                Text("\(Int(current.rounded())) / \(Int(goal.rounded())) \(unit)")
                    .font(.subheadline.weight(.semibold))
                    .monospacedDigit()
            }
            ProgressView(value: progress)
                .tint(RootineTheme.ColorToken.action)
        }
        .padding(.vertical, RootineTheme.Spacing.xSmall)
    }
}

private struct WeightMeasurementSheet: View {
    @Environment(\.dismiss) private var dismiss
    let onSave: (Double, String, String?) -> Void
    @State private var weight = ""
    @State private var date = Date()
    @State private var note = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Pomiar") {
                    TextField("Masa (kg)", text: $weight)
                        .keyboardType(.decimalPad)
                    DatePicker("Dzień", selection: $date, displayedComponents: .date)
                    TextField("Notatka (opcjonalnie)", text: $note)
                }
            }
            .navigationTitle("Nowy pomiar")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Anuluj") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Zapisz") {
                        let value = Double(weight.replacingOccurrences(of: ",", with: ".")) ?? 0
                        onSave(value, RootineDate.localDate(date), note.isEmpty ? nil : note)
                        dismiss()
                    }
                    .disabled((Double(weight.replacingOccurrences(of: ",", with: ".")) ?? 0) <= 0)
                }
            }
        }
    }
}

private struct NutritionCustomMealsView: View {
    @EnvironmentObject private var environment: AppEnvironment
    @Environment(\.dismiss) private var dismiss
    let dateKey: String
    let meal: NutritionMealKind
    @State private var isShowingEditor = false
    @State private var editorOperationID = UUID().uuidString
    @State private var mealToDelete: CustomMeal?
    @State private var isShowingDeleteDialog = false

    private var meals: [CustomMeal] {
        (environment.nutritionWorkspace.customMeals ?? []).sorted { ($0.updatedAt ?? $0.createdAt) > ($1.updatedAt ?? $1.createdAt) }
    }

    var body: some View {
        List {
            Section { introSection }
            mealSection
        }
        .navigationTitle("Własne posiłki")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    editorOperationID = UUID().uuidString
                    isShowingEditor = true
                } label: {
                    Image(systemName: "plus")
                        .frame(width: 44, height: 44)
                }
                .accessibilityLabel("Dodaj własny posiłek")
            }
        }
        .sheet(isPresented: $isShowingEditor) {
            CustomMealEditorSheet(operationID: editorOperationID) { meal in
                await environment.upsertCustomMeal(meal)
            }
            .presentationDetents([.medium, .large])
        }
        .confirmationDialog("Usunąć zapisany posiłek?", isPresented: $isShowingDeleteDialog) {
            Button("Usuń posiłek", role: .destructive) {
                guard let mealToDelete else { return }
                Task { await environment.deleteCustomMeal(id: mealToDelete.id) }
            }
            Button("Anuluj", role: .cancel) {}
        }
    }

    private var introSection: some View {
        Text("Zapisz powtarzalne posiłki raz, a potem dodawaj je do wybranego dnia jednym tapnięciem.")
            .font(.footnote)
            .foregroundStyle(RootineTheme.ColorToken.secondaryText)
    }

    @ViewBuilder
    private var mealSection: some View {
        Section("Twoje posiłki") {
            if meals.isEmpty {
                ContentUnavailableView(
                    "Brak zapisanych posiłków",
                    systemImage: "fork.knife.circle",
                    description: Text("Dodaj pierwszy posiłek z własnym składnikiem.")
                )
            } else {
                ForEach(meals, id: \.id) { customMeal in
                    mealRow(customMeal)
                }
            }
        }
    }

    private func mealRow(_ customMeal: CustomMeal) -> some View {
        HStack(spacing: RootineTheme.Spacing.small) {
            VStack(alignment: .leading, spacing: 2) {
                Text(customMeal.name)
                    .font(.subheadline.weight(.medium))
                Text("\(customMeal.ingredients.count) składników · \(mealCalories(customMeal)) kcal")
                    .font(.caption)
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
            }
            Spacer()
            Button {
                // Every deliberate tap is a journal occurrence. The
                // environment's creation gate still coalesces an in-flight
                // duplicate, while a later tap intentionally adds another
                // serving instead of silently dropping it.
                let operationID = UUID().uuidString
                Task {
                    await environment.addCustomMealToDay(
                        customMeal,
                        dateKey: dateKey,
                        mealKind: meal.rawValue,
                        operationID: operationID
                    )
                }
            } label: {
                Image(systemName: "plus.circle.fill")
                    .font(.title3)
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .foregroundStyle(RootineTheme.ColorToken.action)
            .accessibilityLabel("Dodaj \(customMeal.name) do \(meal.title)")
        }
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button(role: .destructive) {
                mealToDelete = customMeal
                isShowingDeleteDialog = true
            } label: {
                Label("Usuń", systemImage: "trash")
            }
        }
    }

    private func mealCalories(_ customMeal: CustomMeal) -> Int {
        let total = customMeal.ingredients.reduce(0.0) { partial, ingredient in
            partial + ingredient.per100g.calories * NutritionPortion.multiplier(
                amount: ingredient.amount,
                unit: ingredient.unit
            )
        }
        return Int(total.rounded())
    }
}

private struct CustomMealEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    let operationID: String
    let onSave: (CustomMeal) async -> Void
    @State private var isSaving = false
    @State private var name = ""
    @State private var ingredientName = ""
    @State private var amount = "100"
    @State private var calories = ""
    @State private var protein = ""
    @State private var carbs = ""
    @State private var fat = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Posiłek") {
                    TextField("Nazwa posiłku", text: $name)
                }
                Section("Pierwszy składnik") {
                    TextField("Nazwa składnika", text: $ingredientName)
                    TextField("Ilość (g)", text: $amount).keyboardType(.decimalPad)
                    TextField("Kalorie / 100 g", text: $calories).keyboardType(.decimalPad)
                    TextField("Białko / 100 g", text: $protein).keyboardType(.decimalPad)
                    TextField("Węglowodany / 100 g", text: $carbs).keyboardType(.decimalPad)
                    TextField("Tłuszcz / 100 g", text: $fat).keyboardType(.decimalPad)
                }
            }
            .navigationTitle("Nowy własny posiłek")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Anuluj") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Zapisz") {
                        guard !isSaving else { return }
                        let now = RootineDate.isoTimestamp()
                        let mealID = RootineLocalIdentifier.string(namespace: "custom-meal", operationID: operationID)
                        let ingredient = CustomMealIngredient(
                            id: RootineLocalIdentifier.string(namespace: "custom-meal-ingredient", operationID: "\(operationID):0"),
                            name: ingredientName.trimmingCharacters(in: .whitespacesAndNewlines),
                            brand: nil,
                            amount: number(amount),
                            unit: "g",
                            per100g: NutritionValues(calories: number(calories), protein: number(protein), carbs: number(carbs), fat: number(fat))
                        )
                        let meal = CustomMeal(id: mealID, name: name, ingredients: [ingredient], totalWeightG: number(amount), servings: 1, createdAt: now, updatedAt: now)
                        isSaving = true
                        Task {
                            await onSave(meal)
                            dismiss()
                        }
                    }
                    .disabled(
                        isSaving
                            || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                            || ingredientName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    )
                }
            }
        }
    }

    private func number(_ value: String) -> Double {
        max(0, Double(value.replacingOccurrences(of: ",", with: ".")) ?? 0)
    }
}

private enum NutritionMealKind: String, CaseIterable, Identifiable {
    case breakfast
    case lunch
    case snack
    case dinner

    var id: String { rawValue }

    var title: String {
        switch self {
        case .breakfast: return "Śniadanie"
        case .lunch: return "Obiad"
        case .snack: return "Przekąski"
        case .dinner: return "Kolacja"
        }
    }

    var systemImage: String {
        switch self {
        case .breakfast: return "sunrise.fill"
        case .lunch: return "fork.knife"
        case .snack: return "carrot.fill"
        case .dinner: return "moon.stars.fill"
        }
    }
}

private struct NutritionMealCard: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let meal: NutritionMealKind
    let entries: [NutritionEntry]
    let onAdd: () -> Void
    let onDelete: (NutritionEntry) -> Void
    let onEdit: (NutritionEntry) -> Void

    private var calories: Double { entries.reduce(0) { $0 + $1.calories } }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Label(meal.title, systemImage: meal.systemImage)
                    .font(.headline)
                Spacer(minLength: RootineTheme.Spacing.small)
                if calories > 0 {
                    Text("\(Int(calories.rounded())) kcal")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                        .monospacedDigit()
                }
                Button(action: onAdd) {
                    Image(systemName: "plus.circle.fill")
                        .font(.title3)
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(.plain)
                .foregroundStyle(RootineTheme.ColorToken.action)
                .accessibilityLabel("Dodaj do: \(meal.title)")
            }
            .padding(.bottom, RootineTheme.Spacing.xSmall)

            if entries.isEmpty {
                Button(action: onAdd) {
                    HStack(spacing: RootineTheme.Spacing.small) {
                        Image(systemName: "plus")
                        Text("Dodaj pierwszy wpis")
                        Spacer()
                        Image(systemName: "arrow.up.right")
                    }
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    .frame(minHeight: 44)
                }
                .buttonStyle(.plain)
            } else {
                ForEach(entries) { entry in
                    Button { onEdit(entry) } label: {
                        HStack(spacing: RootineTheme.Spacing.small) {
                            VStack(alignment: .leading, spacing: RootineTheme.Spacing.xSmall) {
                                Text(entry.name)
                                    .font(.body.weight(.medium))
                                    .lineLimit(2)
                                Text("\(entry.portion) · B \(Int(entry.protein.rounded())) g · W \(Int(entry.carbs.rounded())) g · T \(Int(entry.fat.rounded())) g")
                                    .font(.caption)
                                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                                    .lineLimit(2)
                            }
                            Spacer(minLength: RootineTheme.Spacing.small)
                            VStack(alignment: .trailing, spacing: 2) {
                                Text("\(Int(entry.calories.rounded()))")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                                    .monospacedDigit()
                                Image(systemName: "chevron.right")
                                    .font(.caption2.weight(.bold))
                                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                                    .accessibilityHidden(true)
                            }
                        }
                        .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Edytuj wpis: \(entry.name)")
                    .accessibilityHint("Otwiera wartości produktu i posiłek")
                    .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                        Button(role: .destructive) { onDelete(entry) } label: {
                            Label("Usuń", systemImage: "trash")
                        }
                    }
                    if entry.id != entries.last?.id {
                        Divider().overlay(RootineTheme.ColorToken.separator)
                    }
                }
            }
        }
        .foregroundStyle(RootineTheme.ColorToken.primaryText)
        .rootineSurface()
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.24), value: entries)
    }
}

private struct AddNutritionEntrySheet: View {
    @EnvironmentObject private var environment: AppEnvironment
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @FocusState private var focusedField: NutritionEntryField?
    let dateKey: String
    let meal: NutritionMealKind
    let existingEntry: NutritionEntry?
    let prefilledProduct: NutritionProduct?
    let barcodeToConsume: String?
    @State private var selectedMeal: NutritionMealKind
    @State private var query = ""
    @State private var selectedProduct: NutritionProduct?
    @State private var name = ""
    @State private var portion = "1 porcja"
    @State private var calories = ""
    @State private var protein = ""
    @State private var carbs = ""
    @State private var fat = ""
    /// Remembers the values last filled from the catalog. If the user edits
    /// any macro field afterwards, submit must preserve that deliberate
    /// override instead of silently replacing it with a catalog calculation.
    @State private var generatedNutritionValues: NutritionValues?
    @State private var pendingBarcodeToConsume: String?
    @State private var isShowingScanner = false
    @State private var scanMessage: String?
    @State private var isSaving = false
    @State private var saveOperationID: String

    init(
        dateKey: String,
        meal: NutritionMealKind,
        existingEntry: NutritionEntry? = nil,
        prefilledProduct: NutritionProduct? = nil,
        barcodeToConsume: String? = nil
    ) {
        self.dateKey = dateKey
        self.meal = meal
        self.existingEntry = existingEntry
        self.prefilledProduct = prefilledProduct
        self.barcodeToConsume = barcodeToConsume
        _selectedMeal = State(initialValue: meal)
        let catalogProduct: NutritionProduct? = existingEntry.flatMap { entry in
            guard let catalogId = entry.catalogId else { return nil }
            return NutritionCatalog.products.first { $0.id == catalogId }
        }
        let initialProduct = prefilledProduct ?? catalogProduct
        _selectedProduct = State(initialValue: initialProduct)
        _name = State(initialValue: existingEntry?.name ?? prefilledProduct?.name ?? "")
        _portion = State(
            initialValue: existingEntry?.portion
                ?? prefilledProduct.map { "\(Int($0.defaultAmount)) \($0.unit)" }
                ?? "1 porcja"
        )
        let initialValues: NutritionValues? = existingEntry.map {
            NutritionValues(calories: $0.calories, protein: $0.protein, carbs: $0.carbs, fat: $0.fat)
        } ?? prefilledProduct.map {
            let multiplier = NutritionPortion.multiplier(amount: $0.defaultAmount, unit: $0.unit)
            return NutritionValues(
                calories: $0.per100g.calories * multiplier,
                protein: $0.per100g.protein * multiplier,
                carbs: $0.per100g.carbs * multiplier,
                fat: $0.per100g.fat * multiplier
            )
        }
        _calories = State(initialValue: initialValues.map { String($0.calories) } ?? "")
        _protein = State(initialValue: initialValues.map { String($0.protein) } ?? "")
        _carbs = State(initialValue: initialValues.map { String($0.carbs) } ?? "")
        _fat = State(initialValue: initialValues.map { String($0.fat) } ?? "")
        // An existing entry may intentionally contain hand-entered macros.
        // Treat those values as authoritative until the user explicitly
        // selects a catalog product again; only a fresh catalog/prefill value
        // is eligible for automatic portion-based recalculation.
        _generatedNutritionValues = State(initialValue: existingEntry == nil ? initialValues : nil)
        _pendingBarcodeToConsume = State(initialValue: barcodeToConsume)
        _saveOperationID = State(initialValue: existingEntry?.id ?? UUID().uuidString)
    }

    private var filteredProducts: [NutritionProduct] {
        let normalized = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalized.isEmpty else { return NutritionCatalog.products }
        return NutritionCatalog.products.filter {
            $0.name.localizedCaseInsensitiveContains(normalized)
                || ($0.brand?.localizedCaseInsensitiveContains(normalized) ?? false)
        }
    }

    private var parsedPortion: NutritionPortion {
        NutritionPortion.parse(
            portion,
            fallbackAmount: selectedProduct?.defaultAmount ?? existingEntry?.amount,
            fallbackUnit: selectedProduct?.unit ?? existingEntry?.unit
        )
    }

    private var scaledNutritionValues: NutritionValues? {
        guard let base = selectedProduct?.per100g ?? existingEntry?.per100g else { return nil }
        let multiplier = NutritionPortion.multiplier(amount: parsedPortion.amount, unit: parsedPortion.unit)
        return NutritionValues(
            calories: max(0, base.calories * multiplier),
            protein: max(0, base.protein * multiplier),
            carbs: max(0, base.carbs * multiplier),
            fat: max(0, base.fat * multiplier)
        )
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Szukaj produktu", text: $query)
                        .focused($focusedField, equals: .search)
                        .textInputAutocapitalization(.never)
                        .accessibilityLabel("Szukaj w katalogu produktów")

                    if filteredProducts.isEmpty {
                        Label("Nie znaleziono produktu — wpisz dane ręcznie poniżej.", systemImage: "pencil.and.list.clipboard")
                            .font(.subheadline)
                            .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    } else {
                        ForEach(filteredProducts) { product in
                            Button {
                                select(product)
                            } label: {
                                HStack(spacing: RootineTheme.Spacing.small) {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(product.name)
                                            .font(.body.weight(.medium))
                                            .foregroundStyle(RootineTheme.ColorToken.primaryText)
                                        Text("\(product.brand ?? "Własny katalog") · \(Int(product.per100g.calories.rounded())) kcal / 100 g")
                                            .font(.caption)
                                            .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                                    }
                                    Spacer()
                                    Image(systemName: selectedProduct?.id == product.id ? "checkmark.circle.fill" : "plus.circle")
                                        .foregroundStyle(RootineTheme.ColorToken.action)
                                }
                                .frame(minHeight: 48)
                            }
                            .buttonStyle(.plain)
                            .accessibilityHint("Uzupełnia formularz wartościami produktu")
                        }
                    }
                    Button {
                        isShowingScanner = true
                    } label: {
                        Label("Skanuj kod produktu", systemImage: "barcode.viewfinder")
                            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    }
                    .accessibilityHint("Otwiera aparat i wyszukuje produkt po kodzie")
                    if let scanMessage {
                        Label(scanMessage, systemImage: "info.circle")
                            .font(.footnote)
                            .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    }
                } header: {
                    Text("Katalog lub wpis ręczny")
                } footer: {
                    Text("Katalog pomaga wystartować. Możesz zawsze zmienić wartości ręcznie.")
                }

                Section("Produkt") {
                    TextField("Nazwa produktu", text: $name)
                        .focused($focusedField, equals: .name)
                    TextField("Porcja", text: $portion)
                    Picker("Posiłek", selection: $selectedMeal) {
                        ForEach(NutritionMealKind.allCases) { option in
                            Text(option.title).tag(option)
                        }
                    }
                }

                Section("Wartości odżywcze") {
                    numericField("Kalorie (kcal)", text: $calories, field: .calories)
                    numericField("Białko (g)", text: $protein, field: .protein)
                    numericField("Węglowodany (g)", text: $carbs, field: .carbs)
                    numericField("Tłuszcz (g)", text: $fat, field: .fat)
                }
            }
            .scrollContentBackground(.hidden)
            .background(RootineTheme.ColorToken.canvas)
            .sheet(isPresented: $isShowingScanner) {
                BarcodeScannerView { code in
                    isShowingScanner = false
                    handleBarcode(code)
                } onError: { message in
                    isShowingScanner = false
                    scanMessage = message
                }
                .ignoresSafeArea()
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
            }
            .navigationTitle(existingEntry == nil ? "Dodaj do dziennika" : "Edytuj wpis")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Anuluj") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(existingEntry == nil ? "Dodaj" : "Zapisz") { submit() }
                        .disabled(
                            isSaving
                                || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                        )
                }
            }
            .task {
                guard !reduceMotion, prefilledProduct == nil else { return }
                try? await _Concurrency.Task.sleep(for: .milliseconds(180))
                focusedField = .search
            }
        }
    }

    private func select(_ product: NutritionProduct) {
        selectedProduct = product
        name = product.name
        portion = "\(Int(product.defaultAmount)) \(product.unit)"
        let multiplier = NutritionPortion.multiplier(amount: product.defaultAmount, unit: product.unit)
        let values = NutritionValues(
            calories: product.per100g.calories * multiplier,
            protein: product.per100g.protein * multiplier,
            carbs: product.per100g.carbs * multiplier,
            fat: product.per100g.fat * multiplier
        )
        generatedNutritionValues = values
        calories = String(Int(values.calories.rounded()))
        protein = String(format: "%.1f", values.protein)
        carbs = String(format: "%.1f", values.carbs)
        fat = String(format: "%.1f", values.fat)
        focusedField = .name
    }

    private func handleBarcode(_ code: String) {
        query = code
        pendingBarcodeToConsume = nil
        scanMessage = "Szukam produktu dla kodu \(code)…"
        _Concurrency.Task {
            if let product = await environment.lookupNutritionProduct(barcode: code) {
                select(product)
                pendingBarcodeToConsume = NutritionBarcode.normalized(code)
                scanMessage = nil
            } else {
                let normalized = NutritionBarcode.normalized(code)
                let wasQueued = environment.nutritionWorkspace.pendingBarcodeLookups?.contains {
                    NutritionBarcode.normalized($0.barcode) == normalized
                } == true
                scanMessage = wasQueued
                    ? "Nie znaleziono produktu online. Kod zapisano — ponowimy próbę po połączeniu; możesz też wpisać dane ręcznie."
                    : "Nie znaleziono produktu. Uzupełnij dane ręcznie poniżej."
                focusedField = .name
            }
        }
    }

    private func submit() {
        guard !isSaving else { return }
        isSaving = true
        let parsed = parsedPortion
        let entered = NutritionValues(
            calories: number(calories),
            protein: number(protein),
            carbs: number(carbs),
            fat: number(fat)
        )
        let finalValues = rootineResolvedNutritionValues(
            generated: generatedNutritionValues,
            entered: entered,
            scaled: scaledNutritionValues
        )
        let draft = NutritionEntryDraft(
            meal: selectedMeal.rawValue,
            name: name,
            portion: portion,
            calories: finalValues.calories,
            protein: finalValues.protein,
            carbs: finalValues.carbs,
            fat: finalValues.fat,
            amount: parsed.amount,
            unit: parsed.unit,
            brand: selectedProduct?.brand ?? existingEntry?.brand,
            catalogId: selectedProduct?.id ?? existingEntry?.catalogId,
            catalogSource: selectedProduct?.source ?? existingEntry?.catalogSource,
            per100g: selectedProduct?.per100g ?? existingEntry?.per100g
        )
        let existing = existingEntry
        let barcodeToConsume = pendingBarcodeToConsume
        _Concurrency.Task<Void, Never> {
            if let existing {
                await save(existing, draft: draft)
            } else {
                await add(draft)
            }
            if let barcodeToConsume {
                _ = await environment.consumeNutritionBarcode(barcode: barcodeToConsume)
            }
            dismiss()
        }
    }

    private func save(_ existing: NutritionEntry, draft: NutritionEntryDraft) async {
        await environment.updateNutritionEntry(
            dateKey: dateKey,
            originalMeal: meal.rawValue,
            meal: draft.meal,
            id: existing.id,
            name: draft.name,
            portion: draft.portion,
            calories: draft.calories,
            protein: draft.protein,
            carbs: draft.carbs,
            fat: draft.fat,
            amount: draft.amount,
            unit: draft.unit,
            brand: draft.brand,
            catalogId: draft.catalogId,
            catalogSource: draft.catalogSource,
            per100g: draft.per100g
        )
    }

    private func add(_ draft: NutritionEntryDraft) async {
        await environment.addNutritionEntry(
            dateKey: dateKey,
            meal: draft.meal,
            name: draft.name,
            portion: draft.portion,
            calories: draft.calories,
            protein: draft.protein,
            carbs: draft.carbs,
            fat: draft.fat,
            amount: draft.amount,
            unit: draft.unit,
            brand: draft.brand,
            catalogId: draft.catalogId,
            catalogSource: draft.catalogSource,
            per100g: draft.per100g,
            operationID: saveOperationID
        )
    }

    @ViewBuilder
    private func numericField(_ title: String, text: Binding<String>, field: NutritionEntryField) -> some View {
        TextField(title, text: text)
            .keyboardType(.decimalPad)
            .focused($focusedField, equals: field)
    }

    private func number(_ value: String) -> Double {
        Double(value.replacingOccurrences(of: ",", with: ".")) ?? 0
    }
}

private enum NutritionEntryField: Hashable {
    case search
    case name
    case calories
    case protein
    case carbs
    case fat
}

private struct NutritionEntryDraft: Sendable {
    let meal: String
    let name: String
    let portion: String
    let calories: Double
    let protein: Double
    let carbs: Double
    let fat: Double
    let amount: Double?
    let unit: String?
    let brand: String?
    let catalogId: String?
    let catalogSource: String?
    let per100g: NutritionValues?
}

private enum NutritionCatalog {
    static let products: [NutritionProduct] = [
        NutritionProduct(id: "catalog-oats", barcode: "", name: "Płatki owsiane", brand: "Rootine", source: "local", defaultAmount: 60, unit: "g", per100g: NutritionValues(calories: 370, protein: 13, carbs: 60, fat: 7)),
        NutritionProduct(id: "catalog-yogurt", barcode: "", name: "Jogurt naturalny", brand: "Rootine", source: "local", defaultAmount: 180, unit: "g", per100g: NutritionValues(calories: 62, protein: 4.3, carbs: 4.7, fat: 3.3)),
        NutritionProduct(id: "catalog-banana", barcode: "", name: "Banan", brand: "Rootine", source: "local", defaultAmount: 120, unit: "g", per100g: NutritionValues(calories: 89, protein: 1.1, carbs: 23, fat: 0.3)),
        NutritionProduct(id: "catalog-chicken", barcode: "", name: "Pierś z kurczaka", brand: "Rootine", source: "local", defaultAmount: 150, unit: "g", per100g: NutritionValues(calories: 165, protein: 31, carbs: 0, fat: 3.6)),
        NutritionProduct(id: "catalog-rice", barcode: "", name: "Ryż gotowany", brand: "Rootine", source: "local", defaultAmount: 180, unit: "g", per100g: NutritionValues(calories: 130, protein: 2.7, carbs: 28, fat: 0.3)),
        NutritionProduct(id: "catalog-sandwich", barcode: "", name: "Kanapka z serem", brand: "Rootine", source: "local", defaultAmount: 1, unit: "szt.", per100g: NutritionValues(calories: 280, protein: 13, carbs: 30, fat: 12))
    ]
}

// MARK: Barcode scanning

private struct BarcodeScannerView: UIViewControllerRepresentable {
    let onCode: (String) -> Void
    let onError: (String) -> Void

    func makeUIViewController(context: Context) -> BarcodeScannerViewController {
        BarcodeScannerViewController(onCode: onCode, onError: onError)
    }

    func updateUIViewController(_ viewController: BarcodeScannerViewController, context: Context) {}
}

@MainActor
private final class BarcodeScannerViewController: UIViewController, @preconcurrency AVCaptureMetadataOutputObjectsDelegate {
    private let onCode: (String) -> Void
    private let onError: (String) -> Void
    nonisolated(unsafe) private let captureSession = AVCaptureSession()
    private let captureQueue = DispatchQueue(label: "app.rootine.barcode-capture", qos: .userInitiated)
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private var hasDeliveredCode = false

    init(onCode: @escaping (String) -> Void, onError: @escaping (String) -> Void) {
        self.onCode = onCode
        self.onError = onError
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { nil }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        configureCamera()
        addGuideOverlay()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer?.frame = view.bounds
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        captureQueue.async { [weak self] in
            guard let self else { return }
            if self.captureSession.isRunning { self.captureSession.stopRunning() }
        }
    }

    private func configureCamera() {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            configureSession()
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                Task { @MainActor in
                    guard let self else { return }
                    if granted { self.configureSession() }
                    else { self.onError("Aparat jest wyłączony. Zezwól na dostęp w Ustawieniach.") }
                }
            }
        case .denied, .restricted:
            onError("Aparat jest wyłączony. Zezwól na dostęp w Ustawieniach.")
        @unknown default:
            onError("Nie udało się uruchomić aparatu.")
        }
    }

    private func configureSession() {
        captureQueue.async { [weak self] in
            guard let self else { return }
            guard let device = AVCaptureDevice.default(for: .video) else {
                DispatchQueue.main.async { [weak self] in self?.onError("Ten iPhone nie udostępnia aparatu.") }
                return
            }
            do {
                let input = try AVCaptureDeviceInput(device: device)
                let output = AVCaptureMetadataOutput()
                self.captureSession.beginConfiguration()
                guard self.captureSession.canAddInput(input), self.captureSession.canAddOutput(output) else {
                    self.captureSession.commitConfiguration()
                    DispatchQueue.main.async { [weak self] in self?.onError("Nie udało się przygotować skanera.") }
                    return
                }
                self.captureSession.addInput(input)
                self.captureSession.addOutput(output)
                output.metadataObjectTypes = [.ean8, .ean13, .upce, .code128, .qr]
                self.captureSession.commitConfiguration()
                let layer = AVCaptureVideoPreviewLayer(session: self.captureSession)
                layer.videoGravity = .resizeAspectFill
                DispatchQueue.main.async { [weak self] in
                    guard let self else { return }
                    output.setMetadataObjectsDelegate(self, queue: .main)
                    self.previewLayer = layer
                    self.view.layer.insertSublayer(layer, at: 0)
                }
                self.captureSession.startRunning()
            } catch {
                DispatchQueue.main.async { [weak self] in self?.onError("Nie udało się uruchomić aparatu.") }
            }
        }
    }

    private func addGuideOverlay() {
        let guide = UILabel()
        guide.text = "Skieruj aparat na kod produktu"
        guide.textColor = .white
        guide.backgroundColor = UIColor.black.withAlphaComponent(0.55)
        guide.textAlignment = .center
        guide.font = .preferredFont(forTextStyle: .headline)
        guide.numberOfLines = 0
        guide.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(guide)
        NSLayoutConstraint.activate([
            guide.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24),
            guide.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24),
            guide.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -24),
            guide.heightAnchor.constraint(greaterThanOrEqualToConstant: 52)
        ])
        guide.layer.cornerRadius = 14
        guide.layer.masksToBounds = true
    }

    func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject], from connection: AVCaptureConnection) {
        guard !hasDeliveredCode,
              let object = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
              let code = object.stringValue,
              !code.isEmpty else { return }
        hasDeliveredCode = true
        captureQueue.async { [weak self] in
            guard let self, self.captureSession.isRunning else { return }
            self.captureSession.stopRunning()
        }
        onCode(code)
    }
}
