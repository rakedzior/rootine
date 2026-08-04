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
    test(`${route.name} reflows without a global page header`, async ({
      rootinePage: page,
    }) => {
      await openRootineRoute(page, route.path);

      const viewport = page.viewportSize();
      expect(viewport).not.toBeNull();

      const workspace = page.locator("#primary-workspace");
      const moduleShell = workspace.locator(":scope > .rootine-route-transition > .ui-module-shell");
      const pageShell = moduleShell.locator(":scope .ui-page-shell");
      const pageContent = pageShell.locator(":scope > .ui-page-shell__content");
      const visibleMain = workspace.locator("main.ui-main-content:visible");
      const contentHeader = visibleMain.locator(".ui-content-header:visible").first();
      const contentHeaderInner = contentHeader.locator(".ui-content-header__inner");

      await expect(workspace).toHaveCount(1);
      await expect(moduleShell).toHaveCount(1);
      await expect(pageShell.locator(":scope > .ui-page-header")).toHaveCount(0);
      await expect(visibleMain).toHaveCount(1);
      await expect(contentHeader).toHaveCount(1);
      await expect(contentHeader).toBeVisible();

      const [workspaceBox, shellBox, pageShellBox, pageContentBox, contentHeaderBox, contentHeaderInnerBox] = await Promise.all([
        workspace.boundingBox(),
        moduleShell.boundingBox(),
        pageShell.boundingBox(),
        pageContent.boundingBox(),
        contentHeader.boundingBox(),
        contentHeaderInner.boundingBox(),
      ]);
      expect(workspaceBox).not.toBeNull();
      expect(shellBox).not.toBeNull();
      expect(pageShellBox).not.toBeNull();
      expect(pageContentBox).not.toBeNull();
      expect(contentHeaderBox).not.toBeNull();
      expect(contentHeaderInnerBox).not.toBeNull();

      expectInsideViewport(workspaceBox!, viewport!, `${route.name} workspace`);
      expectInsideViewport(shellBox!, viewport!, `${route.name} module shell`);
      expectInsideViewport(pageShellBox!, viewport!, `${route.name} page shell`);
      expectInsideViewport(contentHeaderBox!, viewport!, `${route.name} content header`);
      expect(
        Math.abs(contentHeaderBox!.x - pageContentBox!.x),
        `${route.name}: content header must share the page content edge`,
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(contentHeaderBox!.width - pageContentBox!.width),
        `${route.name}: content header must share the page content width`,
      ).toBeLessThanOrEqual(1);
      expect(contentHeaderInnerBox!.x).toBeGreaterThanOrEqual(pageContentBox!.x - 1);
      expect(contentHeaderInnerBox!.x + contentHeaderInnerBox!.width)
        .toBeLessThanOrEqual(pageContentBox!.x + pageContentBox!.width + 1);

      if (["/zadania", "/kalendarz", "/praca", "/notatki"].includes(route.path)) {
        const contextSidebar = moduleShell.locator(":scope > .ui-module-shell__body > .ui-module-sidebar");
        await expect(contextSidebar).toBeVisible();
        const sidebarBox = await contextSidebar.boundingBox();
        expect(sidebarBox).not.toBeNull();
        expect(
          Math.abs(sidebarBox!.x - shellBox!.x),
          `${route.name}: context sidebar must attach to the global navigation edge`,
        ).toBeLessThanOrEqual(1);
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
