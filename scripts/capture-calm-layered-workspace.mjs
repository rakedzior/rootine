import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const root = resolve(import.meta.dirname, "..");
const outputRoot = resolve(root, "output", "qa", "calm-layered-workspace");
const port = 4175;
const baseURL = `http://127.0.0.1:${port}`;

const routes = [
  ["today", "/dzisiaj"],
  ["tasks", "/zadania?widok=wszystkie"],
  ["nutrition", "/odzywianie"],
  ["sport-today", "/sport"],
  ["sport-plan", "/sport?widok=cycle"],
  ["sport-templates", "/sport?widok=templates"],
  ["sport-exercises", "/sport?widok=exercises"],
  ["sport-history", "/sport?widok=history"],
  ["sport-analysis", "/sport?widok=analysis"],
  ["work-today", "/praca"],
  ["work-week", "/praca?widok=week"],
  ["work-active", "/praca?widok=active"],
  ["goals-next", "/cele"],
  ["goals-all", "/cele?widok=all&uklad=grid"],
  ["affairs-today", "/sprawy?widok=today"],
  ["affairs-week", "/sprawy?widok=week"],
  ["affairs-all", "/sprawy?widok=all"],
  ["affairs-one-time", "/sprawy?widok=oneTime"],
  ["affairs-recurring", "/sprawy?widok=payments"],
  ["affairs-subscriptions", "/sprawy?widok=subscriptions"],
  ["affairs-budget", "/sprawy?widok=budget"],
  ["affairs-documents", "/sprawy?widok=documents"],
  ["affairs-vehicles", "/sprawy?widok=vehicles"],
  ["affairs-jdg", "/sprawy?widok=jdg"],
  ["affairs-travel", "/sprawy?widok=travel"],
  ["notes-cards", "/notatki"],
];

const viewports = [
  ["desktop", { width: 1440, height: 900 }],
  ["mobile", { width: 390, height: 844 }],
];

const vite = await createServer({
  root,
  logLevel: "error",
  server: { host: "127.0.0.1", port, strictPort: true },
});

await vite.listen();
const browser = await chromium.launch({ headless: true });

try {
  for (const [viewportName, viewport] of viewports) {
    const directory = resolve(outputRoot, viewportName);
    await mkdir(directory, { recursive: true });
    const context = await browser.newContext({ viewport });
    await context.route("https://api.open-meteo.com/**", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        current: { temperature_2m: 19, weather_code: 1 },
        daily: {
          temperature_2m_min: [12],
          temperature_2m_max: [23],
          precipitation_probability_max: [15],
          weather_code: [1],
        },
      }),
    }));
    await context.route("**/api/openfoodfacts/search**", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ hits: [] }),
    }));

    for (const [name, path] of routes) {
      // A fresh page keeps screenshots deterministic. Several modules own horizontal and
      // vertical scroll containers; reusing one page allowed their scroll positions and an
      // outgoing view-transition snapshot to leak into the next route capture.
      const page = await context.newPage();
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.clock.install({ time: new Date("2026-08-05T10:00:00.000Z") });
      await page.goto(`${baseURL}${path}`, { waitUntil: "networkidle" });
      await page.locator(".ui-page-shell:visible").waitFor({ state: "visible", timeout: 15_000 });
      await page.evaluate(() => globalThis.document.fonts.ready);
      await page.waitForTimeout(450);
      await page.screenshot({ path: resolve(directory, `${name}.png`), animations: "disabled" });
      await page.close();
    }

    const page = await context.newPage();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.clock.install({ time: new Date("2026-08-05T10:00:00.000Z") });
    await page.goto(`${baseURL}/notatki`, { waitUntil: "networkidle" });
    await page.locator(".ui-page-shell:visible").waitFor({ state: "visible", timeout: 15_000 });
    await page.getByRole("button", { name: "Widok listy" }).click();
    await page.locator(".notes-grid--list").first().waitFor({ state: "visible" });
    await page.screenshot({ path: resolve(directory, "notes-list.png"), animations: "disabled" });
    await page.close();
    await context.close();
  }
} finally {
  await browser.close();
  await vite.close();
}

console.log(outputRoot);
