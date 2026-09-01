import { test, expect, openRootineRoute } from "./fixtures";

test.describe("Today dashboard", { tag: "@shared" }, () => {
  test("gives mobile a single next action and a stable daily reading order", async ({
    rootinePage: page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openRootineRoute(page, "/dzisiaj");

    await expect(page.getByRole("heading", { level: 1, name: "Plan dnia" })).toHaveCount(1);
    await expect(page.locator(".today-day-balance h2")).toHaveText([
      "Teraz",
      "Następne w kolejce",
      "Zaległości",
    ]);
    await expect(page.locator(".today-day-balance__balance strong")).toHaveText("Bilans");

    const primaryAction = page.getByRole("button", { name: "Dodaj zadanie do dzisiejszego planu" });
    await expect(primaryAction).toBeVisible();
    await primaryAction.click();
    await expect(page).toHaveURL(/\/zadania$/);
    await expect(page.getByRole("textbox", { name: "Nazwa nowego zadania" })).toBeFocused();
  });

  test("keeps the preferred module order and reports overdue areas", async ({
    rootinePage: page,
  }) => {
    await openRootineRoute(page, "/dzisiaj");

    await expect(page.locator(".today-module-row__identity > strong")).toHaveText([
      "Zadania",
      "Nawyki",
      "Odżywianie",
      "Sport",
      "Praca",
      "Cele",
      "Pozostałe",
      "Notatki",
    ]);
    await expect(page.locator(".today-day-balance__attention-footer")).toContainText("w 2 obszarach");
    await expect(page.getByText("Część danych przykładowa", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Do wykonania", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Plan dnia", { exact: true })).toBeVisible();
    await expect(page.locator(".today-day-balance__progress")).toHaveAttribute("role", "progressbar");
    await expect(page.locator(".today-module-row__overdue").first()).toBeVisible();
  });

  test("keeps one overdue donut with contextual module telemetry", async ({
    rootinePage: page,
  }) => {
    await openRootineRoute(page, "/dzisiaj");

    const donut = page.locator(".today-day-balance__donut");
    const taskTelemetry = page.locator(
      '.today-module-row[data-area-id="tasks"] .telemetry-bar',
    );

    await expect(donut).toBeVisible();
    await expect(donut).toHaveAttribute("role", "img");
    await expect(donut).toHaveAttribute("aria-label", /^\d+% zaległości$/);
    await expect(donut.locator("circle")).toHaveCount(2);
    await expect(page.locator(".living-day--foreground")).toHaveCount(0);
    await expect(taskTelemetry.locator(".telemetry-bar__track")).toHaveAttribute("role", "group");
    await expect(taskTelemetry.locator('[role="progressbar"]')).toHaveCount(3);

    await expect(page.locator(".today-day-balance__overdue-summary")).toHaveCount(0);
    await expect(page.locator("#today-day-balance-attention-title")).toHaveText("Zaległości");
    await expect(page.locator(".today-day-balance__attention-count")).toHaveText(/^\d+ elementów$/);
  });

  test("keeps completed modules legible without hiding their state", async ({
    rootinePage: page,
  }) => {
    await openRootineRoute(page, "/dzisiaj");

    const colors = await page.locator(".today-module-row").first().evaluate((row) => {
      row.style.transition = "none";
      row.classList.add("is-complete");
      const tokenProbe = document.createElement("span");
      tokenProbe.style.color = "var(--color-text-primary)";
      tokenProbe.style.backgroundColor = "var(--color-surface-1)";
      document.body.append(tokenProbe);
      const rowStyle = getComputedStyle(row);
      const titleStyle = getComputedStyle(
        row.querySelector(".today-module-row__identity > strong")!,
      );
      const tokenStyle = getComputedStyle(tokenProbe);
      const result = {
        background: rowStyle.backgroundColor,
        title: titleStyle.color,
        surface: tokenStyle.backgroundColor,
        primary: tokenStyle.color,
      };
      tokenProbe.remove();
      return result;
    });

    expect(colors.background).toBe(colors.surface);
    expect(colors.title).toBe(colors.primary);
  });

  test("keeps empty modules grouped while preserving their hierarchy", async ({
    rootinePage: page,
  }) => {
    await openRootineRoute(page, "/dzisiaj");

    const emptyRows = page.locator(".today-module-row.is-empty");
    await expect(emptyRows).toHaveCount(2);
    await expect(emptyRows.locator(".today-module-row__identity > strong")).toHaveText([
      "Pozostałe",
      "Notatki",
    ]);

    for (const row of await emptyRows.all()) {
      const colors = await row.evaluate((element) => {
        const tokenProbe = document.createElement("span");
        tokenProbe.style.color = "var(--color-text-primary)";
        tokenProbe.style.backgroundColor = "var(--color-surface-1)";
        document.body.append(tokenProbe);
        const rowStyle = getComputedStyle(element);
        const titleStyle = getComputedStyle(
          element.querySelector(".today-module-row__identity > strong")!,
        );
        const tokenStyle = getComputedStyle(tokenProbe);
        const result = {
          background: rowStyle.backgroundColor,
          title: titleStyle.color,
          surface: tokenStyle.backgroundColor,
          primary: tokenStyle.color,
        };
        tokenProbe.remove();
        return result;
      });

      expect(colors.background).toBe(colors.surface);
      expect(colors.title).toBe(colors.primary);
    }
  });
});

test.describe("Today desktop density", { tag: "@desktop" }, () => {
  test("fits the complete daily register in the desktop viewport", async ({
    rootinePage: page,
  }) => {
    await openRootineRoute(page, "/dzisiaj");

    const dimensions = await page.locator(".today-scroll").evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));

    expect(dimensions.scrollHeight).toBeLessThanOrEqual(dimensions.clientHeight + 1);
  });
});
