import SwiftUI

struct NutritionView: View {
    @EnvironmentObject private var environment: AppEnvironment
    @State private var selectedDate = Date()
    @State private var isShowingAddEntry = false
    @State private var selectedMeal: NutritionMealKind = .breakfast
    @State private var hasAppeared = false

    private var dateKey: String { RootineDate.localDate(selectedDate) }
    private var day: NutritionDay { environment.nutritionWorkspace.days[dateKey] ?? .empty(date: dateKey) }
    private var goals: NutritionGoals { environment.nutritionWorkspace.goals }
    private var entries: [NutritionEntry] {
        day.entries.breakfast + day.entries.lunch + day.entries.snack + day.entries.dinner
    }
    private var calories: Double { entries.reduce(0) { $0 + $1.calories } }
    private var protein: Double { entries.reduce(0) { $0 + $1.protein } }
    private var carbs: Double { entries.reduce(0) { $0 + $1.carbs } }
    private var fat: Double { entries.reduce(0) { $0 + $1.fat } }

    var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(alignment: .leading, spacing: RootineTheme.Spacing.large) {
                NutritionDateRail(date: $selectedDate)
                    .transition(.move(edge: .top).combined(with: .opacity))

                NutritionSummaryCard(
                    calories: calories,
                    goals: goals,
                    protein: protein,
                    carbs: carbs,
                    fat: fat
                )
                .offset(y: hasAppeared ? 0 : 12)
                .opacity(hasAppeared ? 1 : 0)

                NutritionWaterCard(
                    current: day.waterMl,
                    goal: goals.waterMl,
                    onChange: { amount in
                        withAnimation(.spring(response: 0.35, dampingFraction: 0.82)) {
                            _ = _Concurrency.Task<Void, Never> { await environment.addWater(dateKey: dateKey, amountMl: amount) }
                        }
                    }
                )
                .offset(y: hasAppeared ? 0 : 18)
                .opacity(hasAppeared ? 1 : 0)

                VStack(alignment: .leading, spacing: RootineTheme.Spacing.small) {
                    ForEach(Array(NutritionMealKind.allCases.enumerated()), id: \.element.id) { index, meal in
                        NutritionMealCard(
                            meal: meal,
                            entries: entries(for: meal),
                            onAdd: {
                                selectedMeal = meal
                                isShowingAddEntry = true
                            },
                            onDelete: { entry in
                                withAnimation(.easeInOut(duration: 0.24)) {
                                    _ = _Concurrency.Task<Void, Never> {
                                        await environment.deleteNutritionEntry(
                                            dateKey: dateKey,
                                            meal: meal.rawValue,
                                            id: entry.id
                                        )
                                    }
                                }
                            }
                        )
                        .offset(y: hasAppeared ? 0 : CGFloat(24 + index * 8))
                        .opacity(hasAppeared ? 1 : 0)
                    }
                }

                Button {
                    withAnimation(.spring(response: 0.32, dampingFraction: 0.82)) {
                        _ = _Concurrency.Task<Void, Never> { await environment.toggleNutritionDayClosed(dateKey: dateKey) }
                    }
                } label: {
                    Label(
                        day.closedAt == nil ? "Zamknij dzień" : "Otwórz dzień ponownie",
                        systemImage: day.closedAt == nil ? "checkmark.seal" : "arrow.uturn.backward"
                    )
                    .font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(day.closedAt == nil ? RootineTheme.ColorToken.action : RootineTheme.ColorToken.success)
                .padding(.top, RootineTheme.Spacing.xSmall)
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
        .sheet(isPresented: $isShowingAddEntry) {
            AddNutritionEntrySheet(dateKey: dateKey, meal: selectedMeal)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
    }

    private func entries(for meal: NutritionMealKind) -> [NutritionEntry] {
        switch meal {
        case .breakfast: return day.entries.breakfast
        case .lunch: return day.entries.lunch
        case .snack: return day.entries.snack
        case .dinner: return day.entries.dinner
        }
    }
}

private struct NutritionDateRail: View {
    @Binding var date: Date

    var body: some View {
        HStack(spacing: RootineTheme.Spacing.small) {
            Button { shift(-1) } label: {
                Image(systemName: "chevron.left")
                    .frame(width: 36, height: 36)
            }
            .buttonStyle(.borderless)
            .accessibilityLabel("Poprzedni dzień")

            DatePicker("Dzień", selection: $date, displayedComponents: .date)
                .labelsHidden()
                .accessibilityLabel("Wybrany dzień")
                .frame(maxWidth: .infinity)

            Button { shift(1) } label: {
                Image(systemName: "chevron.right")
                    .frame(width: 36, height: 36)
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
        withAnimation(.easeInOut(duration: 0.24)) {
            date = Calendar.current.date(byAdding: .day, value: days, to: date) ?? date
        }
    }
}

private struct NutritionSummaryCard: View {
    let calories: Double
    let goals: NutritionGoals
    let protein: Double
    let carbs: Double
    let fat: Double

    private var calorieProgress: Double { min(1, goals.calories > 0 ? calories / goals.calories : 0) }

    var body: some View {
        VStack(alignment: .leading, spacing: RootineTheme.Spacing.medium) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: RootineTheme.Spacing.xSmall) {
                    Text("Bilans dnia")
                        .font(.headline)
                    HStack(alignment: .firstTextBaseline, spacing: RootineTheme.Spacing.xSmall) {
                        Text("\(Int(calories.rounded()))")
                            .font(.system(size: 36, weight: .bold, design: .rounded))
                            .contentTransition(.numericText())
                        Text("/ \(Int(goals.calories.rounded())) kcal")
                            .font(.subheadline)
                            .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    }
                }
                Spacer()
                ZStack {
                    Circle()
                        .stroke(RootineTheme.ColorToken.separator, lineWidth: 8)
                    Circle()
                        .trim(from: 0, to: calorieProgress)
                        .stroke(RootineTheme.ColorToken.action, style: StrokeStyle(lineWidth: 8, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                        .animation(.easeOut(duration: 0.45), value: calorieProgress)
                    Text("\(Int(calorieProgress * 100))%")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(RootineTheme.ColorToken.primaryText)
                }
                .frame(width: 62, height: 62)
            }

            GeometryReader { proxy in
                Capsule()
                    .fill(RootineTheme.ColorToken.separator)
                    .overlay(alignment: .leading) {
                        Capsule()
                            .fill(RootineTheme.ColorToken.action)
                            .frame(width: proxy.size.width * calorieProgress)
                            .animation(.easeOut(duration: 0.45), value: calorieProgress)
                    }
            }
            .frame(height: 7)
            .animation(.easeOut(duration: 0.45), value: calorieProgress)

            HStack(spacing: RootineTheme.Spacing.small) {
                MacroValue(label: "Białko", value: protein, goal: goals.protein, tint: RootineTheme.ColorToken.success)
                MacroValue(label: "Węgle", value: carbs, goal: goals.carbs, tint: RootineTheme.ColorToken.warning)
                MacroValue(label: "Tłuszcz", value: fat, goal: goals.fat, tint: RootineTheme.ColorToken.action)
            }
        }
        .foregroundStyle(RootineTheme.ColorToken.primaryText)
        .rootineSurface()
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
            Text("z \(Int(goal.rounded()))")
                .font(.caption2)
                .foregroundStyle(tint)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct NutritionWaterCard: View {
    let current: Double
    let goal: Double
    let onChange: (Double) -> Void

    private var progress: Double { min(1, goal > 0 ? current / goal : 0) }

    var body: some View {
        VStack(alignment: .leading, spacing: RootineTheme.Spacing.medium) {
            HStack {
                Label("Woda", systemImage: "drop.fill")
                    .font(.headline)
                Spacer()
                Text("\(Int(current.rounded())) / \(Int(goal.rounded())) ml")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(RootineTheme.ColorToken.action)
                    .contentTransition(.numericText())
            }

            GeometryReader { proxy in
                Capsule()
                    .fill(RootineTheme.ColorToken.separator)
                    .overlay(alignment: .leading) {
                        Capsule()
                            .fill(RootineTheme.ColorToken.action)
                            .frame(width: proxy.size.width * progress)
                    }
            }
            .frame(height: 7)
            .animation(.easeOut(duration: 0.45), value: progress)

            HStack(spacing: RootineTheme.Spacing.small) {
                ForEach([250.0, 500.0, 750.0], id: \.self) { amount in
                    Button("+\(Int(amount)) ml") { onChange(amount) }
                        .font(.caption.weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, RootineTheme.Spacing.small)
                        .background(RootineTheme.ColorToken.elevated)
                        .clipShape(Capsule())
                }
                Button { onChange(-250) } label: {
                    Image(systemName: "minus")
                        .frame(width: 32, height: 32)
                }
                .buttonStyle(.bordered)
                .tint(RootineTheme.ColorToken.secondaryText)
                .accessibilityLabel("Odejmij 250 ml")
            }
        }
        .foregroundStyle(RootineTheme.ColorToken.primaryText)
        .rootineSurface()
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
    let meal: NutritionMealKind
    let entries: [NutritionEntry]
    let onAdd: () -> Void
    let onDelete: (NutritionEntry) -> Void

    private var calories: Double { entries.reduce(0) { $0 + $1.calories } }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Label(meal.title, systemImage: meal.systemImage)
                    .font(.headline)
                Spacer()
                if calories > 0 {
                    Text("\(Int(calories.rounded())) kcal")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                }
                Button(action: onAdd) {
                    Image(systemName: "plus.circle.fill")
                        .font(.title3)
                }
                .buttonStyle(.plain)
                .foregroundStyle(RootineTheme.ColorToken.action)
                .accessibilityLabel("Dodaj do: \(meal.title)")
            }
            .padding(.bottom, RootineTheme.Spacing.small)

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
                    .padding(.vertical, RootineTheme.Spacing.small)
                }
                .buttonStyle(.plain)
                .transition(.opacity.combined(with: .move(edge: .bottom)))
            } else {
                ForEach(entries) { entry in
                    HStack(spacing: RootineTheme.Spacing.small) {
                        VStack(alignment: .leading, spacing: RootineTheme.Spacing.xSmall) {
                            Text(entry.name)
                                .font(.body.weight(.medium))
                            Text("\(entry.portion) · B \(Int(entry.protein.rounded())) g · W \(Int(entry.carbs.rounded())) g · T \(Int(entry.fat.rounded())) g")
                                .font(.caption)
                                .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                        }
                        Spacer(minLength: 0)
                        Text("\(Int(entry.calories.rounded()))")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    }
                    .padding(.vertical, RootineTheme.Spacing.small)
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
        .animation(.easeInOut(duration: 0.24), value: entries)
    }
}

private struct AddNutritionEntrySheet: View {
    @EnvironmentObject private var environment: AppEnvironment
    @Environment(\.dismiss) private var dismiss
    let dateKey: String
    let meal: NutritionMealKind
    @State private var selectedMeal: NutritionMealKind
    @State private var name = ""
    @State private var portion = "1 porcja"
    @State private var calories = ""
    @State private var protein = ""
    @State private var carbs = ""
    @State private var fat = ""

    init(dateKey: String, meal: NutritionMealKind) {
        self.dateKey = dateKey
        self.meal = meal
        _selectedMeal = State(initialValue: meal)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Produkt") {
                    TextField("Nazwa produktu", text: $name)
                    TextField("Porcja", text: $portion)
                    Picker("Posiłek", selection: $selectedMeal) {
                        ForEach(NutritionMealKind.allCases) { option in
                            Text(option.title).tag(option)
                        }
                    }
                }
                Section("Wartości odżywcze") {
                    numericField("Kalorie (kcal)", text: $calories)
                    numericField("Białko (g)", text: $protein)
                    numericField("Węglowodany (g)", text: $carbs)
                    numericField("Tłuszcz (g)", text: $fat)
                }
            }
            .scrollContentBackground(.hidden)
            .background(RootineTheme.ColorToken.canvas)
            .navigationTitle("Dodaj wpis")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Anuluj") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Dodaj") {
                        _Concurrency.Task<Void, Never> {
                            await environment.addNutritionEntry(
                                dateKey: dateKey,
                                meal: selectedMeal.rawValue,
                                name: name,
                                portion: portion,
                                calories: number(calories),
                                protein: number(protein),
                                carbs: number(carbs),
                                fat: number(fat)
                            )
                            dismiss()
                        }
                    }
                    .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
        .preferredColorScheme(.dark)
    }

    @ViewBuilder
    private func numericField(_ title: String, text: Binding<String>) -> some View {
        TextField(title, text: text)
            .keyboardType(.decimalPad)
    }

    private func number(_ value: String) -> Double {
        Double(value.replacingOccurrences(of: ",", with: ".")) ?? 0
    }
}
