import AxeBuilder from "@axe-core/playwright";
import { expect, openRootineRoute, test } from "./fixtures";

const ENTRY_NAME = "S03 · rejestr odporny na zamknięcie";

async function addManualEntry(page: Parameters<typeof openRootineRoute>[0], name = ENTRY_NAME) {
  await page.getByRole("button", { name: "Dodaj produkt", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Dodaj produkt" });
  await dialog.getByRole("combobox", { name: "Produkt lub danie" }).fill(name);
  await dialog.getByRole("spinbutton", { name: "Ilość" }).fill("125");
  await dialog.getByRole("spinbutton", { name: "Kalorie" }).fill("210");
  await dialog.getByRole("spinbutton", { name: "Białko (g)" }).fill("12");
  await dialog.getByRole("spinbutton", { name: "Węglowodany (g)" }).fill("26");
  await dialog.getByRole("spinbutton", { name: "Tłuszcze (g)" }).fill("7");
  await dialog.getByRole("button", { name: "Dodaj do dziennika" }).click();
  await expect(dialog).toHaveCount(0);
}

test.describe("Sprint 03 · kontrakt odżywiania @mobile", () => {
  test("Dzień ma wizualnie nazwaną CTA, poprawne nagłówki i pierwszy wpis nad nav", async ({ rootinePage: page }) => {
    const phones = [
      { width: 320, height: 568 },
      { width: 390, height: 844 },
      { width: 430, height: 932 },
      { width: 568, height: 320 },
      { width: 844, height: 390 },
    ];

    for (const viewport of phones) {
      await page.setViewportSize(viewport);
      await openRootineRoute(page, "/odzywianie?konto=testowe");
      const action = page.getByRole("button", { name: "Dodaj produkt", exact: true });
      await expect(action).toBeVisible();
      await expect(action).toHaveText("Dodaj produkt");
      const geometry = await action.evaluate((element) => {
        const button = element.getBoundingClientRect();
        const label = Array.from(element.childNodes).find((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
        const range = document.createRange();
        if (label) range.selectNode(label);
        const labelRect = label ? range.getBoundingClientRect() : null;
        const style = getComputedStyle(element);
        return {
          button: { width: button.width, height: button.height },
          label: labelRect ? { width: labelRect.width, height: labelRect.height } : null,
          labelClipped: style.clipPath !== "none" || style.position === "absolute",
        };
      });
      expect(geometry.button.width).toBeGreaterThanOrEqual(48);
      expect(geometry.button.height).toBeGreaterThanOrEqual(48);
      expect(geometry.label?.width).toBeGreaterThan(1);
      expect(geometry.label?.height).toBeGreaterThan(1);
      expect(geometry.labelClipped).toBe(false);
    }

    for (const viewport of [{ width: 568, height: 320 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport);
      await openRootineRoute(page, "/odzywianie?konto=testowe");
      const entry = page.locator(".nutrition-entry-item").first();
      const nav = page.locator("nav[aria-label=\"Główna nawigacja mobilna\"]");
      await expect(entry).toBeVisible();
      const [entryRect, navRect] = await Promise.all([entry.boundingBox(), nav.boundingBox()]);
      expect(entryRect).not.toBeNull();
      expect(navRect).not.toBeNull();
      expect((entryRect?.y ?? Number.POSITIVE_INFINITY) + (entryRect?.height ?? 0)).toBeLessThanOrEqual(navRect?.y ?? 0);
    }

    for (const theme of ["rootine-cobalt", "rootine-warm-linen"]) {
      await page.setViewportSize({ width: 390, height: 844 });
      await openRootineRoute(page, "/odzywianie?konto=testowe");
      await page.evaluate((value) => {
        localStorage.setItem("rootine.appearance.theme", value);
        document.documentElement.dataset.theme = value;
        document.documentElement.dataset.themePreference = value;
        document.documentElement.style.colorScheme = value === "rootine-warm-linen" ? "light" : "dark";
      }, theme);
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    }
  });

  test("zamknięty dzień blokuje mutacje, a tylko nazwana akcja przywraca edycję", async ({ rootinePage: page }) => {
    await openRootineRoute(page, "/odzywianie?konto=lokalne");
    await addManualEntry(page);
    await expect(page.getByText(ENTRY_NAME, { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Zamknij wybrany dzień" }).click();
    await expect(page.locator(".nutrition-closed-notice")).toContainText("Dzień jest zamknięty");
    await expect(page.getByRole("button", { name: /Otwórz ponownie wybrany dzień|Otwórz dzień/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Dodaj produkt", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: `Edytuj produkt „${ENTRY_NAME}”` })).toBeDisabled();

    await page.getByRole("button", { name: "Otwórz do edycji" }).click();
    await expect(page.getByRole("button", { name: "Dodaj produkt", exact: true })).toBeEnabled();
    await page.reload();
    await expect(page.getByText(ENTRY_NAME, { exact: true })).toBeVisible();
  });

  test("katalog ma klawiaturę oraz retry offline bez blokowania ręcznego wpisu", async ({ rootinePage: page }) => {
    await page.route("**/api/openfoodfacts/search**", (route) => route.abort("failed"));
    await openRootineRoute(page, "/odzywianie?konto=lokalne");
    await page.getByRole("button", { name: "Dodaj produkt", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Dodaj produkt" });
    const field = dialog.getByRole("combobox", { name: "Produkt lub danie" });
    await field.fill("ziemniaki offline");
    await expect(dialog.getByRole("alert")).toContainText("Nie udało się pobrać");
    await expect(dialog.getByRole("button", { name: "Spróbuj ponownie" })).toBeVisible();
    await expect(dialog.getByRole("spinbutton", { name: "Kalorie" })).toBeEnabled();

    await field.fill("ziemniaki");
    await field.press("ArrowDown");
    await field.press("Enter");
    await expect(field).not.toHaveValue("ziemniaki");

    const results = await new AxeBuilder({ page }).include(".ui-modal").analyze();
    expect(results.violations).toEqual([]);
  });

  test("Back zamyka wpis przed trasą, a Forward odtwarza wspólną warstwę", async ({ rootinePage: page }) => {
    await openRootineRoute(page, "/odzywianie?konto=lokalne");
    const trigger = page.getByRole("button", { name: "Dodaj produkt", exact: true });
    await trigger.click();
    await expect(page.getByRole("dialog", { name: "Dodaj produkt" })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("dialog", { name: "Dodaj produkt" })).toHaveCount(0);
    await expect(page).toHaveURL(/\/odzywianie\?konto=lokalne$/);
    await page.goForward();
    await expect(page.getByRole("dialog", { name: "Dodaj produkt" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Dodaj produkt" })).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
});
