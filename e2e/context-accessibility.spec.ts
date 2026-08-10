import AxeBuilder from "@axe-core/playwright";
import { expect, openRootineRoute, test } from "./fixtures";

test.describe("context and accessibility regressions", { tag: "@desktop" }, () => {
  test("task groups expose valid named section semantics", async ({ rootinePage: page }) => {
    await openRootineRoute(page, "/zadania?widok=wszystkie");

    await expect(page.getByRole("region", { name: "Grupy zadań" })).toBeVisible();
    const results = await new AxeBuilder({ page })
      .include(".task-groups")
      .withRules(["aria-prohibited-attr"])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test("task deep links select a record and invalid ids fall back canonically", async ({ rootinePage: page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("rootine.task-workspace.v1", JSON.stringify({
        version: 2,
        updatedAt: "2026-08-05T10:00:00.000Z",
        tasks: [{ id: 404, text: "Zadanie z bezpośredniego linku", done: false, view: "wszystkie" }],
        habits: [],
        lists: [],
        tags: [],
      }));
    });
    await openRootineRoute(page, "/zadania?zadanie=00404");

    await expect(page.locator(".task-detail-panel")).toBeVisible();
    await expect(page.locator(".task-detail-panel")).toContainText("Zadanie z bezpośredniego linku");
    expect(new URL(page.url()).searchParams.get("zadanie")).toBe("404");

    await openRootineRoute(page, "/zadania?zadanie=niepoprawne");
    await expect(page.locator(".task-detail-panel")).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: "Nie znaleziono wskazanego zadania" })).toBeVisible();
    expect(new URL(page.url()).searchParams.has("zadanie")).toBe(false);
  });

  test("task deep links leave the saved view and filters untouched after close and reload", async ({ rootinePage: page }) => {
    const savedPreferences = {
      taskView: "jutro",
      listFilter: "praca",
      tagFilter: null,
      listyOpen: true,
      tagiOpen: false,
    };

    // Establish the app origin first so the fixture's one-time storage reset has
    // already run. A reload must then exercise the values written by the app,
    // not silently reseed the test fixture.
    await openRootineRoute(page, "/");
    await page.evaluate(({ preferences }) => {
      window.localStorage.setItem("rootine.tasks.view-mode.v1", "list");
      window.localStorage.setItem("rootine.tasks.sidebar.v2", JSON.stringify(preferences));
      window.localStorage.setItem("rootine.task-workspace.v1", JSON.stringify({
        version: 2,
        updatedAt: "2026-08-05T10:00:00.000Z",
        tasks: [{ id: 404, text: "Zadanie z bezpośredniego linku", done: false, view: "wszystkie", list: "praca" }],
        habits: [],
        lists: [{ id: "praca", label: "Praca", color: "#4f78a8" }],
        tags: [],
      }));
    }, { preferences: savedPreferences });

    const storedPreferences = () => page.evaluate(() => (
      JSON.parse(window.localStorage.getItem("rootine.tasks.sidebar.v2") ?? "null")
    ));

    await openRootineRoute(page, "/zadania?zadanie=404");
    await expect(page.locator(".task-detail-panel")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Wszystkie zadania" })).toBeVisible();
    await expect.poll(storedPreferences).toEqual(savedPreferences);

    await page.getByRole("button", { name: "Zamknij szczegóły zadania" }).click();
    await expect(page.locator(".task-detail-panel")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1, name: "Praca" })).toBeVisible();
    expect(new URL(page.url()).searchParams.get("widok")).toBe("jutro");
    expect(new URL(page.url()).searchParams.has("zadanie")).toBe(false);
    await expect.poll(storedPreferences).toEqual(savedPreferences);

    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Praca" })).toBeVisible();
    await expect.poll(storedPreferences).toEqual(savedPreferences);
  });

  test("task list and taxonomy preferences survive reload", async ({ rootinePage: page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("rootine.tasks.view-mode.v1", "list");
      window.localStorage.setItem("rootine.tasks.sidebar.v2", JSON.stringify({
        taskView: "wszystkie",
        listFilter: "praca",
        tagFilter: null,
        listyOpen: true,
        tagiOpen: false,
      }));
    });

    await openRootineRoute(page, "/zadania?widok=wszystkie");
    await expect(page.getByRole("heading", { level: 1, name: "Praca" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Praca" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Widok listy" })).toHaveAttribute("aria-pressed", "true");
  });

  test("nutrition consumes valid dates, strips impossible dates and keeps date navigation canonical", async ({ rootinePage: page }) => {
    await openRootineRoute(page, "/odzywianie?data=2026-08-03");
    await expect(page.getByRole("button", { name: /Wybrany dzień.*3 sierpnia 2026/ })).toBeVisible();

    await page.getByRole("button", { name: "Poprzedni dzień" }).click();
    await expect(page).toHaveURL(/data=2026-08-02/);
    await expect(page.getByRole("button", { name: /Wybrany dzień.*2 sierpnia 2026/ })).toBeVisible();

    await openRootineRoute(page, "/odzywianie?data=2026-02-31");
    expect(new URL(page.url()).searchParams.has("data")).toBe(false);
    await expect(page.getByRole("button", { name: /Wybrany dzień/ })).toBeVisible();
  });

  test("nutrition draft survives reload and requires an explicit discard", async ({ rootinePage: page }) => {
    await openRootineRoute(page, "/odzywianie");
    await page.getByRole("button", { name: "Dodaj produkt" }).click();
    const entryDialog = page.getByRole("dialog", { name: "Dodaj produkt" });
    await entryDialog.getByRole("combobox", { name: "Produkt lub danie" }).fill("Roboczy produkt audytowy");

    await entryDialog.getByRole("button", { name: "Anuluj" }).click();
    const discardDialog = page.getByRole("dialog", { name: "Odrzucić zmiany produktu?" });
    await expect(discardDialog).toBeVisible();
    await discardDialog.getByRole("button", { name: "Kontynuuj edycję" }).click();
    await expect(entryDialog.getByRole("combobox", { name: "Produkt lub danie" })).toHaveValue("Roboczy produkt audytowy");

    page.once("dialog", (dialog) => dialog.accept());
    await page.reload();
    await expect(page.locator(".ui-page-shell:visible")).toBeVisible();
    await page.getByRole("button", { name: "Dodaj produkt" }).click();
    await expect(page.getByRole("dialog", { name: "Dodaj produkt" }).getByRole("combobox", { name: "Produkt lub danie" }))
      .toHaveValue("Roboczy produkt audytowy");

    await page.getByRole("dialog", { name: "Dodaj produkt" }).getByRole("button", { name: "Anuluj" }).click();
    await page.getByRole("dialog", { name: "Odrzucić zmiany produktu?" }).getByRole("button", { name: "Odrzuć zmiany" }).click();
    await expect(page.getByRole("dialog", { name: "Dodaj produkt" })).toHaveCount(0);
  });

  test("sport record lists use valid table ownership and cycle labels do not clip", async ({ rootinePage: page }) => {
    for (const [path, name] of [
      ["/sport?widok=templates", "Zapisane szablony treningów"],
      ["/sport?widok=exercises", "Biblioteka ćwiczeń"],
    ] as const) {
      await openRootineRoute(page, path);
      await expect(page.getByRole("table", { name })).toBeVisible();
      const results = await new AxeBuilder({ page })
        .include(".sport-record-table")
        .withRules(["aria-required-children", "aria-required-parent"])
        .analyze();
      expect(results.violations, path).toEqual([]);
    }

    await page.setViewportSize({ width: 1366, height: 768 });
    await openRootineRoute(page, "/sport?widok=cycle");
    const clippedLabels = await page.locator(".sport-cycle-day-heading strong").evaluateAll((labels) => (
      labels.filter((label) => label.scrollWidth > label.clientWidth + 1).map((label) => label.textContent)
    ));
    expect(clippedLabels).toEqual([]);
  });
});
