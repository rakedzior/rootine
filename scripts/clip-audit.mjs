/**
 * Content-clipping audit.
 *
 * Walks every route at the supported viewport widths and reports elements whose content is wider
 * than their box while they are not scrollable — i.e. text and controls the user simply cannot
 * read. This is the detector behind "paczka 02" in AUDIT-2026-08-04-TRIAGE.md; re-run it after
 * any layout change to confirm a fix and to catch new clipping elsewhere.
 *
 *   node scripts/clip-audit.mjs                     # needs a dev server on 127.0.0.1:4174
 *   node scripts/clip-audit.mjs --json
 *   node scripts/clip-audit.mjs --width 1440
 *   node scripts/clip-audit.mjs --base http://127.0.0.1:5173
 */
/* The callbacks passed to page.evaluate run inside the browser, not in this Node process. */
/* global document, window, getComputedStyle */
import { chromium } from "playwright";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const readFlag = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const BASE = readFlag("--base") ?? "http://127.0.0.1:4174";
const ONLY_WIDTH = readFlag("--width") ? Number(readFlag("--width")) : undefined;

const ROUTES = [
  "/dzisiaj",
  "/zadania?widok=wszystkie",
  "/zadania?widok=nawyki",
  "/kalendarz",
  "/notatki",
  "/cele",
  "/sport",
  "/sport?widok=cycle",
  "/sport?widok=templates",
  "/sport?widok=exercises",
  "/sport?widok=history",
  "/sport?widok=analysis",
  "/odzywianie",
  "/praca",
  "/sprawy",
  "/sprawy?widok=matters",
  "/sprawy?widok=payments",
  "/sprawy?widok=budget",
  "/sprawy?widok=documents",
  "/sprawy?widok=vehicles",
  "/sprawy?widok=jdg",
  "/podroze",
];

const VIEWPORTS = [
  { width: 2560, height: 1440 },
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
].filter((viewport) => ONLY_WIDTH === undefined || viewport.width === ONLY_WIDTH);

/** Overflow below this many pixels is sub-pixel rounding, not a readability problem. */
const TOLERANCE = 2;

const browser = await chromium.launch();
const report = [];

for (const viewport of VIEWPORTS) {
  const context = await browser.newContext({ viewport, locale: "pl-PL", timezoneId: "Europe/Warsaw" });
  await context.route("https://api.open-meteo.com/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: "{}",
  }));
  const page = await context.newPage();

  for (const route of ROUTES) {
    await page.goto(BASE + route, { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(400);

    const clipped = await page.evaluate((tolerance) => {
      const results = [];
      const scope = ".ui-main-content *, .ui-context-sidebar *, .ui-detail-panel *";
      for (const element of document.querySelectorAll(scope)) {
        // Visually hidden helpers are meant to overflow their 1px box.
        if (element.classList.contains("ui-sr-only") || element.classList.contains("sr-only")) continue;
        const styles = getComputedStyle(element);
        if (styles.overflowX === "auto" || styles.overflowX === "scroll") continue;
        if (element.clientWidth <= 0) continue;
        // Visually-hidden helpers collapse to a 1px box on purpose.
        if (element.clientWidth <= 1 && element.clientHeight <= 1) continue;
        const overflow = element.scrollWidth - element.clientWidth;
        if (overflow <= tolerance) continue;

        /*
         * Severity matters more than the raw number.
         *
         * `text-overflow: ellipsis` makes scrollWidth exceed clientWidth by design — that is a
         * working truncation, not a defect, so reporting it as "clipping" produces false repairs.
         * What actually loses information is content cut with no ellipsis, and boxes whose own
         * children stick out past their edge.
         */
        const ellipsised = styles.textOverflow === "ellipsis" && styles.whiteSpace === "nowrap";
        const box = element.getBoundingClientRect();
        const escaping = [...element.children].some((child) => {
          const childBox = child.getBoundingClientRect();
          return childBox.width > 0 && childBox.right - box.right > tolerance;
        });

        const kind = escaping ? "CONTAINER" : ellipsised ? "TRUNCATED" : "CLIP";
        results.push({
          kind,
          selector: (element.className.toString() || element.tagName).split(" ")[0].slice(0, 48),
          client: element.clientWidth,
          scroll: element.scrollWidth,
          overflow,
        });
      }
      return results;
    }, TOLERANCE);

    const documentOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (clipped.length > 0 || documentOverflow > 0) {
      report.push({ route, width: viewport.width, documentOverflow, clipped });
    }
  }

  await context.close();
}

await browser.close();

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const byRoute = new Map();
  for (const entry of report) {
    if (!byRoute.has(entry.route)) byRoute.set(entry.route, []);
    byRoute.get(entry.route).push(entry);
  }
  for (const [route, entries] of byRoute) {
    console.log(`\n### ${route}`);
    for (const entry of entries) {
      if (entry.documentOverflow > 0) {
        console.log(`  @${entry.width}  DOCUMENT SCROLLS HORIZONTALLY by ${entry.documentOverflow}px`);
      }
      const worst = [...entry.clipped]
        .filter((item) => item.kind !== "TRUNCATED")
        .sort((a, b) => b.overflow - a.overflow)
        .slice(0, 8);
      for (const item of worst) {
        console.log(`  @${entry.width}  ${item.kind.padEnd(10)} ${item.selector.padEnd(40)} ${item.client} < ${item.scroll}  (+${item.overflow})`);
      }
    }
  }
  const counts = { CLIP: 0, CONTAINER: 0, TRUNCATED: 0 };
  for (const entry of report) for (const item of entry.clipped) counts[item.kind] += 1;
  console.log(`\n${counts.CLIP} cut without ellipsis, ${counts.CONTAINER} boxes with escaping children, ${counts.TRUNCATED} working ellipsis (informational).`);
}

const actionable = report.reduce(
  (sum, entry) => sum + entry.clipped.filter((item) => item.kind !== "TRUNCATED").length,
  0,
);
process.exitCode = actionable > 0 ? 1 : 0;
