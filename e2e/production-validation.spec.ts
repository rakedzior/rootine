import { test, expect, openRoutineRoute } from "./fixtures";

const NUTRITION_STORAGE_KEY = "rootine.nutrition-workspace.v1";
const RECOVERY_INDEX_KEY = "rootine.recovery.index.v1";

async function expectNoDocumentOverflow(page: Parameters<typeof openRoutineRoute>[0]) {
  await expect.poll(
    () => page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
    { message: `Document must not overflow horizontally at ${page.url()}` },
  ).toBe(true);
}

test.describe("production viewport matrix", { tag: "@viewport" }, () => {
  test("uses the configured viewport and contains long task content", async ({ routinePage: page }, testInfo) => {
    const configuredViewport = testInfo.project.use.viewport;
    expect(page.viewportSize()).toEqual(configuredViewport);

    await openRoutineRoute(page, "/dzisiaj");
    await expectNoDocumentOverflow(page);

    await openRoutineRoute(page, "/zadania");
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
  test("representative routes render without console or uncaught runtime errors", async ({ routinePage: page }) => {
    const runtimeErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") runtimeErrors.push(`console: ${message.text()}`);
    });
    page.on("pageerror", (error) => runtimeErrors.push(`pageerror: ${error.message}`));

    for (const path of ["/dzisiaj", "/zadania", "/odzywianie"]) {
      await openRoutineRoute(page, path);
      await expectNoDocumentOverflow(page);
    }

    expect(runtimeErrors).toEqual([]);
  });

  test("online nutrition search waits for an explicit action and explains Retry-After", async ({ routinePage: page }) => {
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

    await openRoutineRoute(page, "/odzywianie");
    await page.getByRole("button", { name: "Dodaj produkt", exact: true }).first().click();
    const dialog = page.getByRole("dialog", { name: "Dodaj produkt" });
    const productInput = dialog.getByRole("combobox", { name: "Produkt lub danie" });
    await productInput.fill("Czekolada testowa E2E");
    await page.waitForTimeout(650);
    expect(requestCount).toBe(0);

    await dialog.getByRole("button", { name: "Szukaj online" }).click();
    await expect(dialog.getByRole("alert")).toContainText("Spróbuj ponownie za 17 s.");
    expect(requestCount).toBe(1);
    await expect(dialog.getByRole("spinbutton", { name: "Kalorie" })).toBeEnabled();
  });

  test("offline catalog failure leaves manual nutrition entry available", async ({ routinePage: page, context }) => {
    await openRoutineRoute(page, "/odzywianie");
    await page.getByRole("button", { name: "Dodaj produkt", exact: true }).first().click();
    const dialog = page.getByRole("dialog", { name: "Dodaj produkt" });
    await dialog.getByRole("combobox", { name: "Produkt lub danie" }).fill("Produkt bez sieci E2E");
    await page.unroute("**/api/openfoodfacts/search**");

    await context.setOffline(true);
    try {
      await dialog.getByRole("button", { name: "Szukaj online" }).click();
      await expect(dialog.getByRole("alert")).toContainText("Baza online jest chwilowo niedostępna");
      await expect(dialog.getByRole("spinbutton", { name: "Kalorie" })).toBeEnabled();
    } finally {
      await context.setOffline(false);
    }
  });

  test("a failed lazy route module is contained by the route error state", async ({ routinePage: page }) => {
    let failedRequests = 0;
    await openRoutineRoute(page, "/dzisiaj");
    await page.route(/\/src\/app\/pages\/Praca\.tsx(?:\?.*)?$/, async (route) => {
      failedRequests += 1;
      await route.abort("failed");
    });

    await page
      .getByRole("navigation", { name: "Obszary aplikacji" })
      .getByRole("link", { name: "Praca" })
      .click();

    await expect(page.getByRole("heading", {
      level: 1,
      name: "Nie możemy wyświetlić tego widoku",
    })).toBeVisible();
    expect(failedRequests).toBeGreaterThan(0);
    await expect(page.getByRole("link", { name: "Wróć do Dzisiaj" })).toBeVisible();
  });

  test("corrupt nutrition data is preserved and can be replaced deliberately", async ({ routinePage: page }) => {
    const corruptRaw = "{not-valid-json";
    await page.addInitScript(() => {
      Object.defineProperty(globalThis, "indexedDB", {
        configurable: true,
        value: undefined,
      });
    });
    await openRoutineRoute(page, "/dzisiaj");
    await page.evaluate(
      ({ key, raw }) => window.localStorage.setItem(key, raw),
      { key: NUTRITION_STORAGE_KEY, raw: corruptRaw },
    );

    await openRoutineRoute(page, "/odzywianie");
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
    await expect(page.getByRole("button", { name: "Dodaj produkt", exact: true }).first()).toBeVisible();
    await expect.poll(() => page.evaluate((key) => {
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      return (JSON.parse(raw) as { version?: number }).version ?? null;
    }, NUTRITION_STORAGE_KEY)).toBe(6);
  });

  test("a local write failure is surfaced without discarding the in-memory change", async ({ routinePage: page }) => {
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

    await openRoutineRoute(page, "/odzywianie");
    await page.getByRole("button", { name: "+250 ml", exact: true }).click();

    await expect(page.getByText("Brak zapisu lokalnego", { exact: true })).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "Nawodnienie" })).toHaveAttribute("aria-valuenow", "250");
    expect(await page.evaluate((key) => window.localStorage.getItem(key), NUTRITION_STORAGE_KEY)).toBeNull();
  });
});
