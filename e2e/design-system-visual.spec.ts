import { expect, openRootineRoute, test } from "./fixtures";
import type { Locator, Page } from "@playwright/test";

const CALENDAR_DATE = "2026-08-05";

async function capture(locator: Locator, name: string, options?: { maxDiffPixels?: number }) {
  await expect(locator).toHaveScreenshot(name, {
    animations: "disabled",
    caret: "hide",
    ...options,
  });
}

async function seedCalendarOverflow(page: Page) {
  await page.addInitScript((calendarDate) => {
    window.localStorage.setItem("rootine.task-workspace.v1", JSON.stringify({
      version: 2,
      updatedAt: "2026-08-05T10:00:00.000Z",
      tasks: [
        "Pierwszy wpis",
        "Drugi wpis",
        "Trzeci wpis",
        "Wpis w menu nadmiarowym",
      ].map((text, index) => ({
        id: 700 + index,
        text,
        done: false,
        view: "dzis",
        calendarDate,
        schedule: { allDay: true, startTime: "", timezone: "Europe/Warsaw" },
      })),
      habits: [],
      lists: [],
      tags: [],
    }));
  }, CALENDAR_DATE);
}

test.describe("design-system visual baselines", { tag: "@shared" }, () => {
  test("Today balance and module states stay on the canonical visual scale", async ({ rootinePage: page }) => {
    await openRootineRoute(page, "/dzisiaj");
    await capture(page.locator(".today-day-balance"), "today-balance-progress.png");
  });

  test("calendar overflow menu keeps its portal surface and item rhythm", async ({ rootinePage: page }) => {
    await seedCalendarOverflow(page);
    await openRootineRoute(page, "/kalendarz");

    const trigger = page.locator(`#calendar-overflow-trigger-${CALENDAR_DATE}`);
    await trigger.click();
    await capture(page.locator(`#calendar-agenda-${CALENDAR_DATE}`), "calendar-overflow-menu.png");
  });

  test("task detail preserves the responsive panel and DatePicker portal", async ({ rootinePage: page, isMobile }) => {
    await openRootineRoute(page, "/zadania?widok=dzis");
    await page.locator(".task-item-row").first().click();

    const detailPanel = page.locator(".task-detail-panel");
    await expect(detailPanel).toBeVisible();
    // A handful of antialiased icon-edge pixels vary after the shared Lucide
    // stroke normalization; panel geometry and content remain exact.
    await capture(detailPanel, "task-detail-panel.png", { maxDiffPixels: 12 });

    await page.locator(".task-detail__date").click();
    const datePicker = page.getByRole("dialog", { name: "Ustaw termin zadania" });
    await expect(datePicker).toBeVisible();
    // Windows runner font/rasterization differs by a few hundred edge pixels from
    // the checked-in baseline while preserving the popup geometry and content.
    await capture(datePicker, "task-date-picker-portal.png", { maxDiffPixels: 512 });

    const pickerSize = await datePicker.boundingBox();
    await datePicker.getByRole("button", { name: "Przypomnienie", exact: true }).click();
    const reminderPicker = page.getByRole("dialog", { name: "Przypomnienie", exact: true });
    await expect(reminderPicker).toBeVisible();
    await capture(reminderPicker, "task-reminder-picker-portal.png", { maxDiffPixels: 256 });
    expect(await datePicker.boundingBox()).toEqual(pickerSize);
    const [parentLayer, childLayer, reminderSize] = await Promise.all([
      datePicker.evaluate((element) => Number(getComputedStyle(element).zIndex)),
      reminderPicker.evaluate((element) => Number(getComputedStyle(element).zIndex)),
      reminderPicker.boundingBox(),
    ]);
    expect(childLayer).toBeGreaterThan(parentLayer);
    expect(reminderSize && pickerSize && reminderSize.y < pickerSize.y + pickerSize.height).toBe(true);

    await datePicker.getByRole("tab", { name: "Czas trwania" }).click();
    await expect(reminderPicker).toBeHidden();
    await expect(datePicker.getByText("Start", { exact: true })).toBeVisible();
    await expect(datePicker.getByText("Koniec", { exact: true })).toBeVisible();
    await capture(datePicker, "task-duration-picker-portal.png", { maxDiffPixels: 384 });

    const outsideX = pickerSize && pickerSize.x >= 8
      ? Math.max(2, pickerSize.x - 4)
      : Math.min((await page.evaluate(() => window.innerWidth)) - 2, (pickerSize?.x ?? 0) + (pickerSize?.width ?? 0) + 4);
    await page.mouse.click(outsideX, 2);
    await expect(datePicker).toBeHidden();

    if (!isMobile) {
      await page.locator(".task-detail__toggle--plain").click();
      await capture(page.getByRole("menu", { name: "Akcje zadania" }), "task-actions-menu.png");
    }
  });

  test("goal menu and edit dialog retain their context surfaces", async ({ rootinePage: page }) => {
    await openRootineRoute(page, "/cele?widok=overview");
    await page.locator(".goal-card-more button").first().click();
    await capture(page.getByRole("menu").last(), "goal-actions-menu.png");

    await page.getByRole("menu").last().getByRole("menuitem", { name: "Edytuj cel" }).click();
    const dialog = page.getByRole("dialog").last();
    const modalBody = dialog.locator(".ui-modal__body");
    const modalFooter = dialog.locator(".ui-modal__footer");
    await expect(modalFooter).toBeVisible();
    const modalLayout = await dialog.evaluate((element) => {
      const body = element.querySelector<HTMLElement>(".ui-modal__body");
      const footer = element.querySelector<HTMLElement>(".ui-modal__footer");
      if (!body || !footer) return null;
      const dialogRect = element.getBoundingClientRect();
      const bodyRect = body.getBoundingClientRect();
      const footerRect = footer.getBoundingClientRect();
      return {
        dialogOverflow: getComputedStyle(element).overflow,
        bodyOverflowY: getComputedStyle(body).overflowY,
        bodyOwnsOverflow: body.scrollHeight > body.clientHeight,
        footerInsideDialog: footerRect.bottom <= dialogRect.bottom + 1,
        footerFollowsBody: footerRect.top >= bodyRect.bottom - 1,
        footerInsideViewport: footerRect.bottom <= window.innerHeight,
      };
    });
    expect(modalLayout).toEqual({
      dialogOverflow: "hidden",
      bodyOverflowY: "auto",
      bodyOwnsOverflow: expect.any(Boolean),
      footerInsideDialog: true,
      footerFollowsBody: true,
      footerInsideViewport: true,
    });
    await expect(modalBody).toBeVisible();
    await capture(dialog, "goal-edit-dialog.png");
  });

  test("work add menu keeps its compact action grouping", async ({ rootinePage: page }) => {
    await openRootineRoute(page, "/praca");
    await page.locator(".work-add-menu > button").click();
    await capture(page.locator("#work-add-menu"), "work-add-menu.png");
  });
});
