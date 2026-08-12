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

type RootineFixtures = {
  rootinePage: Page;
};

export const test = base.extend<RootineFixtures>({
  rootinePage: async ({ page }, provide) => {
    // Keep demo data and visual states deterministic. The default work, goals,
    // and sport fixtures are anchored around this Wednesday, and relying on the
    // runner's wall clock made Today assertions drift when the suite crossed a
    // calendar day.
    await page.clock.install({ time: new Date("2026-08-05T10:00:00.000Z") });

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
      const marker = "rootine:e2e:storage-initialized";
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

export async function openRootineRoute(page: Page, path: string) {
  // Route readiness is owned by the app shell, not by the network. Waiting for
  // `networkidle` makes the matrix depend on background Supabase/weather/font
  // requests and causes otherwise healthy pages to time out when several
  // viewport projects share the Vite server.
  await page.goto(path, { waitUntil: "domcontentloaded" });
  const pageShell = page.locator(".ui-page-shell:visible");
  try {
    await expect(pageShell).toBeVisible({ timeout: 20_000 });
  } catch (error) {
    const html = await page.locator("body").innerHTML().catch(() => "");
    console.error("Page shell not found. Body HTML:", html.slice(0, 500));
    throw error;
  }
  await expect(page.locator(".app-route-state")).toHaveCount(0, { timeout: 15_000 });
  if (new URL(page.url()).pathname === "/dzisiaj") {
    await page.waitForFunction(() => {
      const modules = document.querySelectorAll(".today-module-row__identity > strong");
      return modules.length > 0 && Array.from(modules).every((module) => module.textContent?.trim().length);
    }, { timeout: 10_000 });
  }
  await settleModuleTransition(page);
  return pageShell;
}

/**
 * The module entry animation translates `.ui-module-main` by 8px for 90ms
 * (`useSubtabTransition`). Measuring geometry before it lands reports the module as
 * 8px out of alignment with the page content — which is exactly what /cele looked like.
 *
 * Waiting once is not enough: a module that writes its view into the query string after
 * mount (Cele does) changes the transition key a beat later, so the animation can start
 * *after* a naive check has already passed. The helper therefore requires the element to
 * stay settled for a stability window rather than to be settled once.
 *
 * Only this element's own animations are awaited: the ambient scenes run infinite CSS
 * animations, so waiting on `document.getAnimations()` would never resolve.
 */
const TRANSITION_STABLE_MS = 200;

async function settleModuleTransition(page: Page) {
  await page.evaluate(() => {
    delete (window as unknown as { __rootineSettledAt?: number }).__rootineSettledAt;
  });
  await page.waitForFunction((stableMs) => {
    const store = window as unknown as { __rootineSettledAt?: number };
    const main = document.querySelector(".ui-module-main");
    const idle = !main || (
      main.getAnimations().every((animation) => (
        animation.playState === "finished" || animation.playState === "idle"
      ))
      && ["none", "matrix(1, 0, 0, 1, 0, 0)"].includes(getComputedStyle(main).transform)
    );
    if (!idle) {
      delete store.__rootineSettledAt;
      return false;
    }
    store.__rootineSettledAt ??= performance.now();
    return performance.now() - store.__rootineSettledAt >= stableMs;
  }, TRANSITION_STABLE_MS, { timeout: 10_000 });
}
