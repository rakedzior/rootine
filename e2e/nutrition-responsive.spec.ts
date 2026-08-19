import { expect, openRootineRoute, test } from "./fixtures";

type LedgerGeometry = {
  headerDisplay: string;
  nutritionDisplay: string;
  hasHorizontalOverflow: boolean;
  rowHeights: number[];
  meals: { x: number; y: number; width: number; height: number };
  summary: { x: number; y: number; width: number; height: number };
};

async function settleResponsiveLayout(page: Parameters<typeof openRootineRoute>[0]) {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

async function readLedgerGeometry(page: Parameters<typeof openRootineRoute>[0]): Promise<LedgerGeometry> {
  return page.evaluate(() => {
    const rect = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`Missing responsive test element: ${selector}`);
      const bounds = element.getBoundingClientRect();
      return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
    };
    const header = document.querySelector(".nutrition-entry-table-header");
    const nutrition = document.querySelector(".nutrition-entry-item__nutrition");
    const rows = Array.from(document.querySelectorAll(".nutrition-entry-item"));

    return {
      headerDisplay: header ? getComputedStyle(header).display : "missing",
      nutritionDisplay: nutrition ? getComputedStyle(nutrition).display : "missing",
      hasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      rowHeights: rows.map((row) => row.getBoundingClientRect().height),
      meals: rect(".nutrition-meals-panel"),
      summary: rect(".nutrition-summary"),
    };
  });
}

async function expectAlignedLedgerColumns(page: Parameters<typeof openRootineRoute>[0]) {
  const centers = await page.evaluate(() => {
    const center = (element: Element) => {
      const bounds = element.getBoundingClientRect();
      return bounds.x + bounds.width / 2;
    };
    const header = Array.from(document.querySelectorAll(".nutrition-entry-table-header > span"));
    const meal = document.querySelector(".nutrition-meal-card");
    const entry = document.querySelector(".nutrition-entry-item");
    if (header.length !== 7 || !meal || !entry) throw new Error("Ledger columns are incomplete");

    const summary = Array.from(meal.querySelectorAll(".nutrition-meal-summary__metric"));
    const nutrition = [
      entry.querySelector(".nutrition-entry-item__portion"),
      ...Array.from(entry.querySelectorAll(".nutrition-entry-item__metric")),
      entry.querySelector(".nutrition-entry-item__calories"),
    ].filter((element): element is Element => Boolean(element));

    return {
      header: header.slice(1, 6).map(center),
      meal: summary.map(center),
      entry: nutrition.map(center),
      productStarts: [
        header[0].getBoundingClientRect().x,
        meal.querySelector(".nutrition-meal-card__identity")?.getBoundingClientRect().x ?? -1,
        entry.querySelector(".nutrition-entry-item__main")?.getBoundingClientRect().x ?? -1,
      ],
    };
  });

  expect(centers.meal).toHaveLength(4);
  expect(centers.entry).toHaveLength(5);
  centers.header.forEach((value, index) => expect(Math.abs(value - centers.entry[index])).toBeLessThanOrEqual(1));
  centers.header.slice(1).forEach((value, index) => expect(Math.abs(value - centers.meal[index])).toBeLessThanOrEqual(1));
  centers.productStarts.slice(1).forEach((value) => expect(Math.abs(value - centers.productStarts[0])).toBeLessThanOrEqual(1));
}

test("nutrition ledger keeps one-row products through every responsive stage @desktop", async ({ rootinePage: page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openRootineRoute(page, "/odzywianie?konto=testowe");

  const productName = page.locator(".nutrition-entry-item__name").first();
  await expect(productName).toHaveText("Miska Aurora (Marka demo)");
  await expect(productName.locator(":scope > .nutrition-entry-item__brand")).toHaveText(" (Marka demo)");
  await expect(page.locator(".nutrition-entry-item__main > .nutrition-product-brand")).toHaveCount(0);
  expect(await productName.evaluate((element) => getComputedStyle(element).whiteSpace)).toBe("nowrap");

  const viewportChecks = [
    { width: 1440, metricsVisible: true, summaryAtRight: true, maxRowHeight: 62 },
    { width: 1366, metricsVisible: true, summaryAtRight: false, maxRowHeight: 62 },
    { width: 1024, metricsVisible: true, summaryAtRight: false, maxRowHeight: 62 },
    { width: 760, metricsVisible: true, summaryAtRight: false, maxRowHeight: 62 },
    { width: 600, metricsVisible: false, summaryAtRight: false, maxRowHeight: 52 },
    { width: 390, metricsVisible: false, summaryAtRight: false, maxRowHeight: 52 },
    { width: 320, metricsVisible: false, summaryAtRight: false, maxRowHeight: 52 },
  ] as const;

  for (const check of viewportChecks) {
    await test.step(`${check.width}px`, async () => {
      await page.setViewportSize({ width: check.width, height: 900 });
      await settleResponsiveLayout(page);
      const geometry = await readLedgerGeometry(page);

      expect(geometry.hasHorizontalOverflow).toBe(false);
      geometry.rowHeights.forEach((height) => expect(height).toBeLessThanOrEqual(check.maxRowHeight));
      expect(geometry.headerDisplay === "none").toBe(!check.metricsVisible);
      expect(geometry.nutritionDisplay === "none").toBe(!check.metricsVisible);

      if (check.summaryAtRight) {
        expect(geometry.summary.x).toBeGreaterThanOrEqual(geometry.meals.x + geometry.meals.width);
        expect(geometry.summary.width).toBeLessThanOrEqual(280);
      } else {
        expect(geometry.summary.y).toBeGreaterThanOrEqual(geometry.meals.y + geometry.meals.height);
      }

      if (check.metricsVisible) await expectAlignedLedgerColumns(page);
    });
  }
});
