import { test, expect, openRoutineRoute } from "./fixtures";

const TASK_STORAGE_KEY = "rootine.task-workspace.v1";

test.describe("task persistence", { tag: "@desktop" }, () => {
  test("a newly created task survives a page reload", async ({ routinePage: page }) => {
    await openRoutineRoute(page, "/zadania");

    const taskTitle = "E2E — sprawdzić trwałość zadania";
    const taskInput = page.getByRole("textbox", { name: "Nazwa nowego zadania" });
    await taskInput.fill(taskTitle);
    await taskInput.press("Enter");

    const taskButton = page.getByRole("button", {
      name: `Otwórz szczegóły zadania: ${taskTitle}`,
    });
    await expect(taskButton).toBeVisible();

    await expect
      .poll(async () => page.evaluate(
        ({ key, title }) => {
          const stored = window.localStorage.getItem(key);
          if (!stored) return false;
          const workspace = JSON.parse(stored) as {
            tasks?: Array<{ text?: string; done?: boolean; deleted?: boolean }>;
          };
          return Boolean(
            workspace.tasks?.some(
              (task) => task.text === title && task.done === false && task.deleted !== true,
            ),
          );
        },
        { key: TASK_STORAGE_KEY, title: taskTitle },
      ))
      .toBe(true);

    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Zadania" })).toBeVisible();
    await expect(taskButton).toBeVisible();
  });
});
