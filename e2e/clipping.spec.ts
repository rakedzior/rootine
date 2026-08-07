import { expect, openRootineRoute, test } from "./fixtures";

/**
 * Guards "paczka 02": no view may cut content without an ellipsis, and no box may let its own
 * children escape its edge. Working `text-overflow: ellipsis` is deliberate truncation and is
 * ignored here — flagging it produced false repairs during the audit.
 *
 * `scripts/clip-audit.mjs` runs the same check across every viewport for manual sweeps.
 */

const ROUTES = [
  "/dzisiaj",
  "/zadania?widok=wszystkie",
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
  "/odzywianie/posilki",
  "/odzywianie/analiza",
  "/praca",
  "/sprawy",
  "/sprawy?widok=documents",
  "/sprawy?widok=vehicles",
  "/sprawy?widok=jdg",
  "/podroze",
];

async function findClipping(page: import("@playwright/test").Page) {
  // Measuring before the webfont settles or while the route transition is still animating
  // reports transient widths, which made this flake.
  await page.evaluate(() => document.fonts.ready);
  // Not `animation.finished`: the ambient scenes run infinite animations that never resolve.
  // The route/subtab transition is the only thing that moves layout, and it is under 500ms.
  await page.waitForTimeout(500);
  return page.evaluate(() => {
    const results: string[] = [];
    const scope = ".ui-main-content *, .ui-context-sidebar *, .ui-detail-panel *";
    for (const element of document.querySelectorAll(scope)) {
      if (element.classList.contains("ui-sr-only") || element.classList.contains("sr-only")) continue;
      const styles = getComputedStyle(element);
      if (styles.overflowX === "auto" || styles.overflowX === "scroll") continue;
      if (element.clientWidth <= 0) continue;
      // Visually-hidden helpers collapse to a 1px box on purpose.
      if (element.clientWidth <= 1 && element.clientHeight <= 1) continue;
      const overflow = element.scrollWidth - element.clientWidth;
      if (overflow <= 2) continue;

      const ellipsised = styles.textOverflow === "ellipsis" && styles.whiteSpace === "nowrap";
      const box = element.getBoundingClientRect();
      const escaping = [...element.children].some((child) => {
        const childBox = child.getBoundingClientRect();
        return childBox.width > 0 && childBox.right - box.right > 2;
      });
      if (!escaping && ellipsised) continue;

      const name = (element.className.toString() || element.tagName).split(" ")[0];
      results.push(`${escaping ? "CONTAINER" : "CLIP"} ${name} ${element.clientWidth}<${element.scrollWidth}`);
    }
    return [...new Set(results)];
  });
}

test.describe("brak przycinania zawartości", () => {
  for (const route of ROUTES) {
    test(`${route} nie ucina treści bez wielokropka @desktop`, async ({ rootinePage: page }) => {
      await openRootineRoute(page, route);
      expect(await findClipping(page)).toEqual([]);
    });
  }

  // Paczka 03: the workspace header reacts to its own column, not to the viewport, so opening
  // a detail panel must reflow the toolbar instead of letting the panel edge cut it.
  for (const [route, trigger] of [
    ["/zadania?widok=wszystkie", ".ui-list-row__copy--action"],
    // The default Goals route is now "Następne kroki". Open the overview explicitly so this
    // still verifies the card-triggered detail panel without restoring sidebar auto-open.
    ["/cele?widok=overview", ".goal-card-primary"],
    ["/praca", ".ui-list-row__copy--action"],
  ] as const) {
    test(`${route} nie ucina paska narzędzi po otwarciu panelu @desktop`, async ({ rootinePage: page }) => {
      await openRootineRoute(page, route);
      await page.locator(trigger).first().click();
      await expect(page.locator(".ui-detail-panel")).toBeVisible();
      expect(await findClipping(page)).toEqual([]);
    });
  }

  // One test per route rather than one loop over all of them: as a single test this walked
  // 18 routes sequentially, took ~19s and intermittently blew the 30s timeout under parallel
  // load. Split, each case is a couple of seconds and the workers run them side by side.
  for (const route of ROUTES) {
    test(`${route} nie przewija dokumentu w poziomie @shared`, async ({ rootinePage: page }) => {
      await openRootineRoute(page, route);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${route} scrolls horizontally`).toBeLessThanOrEqual(0);
    });
  }
});
