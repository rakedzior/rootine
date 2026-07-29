import { test, expect, openRoutineRoute } from "./fixtures";

const ROUTES = [
  { name: "Dzisiaj", path: "/dzisiaj" },
  { name: "Zadania", path: "/zadania" },
  { name: "Kalendarz", path: "/kalendarz" },
  { name: "Notatki", path: "/notatki" },
  { name: "Sport", path: "/sport" },
  { name: "Podróże", path: "/podroze" },
  { name: "JDG", path: "/sprawy?widok=jdg" },
] as const;

test.describe("route smoke", { tag: "@shared" }, () => {
  for (const route of ROUTES) {
    test(`${route.name} renders in the application shell`, async ({ routinePage: page, isMobile }) => {
      await openRoutineRoute(page, route.path);

      if (isMobile) {
        await expect(
          page.getByRole("navigation", { name: "Główna nawigacja mobilna" }),
        ).toBeVisible();
      } else {
        await expect(
          page.getByRole("navigation", { name: "Obszary aplikacji" }),
        ).toBeVisible();
      }
    });
  }
});

test.describe("legacy navigation aliases", { tag: "@shared" }, () => {
  test("old Biuro bookmark redirects to the canonical Praca module", async ({ routinePage: page }) => {
    await openRoutineRoute(page, "/biuro");

    await expect(page).toHaveURL(/\/praca$/);
    await expect(page.locator(".ui-page-header__title")).toHaveText("Praca");
    await expect(page.getByRole("link", { name: "Biuro", exact: true })).toHaveCount(0);
  });

  test("old Finanse bookmark redirects to the canonical Sprawy budget view", async ({ routinePage: page }) => {
    await openRoutineRoute(page, "/finanse");

    await expect(page).toHaveURL(/\/sprawy\?widok=budget$/);
    await expect(page.locator(".ui-page-header__title")).toHaveText("Sprawy");
    await expect(page.getByRole("link", { name: "Finanse", exact: true })).toHaveCount(0);
  });
});

test.describe("desktop sidebar", { tag: "@desktop" }, () => {
  test("loads another module and marks it current", async ({ routinePage: page }) => {
    await openRoutineRoute(page, "/dzisiaj");

    const primaryNavigation = page.getByRole("navigation", { name: "Obszary aplikacji" });
    const calendarLink = primaryNavigation.getByRole("link", { name: "Kalendarz" });
    await calendarLink.click();

    await expect(page).toHaveURL(/\/kalendarz$/);
    await expect(page.getByRole("heading", { level: 1, name: "Kalendarz" })).toBeVisible();
    await expect(calendarLink).toHaveAttribute("aria-current", "page");
  });
});

test.describe("mobile navigation", { tag: "@mobile" }, () => {
  test("primary links and More drawer expose every module", async ({ routinePage: page }) => {
    await openRoutineRoute(page, "/dzisiaj");

    const mobileNavigation = page.getByRole("navigation", {
      name: "Główna nawigacja mobilna",
    });
    await mobileNavigation.getByRole("link", { name: "Zadania" }).click();
    await expect(page).toHaveURL(/\/zadania$/);
    await expect(page.getByRole("heading", { level: 1, name: "Zadania" })).toBeVisible();

    const moreButton = mobileNavigation.getByRole("button", { name: "Więcej" });
    await moreButton.click();
    const drawer = page.getByRole("dialog", { name: "Wszystkie obszary aplikacji" });
    await expect(drawer).toBeVisible();
    await expect(moreButton).toHaveAttribute("aria-expanded", "true");
    await expect(drawer.getByRole("link", { name: "Notatki" })).toBeVisible();

    await drawer.getByRole("link", { name: "Notatki" }).click();
    await expect(page).toHaveURL(/\/notatki$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Notatki", exact: true }),
    ).toBeVisible();
    await expect(drawer).toHaveCount(0);
  });
});
