import { test, expect, openRootineRoute } from "./fixtures";

test.describe("affairs navigation", { tag: "@shared" }, () => {
  test.describe("command deep links", () => {
    const commands = [
      { action: "nowa-sprawa", view: "all" },
      { action: "nowa-platnosc", view: "finances" },
      { action: "nowy-wydatek", view: "finances" },
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
    await expect(sidebar.getByRole("heading", { name: "Sprawy" })).toBeVisible();
    await expect(sidebar.getByRole("heading", { name: "Finanse" })).toBeVisible();
    await expect(sidebar.getByRole("heading", { name: "Rejestry" })).toBeVisible();
    await expect(sidebar.getByRole("heading", { name: "Obszary" })).toBeVisible();
    await expect(sidebar.getByRole("button", { name: "Przegląd" })).toBeVisible();
    await expect(sidebar.getByRole("button", { name: "Dokumenty" })).toBeVisible();
    await expect(sidebar.getByRole("button", { name: "Pojazdy" })).toBeVisible();

    await sidebar.getByRole("button", { name: "Przegląd" }).click();
    await expect(page).toHaveURL(/widok=finances/);
  });

  test("mobile exposes every affairs workspace in one selector", async ({ rootinePage: page, isMobile }) => {
    test.skip(!isMobile, "Mobile-only selector coverage");
    await openRootineRoute(page, "/sprawy");

    const selector = page.getByRole("combobox", { name: "Wybierz widok spraw" });
    await expect(selector).toBeVisible();
    await selector.click();
    await expect(page.getByRole("option", { name: "Przegląd" })).toBeVisible();
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

    await openRootineRoute(page, "/sprawy?widok=finances");
    await expect(page.locator(".affairs-module")).toHaveAttribute("data-affairs-archetype", "register");
    await expect(page.locator(".affairs-finance-summary")).toBeVisible();

    await openRootineRoute(page, "/sprawy?widok=jdg");
    await expect(page.locator(".affairs-module")).toHaveAttribute("data-affairs-archetype", "workspace");
    await expect(page.locator(".jdg-simple-checklist")).toBeVisible();
  });

  test("legacy affairs view ids remain compatible", async ({ rootinePage: page }) => {
    await openRootineRoute(page, "/sprawy?widok=overview");
    await expect(page.getByRole("heading", { name: "Dzisiaj", level: 1 })).toBeVisible();

    await openRootineRoute(page, "/sprawy?widok=matters");
    await expect(page.getByRole("heading", { name: "Wszystkie", level: 1 })).toBeVisible();
    await expect(page.locator(".affairs-module")).toHaveAttribute("data-affairs-archetype", "agenda");
  });

  test("travel is a standalone module with its own overview and trip rail", async ({ rootinePage: page, isMobile }) => {
    await openRootineRoute(page, "/podroze");

    await expect(page).toHaveURL(/\/podroze$/);
    await expect(page.getByRole("heading", { name: /przegląd podróży/i })).toBeVisible();
    if (!isMobile) {
      const sidebar = page.getByRole("complementary", { name: "Podróże" });
      await expect(sidebar).toBeVisible();
      await sidebar.locator(".travel-sidebar__trip > .context-nav-item").first().click();
      await expect(sidebar.getByRole("button", { name: "Plan podróży", exact: true })).toBeVisible();
      await sidebar.getByRole("button", { name: "Plan podróży", exact: true }).click();
      await expect(page).toHaveURL(/sekcja=itinerary/);
    } else {
      await page.goto("/podroze/trip-lisbon-2026?sekcja=packing");
      await expect(page.getByRole("combobox", { name: "Wybierz sekcję podróży" })).toContainText("Pakowanie");
    }
    await expect(page.locator(".travel-tabs")).toHaveCount(0);
  });

  test("finances and JDG keep their content in a bounded layout", async ({ rootinePage: page }) => {
    await openRootineRoute(page, "/sprawy?widok=finances");
    await expect(page.locator(".affairs-finance-summary")).toBeVisible();

    await page.goto("/sprawy?widok=jdg");
    await expect(page.locator(".jdg-simple-checklist")).toBeVisible();
    await expect(page.getByText("Wystawiłem fakturę", { exact: true })).toBeVisible();
  });
});
