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
    await expect(sidebar.getByRole("heading", { name: "Pozostałe" })).toBeVisible();
    await expect(sidebar.getByRole("button", { name: "Dokumenty" })).toBeVisible();
    await expect(sidebar.getByRole("button", { name: "Pojazdy" })).toBeVisible();

    const financeGroup = sidebar.locator(".context-nav-group").filter({
      has: page.getByRole("heading", { name: "Finanse", exact: true }),
    });
    await expect(financeGroup.getByRole("button", { name: /^Przegląd(?: \d+)?$/ })).toBeVisible();
    await expect(financeGroup.getByRole("button", { name: /^Jednorazowe(?: \d+)?$/ })).toBeVisible();
    await expect(financeGroup.getByRole("button", { name: /^Cykliczne(?: \d+)?$/ })).toBeVisible();

    await financeGroup.getByRole("button", { name: /^Jednorazowe(?: \d+)?$/ }).click();
    await expect(page).toHaveURL(/widok=finance-one-time/);
    await expect(page.getByRole("heading", { name: "Jednorazowe", level: 1 })).toBeVisible();
    await expect(page.getByRole("tablist")).toHaveCount(0);

    await financeGroup.getByRole("button", { name: /^Cykliczne(?: \d+)?$/ }).click();
    await expect(page).toHaveURL(/widok=finance-recurring/);
    await expect(page.getByRole("heading", { name: "Cykliczne", level: 1 })).toBeVisible();
  });

  test("mobile exposes every affairs workspace in one selector", async ({ rootinePage: page, isMobile }) => {
    test.skip(!isMobile, "Mobile-only selector coverage");
    await openRootineRoute(page, "/sprawy");

    const selector = page.getByRole("combobox", { name: "Wybierz widok spraw" });
    await expect(selector).toBeVisible();
    await selector.click();
    await expect(page.getByRole("option", { name: "Finanse — przegląd", exact: true })).toBeVisible();
    await expect(page.getByRole("option", { name: "Finanse — jednorazowe", exact: true })).toBeVisible();
    await page.getByRole("option", { name: "Finanse — cykliczne", exact: true }).click();
    await expect(page).toHaveURL(/widok=finance-recurring/);
  });

  test("today view uses a compact responsibility radar", async ({ rootinePage: page, isMobile }) => {
    await openRootineRoute(page, "/sprawy?widok=today");

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
    await expect(page.getByRole("tablist")).toHaveCount(0);

    await openRootineRoute(page, "/sprawy?widok=jdg");
    await expect(page.locator(".affairs-module")).toHaveAttribute("data-affairs-archetype", "workspace");
    await expect(page.locator(".jdg-simple-checklist")).toBeVisible();
  });

  test("legacy affairs view ids remain compatible", async ({ rootinePage: page }) => {
    await openRootineRoute(page, "/sprawy?widok=overview");
    await expect(page.getByRole("heading", { name: "Przegląd", level: 1 })).toBeVisible();

    await openRootineRoute(page, "/sprawy?widok=matters");
    await expect(page.getByRole("heading", { name: "Wszystkie", level: 1 })).toBeVisible();
    await expect(page.locator(".affairs-module")).toHaveAttribute("data-affairs-archetype", "agenda");
  });

  test("travel is a standalone module with its own overview and trip rail", async ({ rootinePage: page, isMobile }) => {
    await openRootineRoute(page, "/podroze");

    await expect(page).toHaveURL(/\/podroze$/);
    await expect(page.getByRole("heading", { name: "Przegląd", exact: true })).toBeVisible();
    await expect(page.locator(".travel-next-departure")).toContainText("Lizbona na długi weekend");
    await expect(page.locator(".travel-board__row").filter({ hasText: "Lizbona na długi weekend" })).toHaveCount(0);
    await expect(page.locator(".travel-board__row")).toHaveCount(1);
    await page.getByRole("combobox", { name: "Filtr podróży" }).click();
    await page.getByRole("option", { name: "Wszystkie", exact: true }).click();
    await expect(page.locator(".travel-board__row")).toHaveCount(2);
    await expect(page.locator(".travel-board__row").filter({ hasText: "Lizbona na długi weekend" })).toHaveCount(0);
    await page.goto("/podroze/trip-lisbon-2026");
    await expect(page.getByRole("heading", { name: "Najbliższe punkty", exact: true })).toBeVisible();
    await expect(page.getByText("Gotowość do wyjazdu", { exact: true })).toHaveCount(0);
    const pendingLink = page.getByRole("button", { name: /2 rzeczy do uzupełnienia/i });
    await expect(pendingLink).toBeVisible();
    await pendingLink.click();
    await expect(page.getByLabel("Elementy do uzupełnienia")).toBeVisible();
    await page.getByRole("button", { name: "Zamknij szczegóły" }).click();
    await page.getByRole("button", { name: "Otwórz szczegóły rezerwacji i budżetu" }).click();
    await expect(page.getByLabel("Podsumowanie podróży")).toBeVisible();
    await page.getByRole("button", { name: "Zamknij szczegóły" }).click();
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
    await page.goto("/travel/trip-lisbon-2026/plan");
    await expect(page).toHaveURL(/\/travel\/trip-lisbon-2026\/plan$/);
    await expect(page.getByRole("heading", { name: "Plan podróży", exact: true })).toBeVisible();
    await page.goto("/travel/trip-lisbon-2026/budget");
    await expect(page.getByRole("heading", { name: "Budżet", exact: true })).toBeVisible();
    await expect(page.locator(".travel-tabs")).toHaveCount(0);
  });

  test("Pozostałe workspaces keep one shared content measure", async ({ rootinePage: page, isMobile }) => {
    test.skip(isMobile, "Desktop width contract");
    await page.setViewportSize({ width: 1920, height: 1080 });

    await openRootineRoute(page, "/sprawy?widok=health");
    const healthBounds = await page.locator(".health-summary").boundingBox();

    await openRootineRoute(page, "/sprawy?widok=jdg");
    const jdgBounds = await page.locator(".jdg-simple-status").boundingBox();

    expect(healthBounds).not.toBeNull();
    expect(jdgBounds).not.toBeNull();
    expect(Math.abs(healthBounds!.width - jdgBounds!.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(healthBounds!.x - jdgBounds!.x)).toBeLessThanOrEqual(1);
  });

  test("finances and JDG keep their content in a bounded layout", async ({ rootinePage: page }) => {
    await openRootineRoute(page, "/sprawy?widok=finances");
    await expect(page.locator(".affairs-finance-summary")).toBeVisible();

    await page.goto("/sprawy?widok=jdg");
    await expect(page.locator(".jdg-simple-checklist")).toBeVisible();
    await expect(page.getByText("Wystawiłem fakturę", { exact: true })).toBeVisible();
  });
});
