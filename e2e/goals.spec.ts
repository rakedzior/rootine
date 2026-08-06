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

  test("double-clicking a goal opens its full view", async ({ rootinePage: page }) => {
    await openRootineRoute(page, "/cele?widok=overview");

    await page.locator(".goal-card-primary").first().dblclick();

    await expect(page).toHaveURL(/\/cele\/[^/?]+/);
    await expect(page.getByRole("button", { name: "Wróć do celów" })).toBeVisible();
  });
});
