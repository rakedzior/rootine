import SwiftUI
import AVFoundation
import UIKit

/// A compact daily ledger: the balance stays above water and the four meals.
/// Every meal is both an add target and a drop target, so changes remain local
/// to the part of the day the user is working on.
struct NutritionView: View {
    @EnvironmentObject private var environment: AppEnvironment
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @State private var selectedDate = Date()
    @State private var selectedMeal: NutritionMealKind = .breakfast
    @State private var isShowingAddEntry = false
    @State private var editorTarget: NutritionEditorTarget?
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
            LazyVStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 4) {
                    NutritionDateRail(date: $selectedDate)
                    dayOptions
                }

                NutritionSummaryCard(
                    calories: calories,
                    calorieDelta: calorieDelta,
                    goals: goals,
                    protein: protein,
                    carbs: carbs,
                    fat: fat
                )

                NutritionWaterCard(
                    current: day.waterMl,
                    goal: goals.waterMl,
                    onChange: { amount in
                        let targetDate = dateKey
                        performAnimated {
                            _Concurrency.Task<Void, Never> {
                                await environment.addWater(dateKey: targetDate, amountMl: amount)
                            }
                        }
                    }
                )

                VStack(alignment: .leading, spacing: 12) {
                    ForEach(NutritionMealKind.allCases) { meal in
                        NutritionMealCard(
                            meal: meal,
                            entries: entries(for: meal),
                            dateKey: dateKey,
                            onAdd: {
                                selectedMeal = meal
                                isShowingAddEntry = true
                            },
                            onDelete: { entry in
                                requestDelete(entry: entry, from: meal)
                            },
                            onEdit: { entry in
                                editorTarget = NutritionEditorTarget(dateKey: dateKey, meal: meal, entry: entry)
                            },
                            onDuplicate: { entry in
                                duplicate(entry, in: meal)
                            },
                            onMove: { entry, destination in
                                move(entry, from: meal, to: destination)
                            },
                            onDropEntry: { value in
                                receiveDrop(value, into: meal)
                            }
                        )
                    }
                }

                if day.closedAt != nil {
                    Label("Dzień zamknięty", systemImage: "checkmark.seal")
                        .font(.footnote)
                        .foregroundStyle(RootineTheme.ColorToken.success)
                        .frame(maxWidth: .infinity)
                }

                if let pending = environment.nutritionWorkspace.pendingBarcodeLookups,
                   !pending.isEmpty {
                    let resolved = pending.filter { $0.resolvedProduct != nil }
                    if !resolved.isEmpty { resolvedBarcodeSection(resolved) }
                    let waitingCount = pending.filter { $0.resolvedProduct == nil }.count
                    if waitingCount > 0 {
                        Label("Kody do wyszukania: \(waitingCount). Ponowimy po połączeniu.", systemImage: "barcode")
                            .font(.footnote)
                            .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    }
                }
            }
            .padding(.horizontal, RootineTheme.Spacing.medium)
            .padding(.top, RootineTheme.Spacing.small)
            .padding(.bottom, RootineTheme.Spacing.xLarge)
        }
        .scrollIndicators(.hidden)
        .background(RootineTheme.ColorToken.canvas.ignoresSafeArea())
        .rootineScreenChrome(title: "Odżywianie", addLabel: "Dodaj posiłek", onAdd: {
            selectedMeal = suggestedMeal
            isShowingAddEntry = true
        })
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
                    delete(entryToDelete)
                    self.entryToDelete = nil
                }
            }
            Button("Anuluj", role: .cancel) {}
        }
    }

    private var dayOptions: some View {
        Menu {
            NavigationLink {
                NutritionGoalsView(goals: goals)
            } label: {
                Label("Cele żywieniowe", systemImage: "target")
            }
            NavigationLink {
                NutritionAnalysisView(goals: goals, calories: calories, water: day.waterMl, dateKey: dateKey)
            } label: {
                Label("Analiza i pomiary", systemImage: "chart.bar.xaxis")
            }
            NavigationLink {
                NutritionCustomMealsView(dateKey: dateKey, meal: suggestedMeal)
            } label: {
                Label("Zapisane posiłki", systemImage: "fork.knife.circle")
            }
            Divider()
            Button {
                let targetDate = dateKey
                Task { await environment.toggleNutritionDayClosed(dateKey: targetDate) }
            } label: {
                Label(
                    day.closedAt == nil ? "Zamknij dzień" : "Otwórz dzień ponownie",
                    systemImage: day.closedAt == nil ? "checkmark.seal" : "arrow.uturn.backward"
                )
            }
        } label: {
            Image(systemName: "ellipsis")
                .font(.headline)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
        .accessibilityLabel("Opcje odżywiania")
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

    private func delete(_ target: DeletedNutritionEntry) {
        deletedEntry = target
        performAnimated {
            _Concurrency.Task<Void, Never> {
                await environment.deleteNutritionEntry(dateKey: target.dateKey, meal: target.meal.rawValue, id: target.entry.id)
            }
        }
    }

    private func duplicate(_ entry: NutritionEntry, in meal: NutritionMealKind) {
        let targetDate = dateKey
        Task {
            await environment.addNutritionEntry(
                dateKey: targetDate, meal: meal.rawValue, name: entry.name, portion: entry.portion,
                calories: entry.calories, protein: entry.protein, carbs: entry.carbs, fat: entry.fat,
                amount: entry.amount, unit: entry.unit, brand: entry.brand,
                catalogId: entry.catalogId, catalogSource: entry.catalogSource, per100g: entry.per100g
            )
        }
    }

    private func move(_ entry: NutritionEntry, from source: NutritionMealKind, to destination: NutritionMealKind) {
        guard source != destination else { return }
        let targetDate = dateKey
        Task {
            await environment.updateNutritionEntry(
                dateKey: targetDate, originalMeal: source.rawValue, meal: destination.rawValue,
                id: entry.id, name: entry.name, portion: entry.portion,
                calories: entry.calories, protein: entry.protein, carbs: entry.carbs, fat: entry.fat,
                amount: entry.amount, unit: entry.unit, brand: entry.brand,
                catalogId: entry.catalogId, catalogSource: entry.catalogSource, per100g: entry.per100g
            )
        }
    }

    private func receiveDrop(_ value: String, into destination: NutritionMealKind) -> Bool {
        let prefix = "rootine-nutrition|\(dateKey)|"
        guard value.hasPrefix(prefix) else { return false }
        let entryID = String(value.dropFirst(prefix.count))
        for meal in NutritionMealKind.allCases where meal != destination {
            if let entry = entries(for: meal).first(where: { $0.id == entryID }) {
                move(entry, from: meal, to: destination)
                return true
            }
        }
        return false
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
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var isShowingDatePicker = false

    private var title: String {
        if Calendar.current.isDateInToday(date) { return "Dzisiaj" }
        if Calendar.current.isDateInYesterday(date) { return "Wczoraj" }
        if Calendar.current.isDateInTomorrow(date) { return "Jutro" }
        return date.formatted(.dateTime.weekday(.wide).locale(Locale(identifier: "pl_PL"))).capitalized
    }

    var body: some View {
        HStack(spacing: 0) {
            Button { shift(-1) } label: {
                Image(systemName: "chevron.left")
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.borderless)
            .accessibilityLabel("Poprzedni dzień")

            Button { isShowingDatePicker = true } label: {
                VStack(spacing: 2) {
                    Text(title)
                        .font(.subheadline.weight(.semibold))
                    Text(date.formatted(.dateTime.day().month(.wide).locale(Locale(identifier: "pl_PL"))))
                        .font(.caption)
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                }
                .frame(maxWidth: .infinity)
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Wybierz dzień, \(title), \(RootineDate.localDate(date))")
            .accessibilityHint("Przesuń pasek w lewo lub w prawo, aby zmienić dzień")

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
        .contentShape(Rectangle())
        .simultaneousGesture(
            DragGesture(minimumDistance: 35)
                .onEnded { value in
                    guard abs(value.translation.width) > abs(value.translation.height) * 1.5 else { return }
                    shift(value.translation.width < 0 ? 1 : -1)
                }
        )
        .sheet(isPresented: $isShowingDatePicker) {
            NavigationStack {
                VStack {
                    DatePicker("Dzień", selection: $date, displayedComponents: .date)
                        .datePickerStyle(.graphical)
                        .tint(RootineTheme.ColorToken.action)
                    Button("Wróć do dzisiaj") { date = Date(); isShowingDatePicker = false }
                        .frame(minHeight: 44)
                    Spacer(minLength: 0)
                }
                .padding()
                .background(RootineTheme.ColorToken.canvas)
                .navigationTitle("Wybierz dzień")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Gotowe") { isShowingDatePicker = false }
                    }
                }
            }
            .presentationDetents([.medium, .large])
        }
    }

    private func shift(_ days: Int) {
        withAnimation(reduceMotion ? nil : .easeOut(duration: 0.2)) {
            date = Calendar.current.date(byAdding: .day, value: days, to: date) ?? date
        }
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
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Zjedzone")
                        .font(.caption)
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    (Text("\(Int(calories.rounded())) ").font(.title2.weight(.semibold))
                     + Text("kcal").font(.subheadline))
                    .monospacedDigit()
                    .contentTransition(.numericText())
                }
                Spacer(minLength: 12)
                VStack(alignment: .trailing, spacing: 3) {
                    Text(calorieDelta < 0 ? "Ponad cel" : "Pozostało")
                        .font(.caption)
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    Text("\(Int(abs(calorieDelta).rounded())) kcal")
                        .font(.headline)
                        .monospacedDigit()
                        .foregroundStyle(calorieStatusColor)
                }
            }
            VStack(spacing: 6) {
                ProgressView(value: calorieProgress)
                    .tint(calorieDelta < 0 ? RootineTheme.ColorToken.warning : RootineTheme.ColorToken.action)
                    .accessibilityLabel("Realizacja celu kalorii")
                    .accessibilityValue(calorieStatusText)
                HStack {
                    Text("Cel \(Int(goals.calories.rounded())) kcal")
                    Spacer()
                    Text(goals.calories > 0 ? "\(Int((calories / goals.calories * 100).rounded()))%" : "Ustaw cel w opcjach")
                }
                .font(.caption)
                .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                .monospacedDigit()
            }

            Divider().overlay(RootineTheme.ColorToken.separator)

            ViewThatFits(in: .horizontal) {
                HStack(spacing: RootineTheme.Spacing.small) {
                    MacroValue(label: "Białko", value: protein, goal: goals.protein, tint: RootineTheme.ColorToken.success)
                    MacroValue(label: "Węglowodany", value: carbs, goal: goals.carbs, tint: RootineTheme.ColorToken.warning)
                    MacroValue(label: "Tłuszcz", value: fat, goal: goals.fat, tint: RootineTheme.ColorToken.action)
                }
                VStack(alignment: .leading, spacing: RootineTheme.Spacing.small) {
                    MacroValue(label: "Białko", value: protein, goal: goals.protein, tint: RootineTheme.ColorToken.success)
                    MacroValue(label: "Węglowodany", value: carbs, goal: goals.carbs, tint: RootineTheme.ColorToken.warning)
                    MacroValue(label: "Tłuszcz", value: fat, goal: goals.fat, tint: RootineTheme.ColorToken.action)
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
        return RootineTheme.ColorToken.primaryText
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
                .fixedSize(horizontal: true, vertical: false)
            Text("\(Int(value.rounded())) / \(Int(goal.rounded())) g")
                .font(.caption.weight(.semibold))
                .monospacedDigit()
                .fixedSize(horizontal: true, vertical: false)
            ProgressView(value: min(1, goal > 0 ? value / goal : 0))
                .tint(tint)
                .accessibilityHidden(true)
            Text(value > goal ? "+\(Int((value - goal).rounded())) g ponad cel" : "Zostało \(Int((goal - value).rounded())) g")
                .font(.caption2)
                .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                .fixedSize(horizontal: true, vertical: false)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(label), zjedzone \(Int(value.rounded())) gramów, cel \(Int(goal.rounded())) gramów, \(value > goal ? "ponad cel" : "pozostało") \(Int(abs(goal - value).rounded())) gramów")
    }
}

private struct NutritionWaterCard: View {
    let current: Double
    let goal: Double
    let onChange: (Double) -> Void

    private var progress: Double { min(1, goal > 0 ? current / goal : 0) }

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 10) {
                waterInfo
                Spacer(minLength: 0)
                waterActions
            }
            VStack(alignment: .leading, spacing: 8) {
                waterInfo
                HStack { Spacer(); waterActions }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .foregroundStyle(RootineTheme.ColorToken.primaryText)
        .background(RootineTheme.ColorToken.surface, in: RoundedRectangle(cornerRadius: 14))
    }

    private var waterInfo: some View {
        HStack(spacing: 10) {
            Image(systemName: "drop.fill")
                .font(.body)
                .foregroundStyle(RootineTheme.ColorToken.action)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 5) {
                Text("Woda · \(Int(current.rounded())) / \(Int(goal.rounded())) ml")
                    .font(.caption.weight(.medium))
                    .fixedSize(horizontal: true, vertical: false)
                    .monospacedDigit()
                    .contentTransition(.numericText())
                ProgressView(value: progress)
                    .tint(RootineTheme.ColorToken.action)
                    .accessibilityLabel("Realizacja celu wody")
                    .accessibilityValue("\(Int(progress * 100)) procent")
            }
        }
    }

    private var waterActions: some View {
        HStack(spacing: 2) {
            Button { onChange(-250) } label: {
                Image(systemName: "minus")
                    .font(.subheadline.weight(.medium))
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(current <= 0)
            .accessibilityLabel("Odejmij 250 ml wody")
            Button { onChange(250) } label: {
                Text("+250")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(RootineTheme.ColorToken.action)
                    .frame(minWidth: 44, minHeight: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Dodaj 250 ml wody")
            .contextMenu {
                Button("Dodaj 250 ml") { onChange(250) }
                Button("Dodaj 500 ml") { onChange(500) }
                Button("Dodaj 750 ml") { onChange(750) }
            }
            .accessibilityHint("Przytrzymaj, aby wybrać inną ilość")
        }
    }
}

private struct NutritionGoalsView: View {
    @EnvironmentObject private var environment: AppEnvironment
    @Environment(\.dismiss) private var dismiss
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
            Section("Codzienne cele") {
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
                        dismiss()
                    }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(RootineTheme.ColorToken.canvas)
        .navigationTitle("Cele żywieniowe")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func numericGoalField(_ title: String, text: Binding<String>, unit: String, image: String, tint: Color) -> some View {
        HStack {
            Label(title, systemImage: image)
                .foregroundStyle(tint)
            Spacer()
            TextField(unit, text: text, prompt: Text(unit).foregroundColor(RootineTheme.ColorToken.secondaryText))
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
    let dateKey: String
    @State private var isShowingWeightEntry = false

    var body: some View {
        List {
            Section("Bilans · \(dateKey)") {
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
        .scrollContentBackground(.hidden)
        .background(RootineTheme.ColorToken.canvas)
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
                    TextField("Masa (kg)", text: $weight, prompt: Text("Masa (kg)").foregroundColor(RootineTheme.ColorToken.secondaryText))
                        .keyboardType(.decimalPad)
                    DatePicker("Dzień", selection: $date, displayedComponents: .date)
                    TextField("Notatka (opcjonalnie)", text: $note, prompt: Text("Notatka (opcjonalnie)").foregroundColor(RootineTheme.ColorToken.secondaryText))
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
                    TextField("Nazwa posiłku", text: $name, prompt: Text("Nazwa posiłku").foregroundColor(RootineTheme.ColorToken.secondaryText))
                }
                Section("Pierwszy składnik") {
                    TextField("Nazwa składnika", text: $ingredientName, prompt: Text("Nazwa składnika").foregroundColor(RootineTheme.ColorToken.secondaryText))
                    TextField("Ilość (g)", text: $amount, prompt: Text("Ilość (g)").foregroundColor(RootineTheme.ColorToken.secondaryText)).keyboardType(.decimalPad)
                    TextField("Kalorie / 100 g", text: $calories, prompt: Text("Kalorie / 100 g").foregroundColor(RootineTheme.ColorToken.secondaryText)).keyboardType(.decimalPad)
                    TextField("Białko / 100 g", text: $protein, prompt: Text("Białko / 100 g").foregroundColor(RootineTheme.ColorToken.secondaryText)).keyboardType(.decimalPad)
                    TextField("Węglowodany / 100 g", text: $carbs, prompt: Text("Węglowodany / 100 g").foregroundColor(RootineTheme.ColorToken.secondaryText)).keyboardType(.decimalPad)
                    TextField("Tłuszcz / 100 g", text: $fat, prompt: Text("Tłuszcz / 100 g").foregroundColor(RootineTheme.ColorToken.secondaryText)).keyboardType(.decimalPad)
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
    case dinner
    case snack

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
    @State private var isDropTargeted = false
    let meal: NutritionMealKind
    let entries: [NutritionEntry]
    let dateKey: String
    let onAdd: () -> Void
    let onDelete: (NutritionEntry) -> Void
    let onEdit: (NutritionEntry) -> Void
    let onDuplicate: (NutritionEntry) -> Void
    let onMove: (NutritionEntry, NutritionMealKind) -> Void
    let onDropEntry: (String) -> Bool

    private var calories: Double { entries.reduce(0) { $0 + $1.calories } }
    private var protein: Double { entries.reduce(0) { $0 + $1.protein } }
    private var carbs: Double { entries.reduce(0) { $0 + $1.carbs } }
    private var fat: Double { entries.reduce(0) { $0 + $1.fat } }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header.padding(.bottom, 8)

            if entries.isEmpty {
                emptyState
            } else {
                Divider().overlay(RootineTheme.ColorToken.separator)
                entryRows
            }
        }
        .foregroundStyle(RootineTheme.ColorToken.primaryText)
        .rootineSurface()
        .overlay {
            RoundedRectangle(cornerRadius: RootineTheme.Radius.surface)
                .stroke(isDropTargeted ? RootineTheme.ColorToken.action : .clear, lineWidth: 2)
                .allowsHitTesting(false)
        }
        .dropDestination(for: String.self) { values, _ in
            guard let value = values.first else { return false }
            return onDropEntry(value)
        } isTargeted: { isDropTargeted = $0 }
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.24), value: entries)
    }

    private var header: some View {
        HStack(alignment: .center, spacing: 4) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 8) {
                    Image(systemName: meal.systemImage)
                        .font(.subheadline)
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                        .accessibilityHidden(true)
                    Text(meal.title)
                        .font(.subheadline.weight(.semibold))
                        .accessibilityIdentifier("nutrition-meal-\(meal.rawValue)")
                    Spacer(minLength: 4)
                    Text("\(Int(calories.rounded())) kcal")
                        .font(.caption.weight(.medium))
                        .monospacedDigit()
                }
                Text("B \(Int(protein.rounded())) g  ·  W \(Int(carbs.rounded())) g  ·  T \(Int(fat.rounded())) g")
                    .font(.caption2)
                    .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    .monospacedDigit()
                    .accessibilityLabel("Białko \(Int(protein.rounded())) gramów, węglowodany \(Int(carbs.rounded())) gramów, tłuszcz \(Int(fat.rounded())) gramów")
            }
            Button(action: onAdd) {
                Image(systemName: "plus")
                    .font(.body.weight(.medium))
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .foregroundStyle(RootineTheme.ColorToken.action)
            .accessibilityLabel("Dodaj do: \(meal.title)")
            .accessibilityIdentifier("nutrition-add-\(meal.rawValue)")
        }
    }

    private var emptyState: some View {
        Button(action: onAdd) {
            HStack(spacing: RootineTheme.Spacing.small) {
                Text("Dodaj posiłek lub produkt")
                Spacer()
            }
            .font(.subheadline)
            .foregroundStyle(RootineTheme.ColorToken.secondaryText)
            .frame(minHeight: 44)
        }
        .buttonStyle(.plain)
    }

    private var entryRows: some View {
        ForEach(entries) { entry in
            entryRow(entry)
        }
    }

    @ViewBuilder
    private func entryRow(_ entry: NutritionEntry) -> some View {
        entryLabel(entry)
        .onTapGesture { onEdit(entry) }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
        .accessibilityLabel(accessibilityLabel(for: entry))
        .accessibilityValue(entry.portion)
        .accessibilityIdentifier("nutrition-entry-\(entry.id)")
        .accessibilityHint("Kliknij, aby edytować. Przytrzymaj, aby przenieść lub skopiować")
        .accessibilityAction { onEdit(entry) }
        .rootineSwipeActions(
            leadingLabel: "Edytuj", leadingIcon: "pencil", onLeading: { onEdit(entry) },
            trailingLabel: "Usuń", trailingIcon: "trash", onTrailing: { onDelete(entry) }
        )
        .contextMenu {
            Button { onEdit(entry) } label: { Label("Edytuj", systemImage: "pencil") }
            Button { onDuplicate(entry) } label: { Label("Dodaj taką samą porcję", systemImage: "plus.square.on.square") }
            Menu {
                ForEach(NutritionMealKind.allCases.filter { $0 != meal }) { destination in
                    Button(destination.title) { onMove(entry, destination) }
                }
            } label: {
                Label("Przenieś do", systemImage: "arrow.up.arrow.down")
            }
            Button(role: .destructive) { onDelete(entry) } label: { Label("Usuń", systemImage: "trash") }
        }
        .draggable("rootine-nutrition|\(dateKey)|\(entry.id)")
        if entry.id != entries.last?.id {
            Divider().overlay(RootineTheme.ColorToken.separator)
        }
    }

    private func entryLabel(_ entry: NutritionEntry) -> some View {
        HStack(spacing: RootineTheme.Spacing.small) {
            VStack(alignment: .leading, spacing: RootineTheme.Spacing.xSmall) {
                Text(entry.name)
                    .font(.subheadline.weight(.medium))
                    .lineLimit(2)
                Text(entry.portion)
                .font(.caption)
                .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                .lineLimit(2)
            }
            Spacer(minLength: RootineTheme.Spacing.small)
            Text("\(Int(entry.calories.rounded())) kcal")
                .font(.caption)
                .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                .monospacedDigit()
        }
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, minHeight: 54, alignment: .leading)
        .contentShape(Rectangle())
    }

    private func accessibilityLabel(for entry: NutritionEntry) -> String {
        "Edytuj wpis: \(entry.name), \(Int(entry.calories.rounded())) kilokalorii, "
            + "białko \(Int(entry.protein.rounded())) gramów, "
            + "węglowodany \(Int(entry.carbs.rounded())) gramów, "
            + "tłuszcz \(Int(entry.fat.rounded())) gramów"
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
    @State private var saveError: String?
    @State private var isBrowsingCatalog: Bool

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
        _isBrowsingCatalog = State(initialValue: existingEntry == nil && prefilledProduct == nil)
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
                Picker("Sposób dodawania", selection: $isBrowsingCatalog) {
                    Text("Katalog").tag(true)
                    Text("Wpis ręczny").tag(false)
                }
                .pickerStyle(.segmented)

                if isBrowsingCatalog {
                    Section {
                        TextField("Szukaj produktu", text: $query, prompt: Text("Szukaj produktu").foregroundColor(RootineTheme.ColorToken.secondaryText))
                            .focused($focusedField, equals: .search)
                            .textInputAutocapitalization(.never)
                            .accessibilityLabel("Szukaj w katalogu produktów")

                        if filteredProducts.isEmpty {
                            Label("Nie znaleziono produktu. Wybierz Wpis ręczny, aby dodać własny posiłek.", systemImage: "pencil.and.list.clipboard")
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
                            TextField("Kod EAN / UPC / GTIN lub Rootine QR", text: $manualCode, prompt: Text("Kod EAN / UPC / GTIN lub Rootine QR").foregroundColor(RootineTheme.ColorToken.secondaryText))
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
                        Text("Znajdź produkt")
                    } footer: {
                        Text("Wybierz produkt, aby ustawić porcję. Wpis ręczny pozwala dodać własny posiłek.")
                    }
                } else {
                    Section("Produkt") {
                        TextField("Nazwa produktu", text: $name, prompt: Text("Nazwa produktu").foregroundColor(RootineTheme.ColorToken.secondaryText))
                            .focused($focusedField, equals: .name)
                            .accessibilityIdentifier("nutrition-entry-name")
                        LabeledContent("Porcja") {
                            TextField("Porcja", text: portionBinding, prompt: Text("Porcja").foregroundColor(RootineTheme.ColorToken.secondaryText))
                                .multilineTextAlignment(.trailing)
                                .accessibilityLabel("Porcja")
                                .accessibilityHint("Zmiana porcji przelicza wartości z wybranego produktu")
                        }
                        Picker("Posiłek", selection: $selectedMeal) {
                            ForEach(NutritionMealKind.allCases) { option in
                                Text(option.title).tag(option)
                            }
                        }
                        .accessibilityIdentifier("nutrition-entry-meal")
                    }

                    Section("Wartości odżywcze") {
                        numericField("Kalorie (kcal)", text: $calories, field: .calories, valueField: .calories)
                        numericField("Białko (g)", text: $protein, field: .protein, valueField: .protein)
                        numericField("Węglowodany (g)", text: $carbs, field: .carbs, valueField: .carbs)
                        numericField("Tłuszcz (g)", text: $fat, field: .fat, valueField: .fat)
                    }
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
            .alert("Nie zapisano wpisu", isPresented: Binding(
                get: { saveError != nil },
                set: { if !$0 { saveError = nil } }
            )) {
                Button("OK", role: .cancel) { saveError = nil }
            } message: {
                Text(saveError ?? "Spróbuj ponownie.")
            }
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
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Gotowe") { focusedField = nil }
                        .accessibilityIdentifier("nutrition-keyboard-done")
                }
            }
            .task {
                guard existingEntry == nil, prefilledProduct == nil else { return }
                if reduceMotion { focusedField = .search; return }
                try? await _Concurrency.Task.sleep(for: .milliseconds(180))
                focusedField = .search
            }
            .onChange(of: isBrowsingCatalog) { _, browsing in
                focusedField = browsing ? .search : nil
            }
        }
    }

    private func select(_ product: NutritionProduct) {
        selectedProduct = product
        name = product.name
        portion = "\(Int(product.defaultAmount)) \(product.unit)"
        applyCalculatedValues(base: product.per100g, portionText: portion)
        isBrowsingCatalog = false
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
                    : "Nie znaleziono produktu. Wybierz Wpis ręczny, aby uzupełnić dane."
                focusedField = nil
            }
        }
    }

    private func lookupManualCode() {
        handleBarcode(manualCode)
    }

    private func submit() {
        guard !isSaving else { return }
        guard [calories, protein, carbs, fat].allSatisfy({ value in
            let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed.isEmpty { return true }
            guard let amount = Double(trimmed.replacingOccurrences(of: ",", with: ".")) else { return false }
            return amount.isFinite && amount >= 0
        }) else {
            saveError = "Wpisz nieujemne liczby w kaloriach i makroskładnikach."
            return
        }
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
            let entryID = existing?.id ?? RootineLocalIdentifier.string(namespace: "nutrition-entry", operationID: saveOperationID)
            let savedDay = environment.nutritionWorkspace.days[dateKey]
            let savedEntries: [NutritionEntry]
            switch draft.meal {
            case "breakfast": savedEntries = savedDay?.entries.breakfast ?? []
            case "lunch": savedEntries = savedDay?.entries.lunch ?? []
            case "snack": savedEntries = savedDay?.entries.snack ?? []
            default: savedEntries = savedDay?.entries.dinner ?? []
            }
            guard savedEntries.contains(where: {
                $0.id == entryID && $0.name == draft.name.trimmingCharacters(in: .whitespacesAndNewlines)
                    && $0.calories == draft.calories && $0.protein == draft.protein
                    && $0.carbs == draft.carbs && $0.fat == draft.fat
            }) else {
                isSaving = false
                saveError = "Wpis nie został dodany do dziennika. Twoje dane są w formularzu — spróbuj ponownie."
                return
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
        LabeledContent(title) {
            TextField(
                title,
                text: Binding(
                    get: { text.wrappedValue },
                    set: { newValue in
                        text.wrappedValue = newValue
                        nutritionOverrides.insert(valueField)
                    }
                ),
                prompt: Text(title).foregroundColor(RootineTheme.ColorToken.secondaryText)
            )
            .keyboardType(.decimalPad)
            .multilineTextAlignment(.trailing)
            .accessibilityLabel(title)
            .focused($focusedField, equals: field)
        }
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
