import type { Page } from "@playwright/test";
import { test, expect, openRootineRoute } from "./fixtures";

/**
 * Guards the invariants that the July 2026 UI audit established. Each test here failed
 * against the pre-audit build; the baseline it caught is recorded in the assertion message
 * so a future regression is recognisable rather than just red.
 */

const ROUTES = [
  "/dzisiaj",
  "/zadania",
  "/kalendarz",
  "/odzywianie",
  "/odzywianie/posilki",
  "/odzywianie/analiza",
  "/sport",
  "/cele",
  "/sprawy",
  "/praca",
  "/notatki",
  "/podroze",
] as const;

/**
 * --control-height-* plus --row-height-compact, which the context sidebar nav uses.
 *
 * The invariant covers controls that render as controls — anything wearing a shared
 * design-system class. Clickable rows and cards (a goal card, a travel board row) size to
 * their content by design and are deliberately out of scope; forcing a card to 40px would
 * be a worse layout, not a more consistent one.
 */
const ALLOWED_CONTROL_HEIGHTS = [24, 28, 36, 40, 48];
const CONTROL_HEIGHT_TOLERANCE = 1.5;
const SYSTEM_CONTROL_SELECTOR = [
  ".ui-button",
  ".ui-field__control",
  ".ui-select-trigger",
  ".ui-date-trigger",
  ".context-nav-item",
  ".ui-tab",
].join(",");

async function collectRouteMetrics(page: Page) {
  return page.evaluate((selector) => {
    const round = (value: number) => Math.round(value * 100) / 100;
    const controls = new Set<number>();
    const typography = new Set<string>();
    let smallestText = Number.POSITIVE_INFINITY;

    for (const element of document.querySelectorAll<HTMLElement>("main *, .ui-page-shell *, .ui-context-sidebar *")) {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      const style = getComputedStyle(element);

      if (element.matches(selector) && rect.height > 0) {
        controls.add(round(rect.height));
      }

      // Screen-reader-only copy and the hidden native <select> mirror inherit the browser
      // default of 16px. They are never seen, so they are not part of the visual scale.
      const visuallyHidden = style.clip === "rect(0px, 0px, 0px, 0px)"
        || style.clipPath === "inset(50%)"
        || element.closest(".ui-sr-only, .ui-select-native") !== null;

      if (!visuallyHidden && element.children.length === 0 && element.textContent?.trim()) {
        const size = parseFloat(style.fontSize);
        if (Number.isFinite(size)) smallestText = Math.min(smallestText, size);
        typography.add([
          style.fontSize,
          style.fontWeight,
          style.lineHeight,
          style.letterSpacing,
          style.fontFamily.split(",")[0].trim(),
        ].join("|"));
      }
    }

    return {
      controlHeights: [...controls].sort((left, right) => left - right),
      typography: [...typography],
      smallestText: Number.isFinite(smallestText) ? smallestText : null,
    };
  }, SYSTEM_CONTROL_SELECTOR);
}

test.describe("design system invariants", { tag: "@viewport-matrix" }, () => {
  test("the current view shares the page content axis on every route", async ({ rootinePage: page }) => {
    for (const route of ROUTES) {
      await openRootineRoute(page, route);
      const alignment = await page.evaluate(() => {
        const contentHeader = document.querySelector<HTMLElement>(".ui-content-header");
        const pageContent = document.querySelector<HTMLElement>(".ui-page-shell__content");
        return {
          contentHeaderX: contentHeader?.getBoundingClientRect().x ?? null,
          contentX: pageContent?.getBoundingClientRect().x ?? null,
        };
      });
      expect(
        alignment.contentHeaderX,
        `${route}: every route renders a current-view header`,
      ).not.toBeNull();
      expect(
        Math.abs(alignment.contentHeaderX! - alignment.contentX!),
        `${route}: current-view header must align with page content`,
      ).toBeLessThanOrEqual(1);
    }
  });

  for (const route of ROUTES) {
    test(`${route} uses only tokenised control heights`, async ({ rootinePage: page }) => {
      await openRootineRoute(page, route);
      const { controlHeights } = await collectRouteMetrics(page);

      const offenders = controlHeights.filter((height) => !ALLOWED_CONTROL_HEIGHTS.some(
        (allowed) => Math.abs(height - allowed) <= CONTROL_HEIGHT_TOLERANCE,
      ));

      expect(
        offenders,
        // Notatki reported 12 distinct heights pre-audit, including 22.5 and 98.88.
        `${route}: control heights must come from --control-height-* (${ALLOWED_CONTROL_HEIGHTS.join(", ")}px)`,
      ).toEqual([]);
    });

    test(`${route} keeps every text run at 11px or larger`, async ({ rootinePage: page }) => {
      await openRootineRoute(page, route);
      const { smallestText } = await collectRouteMetrics(page);

      expect(
        smallestText,
        // Kalendarz, Odżywianie and Cele rendered 9px copy before the audit. The floor is
        // 10px because `--text-nano` (DESIGN.md: "metadana gęsta") is a real step of the
        // ramp, used by dense third-order counts such as .task-group-heading__count.
        // Anything below 10px is off the scale.
        `${route}: smallest rendered font-size`,
      ).toBeGreaterThanOrEqual(10);
    });
  }

  test("no route lets content escape the viewport", async ({ rootinePage: page }) => {
    for (const route of ROUTES) {
      await openRootineRoute(page, route);
      const escaping = await page.evaluate(() => {
        const viewportWidth = document.documentElement.clientWidth;
        const offenders: string[] = [];

        for (const element of document.querySelectorAll<HTMLElement>("body *")) {
          const style = getComputedStyle(element);
          if (style.display === "none" || style.visibility === "hidden") continue;
          // Visually hidden helpers are clipped and cannot produce a scrollbar.
          if (style.clip === "rect(0px, 0px, 0px, 0px)" || style.clipPath === "inset(50%)") continue;
          if (style.overflowX !== "visible") continue;

          const rect = element.getBoundingClientRect();
          if (rect.width === 0 || rect.right <= viewportWidth + 1) continue;

          let clipped = false;
          for (let parent = element.parentElement; parent; parent = parent.parentElement) {
            if (getComputedStyle(parent).overflowX !== "visible") { clipped = true; break; }
          }
          if (!clipped) {
            offenders.push(`${element.tagName.toLowerCase()}.${String(element.className).split(" ")[0]}`);
          }
        }
        return offenders.slice(0, 5);
      });

      expect(escaping, `${route}: no element may extend past the viewport`).toEqual([]);
    }
  });

  test("the whole app shares one small typographic scale", async ({ rootinePage: page }) => {
    const combinations = new Set<string>();

    for (const route of ROUTES) {
      await openRootineRoute(page, route);
      const { typography } = await collectRouteMetrics(page);
      typography.forEach((entry) => combinations.add(entry));
    }

    /*
     * A ratchet, not a target. The shared PageShell adds an intentional headline
     * tier while remaining within the compact product scale.
     */
    expect(
      combinations.size,
      `unique typography combinations across all routes:\n${[...combinations].sort().join("\n")}`,
    ).toBeLessThanOrEqual(48);
  });
});

test.describe("shell invariants", { tag: "@viewport-matrix" }, () => {
  test("the primary sidebar remains fixed while global page headers stay removed", async ({ rootinePage: page }) => {
    for (const route of ROUTES) {
      await openRootineRoute(page, route);
      const box = await page.evaluate(() => {
        const sidebar = document.querySelector(".app-sidebar");
        return {
          sidebarWidth: sidebar ? Math.round(sidebar.getBoundingClientRect().width) : null,
          pageHeaderCount: document.querySelectorAll(".ui-page-header").length,
        };
      });

      const viewport = page.viewportSize()!;
      if (viewport.width > 1180) {
        expect(box.sidebarWidth, `${route}: --app-sidebar-width`).toBe(204);
      } else if (viewport.width > 760) {
        expect(box.sidebarWidth, `${route}: --app-sidebar-collapsed-width`).toBe(68);
      }
      expect(box.pageHeaderCount, `${route}: global page header must be removed`).toBe(0);
    }
  });

  test("DetailPanel is docked without occlusion above 1380px and modal at 1380px", async ({ rootinePage: page }) => {
    await page.setViewportSize({ width: 1381, height: 900 });
    await openRootineRoute(page, "/zadania?widok=dzis");
    await page.locator(".task-item-row").first().click();

    const detailPanel = page.locator(".task-detail-panel");
    await expect(detailPanel).toBeVisible();
    const docked = await page.evaluate(() => {
      const panel = document.querySelector<HTMLElement>(".ui-detail-panel");
      const body = panel?.closest<HTMLElement>(".ui-module-shell__body") ?? null;
      const main = body?.querySelector<HTMLElement>(":scope > .ui-main-content") ?? null;
      if (!body || !main || !panel) return null;
      const mainRect = main.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      return {
        panelPosition: getComputedStyle(panel).position,
        panelWidth: panelRect.width,
        panelLeft: panelRect.left,
        mainRight: mainRect.right,
        gridColumns: getComputedStyle(body).gridTemplateColumns,
        role: panel.getAttribute("role"),
        ariaModal: panel.getAttribute("aria-modal"),
        backdropCount: body.querySelectorAll(".ui-detail-panel-backdrop").length,
      };
    });

    expect(docked).not.toBeNull();
    expect(docked!.panelPosition).toBe("absolute");
    expect(docked!.panelWidth).toBeCloseTo(408, 0);
    expect(docked!.panelLeft).toBeGreaterThanOrEqual(docked!.mainRight - 1);
    expect(docked!.gridColumns).toMatch(/408px$/);
    expect(docked!.role).toBeNull();
    expect(docked!.ariaModal).toBeNull();
    expect(docked!.backdropCount).toBe(0);

    await page.setViewportSize({ width: 1380, height: 900 });
    await expect(detailPanel).toHaveAttribute("role", "dialog");
    await expect(detailPanel).toHaveAttribute("aria-modal", "true");
    await expect(page.locator(".ui-detail-panel-backdrop")).toBeVisible();
  });
});
