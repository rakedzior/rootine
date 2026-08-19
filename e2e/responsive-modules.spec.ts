import { expect, openRootineRoute, test } from "./fixtures";

const MODULE_ROUTES = [
  "/dzisiaj?konto=testowe",
  "/sport?konto=testowe",
  "/praca?konto=testowe",
  "/cele?konto=testowe",
  "/podroze?konto=testowe",
  "/notatki?konto=testowe",
  "/sprawy?konto=testowe",
] as const;

async function settleResponsiveLayout(page: Parameters<typeof openRootineRoute>[0]) {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

async function expectViewportContained(page: Parameters<typeof openRootineRoute>[0]) {
  const geometry = await page.evaluate(() => {
    const main = document.querySelector<HTMLElement>(".ui-module-main");
    if (!main) throw new Error("Missing module main");
    const bounds = main.getBoundingClientRect();
    return {
      documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      left: bounds.left,
      right: bounds.right,
      viewport: document.documentElement.clientWidth,
    };
  });

  expect(geometry.documentOverflow).toBe(false);
  expect(geometry.left).toBeGreaterThanOrEqual(-1);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewport + 1);
}

test("primary modules stay contained from wide desktop to narrow phone @desktop", async ({ rootinePage: page }) => {
  test.setTimeout(150_000);

  for (const width of [2560, 1440, 1024, 760, 390, 320]) {
    await test.step(`${width}px`, async () => {
      await page.setViewportSize({ width, height: width <= 760 ? 844 : 900 });
      for (const route of MODULE_ROUTES) {
        await openRootineRoute(page, route);
        await settleResponsiveLayout(page);
        await expectViewportContained(page);
      }
    });
  }
});

test("responsive priority steps preserve the primary controls @desktop", async ({ rootinePage: page }) => {
  test.setTimeout(90_000);

  await page.setViewportSize({ width: 1024, height: 900 });
  await openRootineRoute(page, "/praca?konto=testowe");
  await settleResponsiveLayout(page);
  const laptopTask = page.locator(".work-task-row--with-context").first();
  const laptopCopy = laptopTask.locator(".ui-list-row__copy");
  const laptopStatus = laptopTask.locator(".work-task-status");
  expect((await laptopCopy.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(150);
  const [mainBox, statusBox] = await Promise.all([
    page.locator(".ui-module-main").boundingBox(),
    laptopStatus.boundingBox(),
  ]);
  expect(mainBox).not.toBeNull();
  expect(statusBox).not.toBeNull();
  expect(statusBox!.x + statusBox!.width).toBeLessThanOrEqual(mainBox!.x + mainBox!.width + 1);

  await page.setViewportSize({ width: 320, height: 844 });
  await openRootineRoute(page, "/praca?konto=testowe");
  await settleResponsiveLayout(page);
  expect((await page.locator(".work-task-row .ui-list-row__copy").first().boundingBox())?.width ?? 0)
    .toBeGreaterThanOrEqual(90);

  await openRootineRoute(page, "/cele?konto=testowe");
  await expect(page.locator(".goals-header-actions > .ui-button--primary")).toBeInViewport();

  await openRootineRoute(page, "/notatki?konto=testowe");
  expect((await page.locator(".notes-quick-capture__input").boundingBox())?.width ?? 0)
    .toBeGreaterThanOrEqual(160);

  await openRootineRoute(page, "/sport?widok=cycle&tydzien=1&konto=testowe");
  const planHeading = page.locator(".sport-cycle-plans-module > .sport-cycle-sidebar__heading h2");
  await expect(planHeading).toHaveText("Twoje plany");
  expect(await planHeading.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
});
