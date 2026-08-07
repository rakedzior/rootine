import AxeBuilder from "@axe-core/playwright";
import { expect, openRootineRoute, test } from "./fixtures";

test("@shared statusy Pracy są osobnymi spokojnymi sekcjami, a ukończone startują zwinięte", async ({ rootinePage: page }) => {
    await openRootineRoute(page, "/praca");

    const board = page.locator(".work-task-board");
    await expect(board).toBeVisible();

    for (const label of ["Po terminie", "Dzisiaj", "Ukończone"]) {
      const section = page.getByRole("region", { name: label });
      await expect(section).toBeVisible();
      await expect(section).toHaveClass(/ui-section-surface/);
      await expect(section.locator(".work-task-section__marker")).toBeVisible();
      await expect(section.locator(".work-task-section__count")).toBeVisible();
    }

    const surfaceStyle = await page.getByRole("region", { name: "Po terminie" }).evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        background: style.backgroundColor,
        borderTopWidth: style.borderTopWidth,
        radius: style.borderRadius,
      };
    });
    expect(surfaceStyle.background).toBe("rgba(0, 0, 0, 0)");
    expect(surfaceStyle.borderTopWidth).toBe("0px");
    expect(Number.parseFloat(surfaceStyle.radius)).toBe(0);

    const completed = page.getByRole("region", { name: "Ukończone" });
    const completedToggle = completed.getByRole("button", { name: /Rozwiń/ });
    await expect(completedToggle).toHaveAttribute("aria-expanded", "false");
    await expect(completed.locator(".work-task-list")).toHaveCount(0);

    await completedToggle.click();
    await expect(completed.getByRole("button", { name: /Zwiń/ })).toHaveAttribute("aria-expanded", "true");
    await expect(completed.locator(".work-task-list")).toBeVisible();

    const mobileNavigation = page.getByRole("combobox", { name: "Wybierz widok pracy" });
    if (await mobileNavigation.isVisible()) {
      await mobileNavigation.click();
      await page.getByRole("option", { name: "Bez terminu", exact: true }).click();
    } else {
      await page.locator(".work-context-sidebar").getByRole("button", { name: /^Bez terminu/ }).click();
    }
    await expect(page).toHaveURL(/\/praca\?widok=bezterminu$/);
    const untimed = page.getByRole("region", { name: "Bez terminu" });
    await expect(untimed).toBeVisible();
    await expect(untimed.locator(".work-task-section__count")).toBeVisible();
});

test("@shared Praca nie wprowadza naruszeń WCAG A/AA", async ({ rootinePage: page }) => {
  await openRootineRoute(page, "/praca");

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"])
    .analyze();

  expect(results.violations.map((violation) => ({
    id: violation.id,
    targets: violation.nodes.map((node) => node.target),
  }))).toEqual([]);
});

test("@desktop nazwa projektu otwiera zakres, a chevron rozwija kompaktowy podgląd zadań", async ({ rootinePage: page }) => {
    await openRootineRoute(page, "/praca");

    await page.locator(".work-context-sidebar").getByRole("button", { name: /Studio North/ }).click();
    const projectList = page.locator(".work-project-list--company");
    await expect(projectList).toBeVisible();

    const search = page.getByPlaceholder("Szukaj projektów");
    await search.fill("Kampania startowa");
    await expect(projectList.locator(".work-project-record")).toHaveCount(1);
    await expect(projectList.getByRole("button", { name: "Otwórz projekt „Kampania startowa”" })).toBeVisible();
    await search.fill("");

    const projectRecord = projectList.locator(".work-project-record").filter({ hasText: "Nowa strona" });
    const expand = projectRecord.getByRole("button", { name: "Rozwiń podgląd zadań projektu „Nowa strona”" });
    const companyUrl = page.url();
    await expand.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(companyUrl);

    const preview = projectRecord.locator(".work-project-record__preview");
    await expect(preview).toBeVisible();
    await expect(preview.locator(".work-project-record__preview-task")).toHaveCount(0);

    const compactRows = preview.locator(".work-task-row--compact");
    await expect(compactRows.first()).toBeVisible();
    await expect(compactRows.first().locator(".work-task-check")).toBeVisible();
    await expect(compactRows.first().locator(".work-task-priority")).toBeVisible();
    await expect(compactRows.first().locator(".work-task-inline-date")).toBeVisible();
    await expect(compactRows.first().getByRole("button", { name: /Otwórz szczegóły zadania/ })).toBeVisible();

    const openProject = projectRecord.getByRole("button", { name: "Otwórz projekt „Nowa strona”" });
    await openProject.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".work-screen--project")).toBeVisible();
});
