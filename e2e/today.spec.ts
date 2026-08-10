import { test, expect, openRootineRoute } from "./fixtures";

test.describe("Today dashboard", { tag: "@shared" }, () => {
  test("keeps the preferred module order and reports active areas", async ({
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
      "Sprawy",
      "Notatki",
    ]);
    await expect(page.getByText("6 obszarów wymaga uwagi", { exact: true })).toBeVisible();
    await expect(page.getByText("Część danych przykładowa", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Do wykonania", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Plan dnia", { exact: true })).toBeVisible();
    await expect(page.locator(".today-day-balance__progress")).toHaveAttribute("role", "progressbar");
    await expect(page.locator(".today-module-row__overdue").first()).toBeVisible();
  });

  test("keeps one contextual area ring without redundant progress rings", async ({
    rootinePage: page,
  }) => {
    await openRootineRoute(page, "/dzisiaj");

    const livingDay = page.locator(".living-day--foreground");
    const areaSegments = livingDay.locator(".living-day__area");
    const moduleCount = await page.locator(".today-module-row").count();

    await expect(livingDay).toBeVisible();
    await expect(livingDay.locator(".living-day__outer-track")).toHaveCount(0);
    await expect(livingDay.locator(".living-day__plan-track")).toHaveCount(0);
    await expect(areaSegments).toHaveCount(moduleCount);
    await expect(livingDay.locator(".living-day__context")).toHaveText("Wszystkie obszary");

    const taskArea = livingDay.locator('.living-day__area[data-area="tasks"]');
    const taskLabel = await taskArea.getAttribute("aria-label");
    const taskBreakdown = taskLabel?.match(
      /na dziś: (\d+) · zaległe: (\d+) · wykonane: (\d+) z (\d+)/,
    );
    expect(taskBreakdown).not.toBeNull();
    const [, remainingToday, overdue, completedToday, plannedToday] = taskBreakdown!;

    if (page.viewportSize()!.width > 760) {
      await taskArea.locator(".living-day__area-signal").hover();
    } else {
      await taskArea.focus();
    }
    await expect(livingDay.locator(".living-day__context")).toHaveText("Zadania");
    await expect(taskArea).toHaveAttribute("data-expanded", "true");
    const expandedTaskLength = await taskArea.locator(".living-day__area-track").evaluate(
      (element) => (element as SVGGeometryElement).getTotalLength(),
    );
    expect(Math.abs(expandedTaskLength - 2 * Math.PI * 116)).toBeLessThan(1);
    await expect(taskArea.locator(".living-day__area-track")).toHaveJSProperty(
      "tagName",
      "circle",
    );
    await expect(livingDay.locator('.living-day__area[data-area="habits"]')).toHaveCSS(
      "opacity",
      "0",
    );
    await expect(livingDay.locator('.living-day__area[data-area="habits"]')).toHaveCSS(
      "pointer-events",
      "none",
    );
    await expect(livingDay.locator(".living-day__metric-value")).toHaveText([
      remainingToday,
      overdue,
    ]);
    await expect(livingDay.locator(".living-day__metric-label")).toHaveText([
      "na dziś",
      "zaległe",
    ]);
    await expect(livingDay.locator(".living-day__detail")).toHaveText(
      Number(plannedToday) > 0
        ? `${completedToday} z ${plannedToday} wykonane`
        : "brak planu na dziś",
    );
    await expect(taskArea.locator(".living-day__area-slice--done")).toHaveCount(
      Number(completedToday) > 0 ? 1 : 0,
    );
    await expect(taskArea.locator(".living-day__area-slice--today")).toHaveCount(
      Number(remainingToday) > 0 ? 1 : 0,
    );
    await expect(taskArea.locator(".living-day__area-slice--overdue")).toHaveCount(
      Number(overdue) > 0 ? 1 : 0,
    );

    await livingDay.locator('.living-day__area[data-area="habits"]').focus();
    await expect(livingDay.locator(".living-day__context")).toHaveText("Nawyki");
    await expect(livingDay.locator('.living-day__area[data-area="habits"]')).toHaveAttribute(
      "data-expanded",
      "true",
    );

    await expect(page.locator(".today-day-balance__overdue-summary")).toHaveCount(0);
    await expect(page.locator(".today-day-balance__attention-eyebrow")).toHaveText("Zaległości");
    await expect(page.locator(".today-day-balance__attention-head strong")).toHaveText(/^\d+ zaległych$/);

    await page.locator(".today-day-balance__attention-action").click();
    await expect(page.locator('.today-module-row[data-area-id="tasks"]')).toBeFocused();
    await expect(livingDay.locator(".living-day__context")).toHaveText("Zadania");
  });

  test("keeps completed modules flat without hiding their state", async ({
    rootinePage: page,
  }) => {
    await openRootineRoute(page, "/dzisiaj");

    const colors = await page.locator(".today-module-row").first().evaluate((row) => {
      row.style.transition = "none";
      row.classList.add("is-complete");
      const tokenProbe = document.createElement("span");
      tokenProbe.style.color = "var(--color-text-tertiary)";
      document.body.append(tokenProbe);
      const rowStyle = getComputedStyle(row);
      const titleStyle = getComputedStyle(
        row.querySelector(".today-module-row__identity > strong")!,
      );
      const tokenStyle = getComputedStyle(tokenProbe);
      const result = {
        background: rowStyle.backgroundColor,
        title: titleStyle.color,
        tertiary: tokenStyle.color,
      };
      tokenProbe.remove();
      return result;
    });

    expect(colors.background).toBe("rgba(0, 0, 0, 0)");
    expect(colors.title).toBe(colors.tertiary);
  });

  test("keeps empty modules flat while preserving their hierarchy", async ({
    rootinePage: page,
  }) => {
    await openRootineRoute(page, "/dzisiaj");

    const emptyRows = page.locator(".today-module-row.is-empty");
    await expect(emptyRows).toHaveCount(2);
    await expect(emptyRows.locator(".today-module-row__identity > strong")).toHaveText([
      "Sprawy",
      "Notatki",
    ]);

    for (const row of await emptyRows.all()) {
      const colors = await row.evaluate((element) => {
        const tokenProbe = document.createElement("span");
        tokenProbe.style.color = "var(--color-text-primary)";
        document.body.append(tokenProbe);
        const rowStyle = getComputedStyle(element);
        const titleStyle = getComputedStyle(
          element.querySelector(".today-module-row__identity > strong")!,
        );
        const tokenStyle = getComputedStyle(tokenProbe);
        const result = {
          background: rowStyle.backgroundColor,
          title: titleStyle.color,
          primary: tokenStyle.color,
        };
        tokenProbe.remove();
        return result;
      });

      expect(colors.background).toBe("rgba(0, 0, 0, 0)");
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
