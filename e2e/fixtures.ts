import { test as base, expect, type Page } from "@playwright/test";

const WEATHER_RESPONSE = {
  current: {
    temperature_2m: 19,
    weather_code: 1,
  },
  daily: {
    temperature_2m_min: [12],
    temperature_2m_max: [23],
    precipitation_probability_max: [15],
    weather_code: [1],
  },
};

type RoutineFixtures = {
  routinePage: Page;
};

export const test = base.extend<RoutineFixtures>({
  routinePage: async ({ page }, provide) => {
    await page.route("https://api.open-meteo.com/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(WEATHER_RESPONSE),
      });
    });

    await page.route("https://fonts.googleapis.com/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/css",
        body: "",
      });
    });
    await page.route("https://fonts.gstatic.com/**", (route) => route.abort("blockedbyclient"));

    await page.route("**/api/openfoodfacts/search**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "cache-control": "public, max-age=300" },
        body: JSON.stringify({ hits: [] }),
      });
    });

    await page.addInitScript(() => {
      const marker = "routine:e2e:storage-initialized";
      try {
        if (window.sessionStorage.getItem(marker) === "true") return;
        window.localStorage.clear();
        window.sessionStorage.clear();
        window.sessionStorage.setItem(marker, "true");
      } catch {
        // The script can briefly run against an opaque document before the app origin exists.
      }
    });

    await provide(page);
  },
});

export { expect };

export async function openRoutineRoute(page: Page, path: string) {
  await page.goto(path);
  const pageTitle = page.locator(".ui-page-header__title");
  await expect(pageTitle).toBeVisible();
  await expect(pageTitle).not.toHaveText("");
  await expect(page.locator(".app-route-state")).toHaveCount(0);
  return pageTitle;
}
