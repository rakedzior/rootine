import { expect, openRootineRoute, test } from "./fixtures";

/**
 * Regression cover for the "paczka 01" defects: places where the UI showed data that
 * contradicted the underlying state, or offered an action the view could not perform.
 * Each test names the finding it guards so a future audit does not have to rediscover it.
 */

test.describe("integralność prezentowanych danych", () => {
  test("kalendarz pokazuje nazwę zadania, nie nazwę listy źródłowej @shared", async ({ rootinePage: page }) => {
    await openRootineRoute(page, "/kalendarz");

    const titles = page.locator(".calendar-event__title");
    await expect(titles.first()).toBeVisible();

    const texts = await titles.allInnerTexts();
    const named = texts.map((value) => value.trim()).filter(Boolean);
    expect(named.length).toBeGreaterThan(0);
    // "Zadania" is the source label for task-backed entries. Before the fix it was the only
    // thing a chip rendered, because the non-shrinking label consumed the whole chip width.
    expect(named.every((value) => value !== "Zadania")).toBe(true);

    const firstTitle = titles.first();
    await expect(firstTitle).not.toHaveText("");
    const width = await firstTitle.evaluate((node) => node.getBoundingClientRect().width);
    expect(width).toBeGreaterThan(20);
  });

  test("wykres minut treningu rysuje słupki proporcjonalne do wartości @shared", async ({ rootinePage: page }) => {
    await openRootineRoute(page, "/sport?widok=analysis");

    const cells = page.locator(".sport-analysis-bars > div");
    await expect(cells.first()).toBeVisible();

    const bars = await cells.evaluateAll((nodes) => nodes.map((node) => ({
      value: Number((node.querySelector("span")?.textContent ?? "0").replace(/\s/g, "")),
      plotHeight: Math.round(node.querySelector("div")?.getBoundingClientRect().height ?? 0),
      barHeight: Math.round(node.querySelector("i")?.getBoundingClientRect().height ?? 0),
    })));

    expect(bars.length).toBeGreaterThan(0);
    // The plot area collapsed to 3px when a stale rule forced the bar cell out of grid layout.
    expect(bars.every((bar) => bar.plotHeight > 100)).toBe(true);

    const withData = bars.filter((bar) => bar.value > 0);
    if (withData.length > 0) {
      expect(withData.every((bar) => bar.barHeight > 20)).toBe(true);
      const tallest = withData.reduce((best, bar) => (bar.value > best.value ? bar : best));
      const smallest = withData.reduce((worst, bar) => (bar.value < worst.value ? bar : worst));
      if (tallest.value > smallest.value) {
        expect(tallest.barHeight).toBeGreaterThan(smallest.barHeight);
      }
    }
  });

  test("licznik nawyków w nawigacji i w nagłówku pokazuje tę samą liczbę @desktop", async ({ rootinePage: page }) => {
    await openRootineRoute(page, "/zadania?widok=nawyki");

    const sidebarBadge = page.locator(".task-nav [data-view='nawyki'] , .context-nav-item")
      .filter({ hasText: "Nawyki" })
      .first();
    await expect(sidebarBadge).toBeVisible();

    const sidebarCount = Number(((await sidebarBadge.innerText()).match(/(\d+)\s*$/) ?? [])[1] ?? "0");
    const headerText = await page.locator(".ui-content-header__meta").first().innerText();
    const headerCount = Number((headerText.match(/(\d+)/) ?? [])[1] ?? "-1");

    // Both express "left to do today" (AD-9). They used to count different things.
    expect(headerCount).toBe(sidebarCount);
  });

  test("widok Kosz nie oferuje dodawania zadań @shared", async ({ rootinePage: page }) => {
    await openRootineRoute(page, "/zadania?widok=kosz");
    await expect(page.locator(".ui-content-header__title")).toContainText("Kosz");
    await expect(page.locator("form.task-entry")).toHaveCount(0);

    await openRootineRoute(page, "/zadania?widok=ukonczone");
    await expect(page.locator("form.task-entry")).toHaveCount(0);

    // The composer must still be there in the views that can actually accept a new task.
    await openRootineRoute(page, "/zadania?widok=wszystkie");
    await expect(page.locator("form.task-entry")).toHaveCount(1);
  });

  test("terminy pojazdu nie powtarzają tej samej daty dwa razy w wierszu @shared", async ({ rootinePage: page }) => {
    await openRootineRoute(page, "/sprawy?widok=vehicles");

    const rows = page.locator(".affairs-vehicle-row");
    await expect(rows.first()).toBeVisible();

    const duplicates = await rows.evaluateAll((nodes) => nodes.map((node) => {
      const target = (node.querySelector(".affairs-vehicle-row__target")?.textContent ?? "").trim();
      const badge = (node.querySelector(".ui-badge")?.textContent ?? "").trim();
      return Boolean(badge) && target.includes(badge);
    }));

    expect(duplicates.some(Boolean)).toBe(false);
  });

  test("Sprawy nie zgłaszają duplikatów kluczy Reacta @shared", async ({ rootinePage: page }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });

    for (const path of ["/sprawy", "/sprawy?widok=matters", "/sprawy?widok=payments"]) {
      await openRootineRoute(page, path);
    }

    expect(errors.filter((entry) => entry.includes("same key"))).toEqual([]);
  });
});
