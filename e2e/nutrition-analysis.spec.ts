import { expect, openRootineRoute, test } from "./fixtures";

test("nutrition analysis adapts chart frequency and keeps custom dates inline @shared", async ({ rootinePage: page }) => {
  await openRootineRoute(page, "/odzywianie/analiza?konto=testowe");

  const chartFrequency = page.locator(".nutrition-analysis-v2__chart-frequency").first();
  await page.getByText("30 dni", { exact: true }).click();
  await expect(chartFrequency).toHaveText("Średnia 3-dniowa");

  await page.getByText("3 miesiące", { exact: true }).click();
  await expect(chartFrequency).toHaveText("Średnia tygodniowa");

  await page.getByText("Własny zakres", { exact: true }).click();
  await expect(page.locator(".nutrition-analysis-v2__date-edit")).toBeVisible();
  await expect(page.locator(".nutrition-analysis-v2__custom-range")).toHaveCount(0);
  await expect(page.locator(".nutrition-analysis-v2__range-error")).toHaveCount(0);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});
