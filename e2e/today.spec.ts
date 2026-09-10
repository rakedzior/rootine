import { test, expect, openRootineRoute } from "./fixtures";

test.describe("Today timeline", { tag: "@shared" }, () => {
  test("renders the Graphite Cool Ice day plan and primary action", async ({
    rootinePage: page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openRootineRoute(page, "/dzisiaj");

    await expect(page.getByRole("heading", { level: 1, name: "Dzisiaj" })).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 2, name: "Plan dnia" })).toHaveCount(1);
    await expect(page.locator(".today-overview__progress")).toHaveAttribute("role", "progressbar");
    await expect(page.locator(".today-timeline")).toBeVisible();

    const primaryAction = page.getByRole("button", { name: "Dodaj zadanie do dzisiejszego planu" });
    await expect(primaryAction).toBeVisible();
    await primaryAction.click();
    await expect(page).toHaveURL(/\/zadania\?widok=dzis&akcja=nowe-zadanie$/);
    await expect(page.getByRole("textbox", { name: "Nazwa nowego zadania" })).toBeFocused();
  });

  test("keeps completed rows in place and supports hiding them", async ({
    rootinePage: page,
  }) => {
    await openRootineRoute(page, "/dzisiaj");

    const completedRow = page.locator(".today-timeline__row.is-done").first();
    await expect(completedRow).toBeVisible();
    await expect(completedRow.locator(".today-timeline__check")).toHaveAttribute("aria-pressed", "true");
    await expect(completedRow.locator(".today-timeline__title")).toHaveCSS("text-decoration-line", "line-through");

    const completedTitle = await completedRow.locator(".today-timeline__title").textContent();
    const hideCompleted = page.getByRole("button", { name: "Ukryj zakończone" });
    await expect(hideCompleted).toBeVisible();
    await hideCompleted.click();
    await expect(page.getByText(completedTitle ?? "", { exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "Pokaż zakończone" }).click();
    await expect(page.getByText(completedTitle ?? "", { exact: true })).toBeVisible();
  });

  test("keeps the mobile navigation focused on five destinations", async ({
    rootinePage: page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openRootineRoute(page, "/dzisiaj");

    const navigation = page.getByRole("navigation", { name: "Główna nawigacja mobilna" });
    await expect(navigation).toBeVisible();
    await expect(navigation.locator(".app-mobile-nav__label")).toHaveText([
      "Dzisiaj",
      "Kalendarz",
      "Dieta",
      "Notatki",
      "Więcej",
    ]);

    await navigation.getByRole("button", { name: "Więcej" }).click();
    await expect(page.getByRole("dialog", { name: "Wszystkie obszary aplikacji" })).toBeVisible();
    await expect(page.locator('[data-mobile-menu-id="tasks"]')).toBeVisible();
  });
});

test.describe("Today desktop density", { tag: "@desktop" }, () => {
  test("keeps the daily register inside the desktop viewport", async ({
    rootinePage: page,
  }) => {
    await openRootineRoute(page, "/dzisiaj");

    const dimensions = await page.locator(".today-scroll").evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));

    expect(dimensions.scrollHeight).toBeLessThanOrEqual(dimensions.clientHeight + 1);
  });
});
