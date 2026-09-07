import SwiftUI
import AVFoundation
import UIKit

struct NutritionView: View {
    @EnvironmentObject private var environment: AppEnvironment
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @State private var selectedDate = Date()
    @State private var undoMessage: String?
    @State private var editorTarget: NutritionEditorTarget?
    @State private var entryToDelete: NutritionDeleteTarget?
    @State private var deletedEntry: RootineNutritionEntryUndo?
    @State private var feedback = 0

    private var dateKey: String { RootineDate.localDate(selectedDate) }
    private var day: NutritionDay { environment.nutritionWorkspace.days[dateKey] ?? .empty(date: dateKey) }
    private var goals: NutritionGoals { environment.nutritionWorkspace.goals }

    var body: some View {
        List {
            Section {
                NutritionDateRail(date: $selectedDate)
                NutritionDayBalance(day: day, goals: goals)
                NutritionWaterRow(current: day.waterMl, goal: goals.waterMl, onChange: changeWater)
            }
            .listRowSeparator(.hidden)
            mealSections
            supportSection
            Section {
                Button(day.closedAt == nil ? "Zamknij dzień" : "Otwórz dzień ponownie",
                       systemImage: day.closedAt == nil ? "checkmark.seal" : "arrow.uturn.backward") {
                    let targetDate = dateKey
                    Task { await environment.toggleNutritionDayClosed(dateKey: targetDate, onMutation: didMutate) }
                }
                .frame(minHeight: 44)
                if day.closedAt != nil {
                    Text("Dzień zamknięty. Nadal możesz poprawiać wpisy.")
                        .font(.footnote).foregroundStyle(RootineTheme.ColorToken.secondaryText)
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(RootineTheme.ColorToken.canvas)
        .tint(RootineTheme.ColorToken.action)
        .environment(\.defaultMinListRowHeight, 44)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    NavigationLink("Analiza", destination: NutritionAnalysisView(dateKey: dateKey))
                    NavigationLink("Własne posiłki", destination: NutritionCustomMealsView(dateKey: dateKey, meal: suggestedMeal))
                    NavigationLink("Cele", destination: NutritionGoalsView(goals: goals))
                } label: {
                    Image(systemName: "ellipsis").frame(width: 44, height: 44)
                }
                .accessibilityLabel("Więcej opcji dziennika")
            }
            ToolbarItem(placement: .primaryAction) {
                Button { openEditor(meal: suggestedMeal) } label: {
                    Image(systemName: "plus").frame(width: 44, height: 44)
                }
                .accessibilityLabel("Dodaj produkt")
                .accessibilityHint("Otwiera katalog, skaner i formularz dla wybranego dnia")
            }
        }
        .alert("Nie można cofnąć", isPresented: Binding(
            get: { undoMessage != nil }, set: { if !$0 { undoMessage = nil } }
        )) { Button("OK", role: .cancel) {} } message: { Text(undoMessage ?? "") }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if let deletedEntry {
                RootineUndoBanner(message: "Usunięto \(deletedEntry.entry.name)", usesAdaptiveLayout: true) {
                    self.deletedEntry = nil
                    Task {
                        if await environment.restoreNutritionEntry(deletedEntry) { didMutate() }
                        else { undoMessage = "Stan danych zmienił się od usunięcia wpisu. Nowsze zmiany zostały zachowane." }
                    }
                }
                .padding(.horizontal, RootineTheme.Spacing.medium)
                .padding(.vertical, RootineTheme.Spacing.small)
                .background(RootineTheme.ColorToken.canvas)
            }
        }
        .sensoryFeedback(.success, trigger: feedback)
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.2), value: deletedEntry?.id)
        .onChange(of: environment.nutritionWorkspace) { _, _ in
            if let deletedEntry, !environment.canRestoreNutritionEntry(deletedEntry) {
                self.deletedEntry = nil
            }
        }
        .task { await environment.retryPendingNutritionBarcodes() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await environment.retryPendingNutritionBarcodes() } }
        }
        .sheet(item: $editorTarget) { target in
            AddNutritionEntrySheet(dateKey: target.dateKey, meal: target.meal, existingEntry: target.entry,
                                   prefilledProduct: target.product, barcodeToConsume: target.barcode)
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
        }
        .confirmationDialog("Usunąć wpis?", isPresented: Binding(
            get: { entryToDelete != nil }, set: { if !$0 { entryToDelete = nil } }
        ), titleVisibility: .visible) {
            if let target = entryToDelete {
                Button("Usuń wpis", role: .destructive) {
                    entryToDelete = nil
                    Task {
                        await environment.deleteNutritionEntry(dateKey: target.dateKey, meal: target.meal.rawValue, id: target.entry.id) { undo in
                            deletedEntry = undo
                            didMutate()
                        }
                    }
                }
            }
            Button("Anuluj", role: .cancel) {}
        } message: {
            if let target = entryToDelete { Text(target.entry.name) }
        }
    }

    private var mealSections: some View {
        ForEach(NutritionMealKind.allCases) { meal in
            Section {
                if day.entries[meal].isEmpty {
                    Text("Brak wpisów")
                        .font(.subheadline).foregroundStyle(RootineTheme.ColorToken.secondaryText)
                } else {
                    ForEach(day.entries[meal]) { entry in
                        NutritionEntryRow(entry: entry, onEdit: { openEditor(meal: meal, entry: entry) }, onDelete: {
                            entryToDelete = NutritionDeleteTarget(dateKey: dateKey, meal: meal, entry: entry)
                        })
                    }
                }
            } header: {
                HStack {
                    Text(meal.title).font(.headline).foregroundStyle(RootineTheme.ColorToken.primaryText)
                    Spacer(minLength: 8)
                    Text("\(Int(day.entries[meal].reduce(0) { $0 + $1.calories }.rounded())) kcal")
                        .font(.caption).monospacedDigit()
                    Button { openEditor(meal: meal) } label: {
                        Image(systemName: "plus").frame(width: 44, height: 44)
                    }
                    .buttonStyle(.borderless)
                    .accessibilityLabel("Dodaj do: \(meal.title)")
                }
                .textCase(nil)
            }
            .listRowBackground(RootineTheme.ColorToken.canvas)
        }
    }

    @ViewBuilder private var supportSection: some View {
        Section {
            if case .localOnly = environment.workspaceSyncStatus {
                Label("Zapisano na iPhonie. Synchronizacja wróci po połączeniu.", systemImage: "icloud.slash")
                    .font(.footnote).foregroundStyle(RootineTheme.ColorToken.secondaryText)
            } else if case .conflict = environment.workspaceSyncStatus {
                Label("Konflikt synchronizacji. Lokalne wpisy są zachowane.", systemImage: "exclamationmark.icloud")
                    .font(.footnote).foregroundStyle(RootineTheme.ColorToken.secondaryText)
            }
            if let requests = environment.nutritionWorkspace.pendingBarcodeLookups, !requests.isEmpty {
                DisclosureGroup("Zeskanowane produkty (\(requests.count))") {
                    ForEach(requests) { request in
                        if let product = request.resolvedProduct {
                            Button {
                                editorTarget = NutritionEditorTarget(dateKey: dateKey, meal: suggestedMeal, product: product, barcode: request.barcode)
                            } label: {
                                Label("Dodaj: \(product.name)", systemImage: "plus").frame(minHeight: 44)
                            }
                        } else {
                            Text("Kod \(request.barcode) czeka na wyszukanie po połączeniu.")
                                .font(.footnote)
                        }
                    }
                    Button("Ponów wyszukiwanie") { Task { await environment.retryPendingNutritionBarcodes() } }
                        .frame(minHeight: 44)
                }
            }
        }
        .listRowBackground(RootineTheme.ColorToken.canvas)
    }

    private var suggestedMeal: NutritionMealKind {
        switch Calendar.current.component(.hour, from: Date()) {
        case 5..<11: return .breakfast
        case 11..<15: return .lunch
        case 15..<19: return .snack
        default: return .dinner
        }
    }
    private func openEditor(meal: NutritionMealKind, entry: NutritionEntry? = nil) {
        editorTarget = NutritionEditorTarget(dateKey: dateKey, meal: meal, entry: entry)
    }
    private func changeWater(_ amount: Double) {
        let targetDate = dateKey
        Task { await environment.addWater(dateKey: targetDate, amountMl: amount, onMutation: didMutate) }
    }
    private func didMutate() { feedback += 1 }
}

private struct NutritionDeleteTarget {
    let dateKey: String
    let meal: NutritionMealKind
    let entry: NutritionEntry
}

private struct NutritionEditorTarget: Identifiable {
    let id = UUID()
    let dateKey: String
    let meal: NutritionMealKind
    var entry: NutritionEntry? = nil
    var product: NutritionProduct? = nil
    var barcode: String? = nil
}

private struct NutritionDateRail: View {
    @Binding var date: Date
    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                Button { shift(-1) } label: { Image(systemName: "chevron.left").frame(width: 44, height: 44) }
                    .accessibilityLabel("Poprzedni dzień")
                DatePicker("Dzień", selection: $date, displayedComponents: .date)
                    .datePickerStyle(.compact).labelsHidden().frame(maxWidth: .infinity, minHeight: 44)
                    .accessibilityLabel("Wybrany dzień")
                Button { shift(1) } label: { Image(systemName: "chevron.right").frame(width: 44, height: 44) }
                    .accessibilityLabel("Następny dzień")
            }
            if !Calendar.current.isDateInToday(date) {
                Button("Wróć do dziś") { date = Date() }.frame(minHeight: 44)
            }
        }
        .buttonStyle(.borderless)
    }
    private func shift(_ days: Int) { date = Calendar.current.date(byAdding: .day, value: days, to: date) ?? date }
}

private struct NutritionDayBalance: View {
    @Environment(\.dynamicTypeSize) private var typeSize
    let day: NutritionDay
    let goals: NutritionGoals
    private var summary: RootineNutritionDaySummary { .init(day: day, goals: goals) }
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("\(Int(summary.totals.calories.rounded())) z \(Int(goals.calories.rounded())) kcal")
                .font(.headline).monospacedDigit()
                .accessibilityLabel("Kalorie: \(Int(summary.totals.calories.rounded())), cel \(Int(goals.calories.rounded())) kilokalorii")
            if goals.calories > 0 {
                Text(summary.calorieDelta >= 0 ? "Pozostało \(Int(summary.calorieDelta.rounded())) kcal" : "Ponad cel: \(Int(-summary.calorieDelta.rounded())) kcal")
                    .font(.caption).foregroundStyle(RootineTheme.ColorToken.secondaryText)
            }
            let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 6)) : AnyLayout(HStackLayout(alignment: .top, spacing: 16))
            layout {
                macro("Białko", summary.totals.protein, goals.protein)
                macro("Węgle", summary.totals.carbs, goals.carbs)
                macro("Tłuszcz", summary.totals.fat, goals.fat)
            }
        }
        .padding(.vertical, 4)
    }
    private func macro(_ label: String, _ value: Double, _ goal: Double) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).foregroundStyle(RootineTheme.ColorToken.secondaryText)
            Text("\(Int(value.rounded())) / \(Int(goal.rounded())) g").monospacedDigit()
        }.font(.caption).accessibilityElement(children: .combine)
    }
}

private struct NutritionWaterRow: View {
    @Environment(\.dynamicTypeSize) private var typeSize
    let current: Double
    let goal: Double
    let onChange: (Double) -> Void
    var body: some View {
        let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading)) : AnyLayout(HStackLayout())
        layout {
            VStack(alignment: .leading, spacing: 2) {
                Text("Woda").font(.subheadline.weight(.medium))
                Text("\(Int(current.rounded())) / \(Int(goal.rounded())) ml")
                    .font(.caption).monospacedDigit().foregroundStyle(RootineTheme.ColorToken.secondaryText)
            }
            if !typeSize.isAccessibilitySize { Spacer(minLength: 8) }
            HStack(spacing: 8) {
                Button("+250 ml") { onChange(250) }.font(.subheadline.weight(.semibold)).frame(minHeight: 44)
                    .accessibilityLabel("Dodaj 250 mililitrów wody")
                Menu {
                    Button("Dodaj 500 ml") { onChange(500) }
                    Button("Dodaj 750 ml") { onChange(750) }
                    Button("Odejmij 250 ml") { onChange(-250) }
                } label: { Image(systemName: "ellipsis").frame(width: 44, height: 44) }
                    .accessibilityLabel("Inne ilości wody")
            }
        }
        .buttonStyle(.borderless)
    }
}

private struct NutritionEntryRow: View {
    @Environment(\.dynamicTypeSize) private var typeSize
    let entry: NutritionEntry
    let onEdit: () -> Void
    let onDelete: () -> Void
    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Button(action: onEdit) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(entry.name).font(.body.weight(.medium)).foregroundStyle(RootineTheme.ColorToken.primaryText)
                    Text("\(entry.portion) · \(Int(entry.calories.rounded())) kcal")
                        .font(.subheadline).foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    Text("B \(Int(entry.protein.rounded())) g · W \(Int(entry.carbs.rounded())) g · T \(Int(entry.fat.rounded())) g")
                        .font(.caption).foregroundStyle(RootineTheme.ColorToken.secondaryText)
                }
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
                .contentShape(Rectangle())
            }
            .accessibilityLabel("\(entry.name), \(entry.portion), \(Int(entry.calories.rounded())) kilokalorii, białko \(Int(entry.protein.rounded())) gramów, węglowodany \(Int(entry.carbs.rounded())) gramów, tłuszcz \(Int(entry.fat.rounded())) gramów")
            .accessibilityHint("Otwiera edycję wpisu")
            .accessibilityAction(named: "Edytuj wpis", onEdit)
            .accessibilityAction(named: "Usuń wpis", onDelete)
            Menu {
                Button("Edytuj", systemImage: "pencil", action: onEdit)
                Button("Usuń", systemImage: "trash", role: .destructive, action: onDelete)
            } label: { Image(systemName: "ellipsis").frame(width: 44, height: 44) }
                .accessibilityLabel("Opcje wpisu: \(entry.name)")
        }
        .buttonStyle(.borderless)
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button(role: .destructive, action: onDelete) { Label("Usuń", systemImage: "trash") }
        }
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
            Section("Cele dzienne") {
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
    let dateKey: String
    private var day: NutritionDay { environment.nutritionWorkspace.days[dateKey] ?? .empty(date: dateKey) }
    private var goals: NutritionGoals { environment.nutritionWorkspace.goals }
    private var calories: Double { RootineNutritionDaySummary(day: day, goals: goals).totals.calories }
    private var water: Double { day.waterMl }
    @State private var isShowingWeightEntry = false

    var body: some View {
        List {
            Section(dateKey) {
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
            Menu {
                Button("Usuń zapisany posiłek", systemImage: "trash", role: .destructive) {
                    mealToDelete = customMeal
                    isShowingDeleteDialog = true
                }
            } label: { Image(systemName: "ellipsis").frame(width: 44, height: 44) }
            .accessibilityLabel("Opcje posiłku: \(customMeal.name)")

        }
        .accessibilityAction(named: "Usuń zapisany posiłek") {
            mealToDelete = customMeal
            isShowingDeleteDialog = true
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
    /// Explicit user edits are tracked per field. Programmatic catalog and
    /// portion updates write directly to state, so they do not accidentally
    /// become overrides through SwiftUI change observation.
    @State private var nutritionOverrides: Set<NutritionValueField>
    @State private var pendingBarcodeToConsume: String?
    @State private var isShowingScanner = false
    @State private var isShowingManualCode = false
    @State private var manualCode = ""
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
        _nutritionOverrides = State(
            initialValue: existingEntry == nil ? [] : Set(NutritionValueField.allCases)
        )
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
                    .accessibilityHint("Otwiera aparat i wyszukuje produkt po kodzie EAN, UPC, GTIN lub QR")
                    Button {
                        isShowingManualCode = true
                        focusedField = .manualCode
                    } label: {
                        Label("Wpisz kod ręcznie", systemImage: "keyboard")
                            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    }
                    .accessibilityHint("Pozwala wpisać kod produktu, gdy aparat jest niedostępny")
                    if isShowingManualCode {
                        TextField("Kod EAN / UPC / GTIN lub Rootine QR", text: $manualCode)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .focused($focusedField, equals: .manualCode)
                            .submitLabel(.search)
                            .onSubmit { lookupManualCode() }
                        Button("Wyszukaj kod") { lookupManualCode() }
                            .disabled(manualCode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
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
                    TextField("Porcja", text: portionBinding)
                        .accessibilityHint("Zmiana porcji przelicza wartości z wybranego produktu")
                    Picker("Posiłek", selection: $selectedMeal) {
                        ForEach(NutritionMealKind.allCases) { option in
                            Text(option.title).tag(option)
                        }
                    }
                }

                Section("Wartości odżywcze") {
                    numericField("Kalorie (kcal)", text: $calories, field: .calories, valueField: .calories)
                    numericField("Białko (g)", text: $protein, field: .protein, valueField: .protein)
                    numericField("Węglowodany (g)", text: $carbs, field: .carbs, valueField: .carbs)
                    numericField("Tłuszcz (g)", text: $fat, field: .fat, valueField: .fat)
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
                    isShowingManualCode = true
                    scanMessage = message
                    focusedField = .manualCode
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
        applyCalculatedValues(base: product.per100g, portionText: portion)
        focusedField = .name
    }

    private var portionBinding: Binding<String> {
        Binding(
            get: { portion },
            set: { newValue in
                portion = newValue
                guard let base = selectedProduct?.per100g ?? existingEntry?.per100g else { return }
                applyCalculatedValues(base: base, portionText: newValue)
            }
        )
    }

    private func applyCalculatedValues(base: NutritionValues, portionText: String) {
        let parsed = NutritionPortion.parse(
            portionText,
            fallbackAmount: selectedProduct?.defaultAmount ?? existingEntry?.amount,
            fallbackUnit: selectedProduct?.unit ?? existingEntry?.unit
        )
        guard parsed.amount != nil else { return }
        let multiplier = NutritionPortion.multiplier(amount: parsed.amount, unit: parsed.unit)
        let values = NutritionValues(
            calories: max(0, base.calories * multiplier),
            protein: max(0, base.protein * multiplier),
            carbs: max(0, base.carbs * multiplier),
            fat: max(0, base.fat * multiplier)
        )
        generatedNutritionValues = values
        nutritionOverrides.removeAll()
        calories = String(Int(values.calories.rounded()))
        protein = String(format: "%.1f", values.protein)
        carbs = String(format: "%.1f", values.carbs)
        fat = String(format: "%.1f", values.fat)
    }

    private func handleBarcode(_ code: String) {
        let normalizedCode: String
        switch NutritionBarcode.parseScanPayload(code) {
        case .malformed:
            manualCode = code
            isShowingManualCode = true
            scanMessage = "Nie udało się odczytać kodu. Wpisz poprawny kod EAN, UPC, GTIN lub Rootine QR ręcznie."
            focusedField = .manualCode
            return
        case .unsupported:
            manualCode = code
            isShowingManualCode = true
            scanMessage = "Ten kod QR nie jest obsługiwanym kodem produktu Rootine. Możesz uzupełnić dane ręcznie."
            focusedField = .manualCode
            return
        case .productCode(let normalized):
            normalizedCode = normalized
        }
        query = normalizedCode
        manualCode = normalizedCode
        pendingBarcodeToConsume = nil
        scanMessage = "Szukam produktu dla kodu \(normalizedCode)…"
        _Concurrency.Task {
            if let product = await environment.lookupNutritionProduct(barcode: normalizedCode) {
                select(product)
                pendingBarcodeToConsume = normalizedCode
                scanMessage = nil
            } else {
                let wasQueued = environment.nutritionWorkspace.pendingBarcodeLookups?.contains {
                    NutritionBarcode.normalized($0.barcode) == normalizedCode
                } == true
                scanMessage = wasQueued
                    ? "Nie znaleziono produktu online. Kod zapisano — ponowimy próbę po połączeniu; możesz też wpisać dane ręcznie."
                    : "Nie znaleziono produktu. Uzupełnij dane ręcznie poniżej."
                focusedField = .name
            }
        }
    }

    private func lookupManualCode() {
        handleBarcode(manualCode)
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
            scaled: scaledNutritionValues,
            explicitOverrides: nutritionOverrides
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
    private func numericField(
        _ title: String,
        text: Binding<String>,
        field: NutritionEntryField,
        valueField: NutritionValueField
    ) -> some View {
        TextField(
            title,
            text: Binding(
                get: { text.wrappedValue },
                set: { newValue in
                    text.wrappedValue = newValue
                    nutritionOverrides.insert(valueField)
                }
            )
        )
            .keyboardType(.decimalPad)
            .focused($focusedField, equals: field)
    }

    private func number(_ value: String) -> Double {
        Double(value.replacingOccurrences(of: ",", with: ".")) ?? 0
    }
}

private enum NutritionEntryField: Hashable {
    case search
    case manualCode
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
        updateVideoOrientation()
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
                // UPC-A is emitted as EAN-13 by AVFoundation when it has a
                // leading zero. ITF-14 covers GTIN-14 labels; the parser still
                // validates the decoded value before any lookup.
                output.metadataObjectTypes = [.ean8, .ean13, .upce, .itf14, .interleaved2of5, .code128, .qr]
                self.captureSession.commitConfiguration()
                let layer = AVCaptureVideoPreviewLayer(session: self.captureSession)
                layer.videoGravity = .resizeAspectFill
                DispatchQueue.main.async { [weak self] in
                    guard let self else { return }
                    output.setMetadataObjectsDelegate(self, queue: .main)
                    self.previewLayer = layer
                    self.view.layer.insertSublayer(layer, at: 0)
                    self.updateVideoOrientation()
                }
                self.captureSession.startRunning()
            } catch {
                DispatchQueue.main.async { [weak self] in self?.onError("Nie udało się uruchomić aparatu.") }
            }
        }
    }

    private func updateVideoOrientation() {
        guard let orientation = view.window?.windowScene?.interfaceOrientation,
              let connection = previewLayer?.connection,
              connection.isVideoOrientationSupported else { return }
        switch orientation {
        case .landscapeLeft: connection.videoOrientation = .landscapeLeft
        case .landscapeRight: connection.videoOrientation = .landscapeRight
        case .portraitUpsideDown: connection.videoOrientation = .portraitUpsideDown
        default: connection.videoOrientation = .portrait
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
        RootineObservability.shared.recordQRDetected(format: object.type == .qr ? "qr" : "barcode")
        captureQueue.async { [weak self] in
            guard let self, self.captureSession.isRunning else { return }
            self.captureSession.stopRunning()
        }
        onCode(code)
    }
}
