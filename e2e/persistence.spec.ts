import { test, expect, openRoutineRoute } from "./fixtures";

const TASK_STORAGE_KEY = "rootine.task-workspace.v1";

test.describe("task persistence", { tag: "@desktop" }, () => {
  test("a newly created task survives a page reload", async ({ routinePage: page }) => {
    await openRoutineRoute(page, "/zadania");
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
    await expect(page.getByRole("heading", { level: 1, name: "Zadania" })).toBeVisible();
    await expect(taskButton).toBeVisible();
  });
});
