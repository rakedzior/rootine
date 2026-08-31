import AxeBuilder from "@axe-core/playwright";
import type { Locator } from "@playwright/test";
import { expect, openRootineRoute, test } from "./fixtures";

const MOBILE_VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 568, height: 320 },
  { width: 844, height: 390 },
] as const;

const MOBILE_NAV_LABELS = ["Dzisiaj", "Zadania", "Kalendarz", "Odżywianie", "Więcej"];

function mobileNavigation(page: Parameters<typeof openRootineRoute>[0]) {
  return page.getByRole("navigation", { name: "Główna nawigacja mobilna" });
}

async function expectNoDocumentOverflow(page: Parameters<typeof openRootineRoute>[0]) {
  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth - document.body.clientWidth,
    root: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  expect(overflow.body).toBeLessThanOrEqual(1);
  expect(overflow.root).toBeLessThanOrEqual(1);
}

test.describe("mobile foundation contract", { tag: "@mobile" }, () => {
  test("renders exactly five touch-safe destinations in every required portrait and landscape viewport", async ({ rootinePage: page }) => {
    test.setTimeout(60_000);
    for (const viewport of MOBILE_VIEWPORTS) {
      await page.setViewportSize(viewport);
      await openRootineRoute(page, "/dzisiaj");

      const navigation = mobileNavigation(page);
      await expect(navigation).toBeVisible();
      await expect(navigation.getByRole("link")).toHaveCount(4);
      await expect(navigation.getByRole("button")).toHaveCount(1);
      await expect(navigation.locator(":scope > *")).toHaveText(MOBILE_NAV_LABELS);
      await expect(navigation.locator("[aria-current='page']")).toHaveCount(1);
      await expect(navigation.getByRole("link", { name: "Dzisiaj" })).toHaveAttribute("aria-current", "page");
      await expect(page.getByRole("navigation", { name: "Obszary aplikacji" })).toBeHidden();
      await expect(page.locator("h1:visible")).toHaveCount(1);
      await expectNoDocumentOverflow(page);

      const hitAreas = await navigation.locator(":scope > *").evaluateAll((items) => items.map((item) => {
        const rect = item.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      }));
      expect(hitAreas.every(({ width, height }) => width >= 44 && height >= 44)).toBe(true);
    }

    await openRootineRoute(page, "/sport");
    await expect(mobileNavigation(page).locator("[aria-current='page']")).toHaveCount(1);
    await expect(mobileNavigation(page).getByRole("button", { name: "Więcej" })).toHaveAttribute("aria-current", "page");
  });

  test("keeps every primary workspace operable in the required 844 by 390 mobile landscape", async ({ rootinePage: page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 844, height: 390 });
    const surfaces = [
      { route: "/dzisiaj", control: () => page.getByRole("button", { name: "Dodaj do dzisiejszego planu" }), dialog: "Dodaj" },
      { route: "/zadania?widok=wszystkie", control: () => page.getByRole("textbox", { name: "Nazwa nowego zadania" }) },
      { route: "/kalendarz", control: () => page.getByRole("button", { name: "Następny miesiąc" }) },
      { route: "/odzywianie", control: () => page.getByRole("button", { name: "Dodaj produkt" }), dialog: "Dodaj produkt" },
      { route: "/cele?widok=overview", control: () => page.getByRole("button", { name: "Dodaj cel" }), dialog: "Nowy cel" },
    ] as const;

    for (const surface of surfaces) {
      await openRootineRoute(page, surface.route);
      await expect(mobileNavigation(page)).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Obszary aplikacji" })).toBeHidden();
      await expect(page.locator("h1:visible")).toHaveCount(1);
      const workspace = page.locator(".ui-main-content").first();
      await expect(workspace).toBeVisible();
      await expect.poll(() => workspace.evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThan(300);
      const control = surface.control();
      await expect(control).toBeVisible();
      await expect(control).toBeEnabled();
      await control.click();
      if ("dialog" in surface) {
        await expect(page.getByRole("dialog", { name: surface.dialog })).toBeVisible();
        await page.keyboard.press("Escape");
      }
    }
  });

  test("rejects corrupt or external remembered destinations without breaking the local shell", async ({ rootinePage: page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("rootine.module-memory.v1", JSON.stringify({
        version: 1,
        modules: {
          "mobile-navigation": {
            scroll: {},
            state: { tasks: "http://[", calendar: "https://example.com/kalendarz" },
          },
        },
      }));
    });
    await openRootineRoute(page, "/dzisiaj?konto=lokalne");
    await expect(page.locator(".app-shell")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Plan dnia" })).toBeVisible();
    await expect(mobileNavigation(page).getByRole("link", { name: "Zadania" })).toHaveAttribute("href", "/zadania");
    await expect(mobileNavigation(page).getByRole("link", { name: "Kalendarz" })).toHaveAttribute("href", "/kalendarz");
  });

  test("More preserves history, scroll and exact focus without duplicate states", async ({ rootinePage: page }) => {
    await openRootineRoute(page, "/dzisiaj");
    const moreButton = mobileNavigation(page).getByRole("button", { name: "Więcej" });
    await moreButton.click();

    const center = page.getByRole("dialog", { name: "Wszystkie obszary aplikacji" });
    await expect(center).toBeVisible();
    await expect(center.getByRole("link")).toHaveText([
      "Sport",
      "Praca",
      "Cele",
      "Podróże",
      "Pozostałe",
      "Notatki",
    ]);
    await expect(center.getByRole("button", { name: /Pomoc i skróty/ })).toBeVisible();
    await expect(center.getByRole("button", { name: /Ustawienia/ })).toBeVisible();
    await expect(center.getByRole("button", { name: /Profil lokalny/ })).toBeVisible();

    const notes = center.getByRole("link", { name: "Notatki" });
    await center.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    const rememberedScroll = await center.evaluate((element) => element.scrollTop);
    await notes.focus();
    await notes.click();
    await expect(page).toHaveURL(/\/notatki$/);

    await page.goBack();
    await expect(center).toBeVisible();
    await expect.poll(() => center.evaluate((element) => element.scrollTop)).toBeGreaterThanOrEqual(Math.max(0, rememberedScroll - 8));
    await expect(notes).toBeFocused();

    await page.goBack();
    await expect(center).toHaveCount(0);
    await expect(moreButton).toBeFocused();
    await expect(page).toHaveURL(/\/dzisiaj$/);

    await page.goForward();
    await expect(center).toBeVisible();
    await expect(notes).toBeFocused();
    await page.goBack();
    await expect(center).toHaveCount(0);
    await expect(page).toHaveURL(/\/dzisiaj$/);
  });

  test("fixed destinations restore task, calendar and nutrition context", async ({ rootinePage: page }) => {
    await openRootineRoute(page, "/zadania?widok=nawyki");
    let navigation = mobileNavigation(page);
    await navigation.getByRole("link", { name: "Odżywianie" }).click();
    await navigation.getByRole("link", { name: "Zadania" }).click();
    await expect(page).toHaveURL(/\/zadania\?widok=nawyki$/);

    await navigation.getByRole("link", { name: "Kalendarz" }).click();
    await page.getByRole("button", { name: "Następny miesiąc" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "wrzesień 2026" })).toBeVisible();
    await navigation.getByRole("link", { name: "Dzisiaj" }).click();
    await navigation.getByRole("link", { name: "Kalendarz" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "wrzesień 2026" })).toBeVisible();

    await navigation.getByRole("link", { name: "Odżywianie" }).click();
    await page.getByRole("button", { name: "Poprzedni dzień" }).evaluate((button) => (button as HTMLButtonElement).click());
    await expect(page).toHaveURL(/data=2026-08-04/);
    await navigation.getByRole("link", { name: "Dzisiaj" }).click();
    navigation = mobileNavigation(page);
    await navigation.getByRole("link", { name: "Odżywianie" }).click();
    await expect(page).toHaveURL(/data=2026-08-04/);
  });

  test("More utilities preserve focus and a hidden module remains reachable", async ({ rootinePage: page }) => {
    test.setTimeout(60_000);
    await openRootineRoute(page, "/dzisiaj");
    await mobileNavigation(page).getByRole("button", { name: "Więcej" }).click();
    const center = page.getByRole("dialog", { name: "Wszystkie obszary aplikacji" });

    const settingsTrigger = center.getByRole("button", { name: /Ustawienia/ });
    await settingsTrigger.click();
    const settings = page.getByRole("dialog", { name: "Ustawienia aplikacji" });
    await settings.getByRole("button", { name: "Moduły: Widoczność i kolejność modułów" }).click();
    await settings.getByRole("switch", { name: "Dezaktywuj moduł Sport" })
      .evaluate((input) => (input as HTMLInputElement).click());
    await page.goBack();
    await expect(center).toBeVisible();
    await expect(settingsTrigger).toBeFocused();

    const hiddenSport = center.getByRole("link", { name: /Sport.*Ukryty w pasku nawigacji/ });
    await expect(hiddenSport).toBeVisible();
    await hiddenSport.click();
    await expect(page).toHaveURL(/\/sport$/);
    await page.goBack();
    await expect(center).toBeVisible();
    await expect(hiddenSport).toBeFocused();

    const profileTrigger = center.getByRole("button", { name: /Profil lokalny/ });
    await profileTrigger.click();
    const profile = page.getByRole("dialog", { name: "Profil użytkownika" });
    await expect(profile.getByRole("button", { name: /Tryb prywatny/ })).toBeVisible();
    await expect(profile.getByRole("button", { name: "Kopie zapasowe" })).toBeVisible();
    await page.goBack();
    await expect(profileTrigger).toBeFocused();

    const helpTrigger = center.getByRole("button", { name: /Pomoc i skróty/ });
    await helpTrigger.click();
    await expect(page.getByRole("dialog", { name: "Pomoc i szybkie przejście" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Pomoc i szybkie przejście" })).toHaveCount(0);
    await expect(helpTrigger).toBeFocused();
  });

  test("keeps More utilities discoverable in short landscape", async ({ rootinePage: page }) => {
    await page.setViewportSize({ width: 568, height: 320 });
    await openRootineRoute(page, "/dzisiaj");
    await mobileNavigation(page).getByRole("button", { name: "Więcej" }).click();
    const center = page.getByRole("dialog", { name: "Wszystkie obszary aplikacji" });
    for (const name of ["Pomoc i skróty", "Ustawienia", "Profil lokalny"]) {
      const utility = center.getByRole("button", { name: new RegExp(name) });
      await expect(utility).toBeVisible();
      await expect.poll(() => utility.evaluate((element) => element.getBoundingClientRect().bottom)).toBeLessThanOrEqual(320);
    }

  });

  test("real task detail is history-aware, modal, inert and retains its exit frame", async ({ rootinePage: page }) => {
    const runtimeErrors: string[] = [];
    page.on("pageerror", (error) => runtimeErrors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") runtimeErrors.push(`console: ${message.text()}`);
    });
    await openRootineRoute(page, "/zadania?widok=wszystkie");

    const trigger = page.getByRole("button", { name: /^Otwórz szczegóły zadania:/ }).first();
    await trigger.click();
    const detail = page.getByRole("dialog", { name: "Szczegóły zadania" });
    await expect(detail).toBeVisible();
    await expect(page).toHaveURL(/zadanie=\d+/);
    await expect(detail).toHaveAttribute("aria-modal", "true");
    await expect(page.locator("html")).toHaveCSS("overflow", "hidden");
    await expect(page.locator(".app-mobile-nav")).toHaveAttribute("inert", "");
    await expect(page.locator(".app-mobile-nav")).toBeHidden();
    await expect(page.locator(".ui-module-main")).toHaveAttribute("inert", "");

    const axe = await new AxeBuilder({ page }).include(".ui-detail-panel").analyze();
    expect(axe.violations).toEqual([]);

    await page.evaluate(() => {
      (window as typeof window & { __rootineSawExitClone?: boolean }).__rootineSawExitClone = false;
      const observer = new MutationObserver(() => {
        if (document.querySelector(".ui-detail-panel[data-overlay-exit-clone='true'][data-state='closing']")) {
          (window as typeof window & { __rootineSawExitClone?: boolean }).__rootineSawExitClone = true;
          observer.disconnect();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });
    await page.goBack();
    await expect(detail).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => (
      (window as typeof window & { __rootineSawExitClone?: boolean }).__rootineSawExitClone
    ))).toBe(true);
    await expect(trigger).toBeFocused();
    await expect(page.locator(".ui-detail-panel[data-overlay-exit-clone='true']")).toHaveCount(0);
    await expect(page.locator("html")).not.toHaveCSS("overflow", "hidden");
    await expect(page.locator(".app-mobile-nav")).toBeVisible();

    await page.goForward();
    await expect(detail).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(detail).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(runtimeErrors).toEqual([]);
  });

  test("keeps normal, trash and habit details history-aware across Back, Forward and Escape", async ({ rootinePage: page }) => {
    test.setTimeout(60_000);
    const assertDetailHistory = async (trigger: Locator, dialogName: string) => {
      await expect(trigger).toBeVisible();
      await trigger.click();
      const detail = page.getByRole("dialog", { name: dialogName });
      await expect(detail).toBeVisible();
      await page.goBack();
      await expect(detail).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await page.goForward();
      await expect(detail).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(detail).toHaveCount(0);
      await expect(trigger).toBeFocused();
    };

    await openRootineRoute(page, "/zadania?widok=wszystkie");
    await assertDetailHistory(page.locator(".ui-module-main:visible").getByRole("button", { name: /^Otwórz szczegóły zadania:/ }).first(), "Szczegóły zadania");

    await openRootineRoute(page, "/zadania?widok=wszystkie");
    const trashTitle = "Zadanie historii Kosza";
    const composer = page.getByRole("textbox", { name: "Nazwa nowego zadania" });
    await composer.fill(trashTitle);
    await composer.press("Enter");
    const freshTaskTrigger = page.getByRole("button", { name: `Otwórz szczegóły zadania: ${trashTitle}` });
    await expect(freshTaskTrigger).toBeVisible();
    await freshTaskTrigger.click();
    await page.getByRole("button", { name: "Więcej akcji zadania" }).click();
    await page.getByRole("menuitem", { name: "Usuń" }).click();
    await expect(page.getByRole("dialog", { name: "Szczegóły zadania" })).toHaveCount(0);
    await page.clock.fastForward(300);
    await page.getByRole("combobox", { name: "Widok zadań" }).last().click();
    await page.getByRole("option", { name: "Kosz" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Kosz" })).toBeVisible();
    await assertDetailHistory(page.locator(".ui-module-main:visible").getByRole("button", { name: `Otwórz szczegóły zadania: ${trashTitle}` }), "Szczegóły zadania");

    await openRootineRoute(page, "/zadania?widok=nawyki");
    await assertDetailHistory(page.locator(".ui-module-main:visible").getByRole("button", { name: /^Otwórz szczegóły nawyku:/ }).first(), "Szczegóły nawyku");
  });

  test("real goal sheet protects dirty Back navigation and restores its stable menu trigger", async ({ rootinePage: page }) => {
    await openRootineRoute(page, "/cele?widok=overview");
    const menuTrigger = page.getByRole("button", { name: /Więcej opcji dla celu/ }).first();
    await menuTrigger.click();
    await page.getByRole("menuitem", { name: "Edytuj cel" }).click();

    const sheet = page.getByRole("dialog", { name: "Edytuj cel" });
    const title = sheet.getByRole("textbox", { name: "Nazwa celu" });
    await expect(sheet).toBeVisible();
    await expect(title).toBeFocused();
    await expect(sheet).toHaveCSS("transform", /matrix/);
    await title.fill("Cel chroniony przez kontrakt mobilny");

    await page.goBack();
    const confirm = page.getByRole("dialog", { name: "Odrzucić niezapisane zmiany?" });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Kontynuuj edycję" }).click();
    await expect(sheet).toBeVisible();
    await expect(title).toHaveValue("Cel chroniony przez kontrakt mobilny");

    await page.goBack();
    await page.getByRole("dialog", { name: "Odrzucić niezapisane zmiany?" })
      .getByRole("button", { name: "Odrzuć zmiany" })
      .click();
    await expect(sheet).toHaveCount(0);
    await expect(page).toHaveURL(/\/cele\?widok=overview/);
    await expect(menuTrigger).toBeFocused();
    await expect(page.locator(".ui-modal-backdrop[data-overlay-exit-clone='true']")).toHaveCount(0);
  });
});
