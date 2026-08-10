import { chromium } from "@playwright/test";
import { createServer } from "vite";

const HOST = "127.0.0.1";
const PORT = 4176;
const BASE_URL = `http://${HOST}:${PORT}`;
const COUNTS = [0, 1, 5, 20, 100];
const TASK_STORAGE_KEY = "rootine.task-workspace.v1";

const server = await createServer({
  server: { host: HOST, port: PORT, strictPort: true },
});

const browser = await chromium.launch({ headless: true });
const results = [];

try {
  await server.listen();

  for (const count of COUNTS) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    await page.clock.install({ time: new Date("2026-08-05T10:00:00.000Z") });
    await page.addInitScript(({ key, recordCount }) => {
      try {
        const marker = `rootine:audit:corrected-volume-seed:${recordCount}`;
        if (window.sessionStorage.getItem(marker) === "true") return;
        window.localStorage.clear();
        window.sessionStorage.clear();
        window.sessionStorage.setItem(marker, "true");
        const tasks = Array.from({ length: recordCount }, (_, index) => ({
          id: 990_000 + index,
          text: `Wolumen ${String(index + 1).padStart(3, "0")} · ${"bardzo-długi-tytuł-zadania-".repeat(index === recordCount - 1 ? 5 : 1)}`,
          done: false,
          view: "dzis",
          calendarDate: "2026-08-05",
          schedule: { allDay: true, startTime: "", timezone: "Europe/Warsaw" },
          priority: index % 3 === 0 ? "high" : index % 3 === 1 ? "medium" : "low",
          tags: index % 2 === 0 ? ["wolumen-testowy-z-bardzo-długą-nazwą"] : [],
          notes: index === recordCount - 1 ? "Długi opis ".repeat(20) : "",
        }));
        window.localStorage.setItem(key, JSON.stringify({
          version: 2,
          updatedAt: "2026-08-05T10:00:00.000Z",
          tasks,
          habits: [],
          lists: [],
          tags: [{
            id: "wolumen-testowy-z-bardzo-długą-nazwą",
            label: "wolumen-testowy-z-bardzo-długą-nazwą",
            color: "#A0A0A0",
          }],
        }));
      } catch {
        // The init script may briefly run against an opaque origin.
      }
    }, { key: TASK_STORAGE_KEY, recordCount: count });

    await page.goto(`${BASE_URL}/zadania?widok=dzis`);
    await page.locator(".ui-page-shell:visible").waitFor({ state: "visible", timeout: 15_000 });

    const tasks = page.getByRole("button", { name: /^Otwórz szczegóły zadania: Wolumen/ });
    await tasks.first().or(page.locator(".task-empty-state").first()).waitFor({ state: "visible", timeout: 15_000 });
    const initialCount = await tasks.count();
    const initialOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator(".ui-page-shell:visible").waitFor({ state: "visible", timeout: 15_000 });
    const reloadedTasks = page.getByRole("button", { name: /^Otwórz szczegóły zadania: Wolumen/ });
    if (count > 0) await reloadedTasks.first().waitFor({ state: "visible", timeout: 15_000 });
    const reloadedCount = await reloadedTasks.count();
    const reloadedOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

    let detailOpened = count === 0;
    if (count > 0) {
      const last = reloadedTasks.last();
      await last.scrollIntoViewIfNeeded();
      await last.click();
      detailOpened = await page.getByRole("complementary", { name: "Szczegóły zadania" }).isVisible();
    }

    results.push({
      count,
      initialCount,
      reloadedCount,
      initialOverflow,
      reloadedOverflow,
      detailOpened,
      passed: initialCount === count
        && reloadedCount === count
        && !initialOverflow
        && !reloadedOverflow
        && detailOpened,
    });
    await context.close();
  }

  console.log(JSON.stringify({ passed: results.every((result) => result.passed), results }, null, 2));
} finally {
  await browser.close();
  await server.close();
}
