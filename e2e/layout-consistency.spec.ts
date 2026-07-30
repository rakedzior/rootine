import type { Locator, Page } from "@playwright/test";
import { test, expect, openRootineRoute } from "./fixtures";

const ROUTES = [
  { name: "Dzisiaj", path: "/dzisiaj" },
  { name: "Zadania", path: "/zadania" },
  { name: "Kalendarz", path: "/kalendarz" },
  { name: "Notatki", path: "/notatki" },
  { name: "Cele", path: "/cele" },
  { name: "Sport", path: "/sport" },
  { name: "Odżywianie", path: "/odzywianie" },
  { name: "Praca", path: "/praca" },
  { name: "Sprawy", path: "/sprawy" },
  { name: "Podróże", path: "/podroze" },
] as const;

type Rectangle = NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>;

function expectInsideViewport(
  rectangle: Rectangle,
  viewport: { width: number; height: number },
  description: string,
) {
  expect(rectangle.x, `${description}: left edge`).toBeGreaterThanOrEqual(-1);
  expect(rectangle.y, `${description}: top edge`).toBeGreaterThanOrEqual(-1);
  expect(rectangle.x + rectangle.width, `${description}: right edge`)
    .toBeLessThanOrEqual(viewport.width + 1);
  expect(rectangle.y, `${description}: starts below viewport`)
    .toBeLessThan(viewport.height);
}

async function expectNoGlobalHorizontalOverflow(page: Page, routeName: string) {
  const overflow = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));

  expect(
    overflow.documentWidth,
    `${routeName}: document creates a horizontal page scrollbar`,
  ).toBeLessThanOrEqual(overflow.viewportWidth + 1);
  expect(
    overflow.bodyWidth,
    `${routeName}: body creates a horizontal page scrollbar`,
  ).toBeLessThanOrEqual(overflow.viewportWidth + 1);
}

test.describe("responsive shell and module invariants", { tag: "@viewport-matrix" }, () => {
  for (const route of ROUTES) {
    test(`${route.name} reflows without shifting the module header`, async ({
      rootinePage: page,
    }) => {
      await openRootineRoute(page, route.path);

      const viewport = page.viewportSize();
      expect(viewport).not.toBeNull();

      const workspace = page.locator("#primary-workspace");
      const moduleShell = workspace.locator(":scope > .ui-module-shell");
      const moduleHeader = moduleShell.locator(":scope > .ui-module-shell__header");
      const headerRow = moduleHeader.locator(".ui-page-header__row");
      const visibleMain = workspace.locator("main:visible");
      const visibleH1 = workspace.locator("h1:visible");

      await expect(workspace).toHaveCount(1);
      await expect(moduleShell).toHaveCount(1);
      await expect(moduleHeader).toBeVisible();
      await expect(headerRow).toBeVisible();
      await expect(visibleMain).toHaveCount(1);
      await expect(visibleH1).toHaveCount(1);

      const [workspaceBox, shellBox, headerBox, headerRowBox, headingBox] = await Promise.all([
        workspace.boundingBox(),
        moduleShell.boundingBox(),
        moduleHeader.boundingBox(),
        headerRow.boundingBox(),
        visibleH1.boundingBox(),
      ]);
      expect(workspaceBox).not.toBeNull();
      expect(shellBox).not.toBeNull();
      expect(headerBox).not.toBeNull();
      expect(headerRowBox).not.toBeNull();
      expect(headingBox).not.toBeNull();

      expectInsideViewport(workspaceBox!, viewport!, `${route.name} workspace`);
      expectInsideViewport(shellBox!, viewport!, `${route.name} module shell`);
      expectInsideViewport(headerBox!, viewport!, `${route.name} module header`);
      expectInsideViewport(headingBox!, viewport!, `${route.name} h1`);

      expect(
        Math.abs(headerBox!.x - shellBox!.x),
        `${route.name}: a context sidebar must not shift the page header`,
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(headerBox!.width - shellBox!.width),
        `${route.name}: the page header must span the module shell`,
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(headerRowBox!.x - shellBox!.x),
        `${route.name}: the page header row must use the shared left gutter`,
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(headerRowBox!.width - shellBox!.width),
        `${route.name}: the page header row must not be centered by content width`,
      ).toBeLessThanOrEqual(1);
      await expect(visibleH1).toHaveCSS("text-align", "left");

      if (["/zadania", "/kalendarz", "/praca", "/notatki"].includes(route.path)) {
        const contextSidebar = moduleShell.locator(":scope > .ui-module-shell__body > .ui-context-sidebar");
        await expect(contextSidebar).toBeVisible();
        const sidebarBox = await contextSidebar.boundingBox();
        expect(sidebarBox).not.toBeNull();
        expect(
          Math.abs(sidebarBox!.x - shellBox!.x),
          `${route.name}: context sidebar must attach to the global navigation edge`,
        ).toBeLessThanOrEqual(1);
      }

      if (route.path === "/zadania") {
        const contextSidebar = moduleShell.locator(".ui-context-sidebar");
        const collapseButton = contextSidebar.locator(".ui-context-sidebar__collapse");
        const firstSection = contextSidebar.locator(".ui-section-header").first();
        await expect(collapseButton).toBeVisible();
        await expect(collapseButton.locator("svg")).toBeVisible();
        await expect(collapseButton).not.toContainText("Zwiń panel");
        await expect(firstSection).toBeVisible();

        const [sidebarBox, collapseBox, sectionBox] = await Promise.all([
          contextSidebar.boundingBox(),
          collapseButton.boundingBox(),
          firstSection.boundingBox(),
        ]);
        expect(sidebarBox).not.toBeNull();
        expect(collapseBox).not.toBeNull();
        expect(sectionBox).not.toBeNull();

        expect(
          collapseBox!.x + collapseBox!.width,
          "Zadania: collapse control is aligned to the sidebar's right edge",
        ).toBeLessThanOrEqual(sidebarBox!.x + sidebarBox!.width - 8);
        expect(
          Math.abs(
            collapseBox!.y + collapseBox!.height / 2
              - (sectionBox!.y + sectionBox!.height / 2),
          ),
          "Zadania: collapse control shares the first sidebar section's vertical rhythm",
        ).toBeLessThanOrEqual(7);

        const expandedIconPath = await collapseButton.locator("svg path").getAttribute("d");
        await collapseButton.click();
        await expect(collapseButton).toHaveAttribute("aria-expanded", "false");
        const collapsedIconPath = await collapseButton.locator("svg path").getAttribute("d");
        expect(collapsedIconPath).not.toBe(expandedIconPath);
        await collapseButton.click();
        await expect(collapseButton).toHaveAttribute("aria-expanded", "true");
      }

      await expectNoGlobalHorizontalOverflow(page, route.name);
    });
  }

  test("skip link bypasses navigation and moves keyboard focus to the workspace", async ({
    rootinePage: page,
  }) => {
    await openRootineRoute(page, "/dzisiaj");

    const skipLink = page.getByRole("link", { name: "Przejdź do treści" });
    const workspace = page.locator("#primary-workspace");
    await expect(skipLink).toHaveAttribute("href", "#primary-workspace");
    await expect(workspace).toHaveAttribute("tabindex", "-1");

    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
      window.scrollTo(0, 0);
    });
    await page.keyboard.press("Tab");
    await expect(skipLink).toBeFocused();

    // The link slides in over --motion-fast. Reading its box immediately caught it
    // mid-transition (y was still negative), so settle on the resting position first.
    await expect
      .poll(async () => {
        const box = await skipLink.boundingBox();
        return box ? Math.round(box.y) : -1;
      }, { message: "focused skip link finishes sliding into the viewport" })
      .toBeGreaterThanOrEqual(0);

    const viewport = page.viewportSize();
    const skipLinkBox = await skipLink.boundingBox();
    expect(viewport).not.toBeNull();
    expect(skipLinkBox).not.toBeNull();
    expectInsideViewport(skipLinkBox!, viewport!, "focused skip link");

    await page.keyboard.press("Enter");
    await expect(workspace).toBeFocused();
  });
});
