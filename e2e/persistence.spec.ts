import { test, expect, openRootineRoute } from "./fixtures";

const TASK_STORAGE_KEY = "rootine.task-workspace.v1";

async function readPersistedTaskDate(page: Parameters<typeof openRootineRoute>[0], title: string) {
  return page.evaluate(async ({ key, title: taskTitle }) => {
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
    return workspace?.tasks?.find((item: { text?: string }) => item.text === taskTitle)?.calendarDate ?? null;
  }, { key: TASK_STORAGE_KEY, title });
}

test.describe("task persistence", { tag: "@desktop" }, () => {
  test("uses the active task view for the default date without opening details", async ({ rootinePage: page }) => {
    const cases = [
      ["dzis", "2026-08-05"],
      ["jutro", "2026-08-06"],
      ["7dni", "2026-08-12"],
      ["30dni", "2026-09-05"],
      ["bezterminu", null],
      ["wszystkie", "2026-08-05"],
    ] as const;

    for (const [view, expectedDate] of cases) {
      await openRootineRoute(page, view === "dzis" ? "/zadania" : `/zadania?widok=${view}`);
      const taskTitle = `E2E domyślna data — ${view}`;
      await page.getByRole("textbox", { name: "Nazwa nowego zadania" }).fill(taskTitle);
      await page.getByRole("textbox", { name: "Nazwa nowego zadania" }).press("Enter");

      await expect(page.getByRole("complementary", { name: "Szczegóły zadania" })).toHaveCount(0);
      await expect.poll(() => readPersistedTaskDate(page, taskTitle)).toBe(expectedDate);
    }
  });

  test("a newly created task survives a page reload", async ({ rootinePage: page }) => {
    await openRootineRoute(page, "/zadania");
    await page.evaluate((key) => {
      window.addEventListener("rootine:workspace-change", (event) => {
        const detail = (event as CustomEvent<{ key?: string; origin?: string }>).detail;
        if (
          detail?.key === key
          && !detail.origin?.endsWith("-hydrate")
          && document.documentElement.dataset.e2ePersistenceArmed === "true"
        ) {
          document.documentElement.dataset.e2eTaskPersisted = "true";
        }
      });
    }, TASK_STORAGE_KEY);

    const taskTitle = "E2E — sprawdzić trwałość zadania";
    const taskInput = page.getByRole("textbox", { name: "Nazwa nowego zadania" });
    await taskInput.fill(taskTitle);
    await page.locator("html").evaluate((element) => {
      element.dataset.e2ePersistenceArmed = "true";
    });
    await taskInput.press("Enter");

    const taskButton = page.getByRole("button", {
      name: `Otwórz szczegóły zadania: ${taskTitle}`,
    });
    await expect(taskButton).toBeVisible();

    await expect
      .poll(() => page.locator("html").getAttribute("data-e2e-task-persisted"))
      .toBe("true");

    await page.reload();
    await expect(page.locator(".ui-content-header__title")).toBeVisible();
    await expect(taskButton).toBeVisible();
  });
});
