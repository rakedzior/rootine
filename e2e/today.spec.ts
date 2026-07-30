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
    ]);
    await expect(page.getByText("4 aktywne obszary", { exact: true })).toBeVisible();
    await expect(page.getByText("Część danych przykładowa", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Do wykonania", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Plan dnia", { exact: true })).toBeVisible();
    await expect(page.locator(".today-day-balance__progress")).toHaveAttribute("role", "progressbar");
    await expect(page.locator(".today-module-row__overdue").first()).toBeVisible();
  });

  test("renders a completed module against the canvas without hiding its state", async ({
    rootinePage: page,
  }) => {
    await openRootineRoute(page, "/dzisiaj");

    const colors = await page.locator(".today-module-row").first().evaluate((row) => {
      row.style.transition = "none";
      row.classList.add("is-complete");
      const root = getComputedStyle(document.documentElement);
      const rowStyle = getComputedStyle(row);
      const titleStyle = getComputedStyle(
        row.querySelector(".today-module-row__identity > strong")!,
      );
      return {
        background: rowStyle.backgroundColor,
        canvas: root.getPropertyValue("--color-graphite-canvas").trim(),
        title: titleStyle.color,
        muted: root.getPropertyValue("--color-text-muted").trim(),
      };
    });

    expect(colors.background).toBe("rgb(36, 36, 36)");
    expect(colors.canvas).toBe("#242424");
    expect(colors.title).toBe("rgb(150, 150, 150)");
    expect(colors.muted).toBe("#969696");
  });

  test("dims modules with nothing planned for today", async ({
    rootinePage: page,
  }) => {
    await openRootineRoute(page, "/dzisiaj");

    const emptyRows = page.locator(".today-module-row.is-empty");
    await expect(emptyRows).toHaveCount(2);
    await expect(emptyRows.locator(".today-module-row__identity > strong")).toHaveText([
      "Sport",
      "Sprawy",
    ]);

    for (const row of await emptyRows.all()) {
      await expect(row.locator(".today-module-row__track")).toHaveAttribute("aria-valuenow", "100");
      const colors = await row.evaluate((element) => {
        const root = getComputedStyle(document.documentElement);
        const rowStyle = getComputedStyle(element);
        const titleStyle = getComputedStyle(
          element.querySelector(".today-module-row__identity > strong")!,
        );
        return {
          background: rowStyle.backgroundColor,
          canvas: root.getPropertyValue("--color-graphite-canvas").trim(),
          title: titleStyle.color,
          muted: root.getPropertyValue("--color-text-muted").trim(),
        };
      });

      expect(colors.background).toBe("rgb(36, 36, 36)");
      expect(colors.canvas).toBe("#242424");
      expect(colors.title).toBe("rgb(150, 150, 150)");
      expect(colors.muted).toBe("#969696");
    }
  });
});
