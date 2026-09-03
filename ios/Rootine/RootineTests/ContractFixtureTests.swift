import XCTest
@testable import Rootine

final class ContractFixtureTests: XCTestCase {
    /// The test host is intentionally opt-in: CI and local fixture runs stay
    /// deterministic, while a developer can run the same native preview as a
    /// real UIApplication smoke check with `ROOTINE_UI_SMOKE=1`. This closes
    /// the gap between compile-only SwiftUI coverage and an actual scene.
    @MainActor
    func testNativePreviewUIApplicationSmoke() throws {
        try XCTSkipUnless(
            ProcessInfo.processInfo.environment["ROOTINE_UI_SMOKE"] == "1",
            "Opt-in: set ROOTINE_UI_SMOKE=1 to launch the native preview scene"
        )

        let application = XCUIApplication()
        application.launchArguments = ["--rootine-preview"]
        application.launch()
        addTeardownBlock { application.terminate() }

        XCTAssertTrue(application.tabBars.buttons["Dzisiaj"].waitForExistence(timeout: 12))
        XCTAssertTrue(application.tabBars.buttons["Zadania"].exists)
        XCTAssertTrue(application.tabBars.buttons["Kalendarz"].exists)
        XCTAssertTrue(application.tabBars.buttons["Odżywianie"].exists)
        XCTAssertTrue(application.tabBars.buttons["Więcej"].exists)
    }

    func testTaskFixtureDecodesWithoutLosingScheduledAndHabitData() throws {
        let workspace = try fixture("task-workspace-v2", as: TaskWorkspace.self)

        XCTAssertEqual(workspace.version, 2)
        XCTAssertEqual(workspace.tasks.count, 2)
        XCTAssertEqual(workspace.tasks.first?.schedule?.timezone, "Europe/Warsaw")
        XCTAssertEqual(workspace.habits.first?.schedule?.type, "daily")
        XCTAssertEqual(try roundTrip(workspace), workspace)
    }

    func testNutritionFixtureDecodesCalculatorDiaryAndProductIdentity() throws {
        let workspace = try fixture("nutrition-workspace-v6", as: NutritionWorkspace.self)

        XCTAssertEqual(workspace.version, 6)
        XCTAssertEqual(workspace.calculatorProfile?.activities.first?.type, "strength")
        XCTAssertEqual(workspace.days["2026-08-19"]?.entries.breakfast.first?.catalogId, "off-5901234123457")
        XCTAssertEqual(try roundTrip(workspace), workspace)
    }

    func testNutritionPortionParserKeepsAmountAndUnitInSync() {
        let physical = NutritionPortion.parse("150 g")
        XCTAssertEqual(physical.amount, 150)
        XCTAssertEqual(physical.unit, "g")
        XCTAssertEqual(NutritionPortion.multiplier(amount: physical.amount, unit: physical.unit), 1.5)

        let compact = NutritionPortion.parse("2 szt.")
        XCTAssertEqual(compact.amount, 2)
        XCTAssertEqual(compact.unit, "szt.")
        XCTAssertEqual(NutritionPortion.multiplier(amount: compact.amount, unit: compact.unit), 2)

        let fallback = NutritionPortion.parse("", fallbackAmount: 60, fallbackUnit: "g")
        XCTAssertEqual(fallback, NutritionPortion(amount: 60, unit: "g"))
        XCTAssertEqual(NutritionPortion.multiplier(amount: 1.5, unit: "kg"), 15)
        XCTAssertEqual(NutritionPortion.multiplier(amount: 2, unit: "l"), 20)
    }

    func testNutritionManualMacroOverrideWinsOverCatalogScaling() {
        let generated = NutritionValues(calories: 370, protein: 13, carbs: 60, fat: 7)
        let entered = NutritionValues(calories: 410, protein: 20, carbs: 48, fat: 11)
        let scaled = NutritionValues(calories: 740, protein: 26, carbs: 120, fat: 14)

        XCTAssertEqual(
            rootineResolvedNutritionValues(generated: generated, entered: entered, scaled: scaled),
            entered
        )
        XCTAssertEqual(
            rootineResolvedNutritionValues(generated: generated, entered: generated, scaled: scaled),
            scaled
        )
    }

    @MainActor
    func testCustomMealRetryWithSameIDDoesNotCreateDuplicate() async {
        let environment = AppEnvironment(configuration: RootineConfiguration(
            supabaseURL: nil,
            supabasePublishableKey: "",
            backendURL: nil,
            authCallbackScheme: "",
            termsURL: nil,
            privacyURL: nil
        ))
        let timestamp = "2026-09-02T10:00:00.000Z"
        let ingredient = CustomMealIngredient(
            id: "ingredient-retry",
            name: "Owies",
            amount: 60,
            unit: "g",
            per100g: NutritionValues(calories: 370, protein: 13, carbs: 60, fat: 7)
        )
        let meal = CustomMeal(
            id: "custom-meal-retry",
            name: "Śniadanie retry",
            ingredients: [ingredient],
            totalWeightG: 60,
            servings: 1,
            createdAt: timestamp,
            updatedAt: timestamp
        )

        await environment.upsertCustomMeal(meal)
        await environment.upsertCustomMeal(meal)

        XCTAssertEqual(environment.nutritionWorkspace.customMeals?.count, 1)
        XCTAssertEqual(environment.nutritionWorkspace.customMeals?.first?.id, meal.id)
        XCTAssertEqual(environment.nutritionWorkspace.customMeals?.first?.ingredients.first?.id, ingredient.id)
    }

    @MainActor
    func testCustomMealAddsEachIntentButCoalescesSameOperation() async {
        let environment = AppEnvironment(configuration: RootineConfiguration(
            supabaseURL: nil,
            supabasePublishableKey: "",
            backendURL: nil,
            authCallbackScheme: "",
            termsURL: nil,
            privacyURL: nil
        ))
        let timestamp = "2026-09-02T10:00:00.000Z"
        let meal = CustomMeal(
            id: "custom-meal-serving",
            name: "Owsianka",
            ingredients: [CustomMealIngredient(
                id: "ingredient-serving",
                name: "Płatki",
                amount: 60,
                unit: "g",
                per100g: NutritionValues(calories: 370, protein: 13, carbs: 60, fat: 7)
            )],
            totalWeightG: 60,
            servings: 1,
            createdAt: timestamp,
            updatedAt: timestamp
        )

        // A repeated callback for one user action is idempotent.
        await environment.addCustomMealToDay(meal, dateKey: "2026-09-02", mealKind: "breakfast", operationID: "same-action")
        await environment.addCustomMealToDay(meal, dateKey: "2026-09-02", mealKind: "breakfast", operationID: "same-action")
        // A later, deliberate tap creates another journal occurrence.
        await environment.addCustomMealToDay(meal, dateKey: "2026-09-02", mealKind: "breakfast", operationID: "later-action")

        let entries = environment.nutritionWorkspace.days["2026-09-02"]?.entries.breakfast ?? []
        XCTAssertEqual(entries.count, 2)
        XCTAssertEqual(Set(entries.map(\.id)).count, 2)
    }

    @MainActor
    func testBarcodeLookupQueuesNormalizedRequestWhenOffline() async {
        let environment = AppEnvironment(configuration: RootineConfiguration(
            supabaseURL: nil,
            supabasePublishableKey: "",
            backendURL: nil,
            authCallbackScheme: "",
            termsURL: nil,
            privacyURL: nil
        ))

        let firstLookup = await environment.lookupNutritionProduct(barcode: " 590-123-ABC ")
        let secondLookup = await environment.lookupNutritionProduct(barcode: "590 123 abc")
        XCTAssertNil(firstLookup)
        XCTAssertNil(secondLookup)

        let pending = environment.nutritionWorkspace.pendingBarcodeLookups
        XCTAssertEqual(pending?.count, 1)
        XCTAssertEqual(pending?.first?.barcode, "590123ABC")
        XCTAssertEqual(pending?.first?.attemptCount, 2)
        XCTAssertEqual(pending?.first?.id, NutritionBarcode.requestID(for: "590123ABC"))
    }

    @MainActor
    func testNutritionEntryDerivesAmountAndUnitFromPortionWhenOmitted() async {
        let environment = AppEnvironment(configuration: RootineConfiguration(
            supabaseURL: nil,
            supabasePublishableKey: "",
            backendURL: nil,
            authCallbackScheme: "",
            termsURL: nil,
            privacyURL: nil
        ))

        await environment.addNutritionEntry(
            dateKey: "2026-09-02",
            meal: "breakfast",
            name: "Płatki",
            portion: "125 g",
            calories: 462.5,
            protein: 16.25,
            carbs: 75,
            fat: 8.75,
            per100g: NutritionValues(calories: 370, protein: 13, carbs: 60, fat: 7),
            operationID: "portion-consistency"
        )

        let entry = environment.nutritionWorkspace.days["2026-09-02"]?.entries.breakfast.first
        XCTAssertEqual(entry?.amount, 125)
        XCTAssertEqual(entry?.unit, "g")
        XCTAssertEqual(entry?.id, RootineLocalIdentifier.string(namespace: "nutrition-entry", operationID: "portion-consistency"))
    }

    func testLegacyNutritionWorkspaceDecodesWithoutPendingBarcodeQueue() throws {
        var legacy = NutritionWorkspace.empty
        legacy.pendingBarcodeLookups = nil
        let data = try JSONEncoder().encode(legacy)
        let decoded = try JSONDecoder().decode(NutritionWorkspace.self, from: data)
        XCTAssertNil(decoded.pendingBarcodeLookups)
    }

    func testNutritionBarcodeQueueRoundTripsDurableAttemptState() throws {
        var workspace = NutritionWorkspace.empty
        let product = NutritionProduct(
            id: "barcode-product",
            barcode: "590123",
            name: "Jogurt testowy",
            brand: "Rootine",
            source: "remote",
            defaultAmount: 180,
            unit: "g",
            per100g: NutritionValues(calories: 62, protein: 4.3, carbs: 4.7, fat: 3.3)
        )
        workspace.pendingBarcodeLookups = [NutritionBarcodeRequest(
            id: NutritionBarcode.requestID(for: "590123"),
            barcode: "590123",
            createdAt: "2026-09-02T10:00:00.000Z",
            lastAttemptAt: "2026-09-02T10:01:00.000Z",
            attemptCount: 2,
            resolvedProduct: product
        )]

        XCTAssertEqual(try roundTrip(workspace), workspace)
    }

    func testNutritionProductCacheRoundTripsSeparatelyFromWorkspace() throws {
        let product = NutritionProduct(
            id: "cached-product",
            barcode: "5901234123457",
            name: "Jogurt z cache",
            source: "remote",
            defaultAmount: 180,
            unit: "g",
            per100g: NutritionValues(calories: 62, protein: 4.3, carbs: 4.7, fat: 3.3)
        )
        XCTAssertEqual(
            try roundTrip(NutritionProductCache(products: [product])),
            NutritionProductCache(products: [product])
        )
    }

    func testNutritionBarcodeFormattingSharesOneStableRequestIdentity() {
        XCTAssertEqual(NutritionBarcode.normalized(" 590-123 456 "), "590123456")
        XCTAssertEqual(
            NutritionBarcode.requestID(for: " 590-123 456 "),
            NutritionBarcode.requestID(for: "590123456")
        )
    }

    func testNutritionScanParserAcceptsSupportedProductCodeFamilies() {
        let codes = ["96385074", "036000291452", "5901234123457", "00012345600012"]
        for code in codes {
            XCTAssertEqual(NutritionBarcode.parseScanPayload(code), .productCode(code), code)
            XCTAssertEqual(
                NutritionBarcode.parseScanPayload(code.enumerated().map { $0.offset.isMultiple(of: 2) ? String($0.element) : "-\($0.element)" }.joined()),
                .productCode(code),
                code
            )
        }
        XCTAssertEqual(NutritionBarcode.parseScanPayload("]E0 5901234123457"), .productCode("5901234123457"))
        XCTAssertEqual(
            NutritionBarcode.parseScanPayload("04252614"),
            .productCode("042100005264")
        )
    }

    func testNutritionScanParserAcceptsNumericAndRootineQRPayloads() {
        XCTAssertEqual(
            NutritionBarcode.parseScanPayload("rootine:nutrition:v1:5901234123457"),
            .productCode("5901234123457")
        )
        XCTAssertEqual(
            NutritionBarcode.parseScanPayload("rootine://nutrition/product?barcode=5901234123457"),
            .productCode("5901234123457")
        )
        XCTAssertEqual(
            NutritionBarcode.parseScanPayload("https://rootine.app/nutrition/product?gtin=5901234123457"),
            .productCode("5901234123457")
        )
        XCTAssertEqual(
            NutritionBarcode.parseScanPayload("{\"type\":\"rootine.nutrition.product\",\"version\":1,\"code\":\"5901234123457\"}"),
            .productCode("5901234123457")
        )
    }

    func testNutritionScanParserRejectsMalformedAndUntrustedPayloads() {
        XCTAssertEqual(NutritionBarcode.parseScanPayload(""), .malformed)
        XCTAssertEqual(NutritionBarcode.parseScanPayload("590123"), .malformed)
        XCTAssertEqual(NutritionBarcode.parseScanPayload("5901234123456"), .malformed)
        XCTAssertEqual(NutritionBarcode.parseScanPayload("hello"), .unsupported)
        XCTAssertEqual(
            NutritionBarcode.parseScanPayload("https://evil.example/product?code=5901234123457"),
            .unsupported
        )
        XCTAssertEqual(
            NutritionBarcode.parseScanPayload("https://rootine.app/nutrition/product?code=5901234123457&gtin=5901234123457"),
            .unsupported
        )
        XCTAssertEqual(
            NutritionBarcode.parseScanPayload("rootine://nutrition/product?code=not-a-code"),
            .unsupported
        )
    }

    func testNotesFixtureDecodesChecklistAndPolishText() throws {
        let workspace = try fixture("notes-workspace-v1", as: NotesWorkspace.self)

        XCTAssertEqual(workspace.version, 1)
        XCTAssertEqual(workspace.notes.first?.items.count, 2)
        XCTAssertEqual(workspace.notes.first?.title, "Pytania na rozmowę")
        XCTAssertEqual(try roundTrip(workspace), workspace)
    }

    func testNotesQuerySearchesChecklistItemsAndAppliesFolderTagArchiveAndSort() {
        let older = NoteRecord(
            id: "note-older",
            title: "Plan",
            body: "",
            kind: "checklist",
            items: [NoteChecklistItem(id: "item", text: "Kupić kawę", checked: false)],
            tags: ["dom"],
            listId: "list-home",
            color: .green,
            pinned: false,
            archived: false,
            createdAt: "2026-08-01T08:00:00.000Z",
            updatedAt: "2026-08-02T08:00:00.000Z"
        )
        let newer = NoteRecord(
            id: "note-newer",
            title: "Spotkanie",
            body: "",
            kind: "checklist",
            items: [NoteChecklistItem(id: "item", text: "Przygotować agendę", checked: true)],
            tags: ["praca"],
            listId: "list-work",
            color: .blue,
            pinned: true,
            archived: false,
            createdAt: "2026-08-03T08:00:00.000Z",
            updatedAt: "2026-08-04T08:00:00.000Z"
        )
        let archived = NoteRecord(
            id: "note-archived",
            title: "Stare",
            body: "",
            kind: "text",
            items: [],
            tags: ["dom"],
            listId: "list-home",
            color: .graphite,
            pinned: false,
            archived: true,
            createdAt: "2026-07-01T08:00:00.000Z",
            updatedAt: "2026-07-02T08:00:00.000Z"
        )
        let workspace = NotesWorkspace(version: 1, updatedAt: newer.updatedAt, lists: [], notes: [older, newer, archived])

        XCTAssertEqual(
            rootineNotes(workspace, matching: RootineNotesQuery(search: "kupić", listID: "list-home", tag: "dom")).map(\.id),
            ["note-older"]
        )
        XCTAssertEqual(
            rootineNotes(workspace, matching: RootineNotesQuery(pinnedOnly: true)).map(\.id),
            ["note-newer"]
        )
        XCTAssertEqual(
            rootineNotes(workspace, matching: RootineNotesQuery(showingArchive: true)).map(\.id),
            ["note-archived"]
        )
        XCTAssertEqual(
            rootineNotes(workspace, matching: RootineNotesQuery(sort: .title)).map(\.id),
            ["note-older", "note-newer"]
        )
    }

    func testNotesMappingPreservesOpaqueWebFieldsAndNativeTombstones() throws {
        let timestamp = "2026-08-19T09:10:00.000Z"
        let note = NoteRecord(
            id: "note-1",
            title: "Natywny tytuł",
            body: "Treść",
            kind: "checklist",
            items: [NoteChecklistItem(id: "item-1", text: "Krok", checked: true)],
            tags: ["ios"],
            listId: "list-1",
            color: .blue,
            pinned: true,
            archived: false,
            createdAt: timestamp,
            updatedAt: timestamp
        )
        let base: JSONValue = .object([
            "version": .number(1),
            "updatedAt": .string(timestamp),
            "webRoot": .string("keep"),
            "lists": .array([.object([
                "id": .string("list-1"), "name": .string("Web"), "createdAt": .string(timestamp),
                "webListField": .string("keep")
            ])]),
            "notes": .array([.object([
                "id": .string("note-1"), "title": .string("Stary"), "body": .string(""),
                "kind": .string("text"), "items": .array([.object([
                    "id": .string("item-1"), "text": .string("Stary krok"), "checked": .bool(false),
                    "webItemField": .string("keep")
                ])]), "tags": .array([]), "listId": .string("list-1"), "color": .string("blue"),
                "pinned": .bool(false), "archived": .bool(false), "createdAt": .string(timestamp),
                "updatedAt": .string(timestamp), "webNoteField": .string("keep")
            ]), .object([
                "id": .string("note-removed"), "title": .string("Usuń"), "webOnly": .bool(true)
            ])])
        ])

        let merged = try RootineCanonicalWorkspaceMapping.mergedNotesPayload(
            for: NotesWorkspace(version: 1, updatedAt: timestamp, lists: [NoteList(id: "list-1", name: "Natywny", createdAt: timestamp)], notes: [note]),
            onto: base
        )
        guard case .object(let root) = merged,
              case .array(let lists) = root["lists"], case .object(let list) = lists.first,
              case .array(let notes) = root["notes"], case .object(let updated) = notes.first,
              case .array(let items) = updated["items"], case .object(let item) = items.first else {
            return XCTFail("Notes mapping did not produce canonical arrays")
        }
        XCTAssertEqual(root["webRoot"], .string("keep"))
        XCTAssertEqual(list["webListField"], .string("keep"))
        XCTAssertEqual(updated["webNoteField"], .string("keep"))
        XCTAssertEqual(item["webItemField"], .string("keep"))
        XCTAssertEqual(updated["title"], .string("Natywny tytuł"))
        XCTAssertNil(notes.first(where: { objectValue($0)?["id"] == .string("note-removed") }))
    }

    @MainActor
    func testNotesListLifecycleKeepsNotesWhenFolderIsDeleted() async {
        let environment = AppEnvironment(configuration: RootineConfiguration(
            supabaseURL: nil,
            supabasePublishableKey: "",
            backendURL: nil,
            authCallbackScheme: "",
            termsURL: nil,
            privacyURL: nil
        ))

        await environment.createNoteList(name: "  Praca  ", operationID: "folder-1")
        await environment.createNoteList(name: "praca", operationID: "folder-duplicate")
        XCTAssertEqual(environment.notesWorkspace.lists.count, 1)
        let list = environment.notesWorkspace.lists.first
        guard let list else { return XCTFail("Folder was not created") }

        await environment.renameNoteList(id: list.id, name: "Projekty")
        XCTAssertEqual(environment.notesWorkspace.lists.first?.name, "Projekty")
        await environment.upsertNote(NoteRecord(
            id: "note-folder",
            title: "Plan",
            body: "",
            kind: "text",
            items: [],
            tags: [],
            listId: list.id,
            color: .blue,
            pinned: false,
            archived: false,
            createdAt: "2026-08-19T09:10:00.000Z",
            updatedAt: "2026-08-19T09:10:00.000Z"
        ))

        await environment.deleteNoteList(id: list.id)
        XCTAssertTrue(environment.notesWorkspace.lists.isEmpty)
        XCTAssertEqual(environment.notesWorkspace.notes.first?.listId, "")
        await environment.deleteNote(id: "note-folder")
        XCTAssertTrue(environment.notesWorkspace.notes.isEmpty)
    }

    func testRelationalNotesMapSnakeCaseAndParentTombstone() throws {
        let timestamp = "2026-08-19T09:10:00.000Z"
        let initial = try RootineRelationalWorkspaceAdapter.materialize(bootstrap: RootineRelationalBootstrapResponse(
            serverCursor: 1,
            workspaces: [RootineRelationalWorkspace(storageKey: RootineStorageKey.notes.rawValue, payload: .object([
                "version": .number(1), "updatedAt": .string(timestamp), "lists": .array([]), "notes": .array([])
            ]))]
        ))
        let pulled = try RootineRelationalWorkspaceAdapter.materialize(changes: [
            RootineRelationalPullChange(
                cursor: 2,
                storageKey: RootineStorageKey.notes.rawValue,
                entity: "note",
                entityID: "note-1",
                revision: 7,
                record: .object([
                    "note_id": .string("note-1"), "title": .string("Relacyjna"), "body": .string("Treść"),
                    "kind": .string("checklist"), "created_at": .string(timestamp), "updated_at": .string(timestamp),
                    "pinned": .bool(true), "archived": .bool(false), "items": .array([]), "tags": .array([]),
                    "list_id": .null, "color": .string("green")
                ])
            )
        ], onto: initial)
        let decoded = try RootineRelationalWorkspaceAdapter.document(NotesWorkspace.self, key: .notes, from: pulled)
        XCTAssertEqual(decoded.notes.first?.id, "note-1")
        XCTAssertEqual(decoded.notes.first?.createdAt, timestamp)
        XCTAssertEqual(decoded.notes.first?.updatedAt, timestamp)
        XCTAssertEqual(decoded.notes.first?.listId, "")
        XCTAssertEqual(pulled.recordRevisions["rootine.notes-workspace.v1\u{1F}note\u{1F}note-1"], 7)

        let deleted = try RootineRelationalWorkspaceAdapter.materialize(changes: [
            RootineRelationalPullChange(cursor: 3, storageKey: RootineStorageKey.notes.rawValue, entity: "note", entityID: "note-1", operation: "delete", revision: 8, deletedAt: timestamp)
        ], onto: pulled)
        XCTAssertTrue(try RootineRelationalWorkspaceAdapter.document(NotesWorkspace.self, key: .notes, from: deleted).notes.isEmpty)
    }

    func testNormalizedReadStateKeepsRecordRevisionsAndReadsLegacyState() throws {
        let state = RootineNormalizedReadState(
            contractVersion: 1,
            cursor: 9,
            documents: [RootineStorageKey.notes.rawValue: .object([:])],
            recordRevisions: ["notes\u{1F}note\u{1F}n1": 4]
        )
        XCTAssertEqual(try roundTrip(state), state)

        let legacy = try JSONSerialization.data(withJSONObject: [
            "contractVersion": 1,
            "cursor": 9,
            "documents": [String: Any]()
        ])
        let decoded = try JSONDecoder().decode(RootineNormalizedReadState.self, from: legacy)
        XCTAssertTrue(decoded.recordRevisions.isEmpty)
    }

    func testMoreCanonicalFixturesProjectToNativeModels() throws {
        let sportPayload = try fixture("sport-planner-v5", as: JSONValue.self)
        let goalsPayload = try fixture("goals-workspace-v1", as: JSONValue.self)
        let workPayload = try fixture("work-workspace-v3", as: JSONValue.self)
        let travelPayload = try fixture("travel-workspace-v2", as: JSONValue.self)
        let healthPayload = try fixture("health-workspace-v1", as: JSONValue.self)

        XCTAssertEqual(try RootineCanonicalWorkspaceMapping.sportWorkspace(from: sportPayload).version, 1)
        XCTAssertEqual(try RootineCanonicalWorkspaceMapping.goalsWorkspace(from: goalsPayload).version, 1)
        XCTAssertEqual(try RootineCanonicalWorkspaceMapping.workWorkspace(from: workPayload).version, 1)
        XCTAssertEqual(try RootineCanonicalWorkspaceMapping.travelWorkspace(from: travelPayload).version, 1)
        XCTAssertEqual(try RootineCanonicalWorkspaceMapping.healthWorkspace(from: healthPayload).version, 1)
    }

    func testRelationalBootstrapMaterializesEveryAggregateAndRetainsWebOnlyFields() throws {
        let taskPayload = try fixture("task-workspace-v2", as: JSONValue.self)
        let nutritionPayload = try fixture("nutrition-workspace-v6", as: JSONValue.self)
        let notesPayload = try fixture("notes-workspace-v1", as: JSONValue.self)
        let sportPayload = try fixture("sport-planner-v5", as: JSONValue.self)
        let goalsPayload = try fixture("goals-workspace-v1", as: JSONValue.self)
        let workPayload = try fixture("work-workspace-v3", as: JSONValue.self)
        let travelPayload = try fixture("travel-workspace-v2", as: JSONValue.self)
        let healthPayload = try fixture("health-workspace-v1", as: JSONValue.self)
        let affairsPayload = try jsonValue(AffairsWorkspace.empty)

        let response = RootineRelationalBootstrapResponse(
            contractVersion: 3,
            serverCursor: 42,
            workspaces: [
                RootineRelationalWorkspace(storageKey: RootineStorageKey.tasks.rawValue, payload: taskPayload),
                RootineRelationalWorkspace(storageKey: RootineStorageKey.nutrition.rawValue, payload: nutritionPayload),
                RootineRelationalWorkspace(storageKey: RootineStorageKey.notes.rawValue, payload: notesPayload),
                // The relational service may still return the pre-canonical
                // aliases while B04/B06 are rolled out independently.
                RootineRelationalWorkspace(storageKey: "rootine.sport-workspace.v1", payload: sportPayload),
                RootineRelationalWorkspace(storageKey: "rootine.goals-workspace.v1", payload: goalsPayload),
                RootineRelationalWorkspace(storageKey: RootineStorageKey.work.rawValue, payload: workPayload),
                RootineRelationalWorkspace(storageKey: RootineStorageKey.travel.rawValue, payload: travelPayload),
                RootineRelationalWorkspace(storageKey: RootineStorageKey.health.rawValue, payload: healthPayload),
                RootineRelationalWorkspace(storageKey: RootineStorageKey.affairs.rawValue, payload: affairsPayload)
            ]
        )

        let materialized = try RootineRelationalWorkspaceAdapter.materialize(bootstrap: response)
        XCTAssertEqual(try RootineRelationalWorkspaceAdapter.document(TaskWorkspace.self, key: .tasks, from: materialized).version, 2)
        XCTAssertEqual(try RootineRelationalWorkspaceAdapter.document(NutritionWorkspace.self, key: .nutrition, from: materialized).version, 6)
        XCTAssertEqual(try RootineRelationalWorkspaceAdapter.document(NotesWorkspace.self, key: .notes, from: materialized).version, 1)
        XCTAssertEqual(try RootineRelationalWorkspaceAdapter.document(SportWorkspace.self, key: .sport, from: materialized).version, 1)
        XCTAssertEqual(try RootineRelationalWorkspaceAdapter.document(GoalsWorkspace.self, key: .goals, from: materialized).goals.first?.id, "goal-rich")
        XCTAssertEqual(try RootineRelationalWorkspaceAdapter.document(WorkWorkspace.self, key: .work, from: materialized).version, 1)
        XCTAssertEqual(try RootineRelationalWorkspaceAdapter.document(TravelWorkspace.self, key: .travel, from: materialized).trips.first?.id, "trip-rich")
        XCTAssertEqual(try RootineRelationalWorkspaceAdapter.document(HealthWorkspace.self, key: .health, from: materialized).version, 1)
        XCTAssertEqual(try RootineRelationalWorkspaceAdapter.document(AffairsWorkspace.self, key: .affairs, from: materialized).version, 2)

        // These keys are intentionally not part of compact native models but
        // must survive a relational bootstrap for the web client.
        if case .object(let goals) = materialized.documents["rootine.goals.v1"],
           case .array(let records) = goals["goals"],
           case .object(let first) = records.first {
            XCTAssertEqual(first["customIcon"], .string("data:image/png;base64,AA=="))
        } else { XCTFail("Goals canonical payload was not materialized") }
        if case .object(let travel) = materialized.documents["rootine.travel-workspace.v1"],
           case .array(let trips) = travel["trips"],
           case .object(let first) = trips.first {
            XCTAssertNotNil(first["stays"])
            XCTAssertNotNil(first["budget"])
            XCTAssertNotNil(first["documents"])
        } else { XCTFail("Travel canonical payload was not materialized") }
    }

    func testRelationalPullMergesWebOnlyKeysAndAppliesTombstone() throws {
        var taskPayload = try fixture("task-workspace-v2", as: JSONValue.self)
        if case .object(var root) = taskPayload,
           case .array(var tasks) = root["tasks"],
           case .object(var task) = tasks.first {
            task["webOnlyReminder"] = .object(["channel": .string("email")])
            tasks[0] = .object(task)
            root["tasks"] = .array(tasks)
            taskPayload = .object(root)
        }

        let initial = try RootineRelationalWorkspaceAdapter.materialize(
            bootstrap: RootineRelationalBootstrapResponse(
                serverCursor: 1,
                workspaces: [RootineRelationalWorkspace(storageKey: RootineStorageKey.tasks.rawValue, payload: taskPayload)]
            )
        )
        let pulled = try RootineRelationalWorkspaceAdapter.materialize(changes: [
            RootineRelationalPullChange(
                cursor: 2,
                storageKey: RootineStorageKey.tasks.rawValue,
                entity: "tasks",
                entityID: "101",
                record: .object(["text": .string("Zmienione lokalnie")])
            ),
            RootineRelationalPullChange(
                cursor: 3,
                storageKey: RootineStorageKey.tasks.rawValue,
                entity: "task",
                entityID: "102",
                operation: "delete",
                deletedAt: "2026-09-02T12:00:00.000Z"
            )
        ], onto: initial)
        let tasks = try RootineRelationalWorkspaceAdapter.document(TaskWorkspace.self, key: .tasks, from: pulled)
        XCTAssertEqual(tasks.tasks.first(where: { $0.id == 101 })?.text, "Zmienione lokalnie")
        if case .object(let root) = pulled.documents[RootineStorageKey.tasks.rawValue],
           case .array(let rows) = root["tasks"],
           case .object(let updated) = rows.first(where: { objectValue($0)?["id"] == .number(101) }) {
            XCTAssertEqual(updated["webOnlyReminder"], .object(["channel": .string("email")]))
        } else { XCTFail("Incremental task merge dropped web-only data") }
        XCTAssertTrue(tasks.tasks.contains(where: { $0.id == 102 && $0.deleted == true }))
    }

    func testRelationalPullPreservesOpaqueWebOnlyWorkspaceDocuments() throws {
        let key = "rootine.web-only.calendar.v7"
        let initial = try RootineRelationalWorkspaceAdapter.materialize(changes: [
            RootineRelationalPullChange(
                cursor: 8,
                storageKey: nil,
                entity: "workspace",
                entityID: key,
                record: .object([
                    "version": .number(7),
                    "webOnlyRule": .object(["timezone": .string("Europe/Warsaw")])
                ])
            )
        ])
        XCTAssertEqual(
            initial.documents[key],
            .object([
                "version": .number(7),
                "webOnlyRule": .object(["timezone": .string("Europe/Warsaw")])
            ])
        )

        let deleted = try RootineRelationalWorkspaceAdapter.materialize(changes: [
            RootineRelationalPullChange(
                cursor: 9,
                storageKey: nil,
                entity: "workspace",
                entityID: key,
                operation: "delete"
            )
        ], onto: initial)
        XCTAssertNil(deleted.documents[key])
        XCTAssertEqual(deleted.revisions[key], 9)
    }

    func testB05ChangeAdapterKeepsStableTransportFields() {
        let change = RootineB05RelationalReadAdapter.change(
            cursor: 7,
            entity: "task",
            entityID: "101",
            operation: "upsert",
            record: .object(["text": .string("Zadanie")]),
            revision: 4
        )
        XCTAssertEqual(change.cursor, 7)
        XCTAssertEqual(change.entityID, "101")
        XCTAssertEqual(change.operation, "upsert")
        XCTAssertEqual(change.revision, 4)

        let pull = RootineB05RelationalReadAdapter.pull(
            fromCursor: 6,
            nextCursor: 7,
            hasMore: false,
            changes: [change]
        )
        XCTAssertEqual(pull.contractVersion, 3)
        XCTAssertEqual(pull.changes, [change])
    }

    func testB05BootstrapAdapterRoundTripsPaginationFields() throws {
        let response = RootineB05RelationalReadAdapter.bootstrap(
            serverCursor: 12,
            nextCursor: 5,
            hasMore: true,
            changes: []
        )

        let encoded = try JSONEncoder().encode(response)
        let decoded = try JSONDecoder().decode(RootineRelationalBootstrapResponse.self, from: encoded)
        XCTAssertEqual(decoded.contractVersion, 3)
        XCTAssertEqual(decoded.serverCursor, 12)
        XCTAssertEqual(decoded.nextCursor, 5)
        XCTAssertTrue(decoded.hasMore)
    }

    func testNormalizedRequestOmitsBootstrapOnlyFields() throws {
        let encoder = JSONEncoder()
        let bootstrap = try JSONSerialization.jsonObject(
            with: encoder.encode(NormalizedSyncRequest(
                contractVersion: 3,
                action: "bootstrap",
                cursor: nil,
                limit: 500,
                deviceID: "device"
            ))
        ) as? [String: Any]
        XCTAssertEqual(bootstrap?["contract_version"] as? Int, 3)
        XCTAssertEqual(bootstrap?["action"] as? String, "bootstrap")
        XCTAssertEqual(bootstrap?["device_id"] as? String, "device")
        XCTAssertNil(bootstrap?["cursor"])
        XCTAssertNil(bootstrap?["limit"])

        let pull = try JSONSerialization.jsonObject(
            with: encoder.encode(NormalizedSyncRequest(
                contractVersion: 3,
                action: "pull",
                cursor: 4,
                limit: 500,
                deviceID: "device"
            ))
        ) as? [String: Any]
        XCTAssertEqual(pull?["cursor"] as? Int, 4)
        XCTAssertEqual(pull?["limit"] as? Int, 500)
    }

    func testNormalizedReadFlagIsScopedByAccountAndEnvironment() {
        let suite = "rootine-b08-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        let flags = UserDefaultsRootineReadFeatureFlagStore(defaults: defaults)

        XCTAssertFalse(flags.normalizedReadEnabled(accountID: "account-a", environment: "staging"))
        flags.setNormalizedReadEnabled(true, accountID: "account-a", environment: "staging")
        XCTAssertTrue(flags.normalizedReadEnabled(accountID: "account-a", environment: "staging"))
        XCTAssertFalse(flags.normalizedReadEnabled(accountID: "account-b", environment: "staging"))
        XCTAssertFalse(flags.normalizedReadEnabled(accountID: "account-a", environment: "production"))
        defaults.removePersistentDomain(forName: suite)
    }

    func testNativeNoOpMergePreservesRichWebOnlyFields() throws {
        var goalsPayload = try fixture("goals-workspace-v1", as: JSONValue.self)
        var travelPayload = try fixture("travel-workspace-v2", as: JSONValue.self)
        if case .object(var root) = goalsPayload,
           case .array(var goals) = root["goals"],
           case .object(var goal) = goals[0] {
            goal["iconKey"] = .string("dumbbell")
            goals[0] = .object(goal)
            root["goals"] = .array(goals)
            goalsPayload = .object(root)
        }
        if case .object(var root) = travelPayload,
           case .array(var trips) = root["trips"],
           case .object(var trip) = trips[0] {
            trip["name"] = .string("Weekend nad morzem")
            trips[0] = .object(trip)
            root["trips"] = .array(trips)
            travelPayload = .object(root)
        }

        let nativeGoals = try RootineCanonicalWorkspaceMapping.goalsWorkspace(from: goalsPayload)
        let nativeTravel = try RootineCanonicalWorkspaceMapping.travelWorkspace(from: travelPayload)

        XCTAssertEqual(try RootineCanonicalWorkspaceMapping.mergedGoalsPayload(for: nativeGoals, onto: goalsPayload), goalsPayload)
        XCTAssertEqual(try RootineCanonicalWorkspaceMapping.mergedTravelPayload(for: nativeTravel, onto: travelPayload), travelPayload)

        if case .object(let deletedGoals) = try RootineCanonicalWorkspaceMapping.mergedGoalsPayload(for: .empty, onto: goalsPayload),
           case .array(let goals) = deletedGoals["goals"] {
            XCTAssertTrue(goals.isEmpty)
        } else {
            XCTFail("Native goal deletion should be reflected in the canonical document")
        }
        if case .object(let deletedTrips) = try RootineCanonicalWorkspaceMapping.mergedTravelPayload(for: .empty, onto: travelPayload),
           case .array(let trips) = deletedTrips["trips"] {
            XCTAssertTrue(trips.isEmpty)
        } else {
            XCTFail("Native trip deletion should be reflected in the canonical document")
        }
    }

    func testSportNoOpMergePreservesRichRecordFields() throws {
        let timestamp = "2026-08-30T12:00:00.000Z"
        let workout = SportWorkout(id: "ios-rich-sport", title: "Bieg", date: "2026-08-30", minutes: 30, kind: "Bieg", completed: true, createdAt: timestamp)
        let pending = SportWorkout(id: "ios-rich-pending", title: "Mobilność", date: "2026-08-31", minutes: 20, kind: "Mobilność", completed: false, createdAt: timestamp)
        var rich = try RootineCanonicalWorkspaceMapping.payload(for: SportWorkspace(version: 1, updatedAt: timestamp, workouts: [workout, pending]))
        if case .object(var root) = rich,
           case .array(var sessions) = root["sessions"],
           case .object(var session) = sessions[0] {
            session["exercises"] = .array([.object(["exerciseId": .string("web-exercise"), "sets": .number(4)])])
            session["metrics"] = .object(["distanceKm": .number(8.4)])
            sessions[0] = .object(session)
            root["sessions"] = .array(sessions)
            if case .array(var scheduled) = root["scheduledWorkouts"], case .object(var item) = scheduled[0] {
                item["planId"] = .string("web-plan")
                item["status"] = .string("started")
                item["contentSnapshot"] = .array([.object(["exerciseId": .string("web-exercise")])])
                item["notes"] = .string("Web-only note")
                scheduled[0] = .object(item)
                root["scheduledWorkouts"] = .array(scheduled)
            }
            rich = .object(root)
        }
        let native = try RootineCanonicalWorkspaceMapping.sportWorkspace(from: rich)
        XCTAssertEqual(try RootineCanonicalWorkspaceMapping.mergedSportPayload(for: native, onto: rich), rich)
    }

    func testSportIncompleteAndDeletedRecordsRemainConsistent() throws {
        let timestamp = "2026-08-30T12:00:00.000Z"
        let workout = SportWorkout(id: "ios-status-sport", title: "Bieg", date: "2026-08-30", minutes: 30, kind: "Bieg", completed: false, createdAt: timestamp)
        var base = try RootineCanonicalWorkspaceMapping.payload(for: SportWorkspace(version: 1, updatedAt: timestamp, workouts: [workout]))
        if case .object(var root) = base {
            root["history"] = .array([.object([
                "id": .string("ios-session-status"), "title": .string(workout.title), "discipline": .string("running"),
                "date": .string(workout.date), "plannedDurationMinutes": .number(30), "durationMinutes": .number(0), "status": .string("missed")
            ])])
            root["sessions"] = .array([.object([
                "id": .string("ios-session-status"), "cycleWorkoutId": .string(workout.id), "title": .string(workout.title), "discipline": .string("running"),
                "date": .string(workout.date), "plannedDurationMinutes": .number(30), "durationMinutes": .number(0), "status": .string("missed"),
                "exercises": .array([])
            ])])
            root["workoutOutcomes"] = .object([workout.id: .object([
                "status": .string("missed"), "sessionId": .string("ios-session-status"), "updatedAt": .string(timestamp)
            ])])
            base = .object(root)
        }
        let native = try RootineCanonicalWorkspaceMapping.sportWorkspace(from: base)
        let preserved = try RootineCanonicalWorkspaceMapping.mergedSportPayload(for: native, onto: base)
        XCTAssertEqual(preserved, base)

        let completed = SportWorkspace(version: 1, updatedAt: timestamp, workouts: [
            SportWorkout(id: workout.id, title: workout.title, date: workout.date, minutes: 30, kind: workout.kind, completed: true, createdAt: workout.createdAt)
        ])
        let transitioned = try RootineCanonicalWorkspaceMapping.mergedSportPayload(for: completed, onto: base)
        if case .object(let root) = transitioned,
           case .array(let history) = root["history"],
           case .array(let sessions) = root["sessions"] {
            XCTAssertEqual(history.count, 1)
            XCTAssertEqual(sessions.count, 1)
            XCTAssertEqual(root["scheduledWorkouts"], .array([]))
            XCTAssertEqual(objectValue(history[0])?["status"], .string("completed"))
            XCTAssertEqual(objectValue(sessions[0])?["status"], .string("completed"))
        } else {
            XCTFail("Completing a missed workout should replace, not duplicate, canonical records")
        }

        let deleted = try RootineCanonicalWorkspaceMapping.mergedSportPayload(for: .empty, onto: base)
        if case .object(let root) = deleted {
            XCTAssertEqual(root["history"], .array([]))
            XCTAssertEqual(root["sessions"], .array([]))
            XCTAssertEqual(root["scheduledWorkouts"], .array([]))
            if case .object(let outcomes) = root["workoutOutcomes"] { XCTAssertNil(outcomes[workout.id]) }
        } else {
            XCTFail("Sport deletion should remove all canonical records for the native workout")
        }
    }

    func testMoreNativePayloadsUseCanonicalKeysAndShapes() throws {
        let timestamp = "2026-08-30T12:00:00.000Z"
        let workout = SportWorkout(id: "ios-workout", title: "Bieg", date: "2026-08-30", minutes: 30, kind: "Bieg", completed: true, createdAt: timestamp)
        let pendingWorkout = SportWorkout(id: "ios-pending", title: "Mobilność", date: "2026-08-31", minutes: 20, kind: "Mobilność", completed: false, createdAt: timestamp)
        let sport = try RootineCanonicalWorkspaceMapping.payload(for: SportWorkspace(version: 1, updatedAt: timestamp, workouts: [workout]))
        let pendingSport = try RootineCanonicalWorkspaceMapping.payload(for: SportWorkspace(version: 1, updatedAt: timestamp, workouts: [pendingWorkout]))
        let goals = try RootineCanonicalWorkspaceMapping.payload(for: GoalsWorkspace(version: 1, updatedAt: timestamp, goals: [GoalRecord(id: "ios-goal", title: "Cel", detail: "Opis", current: 1, target: 10, icon: "target", createdAt: timestamp, updatedAt: timestamp)]))
        let work = try RootineCanonicalWorkspaceMapping.payload(for: WorkWorkspace(version: 1, updatedAt: timestamp, activeFocusStartedAt: nil, focusSessions: []))
        let travel = try RootineCanonicalWorkspaceMapping.payload(for: TravelWorkspace(version: 1, updatedAt: timestamp, trips: []))
        let health = try RootineCanonicalWorkspaceMapping.payload(for: HealthWorkspace(version: 1, updatedAt: timestamp, checkIns: [:], reminders: [HealthReminder(id: "reminder", title: "Woda", detail: "Szklanka", completedDates: [])]))

        XCTAssertEqual(RootineCanonicalWorkspaceMapping.storageKey(for: .sport), "rootine-sport-planner-v1")
        XCTAssertEqual(RootineCanonicalWorkspaceMapping.storageKey(for: .goals), "rootine.goals.v1")
        XCTAssertEqual(RootineCanonicalWorkspaceMapping.storageKey(for: .health), "rootine.health.workspace.v1")
        if case .object(let sportObject) = sport { XCTAssertNil(sportObject["updatedAt"]) }
        let clearedSport = try RootineCanonicalWorkspaceMapping.mergedSportPayload(for: .empty, onto: pendingSport)
        if case .object(let clearedObject) = clearedSport, case .array(let cycles) = clearedObject["cycles"] {
            XCTAssertEqual(cycles.count, 1)
            if case .object(let cycle) = cycles[0], case .array(let workouts) = cycle["workouts"] { XCTAssertTrue(workouts.isEmpty) }
        } else {
            XCTFail("Sport cycle should retain its canonical shape after native deletion")
        }
        XCTAssertNoThrow(try RootineCanonicalWorkspaceMapping.sportWorkspace(from: sport))
        XCTAssertNoThrow(try RootineCanonicalWorkspaceMapping.goalsWorkspace(from: goals))
        XCTAssertNoThrow(try RootineCanonicalWorkspaceMapping.workWorkspace(from: work))
        XCTAssertNoThrow(try RootineCanonicalWorkspaceMapping.travelWorkspace(from: travel))
        XCTAssertNoThrow(try RootineCanonicalWorkspaceMapping.healthWorkspace(from: health))
    }

    func testNormalizedProductFixtureMatchesNativeModel() throws {
        let product = try fixture("nutrition-product", as: NutritionProduct.self)

        XCTAssertEqual(product.barcode, "5901234123457")
        XCTAssertEqual(product.source, "openfoodfacts")
        XCTAssertEqual(product.per100g.protein, 12)
    }

    func testFileStorePersistsWorkspaceAndCoalescesPendingMutation() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("rootine-tests-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = WorkspaceFileStore(userID: "user-a", rootURL: root)
        let workspace = try fixture("task-workspace-v2", as: TaskWorkspace.self)

        try await store.save(workspace, key: .tasks)
        let restored = try await store.load(TaskWorkspace.self, key: .tasks)
        XCTAssertEqual(restored, workspace)

        let payload = try JSONDecoder().decode(JSONValue.self, from: JSONEncoder().encode(workspace))
        try await store.enqueue(PendingWorkspaceMutation(id: "first", storageKey: RootineStorageKey.tasks.rawValue, payload: payload, contentHash: "a", expectedRevision: 0, createdAt: RootineDate.isoTimestamp()))
        try await store.enqueue(PendingWorkspaceMutation(id: "second", storageKey: RootineStorageKey.tasks.rawValue, payload: payload, contentHash: "b", expectedRevision: 0, createdAt: RootineDate.isoTimestamp()))

        let queue = try await store.pendingMutations()
        XCTAssertEqual(queue.map(\.id), ["second"])
    }

    func testLegacyAliasMigrationUsesCanonicalKeyAndRevisionZero() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("rootine-tests-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = WorkspaceFileStore(userID: "legacy-user", rootURL: root)
        let remoteClient = FakeWorkspaceRemote()
        let syncEngine = WorkspaceSyncEngine(store: store, remote: remoteClient)
        let timestamp = "2026-08-30T12:00:00.000Z"
        let legacy = SportWorkspace(version: 1, updatedAt: timestamp, workouts: [
            SportWorkout(id: "legacy-workout", title: "Bieg", date: "2026-08-30", minutes: 30, kind: "Bieg", completed: true, createdAt: timestamp)
        ])
        let legacyPayload = try jsonValue(legacy)
        let legacyRow = RemoteWorkspaceSnapshot(
            storageKey: RootineStorageKey.sport.rawValue,
            payload: legacyPayload,
            contentHash: "legacy",
            revision: 7,
            updatedAt: timestamp
        )

        let result = try await WorkspaceCanonicalReconciler.reconcile(
            nil,
            fallback: SportWorkspace.empty,
            key: .sport,
            remote: [legacyRow.storageKey: legacyRow],
            shadow: nil,
            store: store,
            syncEngine: syncEngine,
            encode: { try RootineCanonicalWorkspaceMapping.payload(for: $0) },
            merge: { try RootineCanonicalWorkspaceMapping.mergedSportPayload(for: $0, onto: $1) },
            decode: { try RootineCanonicalWorkspaceMapping.sportWorkspace(from: $0) }
        )

        XCTAssertEqual(result.value.workouts, legacy.workouts)
        let pending = try await store.pendingMutations()
        XCTAssertEqual(pending.count, 1)
        XCTAssertEqual(pending.first?.storageKey, "rootine-sport-planner-v1")
        XCTAssertEqual(pending.first?.expectedRevision, 0)
        if case .object(let payload) = pending.first?.payload, case .number(let version) = payload["version"] {
            XCTAssertEqual(version, 5)
        } else {
            XCTFail("Legacy alias should be rewritten as the canonical Sport payload")
        }
    }

    func testHealthValidationHistoryAndMetricsAreDeterministic() {
        let timestamp = "2026-08-30T12:00:00.000Z"
        let workspace = HealthWorkspace(
            version: 1,
            updatedAt: timestamp,
            checkIns: [
                "2026-08-30": HealthCheckIn(date: "2026-08-30", energy: 2, note: "  spokojnie  ", updatedAt: timestamp),
                "2026-08-29": HealthCheckIn(date: "2026-08-29", energy: 4, note: nil, updatedAt: timestamp),
                "bad": HealthCheckIn(date: "2026-08-31", energy: 9, note: nil, updatedAt: timestamp)
            ],
            reminders: [
                HealthReminder(id: "water", title: "Starsza kopia", detail: "", completedDates: []),
                HealthReminder(id: "water", title: "  Woda  ", detail: "Szklanka", completedDates: ["2026-08-30", "2026-08-30"]),
                HealthReminder(id: "invalid", title: "", detail: "", completedDates: [])
            ]
        )

        XCTAssertTrue(rootineHealthLocalDateIsValid("2024-02-29"))
        XCTAssertFalse(rootineHealthLocalDateIsValid("2023-02-29"))
        XCTAssertTrue(rootineHealthCheckInIsValid(workspace.checkIns["2026-08-30"]!))
        XCTAssertFalse(rootineHealthCheckInIsValid(workspace.checkIns["bad"]!))
        XCTAssertFalse(rootineHealthWorkspaceIsValid(workspace))

        let sanitized = rootineSanitizedHealthWorkspace(workspace)
        XCTAssertEqual(sanitized.checkIns.keys.sorted(), ["2026-08-29", "2026-08-30"])
        XCTAssertEqual(sanitized.checkIns["2026-08-30"]?.note, "spokojnie")
        XCTAssertEqual(sanitized.reminders.count, 1)
        XCTAssertEqual(sanitized.reminders.first?.id, "water")
        XCTAssertEqual(sanitized.reminders.first?.completedDates, ["2026-08-30"])
        XCTAssertTrue(rootineHealthWorkspaceIsValid(sanitized))

        XCTAssertEqual(sanitized.checkInHistory(limit: 2).map(\.date), ["2026-08-30", "2026-08-29"])
        let metrics = sanitized.metrics(for: "2026-08-30", historyDays: 7)
        XCTAssertEqual(metrics.todayEnergy, 2)
        XCTAssertEqual(metrics.checkInCount, 2)
        XCTAssertEqual(metrics.averageEnergy, 3)
        XCTAssertEqual(metrics.reminderCount, 1)
        XCTAssertEqual(metrics.completedReminderCount, 1)
    }

    func testHealthSanitizationResolvesRepairedDateCollisionsDeterministically() {
        let older = HealthCheckIn(
            date: "2026-08-30",
            energy: 1,
            note: "older",
            updatedAt: "2026-08-30T10:00:00.000Z"
        )
        let newer = HealthCheckIn(
            date: "2026-08-30",
            energy: 4,
            note: "newer",
            updatedAt: "2026-08-30T11:00:00.000Z"
        )
        let workspace = HealthWorkspace(
            version: 1,
            updatedAt: "2026-08-30T12:00:00.000Z",
            checkIns: ["malformed-a": older, "malformed-b": newer],
            reminders: []
        )

        let sanitized = rootineSanitizedHealthWorkspace(workspace)
        XCTAssertEqual(sanitized.checkIns["2026-08-30"]?.energy, 4)
        XCTAssertEqual(sanitized.checkIns["2026-08-30"]?.note, "newer")
        XCTAssertEqual(rootineSanitizedHealthWorkspace(workspace), sanitized)
    }

    func testHealthCanonicalMergePropagatesReminderDeletion() throws {
        let timestamp = "2026-08-30T12:00:00.000Z"
        let base = try RootineCanonicalWorkspaceMapping.payload(for: HealthWorkspace(
            version: 1,
            updatedAt: timestamp,
            checkIns: [:],
            reminders: [HealthReminder(id: "water", title: "Woda", detail: "", completedDates: [])]
        ))
        let deleted = try RootineCanonicalWorkspaceMapping.mergedHealthPayload(
            for: HealthWorkspace(version: 1, updatedAt: timestamp, checkIns: [:], reminders: []),
            onto: base
        )
        guard case .object(let root) = deleted, case .array(let reminders) = root["reminders"] else {
            return XCTFail("Health reminders should remain an array after deletion")
        }
        XCTAssertTrue(reminders.isEmpty)
    }

    func testGoalsAndHealthLegacyAliasesMigrateAtRevisionZero() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("rootine-tests-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = WorkspaceFileStore(userID: "legacy-more-user", rootURL: root)
        let remoteClient = FakeWorkspaceRemote()
        let syncEngine = WorkspaceSyncEngine(store: store, remote: remoteClient)
        let timestamp = "2026-08-30T12:00:00.000Z"
        let goals = GoalsWorkspace(version: 1, updatedAt: timestamp, goals: [
            GoalRecord(id: "legacy-goal", title: "Cel", detail: "Opis", current: 2, target: 10, icon: "target", createdAt: timestamp, updatedAt: timestamp)
        ])
        let health = HealthWorkspace(version: 1, updatedAt: timestamp, checkIns: [:], reminders: [
            HealthReminder(id: "legacy-reminder", title: "Woda", detail: "Szklanka", completedDates: [])
        ])

        let goalsRow = RemoteWorkspaceSnapshot(storageKey: RootineStorageKey.goals.rawValue, payload: try jsonValue(goals), contentHash: "legacy-goals", revision: 5, updatedAt: timestamp)
        _ = try await WorkspaceCanonicalReconciler.reconcile(
            nil,
            fallback: GoalsWorkspace.empty,
            key: .goals,
            remote: [goalsRow.storageKey: goalsRow],
            shadow: nil,
            store: store,
            syncEngine: syncEngine,
            encode: { try RootineCanonicalWorkspaceMapping.payload(for: $0) },
            merge: { try RootineCanonicalWorkspaceMapping.mergedGoalsPayload(for: $0, onto: $1) },
            decode: { try RootineCanonicalWorkspaceMapping.goalsWorkspace(from: $0) }
        )
        let healthRow = RemoteWorkspaceSnapshot(storageKey: RootineStorageKey.health.rawValue, payload: try jsonValue(health), contentHash: "legacy-health", revision: 6, updatedAt: timestamp)
        _ = try await WorkspaceCanonicalReconciler.reconcile(
            nil,
            fallback: HealthWorkspace.empty,
            key: .health,
            remote: [healthRow.storageKey: healthRow],
            shadow: nil,
            store: store,
            syncEngine: syncEngine,
            encode: { try RootineCanonicalWorkspaceMapping.payload(for: $0) },
            merge: { try RootineCanonicalWorkspaceMapping.mergedHealthPayload(for: $0, onto: $1) },
            decode: { try RootineCanonicalWorkspaceMapping.healthWorkspace(from: $0) }
        )

        let pending = try await store.pendingMutations()
        XCTAssertEqual(pending.count, 2)
        XCTAssertEqual(pending.first(where: { $0.storageKey == "rootine.goals.v1" })?.expectedRevision, 0)
        XCTAssertEqual(pending.first(where: { $0.storageKey == "rootine.health.workspace.v1" })?.expectedRevision, 0)
    }

    func testCollidingWorkAndTravelLegacyRowsSeedTheirCurrentCASRevision() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("rootine-tests-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = WorkspaceFileStore(userID: "collision-user", rootURL: root)
        let remoteClient = FakeWorkspaceRemote()
        let syncEngine = WorkspaceSyncEngine(store: store, remote: remoteClient)
        let timestamp = "2026-08-30T12:00:00.000Z"
        let work = WorkWorkspace(version: 1, updatedAt: timestamp, activeFocusStartedAt: timestamp, focusSessions: [])
        let workRow = RemoteWorkspaceSnapshot(storageKey: RootineStorageKey.work.rawValue, payload: try jsonValue(work), contentHash: "legacy-work", revision: 11, updatedAt: timestamp)
        _ = try await WorkspaceCanonicalReconciler.reconcile(
            nil,
            fallback: WorkWorkspace.empty,
            key: .work,
            remote: [workRow.storageKey: workRow],
            shadow: nil,
            store: store,
            syncEngine: syncEngine,
            encode: { try RootineCanonicalWorkspaceMapping.payload(for: $0) },
            merge: { try RootineCanonicalWorkspaceMapping.mergedWorkPayload(for: $0, onto: $1) },
            decode: { try RootineCanonicalWorkspaceMapping.workWorkspace(from: $0) }
        )
        let workPending = try await store.pendingMutations()
        XCTAssertEqual(workPending.first?.expectedRevision, 11)
        XCTAssertEqual(workPending.first?.storageKey, RootineStorageKey.work.rawValue)

        try await store.removeMutation(id: try XCTUnwrap(workPending.first?.id))
        let travel = TravelWorkspace(version: 1, updatedAt: timestamp, trips: [])
        let travelRow = RemoteWorkspaceSnapshot(storageKey: RootineStorageKey.travel.rawValue, payload: try jsonValue(travel), contentHash: "legacy-travel", revision: 13, updatedAt: timestamp)
        _ = try await WorkspaceCanonicalReconciler.reconcile(
            nil,
            fallback: TravelWorkspace.empty,
            key: .travel,
            remote: [travelRow.storageKey: travelRow],
            shadow: nil,
            store: store,
            syncEngine: syncEngine,
            encode: { try RootineCanonicalWorkspaceMapping.payload(for: $0) },
            merge: { try RootineCanonicalWorkspaceMapping.mergedTravelPayload(for: $0, onto: $1) },
            decode: { try RootineCanonicalWorkspaceMapping.travelWorkspace(from: $0) }
        )
        let travelPending = try await store.pendingMutations()
        XCTAssertEqual(travelPending.first?.expectedRevision, 13)
        XCTAssertEqual(travelPending.first?.storageKey, RootineStorageKey.travel.rawValue)
    }

    func testFakeRemoteCASConflictKeepsMutationUntilRetry() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("rootine-tests-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = WorkspaceFileStore(userID: "cas-user", rootURL: root)
        let remoteClient = FakeWorkspaceRemote(shouldApply: false, revision: 4)
        let syncEngine = WorkspaceSyncEngine(store: store, remote: remoteClient)
        let payload: JSONValue = .object(["version": .number(1)])
        try await store.setRevision(4, for: RootineStorageKey.work.rawValue)
        try await syncEngine.enqueue(payload: payload, storageKey: RootineStorageKey.work.rawValue)

        let conflict = try await syncEngine.flush(accessToken: "fake")
        XCTAssertEqual(conflict, .conflict([RootineStorageKey.work.rawValue]))
        let pendingAfterConflict = try await store.pendingMutations()
        XCTAssertEqual(pendingAfterConflict.count, 1)
        let attemptedMutation = await remoteClient.lastMutation()
        XCTAssertEqual(attemptedMutation?.expectedRevision, 4)

        await remoteClient.setShouldApply(true)
        let applied = try await syncEngine.flush(accessToken: "fake")
        XCTAssertEqual(applied, .applied(1))
        let pendingAfterRetry = try await store.pendingMutations()
        XCTAssertTrue(pendingAfterRetry.isEmpty)
        let revisionAfterRetry = try await store.revision(for: RootineStorageKey.work.rawValue)
        XCTAssertEqual(revisionAfterRetry, 5)
    }

    func testZeroAndOneRecordSnapshotsRoundTripAcrossStoreReload() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("rootine-reload-tests-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let timestamp = "2026-09-01T08:00:00.000Z"
        let empty = TaskWorkspace(version: 2, updatedAt: timestamp, tasks: [], habits: [], lists: [], tags: [])

        let firstStore = WorkspaceFileStore(userID: "reload-user", rootURL: root)
        try await firstStore.save(empty, key: .tasks)
        let emptyAfterReload = try await WorkspaceFileStore(userID: "reload-user", rootURL: root)
            .load(TaskWorkspace.self, key: .tasks)
        XCTAssertEqual(emptyAfterReload, empty)

        let operationID = "quick-add-submit-1"
        let recordID = RootineLocalIdentifier.integer(namespace: "task", operationID: operationID)
        var one = empty
        one.tasks = [WorkspaceTask(id: recordID, text: "Jedno zadanie", done: false, view: "dzis")]
        try await firstStore.save(one, key: .tasks)

        let oneAfterReload = try await WorkspaceFileStore(userID: "reload-user", rootURL: root)
            .load(TaskWorkspace.self, key: .tasks)
        XCTAssertEqual(oneAfterReload, one)
        XCTAssertEqual(oneAfterReload?.tasks.first?.id, recordID)
    }

    func testUnsupportedVersionAndCorruptSnapshotAreQuarantined() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("rootine-corrupt-tests-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = WorkspaceFileStore(userID: "corrupt-user", rootURL: root)
        let workspaceDirectory = root.appendingPathComponent("Workspaces", isDirectory: true)
        let snapshotURL = workspaceDirectory.appendingPathComponent("rootine-task-workspace-v1.json")
        try FileManager.default.createDirectory(at: workspaceDirectory, withIntermediateDirectories: true)

        let unsupported = TaskWorkspace(
            version: 0,
            updatedAt: "2026-09-01T08:00:00.000Z",
            tasks: [],
            habits: [],
            lists: [],
            tags: []
        )
        try JSONEncoder().encode(unsupported).write(to: snapshotURL, options: .atomic)
        let unsupportedResult = try await store.load(TaskWorkspace.self, key: .tasks)
        XCTAssertNil(unsupportedResult)
        XCTAssertFalse(FileManager.default.fileExists(atPath: snapshotURL.path))

        try Data("{not-json".utf8).write(to: snapshotURL, options: .atomic)
        let corruptResult = try await store.load(TaskWorkspace.self, key: .tasks)
        XCTAssertNil(corruptResult)
        XCTAssertFalse(FileManager.default.fileExists(atPath: snapshotURL.path))

        let recovery = try await store.recoveryFiles()
        XCTAssertEqual(recovery.count, 2)
        XCTAssertTrue(recovery.allSatisfy { $0.name.contains("corrupt") })
        XCTAssertEqual(try Data(contentsOf: recovery[0].url).isEmpty, false)
    }

    func testDuplicateEnqueueIsIdempotentAndCorruptQueueCanRecover() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("rootine-queue-tests-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = WorkspaceFileStore(userID: "queue-user", rootURL: root)
        let remote = FakeWorkspaceRemote()
        let syncEngine = WorkspaceSyncEngine(store: store, remote: remote)
        let payload: JSONValue = .object(["version": .number(2), "tasks": .array([])])

        let first = try await syncEngine.enqueue(payload: payload, storageKey: RootineStorageKey.tasks.rawValue)
        let duplicate = try await syncEngine.enqueue(payload: payload, storageKey: RootineStorageKey.tasks.rawValue)
        XCTAssertEqual(duplicate.id, first.id)
        let duplicateQueue = try await store.pendingMutations()
        XCTAssertEqual(duplicateQueue.count, 1)

        try Data("broken queue".utf8).write(
            to: root.appendingPathComponent("pending-mutations.json"),
            options: .atomic
        )
        let recoveredEmptyQueue = try await store.pendingMutations()
        XCTAssertTrue(recoveredEmptyQueue.isEmpty)
        _ = try await syncEngine.enqueue(payload: payload, storageKey: RootineStorageKey.tasks.rawValue)
        let newQueue = try await store.pendingMutations()
        let queueRecovery = try await store.recoveryFiles()
        XCTAssertEqual(newQueue.count, 1)
        XCTAssertEqual(queueRecovery.count, 1)
    }

    func testRapidMutationDuringFlushRebasesQueuedSuccessor() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("rootine-rapid-tests-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = WorkspaceFileStore(userID: "rapid-user", rootURL: root)
        let remote = GatedWorkspaceRemote()
        let syncEngine = WorkspaceSyncEngine(store: store, remote: remote)
        let storageKey = RootineStorageKey.tasks.rawValue

        _ = try await syncEngine.enqueue(
            payload: .object(["version": .number(2), "sequence": .number(1)]),
            storageKey: storageKey
        )
        let firstFlush = Task { try await syncEngine.flush(accessToken: "fake") }
        await remote.waitUntilApplyStarted()

        let successor = try await syncEngine.enqueue(
            payload: .object(["version": .number(2), "sequence": .number(2)]),
            storageKey: storageKey
        )
        XCTAssertEqual(successor.expectedRevision, 0)
        await remote.releaseApply()
        let firstOutcome = try await firstFlush.value
        XCTAssertEqual(firstOutcome, .applied(2))

        let rebasedQueue = try await store.pendingMutations()
        let appliedMutations = await remote.appliedMutations()
        XCTAssertTrue(rebasedQueue.isEmpty)
        XCTAssertEqual(appliedMutations.map(\.expectedRevision), [0, 1])
        XCTAssertEqual(appliedMutations.last?.id, successor.id)
        let finalRevision = try await store.revision(for: storageKey)
        XCTAssertEqual(finalRevision, 2)
    }

    func testUndoReceiptNeverOverwritesANewerRapidMutation() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("rootine-undo-tests-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = WorkspaceFileStore(userID: "undo-user", rootURL: root)
        let timestamp = "2026-09-01T08:00:00.000Z"
        let empty = TaskWorkspace(version: 2, updatedAt: timestamp, tasks: [], habits: [], lists: [], tags: [])
        try await store.save(empty, key: .tasks)

        var first = empty
        first.tasks = [WorkspaceTask(id: 1, text: "Pierwsza", done: false, view: "dzis")]
        let firstReceipt = try await store.saveWithReceipt(first, key: .tasks)
        var second = first
        second.tasks.append(WorkspaceTask(id: 2, text: "Druga", done: false, view: "dzis"))
        let secondReceipt = try await store.saveWithReceipt(second, key: .tasks)

        let staleUndoApplied = try await store.undo(firstReceipt)
        let afterStaleUndo = try await store.load(TaskWorkspace.self, key: .tasks)
        let latestUndoApplied = try await store.undo(secondReceipt)
        let afterLatestUndo = try await store.load(TaskWorkspace.self, key: .tasks)
        XCTAssertFalse(staleUndoApplied)
        XCTAssertEqual(afterStaleUndo, second)
        XCTAssertTrue(latestUndoApplied)
        XCTAssertEqual(afterLatestUndo, first)
    }

    func testLocalIdentifiersAreStableAndNamespacedForDuplicateTaps() {
        let operationID = "form-submit-42"
        XCTAssertEqual(
            RootineLocalIdentifier.integer(namespace: "task", operationID: operationID),
            RootineLocalIdentifier.integer(namespace: "task", operationID: operationID)
        )
        XCTAssertNotEqual(
            RootineLocalIdentifier.integer(namespace: "task", operationID: operationID),
            RootineLocalIdentifier.integer(namespace: "habit", operationID: operationID)
        )
        XCTAssertEqual(
            RootineLocalIdentifier.string(namespace: "goal", operationID: operationID),
            RootineLocalIdentifier.string(namespace: "goal", operationID: operationID)
        )

        var gate = WorkspaceCreationGate()
        XCTAssertTrue(gate.claim("task|duplicate-tap"))
        XCTAssertFalse(gate.claim("task|duplicate-tap"))
        gate.release("task|duplicate-tap")
        XCTAssertTrue(gate.claim("task|duplicate-tap"))
    }

    func testScheduledTaskCompletionIsScopedToTheRequestedDate() {
        let schedule = WorkspaceTaskSchedule(
            allDay: true,
            startTime: "",
            completedDates: ["2026-09-01"],
            completedAtByDate: ["2026-09-01": "2026-09-01T09:00:00.000Z"],
            timezone: "Europe/Warsaw"
        )
        let task = WorkspaceTask(
            id: 42,
            text: "Powtarzalne zadanie",
            done: true,
            view: "dzis",
            schedule: schedule
        )

        XCTAssertTrue(rootineTaskIsDoneOnDate(task, dateKey: "2026-09-01"))
        XCTAssertFalse(rootineTaskIsDoneOnDate(task, dateKey: "2026-09-02"))
    }

    func testCalendarProjectionExpandsRecurrenceWithMonthEndClampingAndEndDate() {
        let task = WorkspaceTask(
            id: 42,
            text: "Rozliczenie",
            done: false,
            view: "wszystkie",
            calendarDate: "2026-01-31",
            schedule: WorkspaceTaskSchedule(
                allDay: false,
                startTime: "09:00",
                endDate: "2026-04-30",
                recurrence: "monthly",
                timezone: "Europe/Warsaw"
            )
        )

        let occurrences = rootineCalendarOccurrences(
            [task],
            from: "2026-01-01",
            through: "2026-12-31"
        )

        XCTAssertEqual(occurrences.map(\.calendarDate), [
            "2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"
        ])
        XCTAssertEqual(occurrences.first?.key, "task:42@2026-01-31")
        XCTAssertEqual(occurrences.dropFirst().map(\.isVirtual), [true, true, true])
        XCTAssertEqual(occurrences.dropFirst().map(\.time), ["09:00", "09:00", "09:00"])
    }

    func testCalendarProjectionClampsLeapDayUntilTheNextLeapYear() {
        let task = WorkspaceTask(
            id: 43,
            text: "Urodziny",
            done: false,
            view: "wszystkie",
            calendarDate: "2024-02-29",
            schedule: WorkspaceTaskSchedule(
                allDay: true,
                startTime: "",
                recurrence: "yearly",
                timezone: "Europe/Warsaw"
            )
        )

        XCTAssertEqual(
            rootineTaskOccurrences([task], from: "2024-01-01", through: "2028-12-31")
                .map(\.calendarDate),
            ["2024-02-29", "2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29"]
        )
    }

    func testCalendarProjectionKeepsDailyDatesStableAcrossDSTAndScopesCompletion() {
        let task = WorkspaceTask(
            id: 7,
            text: "Poranny spacer",
            done: false,
            view: "wszystkie",
            calendarDate: "2026-03-27",
            schedule: WorkspaceTaskSchedule(
                allDay: false,
                startTime: "02:30",
                recurrence: "daily",
                completedDates: ["2026-03-29"],
                timezone: "Europe/Warsaw"
            )
        )

        let occurrences = rootineTaskOccurrences([task], from: "2026-03-27", through: "2026-03-31")
        XCTAssertEqual(occurrences.map(\.calendarDate), [
            "2026-03-27", "2026-03-28", "2026-03-29", "2026-03-30", "2026-03-31"
        ])
        XCTAssertEqual(occurrences.map(\.isDone), [false, false, true, false, false])
        XCTAssertEqual(
            RootineDate.instant(
                localDate: "2026-03-29",
                time: "02:30",
                timeZone: TimeZone(identifier: "Europe/Warsaw")!
            ),
            Date(timeIntervalSince1970: 1774747800)
        )
        XCTAssertEqual(
            RootineDate.instant(
                localDate: "2026-10-25",
                time: "02:30",
                timeZone: TimeZone(identifier: "Europe/Warsaw")!
            ),
            Date(timeIntervalSince1970: 1792888200)
        )
    }

    func testCalendarCompletionMutatesOnlyTheRequestedRecurringOccurrence() {
        let task = WorkspaceTask(
            id: 8,
            text: "Raport",
            done: true,
            view: "wszystkie",
            calendarDate: "2026-09-01",
            schedule: WorkspaceTaskSchedule(
                allDay: true,
                startTime: "",
                recurrence: "weekly",
                timezone: "Europe/Warsaw"
            )
        )

        let completed = rootineTaskSettingCompletion(
            task,
            dateKey: "2026-09-08",
            done: true,
            completedAt: "2026-09-08T08:00:00.000Z"
        )
        XCTAssertTrue(completed.done)
        XCTAssertEqual(completed.schedule?.completedDates, ["2026-09-08"])
        XCTAssertEqual(completed.schedule?.completedAtByDate?["2026-09-08"], "2026-09-08T08:00:00.000Z")
        XCTAssertNil(completed.schedule?.completedDates?.first(where: { $0 == "2026-09-01" }))
        XCTAssertTrue(rootineTaskIsDoneOnDate(completed, dateKey: "2026-09-08"))
        XCTAssertFalse(rootineTaskIsDoneOnDate(completed, dateKey: "2026-09-15"))

        let undone = rootineTaskSettingCompletion(completed, dateKey: "2026-09-08", done: false)
        XCTAssertEqual(undone.schedule?.completedDates, [])
        XCTAssertNil(undone.schedule?.completedAtByDate)
        XCTAssertFalse(rootineTaskIsDoneOnDate(undone, dateKey: "2026-09-08"))

        let anchorCompleted = rootineTaskSettingCompletion(task, dateKey: "2026-09-01", done: false)
        XCTAssertFalse(anchorCompleted.done)
        XCTAssertNil(anchorCompleted.schedule?.completedDates)
    }

    func testRelationalTaskScheduleAndCompletionChangesFeedCalendarProjection() throws {
        let base = TaskWorkspace(
            version: 2,
            updatedAt: "2026-09-03T08:00:00.000Z",
            tasks: [],
            habits: [],
            lists: [],
            tags: []
        )
        let materialized = try RootineRelationalWorkspaceAdapter.materialize(changes: [
            RootineRelationalPullChange(
                cursor: 1,
                storageKey: RootineStorageKey.tasks.rawValue,
                entity: "task",
                entityID: "42",
                record: .object([
                    "text": .string("Rozliczenie"),
                    "done": .bool(false),
                    "view": .string("wszystkie"),
                    "calendarDate": .string("2026-09-01")
                ])
            ),
            RootineRelationalPullChange(
                cursor: 2,
                storageKey: RootineStorageKey.tasks.rawValue,
                entity: "schedule",
                entityID: "schedule-42",
                record: .object([
                    "taskId": .number(42),
                    "allDay": .bool(true),
                    "startTime": .string(""),
                    "recurrence": .string("weekly"),
                    "timezone": .string("Europe/Warsaw")
                ])
            ),
            RootineRelationalPullChange(
                cursor: 3,
                storageKey: RootineStorageKey.tasks.rawValue,
                entity: "completion",
                entityID: "completion-42-2026-09-08",
                record: .object([
                    "taskId": .number(42),
                    "date": .string("2026-09-08"),
                    "completedAt": .string("2026-09-08T08:00:00.000Z")
                ])
            )
        ], onto: RootineRelationalMaterialization(
            documents: [RootineStorageKey.tasks.rawValue: try jsonValue(base)],
            revisions: [:]
        ))

        let workspace = try RootineRelationalWorkspaceAdapter.document(TaskWorkspace.self, key: .tasks, from: materialized)
        let occurrences = rootineTaskOccurrences(workspace.tasks, from: "2026-09-01", through: "2026-09-15")
        XCTAssertEqual(occurrences.map(\.calendarDate), ["2026-09-01", "2026-09-08", "2026-09-15"])
        XCTAssertEqual(occurrences.map(\.isDone), [false, true, false])
    }

    func testRootineDateParsesBothTimestampPrecisions() {
        XCTAssertNotNil(RootineDate.date(from: "2026-09-01T08:00:00.123Z"))
        XCTAssertNotNil(RootineDate.date(from: "2026-09-01T08:00:00Z"))
        XCTAssertNil(RootineDate.date(from: "not-a-timestamp"))
    }

    func testWorkspaceExportRoundTripsEveryNativeModuleAndPreservesIdentifiers() throws {
        let timestamp = "2026-09-02T08:00:00.000Z"
        var tasks = TaskWorkspace.empty
        tasks.updatedAt = timestamp
        tasks.tasks = [WorkspaceTask(id: 101, text: "Przegląd", done: false, view: "dzis")]

        var nutrition = NutritionWorkspace.empty
        nutrition.updatedAt = timestamp
        nutrition.days = ["2026-09-02": NutritionDay.empty(date: "2026-09-02")]

        var notes = NotesWorkspace.empty
        notes.updatedAt = timestamp
        notes.notes = [NoteRecord(
            id: "note-export",
            title: "Notatka",
            body: "Treść",
            kind: "text",
            items: [],
            tags: ["qa"],
            listId: "inbox",
            color: .blue,
            pinned: false,
            archived: false,
            createdAt: timestamp,
            updatedAt: timestamp
        )]

        let affairs = AffairsWorkspace(
            version: 2,
            matters: [AffairMatter(
                id: "matter-export",
                title: "Dowód rejestracyjny",
                category: "dokumenty",
                priority: "high",
                status: "open",
                dueDate: "2026-09-10",
                note: "Przedłużyć",
                createdAt: timestamp
            )],
            oneTimePayments: [],
            payments: [],
            subscriptions: [],
            documents: [],
            vehicles: [],
            vehicleItems: [],
            budgets: [],
            attentionStates: []
        )

        let export = RootineWorkspaceExport(
            schemaVersion: RootineWorkspaceExport.currentVersion,
            exportedAt: timestamp,
            accountID: "account-export",
            accountEmail: "qa@example.com",
            tasks: tasks,
            nutrition: nutrition,
            notes: notes,
            sport: SportWorkspace.empty,
            goals: GoalsWorkspace.empty,
            work: WorkWorkspace.empty,
            travel: TravelWorkspace.empty,
            health: HealthWorkspace.empty,
            affairs: affairs
        )

        let restored = try roundTrip(export)
        XCTAssertEqual(restored.schemaVersion, RootineWorkspaceExport.currentVersion)
        XCTAssertEqual(restored.accountID, "account-export")
        XCTAssertEqual(restored.tasks.tasks.first?.id, 101)
        XCTAssertEqual(restored.notes.notes.first?.id, "note-export")
        XCTAssertEqual(restored.nutrition.days["2026-09-02"]?.date, "2026-09-02")
        XCTAssertEqual(restored.affairs.matters.first?.id, "matter-export")
    }

    @MainActor
    func testWorkspaceArchiveRejectsUnsupportedNestedWorkspaceVersion() throws {
        var archive = RootineWorkspaceExport(
            schemaVersion: RootineWorkspaceExport.currentVersion,
            exportedAt: "2026-09-02T08:00:00.000Z",
            accountID: nil,
            accountEmail: nil,
            tasks: .empty,
            nutrition: .empty,
            notes: .empty,
            sport: .empty,
            goals: .empty,
            work: .empty,
            travel: .empty,
            health: .empty,
            affairs: .empty
        )
        archive.tasks.version = 999
        let environment = AppEnvironment(configuration: RootineConfiguration(
            supabaseURL: nil,
            supabasePublishableKey: "",
            backendURL: nil,
            authCallbackScheme: "",
            termsURL: nil,
            privacyURL: nil
        ))

        XCTAssertThrowsError(try environment.validateWorkspaceArchive(archive)) { error in
            XCTAssertEqual(
                error as? RootineWorkspaceArchiveError,
                .unsupportedWorkspaceVersion(
                    key: RootineStorageKey.tasks.rawValue,
                    found: 999,
                    supported: 2
                )
            )
        }
    }

    @MainActor
    func testWorkspaceArchiveRejectsUnsupportedAffairsVersionBeforeNormalization() throws {
        var archive = RootineWorkspaceExport(
            schemaVersion: RootineWorkspaceExport.currentVersion,
            exportedAt: "2026-09-02T08:00:00.000Z",
            accountID: nil,
            accountEmail: nil,
            tasks: .empty,
            nutrition: .empty,
            notes: .empty,
            sport: .empty,
            goals: .empty,
            work: .empty,
            travel: .empty,
            health: .empty,
            affairs: .empty
        )
        archive.affairs.version = 999
        let environment = AppEnvironment(configuration: RootineConfiguration(
            supabaseURL: nil,
            supabasePublishableKey: "",
            backendURL: nil,
            authCallbackScheme: "",
            termsURL: nil,
            privacyURL: nil
        ))

        XCTAssertThrowsError(try environment.validateWorkspaceArchive(archive)) { error in
            XCTAssertEqual(
                error as? RootineWorkspaceArchiveError,
                .unsupportedWorkspaceVersion(
                    key: RootineStorageKey.affairs.rawValue,
                    found: 999,
                    supported: 2
                )
            )
        }
    }

    @MainActor
    func testWorkspaceArchiveRejectsMalformedDataWithRecoveryMessage() async {
        let environment = AppEnvironment(configuration: RootineConfiguration(
            supabaseURL: nil,
            supabasePublishableKey: "",
            backendURL: nil,
            authCallbackScheme: "",
            termsURL: nil,
            privacyURL: nil
        ))

        do {
            try await environment.importWorkspaceArchive(Data("{\"tasks\":\"broken\"}".utf8))
            XCTFail("Malformed archive should be rejected")
        } catch let error as RootineWorkspaceArchiveError {
            XCTAssertEqual(error, .invalidArchive)
            XCTAssertTrue(error.localizedDescription.contains("bieżących danych nie zmieniono"))
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }

    func testAffairCategoryMigrationNeverEmitsUnknownWebValues() {
        XCTAssertEqual(AffairMatterCategory.canonical("dokumenty"), "dokumenty")
        XCTAssertEqual(AffairMatterCategory.canonical("Dokumenty"), "dokumenty")
        XCTAssertEqual(AffairMatterCategory.canonical("Inne"), "dom")
        XCTAssertFalse(AffairMatterCategory.allCases.map(\.rawValue).contains("inne"))
    }

    func testCanonicalReconcileAcceptsNewerRemoteWhenNoLocalMutationIsPending() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("rootine-remote-refresh-tests-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = WorkspaceFileStore(userID: "remote-refresh-user", rootURL: root)
        let remote = FakeWorkspaceRemote()
        let syncEngine = WorkspaceSyncEngine(store: store, remote: remote)
        let timestamp = "2026-09-02T08:00:00.000Z"
        let local = GoalsWorkspace.empty
        let updated = GoalsWorkspace(
            version: 1,
            updatedAt: timestamp,
            goals: [GoalRecord(
                id: "remote-goal",
                title: "Nowszy cel",
                detail: "Z webu",
                current: 2,
                target: 4,
                icon: "target",
                createdAt: timestamp,
                updatedAt: timestamp
            )]
        )
        try await store.save(local, key: .goals)
        try await store.setRevision(3, for: RootineCanonicalWorkspaceMapping.storageKey(for: .goals))
        let row = RemoteWorkspaceSnapshot(
            storageKey: RootineCanonicalWorkspaceMapping.storageKey(for: .goals),
            payload: try RootineCanonicalWorkspaceMapping.payload(for: updated),
            contentHash: "remote-newer",
            revision: 4,
            updatedAt: timestamp
        )

        let result = try await WorkspaceCanonicalReconciler.reconcile(
            local,
            fallback: .empty,
            key: .goals,
            remote: [row.storageKey: row],
            shadow: nil,
            store: store,
            syncEngine: syncEngine,
            encode: RootineCanonicalWorkspaceMapping.payload,
            merge: RootineCanonicalWorkspaceMapping.mergedGoalsPayload,
            decode: RootineCanonicalWorkspaceMapping.goalsWorkspace(from:)
        )

        XCTAssertFalse(result.conflict)
        XCTAssertEqual(result.value.goals.first?.id, "remote-goal")
        let localAfterRefresh = try await store.load(GoalsWorkspace.self, key: .goals)
        XCTAssertEqual(localAfterRefresh?.goals.first?.id, "remote-goal")
        let revisionAfterRefresh = try await store.revision(for: row.storageKey)
        XCTAssertEqual(revisionAfterRefresh, 4)
    }

    func testRecoveryCopyCanBeListedAndSafelyDeleted() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("rootine-recovery-tests-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = WorkspaceFileStore(userID: "recovery-user", rootURL: root)
        let recovery = try await store.writeRecoveryCopy(Data("export".utf8), label: "manual-export")
        let hostile = try await store.writeRecoveryCopy(Data("safe".utf8), label: "../nested/path\\name")
        XCTAssertFalse(hostile.name.contains(".."))
        XCTAssertFalse(hostile.name.contains("/"))
        XCTAssertFalse(hostile.name.contains("\\"))

        let filesBeforeDelete = try await store.recoveryFiles()
        XCTAssertEqual(filesBeforeDelete.map(\.name), [hostile.name, recovery.name].sorted())
        try await store.deleteRecoveryFile(recovery)
        try await store.deleteRecoveryFile(hostile)
        let filesAfterDelete = try await store.recoveryFiles()
        XCTAssertTrue(filesAfterDelete.isEmpty)

        // A URL outside Recovery is ignored rather than allowing path traversal.
        let outside = WorkspaceRecoveryFile(name: "outside.json", url: root.appendingPathComponent("outside.json"))
        try Data("sentinel".utf8).write(to: outside.url, options: .atomic)
        try await store.deleteRecoveryFile(outside)
        XCTAssertEqual(try Data(contentsOf: outside.url), Data("sentinel".utf8))
    }

    func testRecoveryKindsKeepDiagnosticsSupportOnly() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("rootine-recovery-kinds-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = WorkspaceFileStore(userID: "recovery-kinds-user", rootURL: root)

        let archive = try await store.writeRecoveryCopy(
            Data("full archive".utf8),
            label: "before-import",
            kind: .workspaceArchive
        )
        let diagnostic = try await store.writeRecoveryCopy(
            Data("raw diagnostics".utf8),
            label: "work-focus-corrupt",
            kind: .diagnostic
        )

        let files = try await store.recoveryFiles()
        XCTAssertTrue(files.contains(where: { $0.name == archive.name && $0.isRestorable }))
        XCTAssertTrue(files.contains(where: { $0.name == diagnostic.name && !$0.isRestorable }))
        XCTAssertEqual(WorkspaceRecoveryKind.infer(from: "work-focus-corrupt-123.json"), .diagnostic)
        XCTAssertEqual(WorkspaceRecoveryKind.infer(from: "before-import-123.json"), .workspaceArchive)
    }

    func testBatchTransactionRollsBackWorkspaceAndPendingQueueTogether() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("rootine-transaction-tests-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = WorkspaceFileStore(userID: "transaction-user", rootURL: root)
        let timestamp = "2026-09-02T10:00:00.000Z"
        let oldWorkspace = TaskWorkspace(
            version: 2,
            updatedAt: timestamp,
            tasks: [WorkspaceTask(id: 1, text: "Stary rekord", done: false, view: "dzis")],
            habits: [],
            lists: [],
            tags: []
        )
        let newWorkspace = TaskWorkspace(
            version: 2,
            updatedAt: timestamp,
            tasks: [WorkspaceTask(id: 2, text: "Nowy rekord", done: false, view: "dzis")],
            habits: [],
            lists: [],
            tags: []
        )
        try await store.save(oldWorkspace, key: .tasks)
        let oldPayload = try jsonValue(oldWorkspace)
        let newPayload = try jsonValue(newWorkspace)
        let oldMutation = PendingWorkspaceMutation(
            id: "old-mutation",
            storageKey: RootineStorageKey.tasks.rawValue,
            payload: oldPayload,
            contentHash: "old",
            expectedRevision: 0,
            createdAt: timestamp
        )
        let newMutation = PendingWorkspaceMutation(
            id: "new-mutation",
            storageKey: RootineStorageKey.tasks.rawValue,
            payload: newPayload,
            contentHash: "new",
            expectedRevision: 1,
            createdAt: timestamp
        )
        try await store.replacePendingMutations([oldMutation])

        let transaction = try await store.beginBatchTransaction()
        try await store.replaceWorkspaceBatch([
            WorkspaceBatchDocument(key: .tasks, data: try JSONEncoder().encode(newWorkspace))
        ])
        try await store.replacePendingMutations([newMutation])
        try await store.rollbackBatchTransaction(transaction)

        let restoredWorkspace = try await store.load(TaskWorkspace.self, key: .tasks)
        let restoredMutations = try await store.pendingMutations()
        XCTAssertEqual(restoredWorkspace, oldWorkspace)
        XCTAssertEqual(restoredMutations, [oldMutation])
    }

    func testStartupRecoveryRollsBackOrphanedTransactionButSkipsLiveOne() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("rootine-orphaned-transaction-tests-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let liveStore = WorkspaceFileStore(userID: "orphaned-transaction-user", rootURL: root)
        let timestamp = "2026-09-02T10:00:00.000Z"
        let oldWorkspace = TaskWorkspace(
            version: 2,
            updatedAt: timestamp,
            tasks: [WorkspaceTask(id: 11, text: "Stan przed przerwanym importem", done: false, view: "dzis")],
            habits: [],
            lists: [],
            tags: []
        )
        let newWorkspace = TaskWorkspace(
            version: 2,
            updatedAt: timestamp,
            tasks: [WorkspaceTask(id: 12, text: "Niepełny import", done: false, view: "dzis")],
            habits: [],
            lists: [],
            tags: []
        )
        try await liveStore.save(oldWorkspace, key: .tasks)
        let oldMutation = PendingWorkspaceMutation(
            id: "orphan-old",
            storageKey: RootineStorageKey.tasks.rawValue,
            payload: try jsonValue(oldWorkspace),
            contentHash: "orphan-old",
            expectedRevision: 0,
            createdAt: timestamp
        )
        let newMutation = PendingWorkspaceMutation(
            id: "orphan-new",
            storageKey: RootineStorageKey.tasks.rawValue,
            payload: try jsonValue(newWorkspace),
            contentHash: "orphan-new",
            expectedRevision: 1,
            createdAt: timestamp
        )
        try await liveStore.replacePendingMutations([oldMutation])

        _ = try await liveStore.beginBatchTransaction()
        try await liveStore.replaceWorkspaceBatch([
            WorkspaceBatchDocument(key: .tasks, data: try JSONEncoder().encode(newWorkspace))
        ])
        try await liveStore.replacePendingMutations([newMutation])

        // A foreground recovery scan must not touch the transaction currently
        // owned by the live store.
        let liveRecoveryCount = try await liveStore.recoverOrphanedBatchTransactions()
        let liveWorkspace = try await liveStore.load(TaskWorkspace.self, key: .tasks)
        XCTAssertEqual(liveRecoveryCount, 0)
        XCTAssertEqual(liveWorkspace, newWorkspace)

        // A new store models the next process launch: its in-memory active
        // token is empty, so it restores the complete snapshot atomically.
        let restartedStore = WorkspaceFileStore(userID: "orphaned-transaction-user", rootURL: root)
        let restartedRecoveryCount = try await restartedStore.recoverOrphanedBatchTransactions()
        let restartedWorkspace = try await restartedStore.load(TaskWorkspace.self, key: .tasks)
        let restartedMutations = try await restartedStore.pendingMutations()
        XCTAssertEqual(restartedRecoveryCount, 1)
        XCTAssertEqual(restartedWorkspace, oldWorkspace)
        XCTAssertEqual(restartedMutations, [oldMutation])
    }

    func testSportMappingDeduplicatesMalformedIDsAndCarriesUpdatedAt() throws {
        let timestamp = "2026-09-02T10:00:00.000Z"
        let duplicateA = SportWorkout(
            id: "duplicate-workout",
            title: "Pierwsza wersja",
            date: "2026-09-02",
            minutes: 20,
            kind: "Bieg",
            completed: true,
            createdAt: timestamp,
            updatedAt: "2026-09-02T10:01:00.000Z"
        )
        let duplicateB = SportWorkout(
            id: "duplicate-workout",
            title: "Ostatnia wersja",
            date: "2026-09-02",
            minutes: 30,
            kind: "Bieg",
            completed: true,
            createdAt: timestamp,
            updatedAt: "2026-09-02T10:02:00.000Z"
        )
        let payload = try RootineCanonicalWorkspaceMapping.payload(for: SportWorkspace(
            version: 1,
            updatedAt: timestamp,
            workouts: [duplicateA, duplicateB]
        ))
        let decoded = try RootineCanonicalWorkspaceMapping.sportWorkspace(from: payload)

        XCTAssertEqual(decoded.workouts.count, 1)
        XCTAssertEqual(decoded.workouts.first?.title, duplicateB.title)
        XCTAssertEqual(decoded.workouts.first?.updatedAt, duplicateB.updatedAt)
        guard case .object(let object) = payload,
              case .array(let history) = object["history"],
              case .object(let record) = history.first,
              case .string(let updatedAt) = record["updatedAt"] else {
            return XCTFail("Sport history should retain a deterministic updatedAt")
        }
        XCTAssertEqual(updatedAt, duplicateB.updatedAt)
    }

    func testWorkSanitizationClearsInvalidFocusAndKeepsLastDuplicate() {
        let timestamp = "2026-09-02T10:00:00.000Z"
        let first = WorkFocusSession(id: "focus", startedAt: timestamp, endedAt: timestamp, minutes: 10)
        let last = WorkFocusSession(id: "focus", startedAt: timestamp, endedAt: timestamp, minutes: 20)
        let malformed = WorkWorkspace(
            version: 1,
            updatedAt: timestamp,
            activeFocusStartedAt: "not-a-timestamp",
            focusSessions: [first, last, WorkFocusSession(id: "", startedAt: timestamp, endedAt: timestamp, minutes: 4)]
        )

        let sanitized = rootineSanitizedWorkWorkspace(malformed)
        XCTAssertNil(sanitized.activeFocusStartedAt)
        XCTAssertEqual(sanitized.focusSessions.map(\.id), ["focus"])
        XCTAssertEqual(sanitized.focusSessions.first?.minutes, 20)
    }

    func testLegacyCompactWorkSnapshotDoesNotDeleteCanonicalCollections() throws {
        let data = Data("""
        {"version":1,"updatedAt":"2026-09-02T10:00:00.000Z","activeFocusStartedAt":null,"focusSessions":[]}
        """.utf8)
        let legacy = try JSONDecoder().decode(WorkWorkspace.self, from: data)
        XCTAssertFalse(legacy.hasFullProjection)
        let compactRoundTrip = try JSONDecoder().decode(JSONValue.self, from: JSONEncoder().encode(legacy))
        if case .object(let compactObject) = compactRoundTrip {
            XCTAssertNil(compactObject["companies"])
            XCTAssertNil(compactObject["projects"])
            XCTAssertNil(compactObject["tasks"])
        } else {
            XCTFail("Legacy Work snapshot should remain compact on local save")
        }

        let base = try RootineCanonicalWorkspaceMapping.payload(for: WorkWorkspace(
            version: 1,
            updatedAt: "2026-09-02T10:00:00.000Z",
            activeFocusStartedAt: nil,
            focusSessions: [],
            companies: [WorkCompany(id: "company", name: "Acme")],
            projects: [WorkProject(id: "project", companyId: "company", name: "Launch")],
            tasks: [WorkItem(id: "task", projectId: "project", title: "Ship", createdAt: "2026-09-02T10:00:00.000Z")]
        ))
        let merged = try RootineCanonicalWorkspaceMapping.mergedWorkPayload(for: legacy, onto: base)
        guard case .object(let object) = merged,
              case .array(let companies) = object["companies"],
              case .array(let projects) = object["projects"],
              case .array(let tasks) = object["tasks"] else {
            return XCTFail("Legacy compact Work merge should keep canonical collections")
        }
        XCTAssertEqual(companies.count, 1)
        XCTAssertEqual(projects.count, 1)
        XCTAssertEqual(tasks.count, 1)
    }

    func testWorkProjectionRoundTripsCollectionsAndPreservesUnknownRecordFields() throws {
        let timestamp = "2026-09-02T10:00:00.000Z"
        let workspace = WorkWorkspace(
            version: 1,
            updatedAt: timestamp,
            activeFocusStartedAt: nil,
            focusSessions: [WorkFocusSession(id: " focus-1 ", startedAt: timestamp, endedAt: timestamp, minutes: 25, projectId: "project-1")],
            companies: [WorkCompany(id: " company-1 ", name: "Acme", description: "Studio")],
            projects: [WorkProject(id: "project-1", companyId: "company-1", name: "Launch", status: .active)],
            tasks: [WorkItem(id: "task-1", companyId: "company-1", projectId: "project-1", title: "Ship", completed: false, status: .todo, priority: .high, dueDate: "2026-09-04", createdAt: timestamp)]
        )
        var base = try RootineCanonicalWorkspaceMapping.payload(for: workspace)
        if case .object(var root) = base,
           case .array(let companies) = root["companies"],
           case .object(var company) = companies[0] {
            company["webOnlyField"] = .string("preserve")
            root["companies"] = .array([.object(company)])
            base = .object(root)
        }
        let decoded = try RootineCanonicalWorkspaceMapping.workWorkspace(from: base)
        XCTAssertEqual(decoded.companies.first?.id, "company-1")
        XCTAssertEqual(decoded.projects.first?.companyId, "company-1")
        XCTAssertEqual(decoded.tasks.first?.priority, .high)
        XCTAssertEqual(decoded.focusSessions.first?.minutes, 25)

        let merged = try RootineCanonicalWorkspaceMapping.mergedWorkPayload(for: decoded, onto: base)
        guard case .object(let root) = merged,
              case .array(let companies) = root["companies"],
              case .object(let company) = companies[0] else {
            return XCTFail("Work payload should contain canonical company records")
        }
        XCTAssertEqual(company["webOnlyField"], .string("preserve"))
    }

    func testWorkValidationBreaksDanglingRelationshipsAndComputesTotals() {
        let timestamp = "2026-09-02T10:00:00.000Z"
        let workspace = WorkWorkspace(
            version: 1,
            updatedAt: timestamp,
            activeFocusStartedAt: timestamp,
            focusSessions: [WorkFocusSession(id: "focus", startedAt: timestamp, endedAt: timestamp, minutes: 25)],
            companies: [WorkCompany(id: "company", name: "Acme")],
            projects: [WorkProject(id: "project", companyId: "missing", name: "Launch")],
            tasks: [
                WorkItem(id: "task", projectId: "missing", parentId: "task", title: "Ship", completed: false, priority: .urgent, createdAt: timestamp),
                WorkItem(id: "done", projectId: "project", title: "Done", completed: true, status: .completed, createdAt: timestamp)
            ]
        )
        let sanitized = rootineSanitizedWorkWorkspace(workspace)
        XCTAssertNil(sanitized.projects.first?.companyId)
        XCTAssertNil(sanitized.tasks.first?.projectId)
        XCTAssertNil(sanitized.tasks.first?.parentId)
        let totals = rootineWorkTotals(sanitized)
        XCTAssertEqual(totals.projectCount, 1)
        XCTAssertEqual(totals.openTaskCount, 1)
        XCTAssertEqual(totals.completedTaskCount, 1)
        XCTAssertEqual(totals.focusMinutes, 25)
        let now = RootineDate.date(from: timestamp)!.addingTimeInterval(90)
        XCTAssertEqual(rootineFocusElapsedSeconds(startedAt: timestamp, at: now), 90)
        XCTAssertNil(rootineFocusElapsedSeconds(startedAt: "not-a-timestamp", at: now))
    }

    func testPausedFocusMarkerRoundTripsAndRequiresKnownHistory() throws {
        let timestamp = "2026-09-02T10:00:00.000Z"
        let session = WorkFocusSession(id: "focus-segment", startedAt: timestamp, endedAt: timestamp, minutes: 25)
        let paused = WorkWorkspace(
            version: 1,
            updatedAt: timestamp,
            activeFocusStartedAt: nil,
            pausedFocusSessionID: session.id,
            focusSessions: [session]
        )
        XCTAssertEqual(try roundTrip(paused), paused)
        XCTAssertEqual(try objectValue(RootineCanonicalWorkspaceMapping.payload(for: paused))?["pausedFocusSessionID"], .string(session.id))

        var unknown = paused
        unknown.pausedFocusSessionID = "missing"
        XCTAssertNil(rootineSanitizedWorkWorkspace(unknown).pausedFocusSessionID)
        XCTAssertEqual(RootineLocalIdentifier.string(namespace: "focus", operationID: timestamp), RootineLocalIdentifier.string(namespace: "focus", operationID: timestamp))
    }

    func testCanonicalMergesDeduplicateWhitespaceAndRepeatedBaseIDs() throws {
        let timestamp = "2026-09-02T10:00:00.000Z"

        var sportBase = try RootineCanonicalWorkspaceMapping.payload(for: SportWorkspace(
            version: 1,
            updatedAt: timestamp,
            workouts: [SportWorkout(id: "sport-1", title: "Bieg", date: "2026-09-02", minutes: 30, kind: "Bieg", completed: true, createdAt: timestamp)]
        ))
        if case .object(var root) = sportBase,
           case .array(let history) = root["history"],
           let duplicate = history.first {
            root["history"] = .array(history + [duplicate])
            sportBase = .object(root)
        }
        let mergedSport = try RootineCanonicalWorkspaceMapping.mergedSportPayload(
            for: try RootineCanonicalWorkspaceMapping.sportWorkspace(from: sportBase),
            onto: sportBase
        )
        if case .object(let root) = mergedSport,
           case .array(let history) = root["history"] {
            let ids = history.compactMap { objectValue($0)?["id"] }.compactMap { value -> String? in
                guard case .string(let id) = value else { return nil }
                return id.trimmingCharacters(in: .whitespacesAndNewlines)
            }
            XCTAssertEqual(ids.count, Set(ids).count)
        } else {
            XCTFail("Canonical sport history should remain an array")
        }

        var goalsBase = try RootineCanonicalWorkspaceMapping.payload(for: GoalsWorkspace(
            version: 1,
            updatedAt: timestamp,
            goals: [GoalRecord(id: " goal-1 ", title: "Cel", detail: "", current: 1, target: 10, icon: "target", createdAt: timestamp, updatedAt: timestamp)]
        ))
        if case .object(var root) = goalsBase,
           case .array(let goals) = root["goals"],
           let duplicate = goals.first {
            root["goals"] = .array(goals + [duplicate])
            goalsBase = .object(root)
        }
        let mergedGoals = try RootineCanonicalWorkspaceMapping.mergedGoalsPayload(
            for: try RootineCanonicalWorkspaceMapping.goalsWorkspace(from: goalsBase),
            onto: goalsBase
        )
        if case .object(let root) = mergedGoals,
           case .array(let goals) = root["goals"] {
            let ids = goals.compactMap { objectValue($0)?["id"] }.compactMap { value -> String? in
                guard case .string(let id) = value else { return nil }
                return id.trimmingCharacters(in: .whitespacesAndNewlines)
            }
            XCTAssertEqual(ids.count, Set(ids).count)
        } else {
            XCTFail("Canonical goals should remain an array")
        }

        var travelBase = try RootineCanonicalWorkspaceMapping.payload(for: TravelWorkspace(
            version: 1,
            updatedAt: timestamp,
            trips: [TravelRecord(id: "travel-1", destination: "Gdańsk", dateRange: "2026-09-02 – 2026-09-03", nights: 1, itinerary: [], createdAt: timestamp, updatedAt: timestamp)]
        ))
        if case .object(var root) = travelBase,
           case .array(let trips) = root["trips"],
           let duplicate = trips.first {
            root["trips"] = .array(trips + [duplicate])
            travelBase = .object(root)
        }
        let mergedTravel = try RootineCanonicalWorkspaceMapping.mergedTravelPayload(
            for: try RootineCanonicalWorkspaceMapping.travelWorkspace(from: travelBase),
            onto: travelBase
        )
        if case .object(let root) = mergedTravel,
           case .array(let trips) = root["trips"] {
            let ids = trips.compactMap { objectValue($0)?["id"] }.compactMap { value -> String? in
                guard case .string(let id) = value else { return nil }
                return id.trimmingCharacters(in: .whitespacesAndNewlines)
            }
            XCTAssertEqual(ids.count, Set(ids).count)
        } else {
            XCTFail("Canonical travel should remain an array")
        }
    }

    func testTravelItineraryMergeUpdatesDeletesAndAddsByStableID() throws {
        let timestamp = "2026-09-02T10:00:00.000Z"
        let original = TravelRecord(
            id: "trip-stable",
            destination: "Gdańsk",
            dateRange: "2026-09-02 – 2026-09-03",
            nights: 1,
            itinerary: [
                TravelItineraryItem(id: "stop-a", day: "2026-09-02", title: "Molo", detail: "Spacer"),
                TravelItineraryItem(id: "stop-b", day: "2026-09-03", title: "Muzeum", detail: "Bilety")
            ],
            createdAt: timestamp,
            updatedAt: timestamp
        )
        var base = try RootineCanonicalWorkspaceMapping.payload(for: TravelWorkspace(
            version: 1,
            updatedAt: timestamp,
            trips: [original]
        ))
        if case .object(var root) = base,
           case .array(var trips) = root["trips"],
           case .object(var trip) = trips.first,
           case .array(let itinerary) = trip["itinerary"] {
            trip["name"] = .string("Weekend nad morzem")
            if case .object(var first) = itinerary[0] {
                first["location"] = .string("Brzeźno")
                var changed = itinerary
                changed[0] = .object(first)
                trip["itinerary"] = .array(changed)
            }
            trips[0] = .object(trip)
            root["trips"] = .array(trips)
            base = .object(root)
        }

        let updated = TravelRecord(
            id: original.id,
            destination: original.destination,
            dateRange: original.dateRange,
            nights: original.nights,
            itinerary: [
                TravelItineraryItem(id: "stop-a", day: "2026-09-04", title: "Molo po zmianie", detail: "Spacer wieczorem"),
                TravelItineraryItem(id: "stop-c", day: "2026-09-02", title: "Latarnia", detail: "Nowy punkt")
            ],
            createdAt: original.createdAt,
            updatedAt: "2026-09-02T11:00:00.000Z"
        )
        let merged = try RootineCanonicalWorkspaceMapping.mergedTravelPayload(
            for: TravelWorkspace(version: 1, updatedAt: updated.updatedAt, trips: [updated]),
            onto: base
        )

        guard case .object(let root) = merged,
              case .array(let trips) = root["trips"],
              case .object(let trip) = trips.first,
              case .array(let itinerary) = trip["itinerary"] else {
            return XCTFail("Travel merge should keep a canonical trip and itinerary")
        }
        let ids = itinerary.compactMap { objectValue($0)?["id"] }.compactMap { value -> String? in
            guard case .string(let id) = value else { return nil }
            return id
        }
        XCTAssertEqual(ids, ["stop-a", "stop-c"])
        XCTAssertEqual(objectValue(itinerary[0])?["title"], .string("Molo po zmianie"))
        XCTAssertEqual(objectValue(itinerary[0])?["location"], .string(""))
        XCTAssertEqual(objectValue(itinerary[1])?["title"], .string("Latarnia"))
        XCTAssertEqual(trip["name"], .string("Weekend nad morzem"))
    }

    func testTravelFixtureRetainsFullTripDossierAcrossNativeProjection() throws {
        let payload = try fixture("travel-workspace-v2", as: JSONValue.self)
        let native = try RootineCanonicalWorkspaceMapping.travelWorkspace(from: payload)
        let trip = try XCTUnwrap(native.trips.first)

        XCTAssertEqual(native.version, 1)
        XCTAssertEqual(trip.name, "Gdańsk")
        XCTAssertEqual(trip.startDate, "2026-09-12")
        XCTAssertEqual(trip.endDate, "2026-09-15")
        XCTAssertEqual(trip.status, "ready")
        XCTAssertEqual(trip.stays.first?.bookingRef, "ABC")
        XCTAssertEqual(trip.itinerary.first?.location, "Stare Miasto")
        XCTAssertEqual(trip.budget.first?.actual, 900)
        XCTAssertEqual(trip.documents.first?.status, "ready")
        XCTAssertEqual(trip.tasks.first?.category, "booking")
        XCTAssertTrue(rootineValidateTravelWorkspace(native).isEmpty)
        XCTAssertEqual(try roundTrip(native), native)

        let remapped = try RootineCanonicalWorkspaceMapping.payload(for: native)
        guard case .object(let root) = remapped,
              case .array(let trips) = root["trips"],
              case .object(let remappedTrip) = trips.first else {
            return XCTFail("Travel payload should contain a canonical trip")
        }
        XCTAssertEqual(remappedTrip["status"], .string("ready"))
        XCTAssertNotNil(remappedTrip["stays"])
        XCTAssertNotNil(remappedTrip["budget"])
        XCTAssertNotNil(remappedTrip["documents"])
        XCTAssertNotNil(remappedTrip["tasks"])
    }

    func testTravelBudgetSummaryDoesNotDoubleCountReservations() {
        let timestamp = "2026-09-02T10:00:00.000Z"
        var trip = TravelRecord(id: "budget-trip", destination: "Gdańsk", dateRange: "2026-09-12 – 2026-09-15", nights: 3, itinerary: [], createdAt: timestamp, updatedAt: timestamp)
        trip.stays = [TravelStay(id: "stay", name: "Hotel", city: "Gdańsk", address: "", checkIn: "2026-09-12", checkOut: "2026-09-15", bookingRef: "", status: "paid", amount: 900)]
        trip.transports = [TravelTransport(id: "train", mode: "train", title: "PKP", from: "Warszawa", to: "Gdańsk", departure: "2026-09-12", arrival: "2026-09-12", bookingRef: "", status: "booked", amount: 100)]
        trip.budget = [TravelBudgetLine(id: "stay-budget", category: "stay", label: "Hotel", planned: 900, actual: 900, paid: true)]

        let summary = summarizeTravelBudget(trip)
        XCTAssertEqual(summary.planned, 1_000)
        XCTAssertEqual(summary.actual, 1_000)
        XCTAssertEqual(summary.paid, 900)
        XCTAssertEqual(summary.remaining, 0)
        XCTAssertEqual(summary.reservationCommitted, 1_000)
        XCTAssertEqual(summary.unbudgetedReservations, 100)
    }

    func testTravelValidationRejectsDatesTimezoneMoneyAndPackingErrors() throws {
        let timestamp = "2026-09-02T10:00:00.000Z"
        let item = TravelItineraryItem(
            id: "item-1",
            date: "2026-09-12",
            time: "16:20",
            title: "Spacer",
            location: "Stare Miasto",
            kind: "sightseeing",
            note: "",
            reserved: false,
            timezone: "Europe/Warsaw"
        )
        let trip = TravelRecord(
            id: "trip-validation",
            name: "Gdańsk",
            destination: "Gdańsk",
            startDate: "2026-09-12",
            endDate: "2026-09-15",
            status: "planning",
            travelers: ["Rafał"],
            baseCurrency: "PLN",
            note: "",
            archivedAt: nil,
            stays: [TravelStay(id: "stay-1", name: "Hotel", city: "Gdańsk", address: "Długa 1", checkIn: "2026-09-12T15:00:00.000Z", checkOut: "2026-09-15T10:00:00.000Z", bookingRef: "", status: "planned", amount: 900)],
            transports: [],
            bookings: [],
            itinerary: [item],
            budget: [TravelBudgetLine(id: "budget-1", category: "stay", label: "Hotel", planned: 900, actual: 0, paid: false)],
            documents: [],
            tasks: [],
            packingItems: [TravelPackingItem(id: "bag-1", label: "Kurtka", quantity: 1, packed: false)],
            timezone: "Europe/Warsaw",
            createdAt: timestamp,
            updatedAt: timestamp
        )
        let valid = TravelWorkspace(version: 1, updatedAt: timestamp, trips: [trip])
        XCTAssertTrue(rootineValidateTravelWorkspace(valid).isEmpty)

        var invalid = trip
        invalid.baseCurrency = "ZZZ"
        invalid.timezone = "Mars/Phobos"
        invalid.itinerary[0].time = "25:61"
        invalid.stays[0].amount = -1
        invalid.packingItems[0].quantity = 0
        let issues = rootineValidateTravelWorkspace(TravelWorkspace(version: 1, updatedAt: timestamp, trips: [invalid]))
        XCTAssertTrue(issues.contains { if case .invalidCurrency("trip-validation") = $0 { return true }; return false })
        XCTAssertTrue(issues.contains { if case .invalidTimezone("trip-validation") = $0 { return true }; return false })
        XCTAssertTrue(issues.contains { if case .invalidClockTime(tripID: "trip-validation", id: "item-1") = $0 { return true }; return false })
        XCTAssertTrue(issues.contains { if case .invalidAmount(tripID: "trip-validation", collection: "stays", id: "stay-1") = $0 { return true }; return false })
        XCTAssertTrue(issues.contains { if case .invalidQuantity(tripID: "trip-validation", id: "bag-1") = $0 { return true }; return false })

        var reversed = trip
        reversed.endDate = "2026-09-11"
        XCTAssertTrue(rootineValidateTravelWorkspace(TravelWorkspace(version: 1, updatedAt: timestamp, trips: [reversed])).contains { if case .invalidTripDates = $0 { return true }; return false })
    }

    func testTravelLocalDatesRejectNonexistentDSTWallClock() {
        XCTAssertNotNil(RootineDate.date(fromLocalDateTime: "2026-03-29T01:30", timezone: "Europe/Warsaw"))
        XCTAssertNil(RootineDate.date(fromLocalDateTime: "2026-03-29T02:30", timezone: "Europe/Warsaw"))
        XCTAssertEqual(RootineDate.localDate(RootineDate.dateOnly(from: "2026-09-12", timezone: "Pacific/Auckland")!, timezone: "Pacific/Auckland"), "2026-09-12")
    }

    func testRelationalTravelBookingsDoNotMaterializeAsStays() throws {
        let materialized = try RootineRelationalWorkspaceAdapter.materialize(changes: [
            RootineRelationalPullChange(
                cursor: 1,
                storageKey: RootineStorageKey.travel.rawValue,
                entity: "trip",
                entityID: "trip-relational",
                record: .object([
                    "name": .string("Podróż"),
                    "destination": .string("Gdańsk"),
                    "start_date": .string("2026-09-12"),
                    "end_date": .string("2026-09-15"),
                    "status": .string("ongoing"),
                    "base_currency": .string("PLN")
                ])
            ),
            RootineRelationalPullChange(
                cursor: 2,
                storageKey: RootineStorageKey.travel.rawValue,
                entity: "trip_bookings",
                entityID: "booking-1",
                record: .object([
                    "trip_id": .string("trip-relational"),
                    "provider": .string("PKP"),
                    "booking_reference": .string("ABC"),
                    "status": .string("booked"),
                    "amount_minor": .number(12000),
                    "currency_code": .string("PLN")
                ])
            )
        ])
        let payload = try XCTUnwrap(materialized.documents[RootineCanonicalWorkspaceMapping.canonicalStorageKey(for: .travel)])
        let native = try RootineCanonicalWorkspaceMapping.travelWorkspace(from: payload)
        let trip = try XCTUnwrap(native.trips.first)
        XCTAssertEqual(trip.status, "planning")
        XCTAssertTrue(trip.stays.isEmpty)
        XCTAssertEqual(trip.bookings.first?.bookingReference, "ABC")
        XCTAssertEqual(trip.bookings.first?.amountMinor, 12000)
    }

    @MainActor
    func testTravelMutationsUseStableIDsAndRejectInvalidOfflineDrafts() async {
        let environment = AppEnvironment(configuration: RootineConfiguration(
            supabaseURL: nil,
            supabasePublishableKey: "",
            backendURL: nil,
            authCallbackScheme: "",
            termsURL: nil,
            privacyURL: nil
        ))
        await environment.addTrip(destination: "Gdańsk", dateRange: "2026-09-12 – 2026-09-15", nights: 3, operationID: "retry-trip")
        await environment.addTrip(destination: "Gdańsk", dateRange: "2026-09-12 – 2026-09-15", nights: 3, operationID: "retry-trip")
        let tripID = try! XCTUnwrap(environment.travelWorkspace.trips.first?.id)
        await environment.addTravelPackingItem(tripID: tripID, label: "Paszport", operationID: "passport")
        await environment.addTravelPackingItem(tripID: tripID, label: "Paszport", operationID: "passport")
        XCTAssertEqual(environment.travelWorkspace.trips.count, 1)
        XCTAssertEqual(environment.travelWorkspace.trips.first?.packingItems.count, 1)
        await environment.setTravelStatus("not-a-status", tripID: tripID)
        XCTAssertEqual(environment.travelWorkspace.trips.first?.status, "planning")
    }

    private func fixture<T: Decodable>(_ name: String, as type: T.Type) throws -> T {
        let bundle = Bundle(for: ContractFixtureTests.self)
        let url = try XCTUnwrap(bundle.url(forResource: name, withExtension: "json"))
        return try JSONDecoder().decode(T.self, from: Data(contentsOf: url))
    }

    private func roundTrip<T: Codable>(_ value: T) throws -> T {
        try JSONDecoder().decode(T.self, from: JSONEncoder().encode(value))
    }

    private func jsonValue<T: Encodable>(_ value: T) throws -> JSONValue {
        try JSONDecoder().decode(JSONValue.self, from: JSONEncoder().encode(value))
    }

    private func objectValue(_ value: JSONValue?) -> [String: JSONValue]? {
        guard case .object(let object) = value else { return nil }
        return object
    }
}

private actor FakeWorkspaceRemote: WorkspaceRemoteClient {
    private var shouldApply: Bool
    private var revision: Int64
    private var mutations: [PendingWorkspaceMutation] = []

    init(shouldApply: Bool = true, revision: Int64 = 0) {
        self.shouldApply = shouldApply
        self.revision = revision
    }

    func setShouldApply(_ value: Bool) {
        shouldApply = value
    }

    func lastMutation() -> PendingWorkspaceMutation? {
        mutations.last
    }

    func apply(_ mutation: PendingWorkspaceMutation, accessToken: String) async throws -> ApplySnapshotResponse {
        mutations.append(mutation)
        guard shouldApply else {
            return ApplySnapshotResponse(applied: false, storageKey: mutation.storageKey, payload: mutation.payload, contentHash: mutation.contentHash, revision: revision, updatedAt: RootineDate.isoTimestamp())
        }
        revision = max(revision, mutation.expectedRevision) + 1
        return ApplySnapshotResponse(applied: true, storageKey: mutation.storageKey, payload: mutation.payload, contentHash: mutation.contentHash, revision: revision, updatedAt: RootineDate.isoTimestamp())
    }
}

private actor GatedWorkspaceRemote: WorkspaceRemoteClient {
    private var revision: Int64 = 0
    private var applyStarted = false
    private var applyStartWaiters: [CheckedContinuation<Void, Never>] = []
    private var applyGate: CheckedContinuation<Void, Never>?
    private var shouldGateNextApply = true
    private var mutations: [PendingWorkspaceMutation] = []

    func appliedMutations() -> [PendingWorkspaceMutation] {
        mutations
    }

    func waitUntilApplyStarted() async {
        guard !applyStarted else { return }
        await withCheckedContinuation { continuation in
            applyStartWaiters.append(continuation)
        }
    }

    func releaseApply() {
        shouldGateNextApply = false
        applyGate?.resume()
        applyGate = nil
    }

    func apply(_ mutation: PendingWorkspaceMutation, accessToken: String) async throws -> ApplySnapshotResponse {
        mutations.append(mutation)
        if shouldGateNextApply {
            applyStarted = true
            let waiters = applyStartWaiters
            applyStartWaiters.removeAll()
            waiters.forEach { $0.resume() }
            await withCheckedContinuation { continuation in
                applyGate = continuation
            }
        }
        revision = max(revision, mutation.expectedRevision) + 1
        return ApplySnapshotResponse(
            applied: true,
            storageKey: mutation.storageKey,
            payload: mutation.payload,
            contentHash: mutation.contentHash,
            revision: revision,
            updatedAt: RootineDate.isoTimestamp()
        )
    }
}
