import { test, expect, openRootineRoute } from "./fixtures";

const ROUTES = [
  { name: "Dzisiaj", path: "/dzisiaj" },
  { name: "Zadania", path: "/zadania" },
  { name: "Kalendarz", path: "/kalendarz" },
  { name: "Notatki", path: "/notatki" },
  { name: "Sport", path: "/sport" },
  { name: "Podróże", path: "/podroze" },
  { name: "JDG", path: "/sprawy?widok=jdg" },
  { name: "Cele", path: "/cele" },
] as const;

test.describe("route smoke", { tag: "@shared" }, () => {
  for (const route of ROUTES) {
    test(`${route.name} renders in the application shell`, async ({ rootinePage: page, isMobile }) => {
      await openRootineRoute(page, route.path);

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
  test("old Biuro bookmark redirects to the canonical Praca module", async ({ rootinePage: page }) => {
    await openRootineRoute(page, "/biuro");

    await expect(page).toHaveURL(/\/praca$/);
    await expect(page.locator(".ui-page-shell")).toBeVisible();
    await expect(page.getByRole("link", { name: "Biuro", exact: true })).toHaveCount(0);
  });

  test("old Finanse bookmark redirects to the canonical Sprawy budget view", async ({ rootinePage: page }) => {
    await openRootineRoute(page, "/finanse");

    await expect(page).toHaveURL(/\/sprawy\?widok=budget$/);
    await expect(page.locator(".ui-page-shell")).toBeVisible();
    await expect(page.getByRole("link", { name: "Finanse", exact: true })).toHaveCount(0);
  });
});

test.describe("desktop sidebar", { tag: "@desktop" }, () => {
  test("loads another module and marks it current", async ({ rootinePage: page }) => {
    await openRootineRoute(page, "/dzisiaj");

    const primaryNavigation = page.getByRole("navigation", { name: "Obszary aplikacji" });
    const tasksLink = primaryNavigation.getByRole("link", { name: "Zadania" });
    await tasksLink.click();
    await page.getByRole("button", { name: "Widok kalendarza" }).click();

    await expect(page).toHaveURL(/\/kalendarz$/);
    await expect(page.locator(".ui-content-header__title")).toBeVisible();
    await expect(tasksLink).toHaveAttribute("aria-current", "page");
    await expect(primaryNavigation.getByRole("link", { name: "Kalendarz" })).toHaveCount(0);
  });

  test("uses one global calendar and returns to the selected list subview", async ({ rootinePage: page }) => {
    await openRootineRoute(page, "/zadania?widok=jutro");

    await page.getByRole("button", { name: "Widok kalendarza" }).click();
    await expect(page).toHaveURL(/\/kalendarz$/);
    const taskSidebar = page.getByRole("complementary", { name: "Widoki i listy zadań" });
    await expect(taskSidebar.getByRole("button", { name: /^Wszystkie/ })).toHaveAttribute("aria-current", "page");

    await taskSidebar.getByRole("button", { name: /^Dziś/ }).click();
    await expect(page).toHaveURL(/\/zadania$/);
    await expect(taskSidebar.getByRole("button", { name: /^Dziś/ })).toHaveAttribute("aria-current", "page");
  });

  test("does not add a selected priority label to the list header", async ({ rootinePage: page }) => {
    await openRootineRoute(page, "/zadania");

    await page.getByRole("button", { name: "Średni", exact: true }).click();
    await expect(page.locator(".ui-content-header__meta")).toHaveCount(0);
  });

  test("keeps the habit quick-add row stable while choosing days and priority", async ({ rootinePage: page }) => {
    await openRootineRoute(page, "/zadania?widok=nawyki");

    const addHabitForm = page.getByRole("form", { name: "Dodaj nawyk" });
    const before = await addHabitForm.boundingBox();
    const schedule = page.getByRole("combobox", { name: "Cykliczność nawyku Codziennie" });
    await schedule.click();
    await page.getByRole("option", { name: "Wybrane dni", exact: true }).click();

    const weekdayDialog = page.getByRole("dialog", { name: "Wybrane dni" });
    await expect(weekdayDialog).toBeVisible();
    const afterWeekdayPicker = await addHabitForm.boundingBox();
    expect(afterWeekdayPicker?.height).toBe(before?.height);

    await weekdayDialog.getByRole("button", { name: "So", exact: true }).click();
    await expect(weekdayDialog.getByRole("button", { name: "So", exact: true })).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "Priorytet nawyku", exact: true }).click();
    await page.getByRole("menuitem", { name: "Średni", exact: true }).click();
    const afterPriority = await addHabitForm.boundingBox();
    expect(afterPriority?.height).toBe(before?.height);
  });
});

test.describe("mobile navigation", { tag: "@mobile" }, () => {
  test("primary links and More drawer expose every module", async ({ rootinePage: page }) => {
    await openRootineRoute(page, "/dzisiaj");

    const mobileNavigation = page.getByRole("navigation", {
      name: "Główna nawigacja mobilna",
    });
    await mobileNavigation.getByRole("link", { name: "Zadania" }).click();
    await expect(page).toHaveURL(/\/zadania$/);
    await expect(page.locator(".ui-content-header__title")).toBeVisible();

    const moreButton = mobileNavigation.getByRole("button", { name: "Więcej" });
    await moreButton.click();
    const drawer = page.getByRole("dialog", { name: "Wszystkie obszary aplikacji" });
    await expect(drawer).toBeVisible();
    await expect(moreButton).toHaveAttribute("aria-expanded", "true");
    await expect(drawer.getByRole("link", { name: "Notatki" })).toBeVisible();

    await drawer.getByRole("link", { name: "Notatki" }).click();
    await expect(page).toHaveURL(/\/notatki$/);
    await expect(page.locator(".ui-content-header__title")).toHaveText("Wszystkie notatki");
    await expect(drawer).toHaveCount(0);
  });
});
