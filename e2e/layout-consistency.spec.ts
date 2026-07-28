import { test, expect, openRoutineRoute } from "./fixtures";

const ROUTES = [
  {
    name: "Dzisiaj",
    path: "/dzisiaj",
    surfaceSelector: ".today-content",
    contentSelector: ".today-module-register",
    heightContentSelector: ".today-module-register",
  },
  {
    name: "Zadania",
    path: "/zadania",
    surfaceSelector: ".task-content",
    contentSelector: ".task-entry",
    tolerance: 10,
  },
  {
    name: "Kalendarz",
    path: "/kalendarz",
    surfaceSelector: ".calendar-page",
    contentSelector: ".calendar-page",
    heightContentSelector: ".calendar-page",
  },
  {
    name: "Notatki",
    path: "/notatki",
    surfaceSelector: ".notes-canvas",
    contentSelector: ".notes-canvas__heading",
    heightContentSelector: ".notes-shelf:last-child",
  },
  {
    name: "Cele",
    path: "/cele",
    surfaceSelector: ".goals-content",
    contentSelector: ".goals-content > div",
  },
  {
    name: "Sport",
    path: "/sport",
    surfaceSelector: ".sport-planner-scroll",
    contentSelector: ".sport-planner-content",
    heightContentSelector: ".sport-planner-content",
  },
  {
    name: "Odżywianie",
    path: "/odzywianie",
    surfaceSelector: ".nutrition-content",
    contentSelector: ".nutrition-layout",
  },
  {
    name: "Praca",
    path: "/praca",
    surfaceSelector: ".work-overview",
    contentSelector: ".work-overview__header",
    heightContentSelector: ".work-overview-insights",
  },
  {
    name: "Sprawy",
    path: "/sprawy",
    surfaceSelector: ".affairs-canvas",
    contentSelector: ".affairs-overview",
    heightContentSelector: ".affairs-overview",
  },
  {
    name: "Podróże",
    path: "/podroze",
    surfaceSelector: ".travel-overview",
    contentSelector: ".travel-board",
    heightContentSelector: ".travel-board",
  },
] as const;

test.describe("module layout consistency", { tag: "@viewport" }, () => {
  for (const route of ROUTES) {
    test(`${route.name} fills the available workspace`, async ({ routinePage: page }, testInfo) => {
      if (testInfo.project.name === "desktop-1440") {
        await page.setViewportSize({ width: 1920, height: 1080 });
      }

      await openRoutineRoute(page, route.path);

      const shellContent = page.locator(".app-shell__content");
      const moduleRoot = page.locator(
        ".app-shell__content > .ui-module-shell, .app-shell__content > .nutrition-module",
      );
      await expect(moduleRoot).toHaveCount(1);

      const shellBox = await shellContent.boundingBox();
      const rootBox = await moduleRoot.boundingBox();
      expect(shellBox).not.toBeNull();
      expect(rootBox).not.toBeNull();
      expect(Math.abs(rootBox!.x - shellBox!.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(rootBox!.y - shellBox!.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(rootBox!.width - shellBox!.width)).toBeLessThanOrEqual(1);
      expect(Math.abs(rootBox!.height - shellBox!.height)).toBeLessThanOrEqual(1);

      const surface = page.locator(route.surfaceSelector).first();
      const content = page.locator(route.contentSelector).first();
      await expect(surface).toBeVisible();
      await expect(content).toBeVisible();

      const surfaceBox = await surface.boundingBox();
      const contentBox = await content.boundingBox();
      const horizontalPadding = await surface.evaluate((element) => {
        const style = getComputedStyle(element);
        return Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight);
      });
      const tolerance = "tolerance" in route ? route.tolerance : 2;
      const availableContentWidth = surfaceBox!.width - horizontalPadding;

      expect(contentBox!.width).toBeGreaterThanOrEqual(availableContentWidth - tolerance);

      if (
        testInfo.project.name !== "mobile-390"
        && "heightContentSelector" in route
      ) {
        const heightContent = page.locator(route.heightContentSelector).first();
        await expect(heightContent).toBeVisible();

        const heightContentBox = await heightContent.boundingBox();
        const bottomPadding = await surface.evaluate((element) => (
          Number.parseFloat(getComputedStyle(element).paddingBottom)
        ));
        const availableBottom = surfaceBox!.y + surfaceBox!.height - bottomPadding;
        const contentBottom = heightContentBox!.y + heightContentBox!.height;

        expect(contentBottom).toBeGreaterThanOrEqual(availableBottom - 2);
      }
    });
  }
});
