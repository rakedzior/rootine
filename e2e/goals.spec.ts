import { test, expect, openRootineRoute } from "./fixtures";

test.describe("goals navigation", { tag: "@shared" }, () => {
  test("desktop exposes filters in the context sidebar", async ({ rootinePage: page, isMobile }) => {
    test.skip(isMobile, "Desktop-only sidebar coverage");
    await openRootineRoute(page, "/cele");

    const sidebar = page.getByRole("complementary", { name: "Widoki i kategorie celów" });
    await expect(sidebar.getByRole("button", { name: /Aktywne cele/ })).toBeVisible();
    await expect(sidebar.getByRole("button", { name: /Wszystkie cele/ })).toBeVisible();
    await expect(sidebar.getByRole("button", { name: /Zagrożone/ })).toBeVisible();

    await sidebar.getByRole("button", { name: "Wszystkie cele" }).click();
    await expect(page).toHaveURL(/widok=all/);
    await expect(sidebar.getByRole("button", { name: /Wszystkie cele/ })).toHaveAttribute("aria-current", "page");
  });

  test("mobile keeps the complete filter list without clipping labels", async ({ rootinePage: page, isMobile }) => {
    test.skip(!isMobile, "Mobile-only filter coverage");
    await openRootineRoute(page, "/cele");

    const filter = page.getByRole("combobox", { name: "Widok celów" });
    await filter.click();
    await expect(page.getByRole("option", { name: "Wszystkie cele" })).toBeVisible();
    await expect(page.getByRole("option", { name: "Zagrożone" })).toBeVisible();
    await page.getByRole("option", { name: "Wszystkie cele" }).click();
    await expect(page).toHaveURL(/widok=all/);
  });

  test("uses the grid when no layout preference has been saved", async ({ rootinePage: page }) => {
    await openRootineRoute(page, "/cele?widok=overview");

    await expect(page.locator(".goals-card-grid").first()).toBeVisible();
    await expect(page).toHaveURL(/uklad=grid/);
  });

  test("desktop goal selection scopes the workspace without opening quick details", async ({ rootinePage: page, isMobile }) => {
    test.skip(isMobile, "The second sidebar is replaced by the mobile view selector");
    await openRootineRoute(page, "/cele?widok=next");

    const sidebar = page.getByRole("complementary", { name: "Widoki i kategorie celów" });
    const scopedGoal = sidebar.getByRole("button", { name: /Stworzyć aplikację do rehabilitacji/ });
    await scopedGoal.focus();
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/zakres=rehab-app/);
    await expect(page).toHaveURL(/widok=overview/);
    expect(page.url()).not.toMatch(/[?&]cel=/);
    await expect(page.getByRole("heading", { level: 1, name: "Stworzyć aplikację do rehabilitacji" })).toBeVisible();
    await expect(page.locator(".ui-detail-panel")).toHaveCount(0);
    await expect(scopedGoal).toHaveAttribute("aria-current", "page");

    await page.locator(".goal-card-primary").click();
    await expect(page).toHaveURL(/zakres=rehab-app/);
    await expect(page).toHaveURL(/cel=rehab-app/);
    await expect(page.locator(".ui-detail-panel")).toBeVisible();
  });

  test("next steps are grouped by goal and respect the 1/2/3 depth switch", async ({ rootinePage: page }) => {
    await openRootineRoute(page, "/cele?widok=next");

    const group = page.locator('.goal-next-group[data-goal-id="rehab-app"]');
    await expect(group).toBeVisible();
    await expect(group.locator(".goal-agenda-row")).toHaveCount(1);

    await page.getByRole("button", { name: "3 kroki" }).click();
    await expect(group.locator(".goal-agenda-row")).toHaveCount(3);
    await expect(group).toContainText("MVP — główne funkcje aplikacji");
    await expect(group).toContainText("Moduł rehabilitacji kolana");
    await expect(group).toContainText("Integracja z zegarkami");
  });

  test("the explicit card action opens the full goal view", async ({ rootinePage: page }) => {
    await openRootineRoute(page, "/cele?widok=overview");

    await page.locator(".goal-card-more > button").first().click();
    await page.getByRole("menuitem", { name: "Otwórz pełny widok" }).click();

    await expect(page).toHaveURL(/\/cele\/[^/?]+/);
    await expect(page.getByRole("button", { name: "Wróć do celów" })).toBeVisible();
  });
});
