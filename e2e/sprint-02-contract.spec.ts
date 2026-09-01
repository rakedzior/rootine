import { expect, openRootineRoute, test } from "./fixtures";

const TASK_STORAGE_KEY = "rootine.task-workspace.v1";

async function storedTask(page: Parameters<typeof openRootineRoute>[0], title: string) {
  return page.evaluate(async ({ key, taskTitle }) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("rootine-workspaces");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const record = await new Promise<{ raw?: string } | null>((resolve, reject) => {
      const request = database.transaction("workspaces", "readonly").objectStore("workspaces").get(key);
      request.onsuccess = () => resolve((request.result as { raw?: string } | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
    database.close();
    const workspace = record?.raw ? JSON.parse(record.raw) : null;
    return workspace?.tasks?.find((task: { text?: string }) => task.text === taskTitle) ?? null;
  }, { key: TASK_STORAGE_KEY, taskTitle: title });
}

test.describe("Sprint 02 daily task journey", { tag: "@mobile" }, () => {
  test("keeps the named Today action and first reading above mobile navigation", async ({
    rootinePage: page,
  }) => {
    const phones = [
      { width: 320, height: 568 },
      { width: 390, height: 844 },
      { width: 430, height: 932 },
      { width: 568, height: 320 },
      { width: 844, height: 390 },
    ];

    for (const viewport of phones) {
      await page.setViewportSize(viewport);
      await openRootineRoute(page, "/dzisiaj?konto=testowe");
      const action = page.locator("button.today-primary-action");
      const visualLabel = action.locator(".header-action-label");
      await expect(action).toBeVisible();
      await expect(visualLabel).toHaveText("Dodaj zadanie");
      const geometry = await action.evaluate((element) => {
        const actionRect = element.getBoundingClientRect();
        const label = element.querySelector(".header-action-label");
        const labelRect = label?.getBoundingClientRect();
        const labelStyle = label ? getComputedStyle(label) : null;
        return {
          action: { width: actionRect.width, height: actionRect.height },
          label: labelRect ? { width: labelRect.width, height: labelRect.height } : null,
          labelClipped: labelStyle?.clipPath !== "none" || labelStyle?.position === "absolute",
        };
      });
      expect(geometry.action.width).toBeGreaterThanOrEqual(48);
      expect(geometry.action.height).toBeGreaterThanOrEqual(48);
      expect(geometry.label?.width).toBeGreaterThan(1);
      expect(geometry.label?.height).toBeGreaterThan(1);
      expect(geometry.labelClipped).toBe(false);
    }

    await page.setViewportSize({ width: 568, height: 320 });
    await openRootineRoute(page, "/dzisiaj?konto=testowe");
    const nav = page.locator(".app-mobile-nav");
    const navRect = await nav.boundingBox();
    expect(navRect).not.toBeNull();
    for (const locator of [
      page.locator("#today-now-title"),
      page.locator(".today-day-balance__completed-value"),
      page.getByRole("progressbar", { name: "Postęp planu dnia" }),
      page.locator("#today-day-balance-queue-title"),
      page.locator(".today-day-balance__queue-list a, .today-day-balance__queue-empty").first(),
    ]) {
      await expect(locator).toBeVisible();
      const rect = await locator.boundingBox();
      expect(rect).not.toBeNull();
      expect((rect?.y ?? Number.POSITIVE_INFINITY) + (rect?.height ?? 0)).toBeLessThanOrEqual((navRect?.y ?? 0) - 2);
    }
  });

  test("creates one local record from Today and keeps its detail reachable in Tasks and Calendar", async ({
    rootinePage: page,
  }) => {
    const taskTitle = "S02 — przegląd planu";
    await page.setViewportSize({ width: 390, height: 844 });
    await openRootineRoute(page, "/dzisiaj");

    await page.getByRole("button", { name: "Dodaj zadanie do dzisiejszego planu" }).click();
    const composer = page.getByRole("textbox", { name: "Nazwa nowego zadania" });
    await expect(composer).toBeFocused();
    await composer.fill(taskTitle);
    await composer.press("Enter");

    const taskOpener = page.getByRole("button", { name: `Otwórz szczegóły zadania: ${taskTitle}` });
    await expect(taskOpener).toBeVisible();
    await expect.poll(() => storedTask(page, taskTitle)).toMatchObject({ text: taskTitle, calendarDate: "2026-08-05" });
    const persisted = await storedTask(page, taskTitle);
    expect(persisted?.id).toEqual(expect.any(Number));

    await taskOpener.focus();
    await taskOpener.click();
    const taskDetail = page.getByRole("dialog", { name: "Szczegóły zadania" });
    await expect(taskDetail).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(taskDetail).toHaveCount(0);
    await expect(taskOpener).toBeFocused();

    await openRootineRoute(page, "/kalendarz");
    const calendarOpener = page.getByRole("button", { name: `Otwórz szczegóły: ${taskTitle}` });
    await expect(calendarOpener).toBeVisible();
    await calendarOpener.click();
    await expect(page.getByRole("dialog", { name: "Szczegóły zadania" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Szczegóły zadania" })).toHaveCount(0);
    await openRootineRoute(page, "/dzisiaj");
    const todayOpener = page.getByRole("link", { name: `Otwórz zadanie: ${taskTitle}` });
    await expect(todayOpener).toBeVisible();
    const target = await todayOpener.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    expect(target.width).toBeGreaterThanOrEqual(44);
    expect(target.height).toBeGreaterThanOrEqual(44);
    await todayOpener.click();
    await expect(page.getByRole("dialog", { name: "Szczegóły zadania" })).toBeVisible();
  });

  test("keeps a task deep link through a clean IndexedDB hydration on repeated route entries", async ({
    rootinePage: page,
  }) => {
    const taskTitle = "S02 — deeplink po hydracji";
    await page.setViewportSize({ width: 390, height: 844 });
    await openRootineRoute(page, "/zadania?widok=wszystkie");
    const composer = page.getByRole("textbox", { name: "Nazwa nowego zadania" });
    await composer.fill(taskTitle);
    await composer.press("Enter");
    const opener = page.getByRole("button", { name: `Otwórz szczegóły zadania: ${taskTitle}` });
    await expect(opener).toBeVisible();
    await expect.poll(() => storedTask(page, taskTitle)).toMatchObject({ text: taskTitle });
    const task = await storedTask(page, taskTitle);
    expect(task?.id).toEqual(expect.any(Number));
    await page.evaluate(() => window.localStorage.removeItem("rootine.today-recent-task.v1"));

    for (let entry = 0; entry < 3; entry += 1) {
      await page.goto(`/zadania?widok=wszystkie&zadanie=${task?.id}`, { waitUntil: "domcontentloaded" });
      await expect(page.locator(".ui-page-shell:visible")).toBeVisible();
      await expect(page.getByRole("dialog", { name: "Szczegóły zadania" })).toBeVisible();
      await expect(page.getByText("Nie znaleziono wskazanego zadania", { exact: false })).toHaveCount(0);
      await page.keyboard.press("Escape");
    }
  });

  test("keeps mobile filters and the calendar schedule editor in managed layers", async ({
    rootinePage: page,
  }) => {
    for (const viewport of [{ width: 320, height: 568 }, { width: 568, height: 320 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport);
      await openRootineRoute(page, "/zadania?widok=wszystkie");
      const filters = page.getByRole("button", { name: "Filtry" });
      await expect(filters).toBeVisible();
      const filterRect = await filters.evaluate((element) => element.getBoundingClientRect().toJSON());
      expect(filterRect.width).toBeGreaterThanOrEqual(44);
      expect(filterRect.height).toBeGreaterThanOrEqual(44);
      await filters.click();
      await expect(page.getByRole("dialog", { name: "Filtry zadań" })).toBeVisible();
      await expect(page.getByRole("searchbox", { name: "Szukaj zadań" })).toBeVisible();
      await expect(page.getByRole("group", { name: "Filtr tagu" })).toBeVisible();
      await expect(page.getByRole("group", { name: "Filtr priorytetu" })).toBeVisible();
      await page.keyboard.press("Escape");
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await openRootineRoute(page, "/kalendarz");
    const eventOpener = page.locator(".calendar-module-main .ui-content-header__actions").getByRole("button", { name: "Dodaj zadanie" });
    await expect(eventOpener).toBeVisible();
    await eventOpener.focus();
    await eventOpener.click();
    const detail = page.getByRole("dialog", { name: "Szczegóły zadania" });
    await expect(detail).toHaveAttribute("aria-modal", "true");
    await detail.getByRole("button", { name: "Zmień termin zadania" }).click();
    const picker = page.getByRole("dialog", { name: "Ustaw termin zadania" });
    await expect(picker).toHaveAttribute("aria-modal", "true");
    await expect(page.locator(".app-mobile-nav")).toHaveCSS("visibility", "hidden");
    await page.keyboard.press("Escape");
    await expect(picker).toHaveCount(0);
    await expect(detail).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(detail).toHaveCount(0);
    await expect(eventOpener).toBeFocused();
  });
});
