import { test, expect, openRoutineRoute } from "./fixtures";

test.describe("modal keyboard behavior", { tag: "@desktop" }, () => {
  test("Escape closes and returns focus to its trigger", async ({ routinePage: page }) => {
    await openRoutineRoute(page, "/sport?widok=templates");

    const trigger = page.getByRole("button", { name: "Nowy szablon" });
    await trigger.click();

    const dialog = page.getByRole("dialog", { name: "Nowy szablon" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("textbox", { name: "Nazwa" })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
});

test.describe("mobile drawer keyboard behavior", { tag: "@mobile" }, () => {
  test("Escape closes and restores focus", async ({ routinePage: page }) => {
    await openRoutineRoute(page, "/dzisiaj");

    const moreButton = page
      .getByRole("navigation", { name: "Główna nawigacja mobilna" })
      .getByRole("button", { name: "Więcej" });
    await moreButton.click();

    const drawer = page.getByRole("dialog", { name: "Wszystkie obszary aplikacji" });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("link").first()).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
    await expect(moreButton).toBeFocused();
    await expect(moreButton).toHaveAttribute("aria-expanded", "false");
  });
});
