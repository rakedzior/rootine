import { test, expect, openRootineRoute } from "./fixtures";

const NUTRITION_STORAGE_KEY = "rootine.nutrition-workspace.v1";
const RECOVERY_INDEX_KEY = "rootine.recovery.index.v1";
const TASK_STORAGE_KEY = "rootine.task-workspace.v1";
const TASK_VOLUME_SEED_BASE_TIME = Date.parse("2026-08-05T10:00:00.000Z");

async function expectNoDocumentOverflow(page: Parameters<typeof openRootineRoute>[0]) {
  await expect.poll(
    () => page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
    { message: `Document must not overflow horizontally at ${page.url()}` },
  ).toBe(true);
}

async function openFirstNutritionProductDialog(page: Parameters<typeof openRootineRoute>[0]) {
  const addButton = page.getByRole("button", {
    name: /^(Dodaj pierwszy produkt|Dodaj produkt do:)/,
  }).first();
  await expect(addButton).toBeVisible();
  await addButton.click();
  return page.getByRole("dialog", { name: "Dodaj produkt" });
}

test.describe("production viewport matrix", { tag: "@viewport" }, () => {
  test("uses the configured viewport and contains long task content", async ({ rootinePage: page }, testInfo) => {
    const configuredViewport = testInfo.project.use.viewport;
    expect(page.viewportSize()).toEqual(configuredViewport);

    await openRootineRoute(page, "/dzisiaj");
    await expectNoDocumentOverflow(page);

    await openRootineRoute(page, "/zadania");
    const taskTitle = `E2E długi tytuł — ${"bardzo-długi-fragment-".repeat(8)}`;
    const taskInput = page.getByRole("textbox", { name: "Nazwa nowego zadania" });
    await taskInput.fill(taskTitle);
    await taskInput.press("Enter");

    const taskButton = page.getByRole("button", {
      name: `Otwórz szczegóły zadania: ${taskTitle}`,
    });
    await expect(taskButton).toBeVisible();
    await expectNoDocumentOverflow(page);

    const bounds = await taskButton.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(-1);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual((configuredViewport?.width ?? 0) + 1);
  });
});

test.describe("browser runtime validation", { tag: "@desktop" }, () => {
  test("task workspace remains usable for 0, 1, 5, 20 and 100 long records", async ({ rootinePage: page }) => {
    await openRootineRoute(page, "/zadania");

    for (const [iteration, count] of [0, 1, 5, 20, 100].entries()) {
      await test.step(`${count} records`, async () => {
        // The app mirrors workspace data into IndexedDB. Each seed must be a
        // newer external write than the previous iteration; otherwise the
        // persistence conflict guard is allowed to keep the older (empty)
        // workspace on a slower CI runner.
        const updatedAt = new Date(TASK_VOLUME_SEED_BASE_TIME + iteration * 1_000).toISOString();
        await page.evaluate(async ({ key, recordCount, seedUpdatedAt }) => {
          const tasks = Array.from({ length: recordCount }, (_, index) => ({
            id: 900_000 + index,
            text: `Wolumen ${String(index + 1).padStart(3, "0")} · ${"bardzo-długi-tytuł-zadania-".repeat(index === recordCount - 1 ? 5 : 1)}`,
            done: false,
            view: "dzis",
            calendarDate: "2026-08-05",
            schedule: { allDay: true, startTime: "", timezone: "Europe/Warsaw" },
            priority: index % 3 === 0 ? "high" : index % 3 === 1 ? "medium" : "low",
            tags: index % 2 === 0 ? ["wolumen-testowy-z-bardzo-długą-nazwą"] : [],
            notes: index === recordCount - 1 ? "Długi opis ".repeat(20) : "",
          }));
          const raw = JSON.stringify({
            version: 2,
            updatedAt: seedUpdatedAt,
            tasks,
            habits: [],
            lists: [],
            tags: [{ id: "wolumen-testowy-z-bardzo-długą-nazwą", label: "wolumen-testowy-z-bardzo-długą-nazwą", color: "#A0A0A0" }],
          });
          const hashRaw = (value: string) => {
            let first = 0x811c9dc5;
            let second = 0x9e3779b9;
            for (let index = 0; index < value.length; index += 1) {
              const code = value.charCodeAt(index);
              first ^= code;
              first = Math.imul(first, 0x01000193);
              second ^= code + index;
              second = Math.imul(second, 0x85ebca6b);
            }
            return `${value.length.toString(36)}-${(first >>> 0).toString(36)}-${(second >>> 0).toString(36)}`;
          };
          const database = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open("rootine-workspaces");
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          const current = await new Promise<{ revision?: number } | null>((resolve, reject) => {
            const request = database.transaction("workspaces", "readonly").objectStore("workspaces").get(key);
            request.onsuccess = () => resolve((request.result as { revision?: number } | undefined) ?? null);
            request.onerror = () => reject(request.error);
          });
          const contentHash = hashRaw(raw);
          const revision = (current?.revision ?? 0) + 1;
          await new Promise<void>((resolve, reject) => {
            const transaction = database.transaction("workspaces", "readwrite");
            transaction.objectStore("workspaces").put({
              key,
              raw,
              revision,
              contentHash,
              updatedAt: seedUpdatedAt,
              writtenAt: new Date().toISOString(),
              byteLength: new TextEncoder().encode(raw).byteLength,
            });
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error);
          });
          database.close();
          window.localStorage.setItem(key, JSON.stringify({
            __rootineWorkspaceManifest: 1,
            key,
            storage: "indexeddb",
            revision,
            contentHash,
            updatedAt: seedUpdatedAt,
            byteLength: new TextEncoder().encode(raw).byteLength,
          }));
        }, { key: TASK_STORAGE_KEY, recordCount: count, seedUpdatedAt: updatedAt });
        await page.reload();
        await expect(page.locator(".ui-content-header__title")).toBeVisible();
        await expect(page.getByRole("button", { name: /^Otwórz szczegóły zadania: Wolumen/ })).toHaveCount(count);
        await expectNoDocumentOverflow(page);

        if (count > 0) {
          const lastTask = page.getByRole("button", { name: /^Otwórz szczegóły zadania: Wolumen/ }).last();
          await lastTask.scrollIntoViewIfNeeded();
          await expect(lastTask).toBeVisible();
          await lastTask.click();
          const taskDetails = page.getByRole("complementary", { name: "Szczegóły zadania" });
          await expect(taskDetails).toBeVisible();
          await taskDetails.getByRole("button", { name: "Zamknij szczegóły zadania" }).click();
          await expect(taskDetails).toHaveCount(0);
        }
      });
    }
  });

  test("representative routes render without console or uncaught runtime errors", async ({ rootinePage: page }) => {
    const runtimeErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") runtimeErrors.push(`console: ${message.text()}`);
    });
    page.on("pageerror", (error) => runtimeErrors.push(`pageerror: ${error.message}`));

    for (const path of ["/dzisiaj", "/zadania", "/odzywianie"]) {
      await openRootineRoute(page, path);
      await expectNoDocumentOverflow(page);
    }

    expect(runtimeErrors).toEqual([]);
  });

  test("JDG consumes a valid month and removes an invalid month from the canonical URL", async ({ rootinePage: page }) => {
    await openRootineRoute(page, "/sprawy?widok=jdg&month=2026-07");

    await expect(page.getByRole("heading", { level: 1, name: "JDG" })).toBeVisible();
    await expect(page.locator(".affairs-month-switcher").getByText(/lipiec 2026/i)).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get("month")).toBe("2026-07");

    await openRootineRoute(page, "/sprawy?widok=jdg&month=2026-13");

    await expect(page.locator(".affairs-month-switcher").getByText(/lipiec 2026/i)).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get("month")).toBeNull();
    expect(new URL(page.url()).searchParams.get("widok")).toBe("jdg");
  });

  test("an invalid affairs view is canonically replaced without adding a history entry", async ({ rootinePage: page }) => {
    await openRootineRoute(page, "/dzisiaj");
    await openRootineRoute(page, "/sprawy?widok=nieistniejacy&source=e2e");

    await expect(page.getByRole("heading", { level: 1, name: "Przegląd" })).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get("widok")).toBeNull();
    expect(new URL(page.url()).searchParams.get("source")).toBe("e2e");

    await page.goBack();
    await expect(page).toHaveURL(/\/dzisiaj$/);
  });

  test("hydration value sits below its actions and matches macro typography", async ({ rootinePage: page }) => {
    await openRootineRoute(page, "/odzywianie");

    const hydrationSection = page
      .getByRole("heading", { level: 2, name: "Nawodnienie", exact: true })
      .locator("xpath=ancestor::section[1]");
    const balanceSection = page
      .getByRole("heading", { level: 2, name: "Bilans dnia", exact: true })
      .locator("xpath=ancestor::section[1]");
    const hydrationAction = hydrationSection.getByRole("button", { name: "Ustaw cel nawodnienia" });
    const hydrationValue = hydrationSection.getByText(/^\d[\d\s,.]* ml \/ \d[\d\s,.]* ml$/);
    const hydrationStatus = hydrationSection.getByText(/^(?:Pozosta\u0142o|Cel osi\u0105gni\u0119ty|Przekroczono)/);
    const macroValue = balanceSection.getByText(/^\d[\d\s,.]* \/ \d[\d\s,.]* g$/).first();

    await expect(hydrationAction).toBeVisible();
    await expect(hydrationValue).toBeVisible();
    await expect(hydrationStatus).toBeVisible();
    await expect(macroValue).toBeVisible();

    const [actionsBox, hydrationBox, macroTypography, hydrationTypography] = await Promise.all([
      hydrationAction.boundingBox(),
      hydrationValue.boundingBox(),
      macroValue.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
          fontVariantNumeric: style.fontVariantNumeric,
          fontWeight: style.fontWeight,
          textAlign: style.textAlign,
        };
      }),
      hydrationValue.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
          fontVariantNumeric: style.fontVariantNumeric,
          fontWeight: style.fontWeight,
          textAlign: style.textAlign,
        };
      }),
    ]);

    expect(actionsBox).not.toBeNull();
    expect(hydrationBox).not.toBeNull();
    expect(hydrationBox!.y).toBeGreaterThanOrEqual(actionsBox!.y + actionsBox!.height - 1);
    expect(hydrationBox!.x + hydrationBox!.width).toBeLessThanOrEqual(actionsBox!.x + actionsBox!.width + 1);
    expect(hydrationTypography).toEqual(macroTypography);
  });

  test("nutrition search automatically combines catalogs and explains Retry-After", async ({ rootinePage: page }) => {
    let requestCount = 0;
    await page.route("**/api/openfoodfacts/search**", async (route) => {
      requestCount += 1;
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        headers: { "retry-after": "17", "cache-control": "no-store" },
        body: JSON.stringify({ error: "rate limited" }),
      });
    });

    await openRootineRoute(page, "/odzywianie");
    const dialog = await openFirstNutritionProductDialog(page);
    const productInput = dialog.getByRole("combobox", { name: "Produkt lub danie" });
    await productInput.fill("Czekolada testowa E2E");
    await expect(dialog.getByRole("alert")).toContainText("Spróbuj ponownie za 17 s.");
    expect(requestCount).toBe(1);
    await expect(dialog.getByRole("button", { name: "Szukaj online" })).toHaveCount(0);
    await expect(dialog.getByText(/USDA|online/i)).toHaveCount(0);
    await expect(dialog.getByRole("spinbutton", { name: "Kalorie" })).toBeEnabled();
  });

  test("nutrition suggestions put basic products before company products", async ({ rootinePage: page }) => {
    await page.route("**/api/openfoodfacts/search**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          products: [{
            id: "off-5900000000001",
            barcode: "5900000000001",
            name: "Ziemniaki chips testowe",
            brand: "Firma testowa",
            source: "openfoodfacts",
            defaultAmount: 100,
            unit: "g",
            per100g: {
              calories: 200,
              protein: 5,
              carbs: 30,
              fat: 10,
            },
          }],
        }),
      });
    });

    await openRootineRoute(page, "/odzywianie");
    const dialog = await openFirstNutritionProductDialog(page);
    await dialog.getByRole("combobox", { name: "Produkt lub danie" }).fill("ziemniaki");

    const groups = dialog.locator(".nutrition-suggestion-group__label");
    await expect(groups).toHaveText(["Produkty podstawowe", "Produkty firmowe"]);
    await expect(dialog.getByText(/USDA|Open Food Facts|online/i)).toHaveCount(0);
  });

  test("nutrition typeahead starts with local matches after one character", async ({ rootinePage: page }) => {
    await page.route("**/api/openfoodfacts/search**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          products: [{
            id: "off-5900331607549",
            barcode: "5900331607549",
            name: "Filet pieczony Duda",
            brand: "Duda",
            source: "openfoodfacts",
            defaultAmount: 100,
            unit: "g",
            per100g: {
              calories: 109,
              protein: 19,
              carbs: 2,
              fat: 2.8,
            },
          }, {
            id: "off-5900331607550",
            barcode: "5900331607550",
            name: "Filet gotowany",
            brand: "Olewnik",
            source: "openfoodfacts",
            defaultAmount: 100,
            unit: "g",
            per100g: {
              calories: 120,
              protein: 19,
              carbs: 2,
              fat: 3,
            },
          }],
        }),
      });
    });

    await openRootineRoute(page, "/odzywianie");
    const dialog = await openFirstNutritionProductDialog(page);
    const productInput = dialog.getByRole("combobox", { name: "Produkt lub danie" });
    const dialogBox = await dialog.boundingBox();

    expect(dialogBox?.width).toBeGreaterThanOrEqual(700);
    expect(dialogBox?.width).toBeLessThan(780);
    expect(dialogBox?.height).toBeGreaterThan(600);

    await productInput.fill("s");

    await expect(dialog.locator(".nutrition-suggestions")).toBeVisible();
    await expect(dialog.locator(".nutrition-suggestion-group__label").first()).toHaveText("Produkty podstawowe");
    await expect(dialog.locator(".nutrition-suggestion")).not.toHaveCount(0);

    await productInput.fill("filet");
    await expect(
      dialog.locator(".nutrition-suggestion__name").filter({ hasText: /Filet z kurczaka/ }),
    ).toBeVisible();
    await expect(dialog.locator(".nutrition-suggestion-group__label")).toHaveText([
      "Produkty podstawowe",
      "Produkty firmowe",
    ]);
    await expect(
      dialog.locator(".nutrition-suggestion__name").filter({ hasText: /Filet pieczony Duda/ }),
    ).toBeVisible();
    await expect(
      dialog.locator(".nutrition-suggestion__name").filter({ hasText: /Filet gotowany/ }),
    ).toBeVisible();
  });

  test("offline catalog failure leaves manual nutrition entry available", async ({ rootinePage: page, context }) => {
    await openRootineRoute(page, "/odzywianie");
    const dialog = await openFirstNutritionProductDialog(page);
    await dialog.getByRole("combobox", { name: "Produkt lub danie" }).fill("Produkt bez sieci E2E");
    await page.unroute("**/api/openfoodfacts/search**");

    await context.setOffline(true);
    try {
      await expect(dialog.getByRole("alert")).toContainText("Nie udało się pobrać dodatkowych podpowiedzi");
      await expect(dialog.getByRole("spinbutton", { name: "Kalorie" })).toBeEnabled();
    } finally {
      await context.setOffline(false);
    }
  });

  test("a failed lazy route module is contained by the route error state", async ({ rootinePage: page }) => {
    await openRootineRoute(page, "/dzisiaj");

    const workLink = page
      .getByRole("navigation", { name: "Obszary aplikacji" })
      .getByRole("link", { name: "Praca" });
    await workLink.hover();
    await page.evaluate(() => window.sessionStorage.setItem("rootine.dev.fail-route", "/praca"));

    await workLink.click();

    await expect(page.getByRole("heading", {
      level: 1,
      name: "Nie możemy wyświetlić tego widoku",
    })).toBeVisible();
    await expect(page.getByRole("link", { name: "Wróć do Dzisiaj" })).toBeVisible();
  });

  test("corrupt nutrition data is preserved and can be replaced deliberately", async ({ rootinePage: page }) => {
    const corruptRaw = "{not-valid-json";
    await page.addInitScript(() => {
      Object.defineProperty(globalThis, "indexedDB", {
        configurable: true,
        value: undefined,
      });
    });
    await openRootineRoute(page, "/dzisiaj");
    await page.evaluate(
      ({ key, raw }) => window.localStorage.setItem(key, raw),
      { key: NUTRITION_STORAGE_KEY, raw: corruptRaw },
    );

    await openRootineRoute(page, "/odzywianie");
    await expect(page.getByRole("alert")).toContainText("Nie udało się odczytać lokalnego dziennika");
    await expect.poll(() => page.evaluate(
      (key) => window.localStorage.getItem(key),
      NUTRITION_STORAGE_KEY,
    )).toBe(corruptRaw);

    const backup = await page.evaluate(
      ({ indexKey, storageKey }) => {
        const records = JSON.parse(window.localStorage.getItem(indexKey) ?? "[]") as Array<{
          storageKey: string;
          backupKey: string;
        }>;
        const record = records.find((candidate) => candidate.storageKey === storageKey);
        if (!record) return null;
        const envelope = JSON.parse(window.localStorage.getItem(record.backupKey) ?? "null") as {
          raw?: string;
        } | null;
        return envelope?.raw ?? null;
      },
      { indexKey: RECOVERY_INDEX_KEY, storageKey: NUTRITION_STORAGE_KEY },
    );
    expect(backup).toBe(corruptRaw);

    await page.getByRole("button", { name: "Rozpocznij pusty dziennik" }).click();
    await expect(page.getByRole("button", { name: /^Dodaj pierwszy produkt/ }).first()).toBeVisible();
    await expect.poll(() => page.evaluate((key) => {
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      return (JSON.parse(raw) as { version?: number }).version ?? null;
    }, NUTRITION_STORAGE_KEY)).toBe(6);
  });

  test("a local write failure is surfaced without discarding the in-memory change", async ({ rootinePage: page }) => {
    await page.addInitScript((blockedKey) => {
      Object.defineProperty(globalThis, "indexedDB", {
        configurable: true,
        value: undefined,
      });
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function setItem(key: string, value: string) {
        if (key === blockedKey) throw new DOMException("Storage quota exceeded", "QuotaExceededError");
        return originalSetItem.call(this, key, value);
      };
    }, NUTRITION_STORAGE_KEY);

    await openRootineRoute(page, "/odzywianie");
    const hydration = page.getByRole("progressbar", { name: "Nawodnienie" });
    const initialHydration = Number(await hydration.getAttribute("aria-valuenow")) || 0;
    await page.getByRole("button", { name: "+250 ml", exact: true }).click();

    await expect(page.getByText("Brak zapisu lokalnego", { exact: true })).toBeVisible();
    await expect(hydration).toHaveAttribute("aria-valuenow", String(initialHydration + 250));
    expect(await page.evaluate((key) => window.localStorage.getItem(key), NUTRITION_STORAGE_KEY)).toBeNull();
  });
});
