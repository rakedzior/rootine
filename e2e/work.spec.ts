import AxeBuilder from "@axe-core/playwright";
import { expect, openRootineRoute, test } from "./fixtures";

test("@shared Praca używa spokojnych sekcji zadań i nie pokazuje ukończonych", async ({ rootinePage: page }) => {
    await openRootineRoute(page, "/praca");

    const board = page.locator(".work-task-board");
    await expect(board).toBeVisible();

    for (const label of ["Po terminie"]) {
      const section = page.getByRole("region", { name: label });
      await expect(section).toBeVisible();
      await expect(section).toHaveClass(/ui-section-surface/);
      await expect(section.locator(".work-task-section__marker")).toHaveCount(0);
      await expect(section.getByRole("button", { name: new RegExp(`sekcję ${label}`, "i") })).toBeVisible();
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

    const todaySection = page.getByRole("region", { name: "Dzisiaj" });
    await expect(todaySection).toBeVisible();
    const untimedTodayTask = todaySection.getByRole("button", { name: /Otwórz szczegóły zadania „Doprecyzować sekcję otwierającą”/ });
    await expect(untimedTodayTask).toBeVisible();
    await expect(page.getByRole("region", { name: "Po terminie" }).getByRole("button", { name: /Otwórz szczegóły zadania „Doprecyzować sekcję otwierającą”/ })).toHaveCount(0);

    await expect(page.getByRole("region", { name: "Ukończone" })).toHaveCount(0);
    await expect(page.locator(".work-task-row.is-completed")).toHaveCount(0);
    await expect(page.getByText("Nie masz zadań z terminem na dziś", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Zaplanuj zadanie", exact: true })).toHaveCount(0);
    await expect(page.getByText(/na dziś ·/)).toHaveCount(0);

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

test("@shared Praca ma podzakładki i właściwości szybkiego dodawania", async ({ rootinePage: page }) => {
  await openRootineRoute(page, "/praca");

  const quickEntry = page.getByRole("form", { name: "Szybkie dodawanie zadania do pracy" });
  await expect(quickEntry).toBeVisible();
  await expect(quickEntry.getByPlaceholder("Dodaj zadanie do „Dzisiaj”")).toBeVisible();
  for (const name of ["Firma: Bez firmy", "Projekt: Bez projektu", "Status: Do zrobienia", "Priorytet: Bez priorytetu"]) {
    await expect(quickEntry.getByRole("button", { name, exact: true })).toBeVisible();
  }
  await quickEntry.getByRole("button", { name: "Status: Do zrobienia", exact: true }).click();
  await expect(page.getByRole("menuitemradio", { name: "W trakcie", exact: true })).toBeVisible();
  await page.getByRole("menuitemradio", { name: "W trakcie", exact: true }).click();
  await expect(quickEntry.getByRole("button", { name: "Status: W trakcie", exact: true })).toBeVisible();
  await quickEntry.getByRole("button", { name: /Termin zadania/ }).click();
  await expect(page.getByRole("dialog", { name: /Termin zadania/ })).toBeVisible();
  await page.keyboard.press("Escape");

  const mobileNavigation = page.getByRole("combobox", { name: "Wybierz widok pracy" });
  if (await mobileNavigation.isVisible()) {
    await mobileNavigation.click();
    await expect(page.getByRole("option", { name: "Jutro", exact: true })).toBeVisible();
    await page.getByRole("option", { name: "Ten tydzień", exact: true }).click();
  } else {
    await expect(page.locator(".work-context-sidebar").getByRole("button", { name: /^Jutro/ })).toBeVisible();
    await page.locator(".work-context-sidebar").getByRole("button", { name: /^Ten tydzień/ }).click();
  }
  await expect(page).toHaveURL(/\/praca\?widok=week$/);
  await expect(page.getByPlaceholder("Dodaj zadanie do „Ten tydzień”")).toBeVisible();
  if (!(await mobileNavigation.isVisible())) await expect(page.getByText("+7 dni", { exact: true })).toBeVisible();

  if (await mobileNavigation.isVisible()) {
    await mobileNavigation.click();
    await page.getByRole("option", { name: "Bez terminu", exact: true }).click();
  } else {
    await page.locator(".work-context-sidebar").getByRole("button", { name: /^Bez terminu/ }).click();
  }
  await expect(page).toHaveURL(/\/praca\?widok=bezterminu$/);
  await expect(page.getByPlaceholder("Dodaj zadanie do „Bez terminu”")).toBeVisible();
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
    const collapse = projectRecord.getByRole("button", { name: "Zwiń podgląd zadań projektu „Nowa strona”" });
    const companyUrl = page.url();
    await collapse.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(companyUrl);

    const preview = projectRecord.locator(".work-project-record__preview");
    await expect(preview).toBeHidden();

    const expand = projectRecord.getByRole("button", { name: "Rozwiń podgląd zadań projektu „Nowa strona”" });
    await expand.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(companyUrl);
    await expect(preview).toBeVisible();
    await expect(preview.locator(".work-project-record__preview-task")).toHaveCount(0);

    const compactRows = preview.locator(".work-task-row--compact");
    await expect(compactRows.first()).toBeVisible();
    await expect(compactRows.first().locator(".work-task-check")).toBeVisible();
    await expect(compactRows.first().locator(".work-task-priority")).toBeVisible();
    await expect(compactRows.first().locator(".work-task-status")).toBeVisible();
    await expect(compactRows.first().locator(".work-task-inline-date")).toBeVisible();
    await expect(compactRows.first().getByRole("button", { name: /Otwórz szczegóły zadania/ })).toBeVisible();

    const openProject = projectRecord.getByRole("button", { name: "Otwórz projekt „Nowa strona”" });
    await openProject.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".work-screen--project")).toBeVisible();
});

test("@desktop Back między widokami Pracy chroni i zamyka odrzucony szkic", async ({ rootinePage: page }) => {
  await openRootineRoute(page, "/praca");

  await page.locator(".work-context-sidebar").getByRole("button", { name: /^Ten tydzień/ }).click();
  await expect(page).toHaveURL(/\/praca\?widok=week$/);

  await page.locator(".work-add-menu > button").click();
  await page.getByRole("menuitem", { name: "Dodaj firmę" }).click();
  const editor = page.getByRole("dialog", { name: "Nowa firma" });
  await editor.getByLabel("Nazwa").fill("Szkic przed Back");

  await page.evaluate(() => window.history.back());
  const discard = page.getByRole("dialog", { name: "Odrzucić niezapisane zmiany?" });
  await expect(discard).toBeVisible();
  await expect(page).toHaveURL(/\/praca\?widok=week$/);

  await discard.getByRole("button", { name: "Odrzuć zmiany" }).click();
  await expect(page).toHaveURL(/\/praca$/);
  await expect(editor).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.sessionStorage.getItem("rootine.work-editor-draft.company.add.new"))).toBeNull();
});
