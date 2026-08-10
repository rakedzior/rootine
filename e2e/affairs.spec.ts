import { test, expect, openRootineRoute } from "./fixtures";

test.describe("affairs navigation", { tag: "@shared" }, () => {
  test.describe("command deep links", () => {
    const commands = [
      { action: "nowa-sprawa", view: "all" },
      { action: "nowa-platnosc", view: "payments" },
      { action: "nowy-wydatek", view: "budget" },
    ] as const;

    for (const { action, view } of commands) {
      test(`${action} opens its editor on the canonical ${view} view`, async ({ rootinePage: page }) => {
        await openRootineRoute(page, `/sprawy?akcja=${action}&tytul=Test&q=preserved`);

        await expect(page.getByRole("dialog")).toBeVisible();
        await expect.poll(() => new URL(page.url()).searchParams.get("widok")).toBe(view);
        await expect.poll(() => new URL(page.url()).searchParams.get("akcja")).toBeNull();
        await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe("preserved");
      });
    }
  });

  test("desktop exposes all affairs workspaces in the sidebar", async ({ rootinePage: page, isMobile }) => {
    test.skip(isMobile, "Desktop-only sidebar coverage");
    await openRootineRoute(page, "/sprawy");

    const sidebar = page.getByRole("complementary", { name: "Widoki spraw" });
    await expect(sidebar.getByRole("heading", { name: "Plan" })).toBeVisible();
    await expect(sidebar.getByRole("heading", { name: "Finanse" })).toBeVisible();
    await expect(sidebar.getByRole("heading", { name: "Rejestry" })).toBeVisible();
    await expect(sidebar.getByRole("heading", { name: "Obszary" })).toBeVisible();
    await expect(sidebar.getByRole("button", { name: "Cykliczne" })).toBeVisible();
    await expect(sidebar.getByRole("button", { name: "Dokumenty" })).toBeVisible();
    await expect(sidebar.getByRole("button", { name: "Pojazdy" })).toBeVisible();

    await sidebar.getByRole("button", { name: "Budżet" }).click();
    await expect(page).toHaveURL(/widok=budget/);
  });

  test("mobile exposes every affairs workspace in one selector", async ({ rootinePage: page, isMobile }) => {
    test.skip(!isMobile, "Mobile-only selector coverage");
    await openRootineRoute(page, "/sprawy");

    const selector = page.getByRole("combobox", { name: "Wybierz widok spraw" });
    await expect(selector).toBeVisible();
    await selector.click();
    await expect(page.getByRole("option", { name: "Budżet" })).toBeVisible();
    await expect(page.getByRole("option", { name: "Pojazdy" })).toBeVisible();
    await page.getByRole("option", { name: "Pojazdy" }).click();
    await expect(page).toHaveURL(/widok=vehicles/);
  });

  test("today view uses a compact responsibility radar", async ({ rootinePage: page, isMobile }) => {
    await openRootineRoute(page, "/sprawy");

    await expect(page.getByRole("heading", { name: "Dzisiaj", level: 1 })).toBeVisible();
    await expect(page.locator(".affairs-module")).toHaveAttribute("data-affairs-archetype", "agenda");
    await expect(page.locator(".affairs-section-surface--agenda")).toBeVisible();
    if (isMobile) {
      await expect(page.getByRole("combobox", { name: "Wybierz widok spraw" })).toContainText("Dzisiaj");
    } else {
      await expect(page.getByRole("button", { name: "Ten tydzień" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Wszystkie" })).toBeVisible();
    }
    await expect(page.locator(".affairs-overview__summary")).toHaveCount(0);
  });

  test("register and workspace destinations use the shared affairs surface contract", async ({ rootinePage: page }) => {
    await openRootineRoute(page, "/sprawy?widok=documents");
    await expect(page.locator(".affairs-module")).toHaveAttribute("data-affairs-archetype", "register");
    await expect(page.locator(".affairs-section-surface--documents")).toBeVisible();

    await openRootineRoute(page, "/sprawy?widok=budget");
    await expect(page.locator(".affairs-module")).toHaveAttribute("data-affairs-archetype", "workspace");
    await expect(page.locator(".affairs-section-surface--budget")).toBeVisible();

    await openRootineRoute(page, "/sprawy?widok=jdg");
    await expect(page.locator(".affairs-module")).toHaveAttribute("data-affairs-archetype", "workspace");
    await expect(page.locator(".jdg-stage").first()).toBeVisible();
  });

  test("legacy affairs view ids remain compatible", async ({ rootinePage: page }) => {
    await openRootineRoute(page, "/sprawy?widok=overview");
    await expect(page.getByRole("heading", { name: "Dzisiaj", level: 1 })).toBeVisible();

    await openRootineRoute(page, "/sprawy?widok=matters");
    await expect(page.getByRole("heading", { name: "Wszystkie", level: 1 })).toBeVisible();
    await expect(page.locator(".affairs-module")).toHaveAttribute("data-affairs-archetype", "register");
  });

  test("travel stays inside the affairs module", async ({ rootinePage: page, isMobile }) => {
    await openRootineRoute(page, "/sprawy");

    if (isMobile) {
      const selector = page.getByRole("combobox", { name: "Wybierz widok spraw" });
      await selector.click();
      await page.getByRole("option", { name: /Podr/ }).click();
    } else {
      await page.getByRole("complementary", { name: "Widoki spraw" }).getByRole("button", { name: /Podr/ }).click();
    }

    await expect(page).toHaveURL(/\/sprawy\?widok=travel/);
    await expect(page.getByRole("heading", { name: /podróż/i }).first()).toBeVisible();
    if (isMobile) {
      await expect(page.getByRole("combobox", { name: "Wybierz widok spraw" })).toContainText("Podr");
    } else {
      await expect(page.getByRole("complementary", { name: "Widoki spraw" })).toBeVisible();
    }
  });

  test("budget and JDG keep their content in a bounded layout", async ({ rootinePage: page }) => {
    await openRootineRoute(page, "/sprawy?widok=budget");
    await expect(page.locator(".affairs-budget__summary")).toBeVisible();

    await page.goto("/sprawy?widok=jdg");
    await expect(page.locator(".jdg-stage").first()).toBeVisible();
    await expect(page.locator(".jdg-stage__header h3").first()).toBeVisible();
  });
});
