import type { Page, TestInfo } from "@playwright/test";
import { test, expect, openRootineRoute } from "./fixtures";

const REFLOW_ROUTES = [
  { name: "Dzisiaj", path: "/dzisiaj" },
  { name: "Notatki", path: "/notatki" },
  { name: "Cele", path: "/cele" },
  { name: "Sport", path: "/sport" },
  { name: "Odżywianie", path: "/odzywianie" },
  { name: "Praca", path: "/praca" },
  { name: "Sprawy", path: "/sprawy" },
  { name: "Podróże", path: "/podroze" },
] as const;

type ZoomMetadata = {
  zoomPercent: number;
  scale: number;
  physicalWidth: number;
  physicalHeight: number;
  effectiveWidth: number;
  effectiveHeight: number;
};

function zoomMetadata(testInfo: TestInfo): ZoomMetadata {
  return testInfo.project.metadata as ZoomMetadata;
}

async function expectReflowAtCurrentScale(page: Page, routeName: string) {
  const layout = await page.evaluate(() => {
    const contentHeader = document.querySelector<HTMLElement>(".ui-content-header");
    return {
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      contentHeaderClientWidth: contentHeader?.clientWidth ?? 0,
      contentHeaderScrollWidth: contentHeader?.scrollWidth ?? 0,
    };
  });

  expect(
    layout.documentWidth,
    `${routeName}: document overflows horizontally after scaling`,
  ).toBeLessThanOrEqual(layout.viewportWidth + 1);
  expect(
    layout.bodyWidth,
    `${routeName}: body overflows horizontally after scaling`,
  ).toBeLessThanOrEqual(layout.viewportWidth + 1);
  expect(
    layout.contentHeaderScrollWidth,
    `${routeName}: content-header controls are clipped after scaling`,
  ).toBeLessThanOrEqual(layout.contentHeaderClientWidth + 1);
}

test.describe("browser zoom and reflow", { tag: "@zoom-matrix" }, () => {
  test("emulates browser zoom with a scaled CSS viewport", async ({
    rootinePage: page,
  }, testInfo) => {
    const profile = zoomMetadata(testInfo);
    await openRootineRoute(page, "/dzisiaj");

    expect(page.viewportSize()).toEqual({
      width: profile.effectiveWidth,
      height: profile.effectiveHeight,
    });
    expect(profile.effectiveWidth * profile.scale).toBe(profile.physicalWidth);
    expect(profile.effectiveHeight * profile.scale).toBe(profile.physicalHeight);

    const devicePixelRatio = await page.evaluate(() => window.devicePixelRatio);
    expect(devicePixelRatio).toBeCloseTo(profile.scale, 2);
  });

  test("core modules reflow without global overflow or duplicate landmarks", async ({
    rootinePage: page,
  }, testInfo) => {
    const profile = zoomMetadata(testInfo);

    for (const route of REFLOW_ROUTES) {
      await test.step(`${route.name} at ${profile.zoomPercent}%`, async () => {
        await openRootineRoute(page, route.path);
        await expect(page.locator("#primary-workspace main:visible")).toHaveCount(1);
        await expect(page.locator("#primary-workspace .ui-content-header:visible")).toHaveCount(1);
        await expect(page.locator(".ui-page-shell")).toBeVisible();
        await expectReflowAtCurrentScale(page, route.name);
      });
    }
  });

  test("keyboard focus remains visible while traversing the scaled workspace", async ({
    rootinePage: page,
  }) => {
    await openRootineRoute(page, "/dzisiaj");

    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
      window.scrollTo(0, 0);
    });
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Przejdź do treści" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#primary-workspace")).toBeFocused();

    for (let index = 0; index < 8; index += 1) {
      await page.keyboard.press("Tab");
      const focus = await page.evaluate(() => {
        const element = document.activeElement as HTMLElement | null;
        const rectangle = element?.getBoundingClientRect();
        return {
          tagName: element?.tagName ?? "",
          width: rectangle?.width ?? 0,
          height: rectangle?.height ?? 0,
          top: rectangle?.top ?? 0,
          bottom: rectangle?.bottom ?? 0,
          left: rectangle?.left ?? 0,
          right: rectangle?.right ?? 0,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
        };
      });

      expect(focus.tagName, `Tab stop ${index + 1} must be an element`).not.toBe("BODY");
      expect(focus.width, `Tab stop ${index + 1} must have a rendered width`).toBeGreaterThan(0);
      expect(focus.height, `Tab stop ${index + 1} must have a rendered height`).toBeGreaterThan(0);
      expect(focus.right, `Tab stop ${index + 1} exceeds the right viewport edge`)
        .toBeLessThanOrEqual(focus.viewportWidth + 1);
      expect(focus.left, `Tab stop ${index + 1} exceeds the left viewport edge`)
        .toBeGreaterThanOrEqual(-1);
      expect(focus.bottom, `Tab stop ${index + 1} exceeds the bottom viewport edge`)
        .toBeLessThanOrEqual(focus.viewportHeight + 1);
      expect(focus.top, `Tab stop ${index + 1} exceeds the top viewport edge`)
        .toBeGreaterThanOrEqual(-1);
    }
  });
});
