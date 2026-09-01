import AxeBuilder from "@axe-core/playwright";
import type { Locator } from "@playwright/test";
import { expect, openRootineRoute, test } from "./fixtures";

const PHONE_VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 568, height: 320 },
  { width: 844, height: 390 },
] as const;

const MORE_MODULES = [
  { route: "/sport", action: "Dodaj trening" },
  { route: "/praca", action: "Dodaj zadanie" },
  { route: "/cele?widok=overview", action: "Dodaj cel" },
  { route: "/podroze", action: "Dodaj podróż" },
  { route: "/notatki", action: "Dodaj notatkę" },
  { route: "/sprawy?widok=matters", action: "Dodaj sprawę" },
] as const;

function mobileNavigation(page: Parameters<typeof openRootineRoute>[0]) {
  return page.getByRole("navigation", { name: "Główna nawigacja mobilna" });
}

async function expectVisibleActionLabel(action: Locator) {
  await expect(action).toBeVisible();
  const geometry = await action.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const text = element.textContent?.trim() ?? "";
    const range = document.createRange();
    const textNode = Array.from(element.childNodes).find((node) => node.nodeType === Node.TEXT_NODE || node.textContent?.trim());
    if (textNode) range.selectNodeContents(textNode);
    const textRect = range.getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height,
      text,
      textWidth: textRect.width,
      textHeight: textRect.height,
    };
  });
  expect(geometry.width).toBeGreaterThanOrEqual(44);
  expect(geometry.height).toBeGreaterThanOrEqual(44);
  expect(geometry.text).not.toBe("");
  expect(geometry.textWidth).toBeGreaterThan(1);
  expect(geometry.textHeight).toBeGreaterThan(1);
}

test.describe("Sprint 04 — More and module mobile contract", { tag: "@mobile" }, () => {
  test("More keeps semantic history, focus, scroll and a single current destination", async ({ rootinePage: page }) => {
    await openRootineRoute(page, "/dzisiaj?konto=testowe");
    const more = mobileNavigation(page).getByRole("button", { name: "Więcej", exact: true });
    await more.click();

    await expect.poll(() => page.evaluate(() => {
      const state = history.state as { usr?: { rootineMobileLayer?: string }; rootineMobileLayer?: string } | null;
      return state?.usr?.rootineMobileLayer ?? state?.rootineMobileLayer ?? null;
    })).toBe("more");

    const center = page.getByRole("dialog", { name: "Wszystkie obszary aplikacji" });
    await expect(center).toBeVisible();
    await expect(mobileNavigation(page).locator("[aria-current='page']")).toHaveCount(1);
    const sport = center.getByRole("link", { name: "Sport", exact: true });
    await center.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    const scrollTop = await center.evaluate((element) => element.scrollTop);
    await sport.click();
    // The isolated browser-audit profile is intentionally retained while
    // navigating out of More; ordinary navigation still uses /sport.
    await expect(page).toHaveURL(/\/sport(?:\?konto=testowe)?$/);
    await expect(mobileNavigation(page).getByRole("button", { name: "Więcej", exact: true })).toHaveAttribute("aria-current", "page");

    await page.goBack();
    await expect(center).toBeVisible();
    await expect.poll(() => center.evaluate((element) => element.scrollTop)).toBeGreaterThanOrEqual(Math.max(0, scrollTop - 8));
    await expect(sport).toBeFocused();
    await page.goBack();
    await expect(more).toBeFocused();
    await expect(page).toHaveURL(/\/dzisiaj\?konto=testowe$/);
    await page.goForward();
    await expect(center).toBeVisible();
    await page.goForward();
    await expect(page).toHaveURL(/\/sport(?:\?konto=testowe)?$/);
  });

  test("each More module keeps a named touch-safe quick-add across the phone matrix", async ({ rootinePage: page }) => {
    test.setTimeout(120_000);
    for (const viewport of PHONE_VIEWPORTS) {
      await page.setViewportSize(viewport);
      for (const module of MORE_MODULES) {
        await openRootineRoute(page, `${module.route}${module.route.includes("?") ? "&" : "?"}konto=testowe`);
        await expect(page.locator("h1:visible")).toHaveCount(1);
        const action = page.getByRole("button", { name: module.action, exact: true }).first();
        await expectVisibleActionLabel(action);
        await expect(mobileNavigation(page).locator("[aria-current='page']")).toHaveCount(1);
      }
    }
  });

  test("More and its real utility layers have no axe violations in both themes", async ({ rootinePage: page }) => {
    for (const theme of ["rootine-cobalt", "rootine-warm-linen"]) {
      await page.addInitScript((nextTheme) => localStorage.setItem("rootine.theme.v1", nextTheme), theme);
      await openRootineRoute(page, "/dzisiaj?konto=testowe");
      await mobileNavigation(page).getByRole("button", { name: "Więcej", exact: true }).click();
      const center = page.getByRole("dialog", { name: "Wszystkie obszary aplikacji" });
      const axe = await new AxeBuilder({ page }).include("#mobile-more-menu").analyze();
      expect(axe.violations).toEqual([]);
      await center.getByRole("button", { name: /Ustawienia/ }).click();
      await expect(page.getByRole("dialog", { name: "Ustawienia aplikacji" })).toBeVisible();
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
    }
  });

  test("More persists a hidden-module preference and keeps invalid recovery imports non-destructive", async ({ rootinePage: page }) => {
    await openRootineRoute(page, "/dzisiaj?konto=lokalne");
    const more = mobileNavigation(page).getByRole("button", { name: "Więcej", exact: true });
    await more.click();
    await page.getByRole("button", { name: "Ustawienia", exact: true }).click();
    const settings = page.getByRole("dialog", { name: "Ustawienia aplikacji" });
    await settings.getByRole("button", { name: /^Moduły:/ }).click();
    const sportToggle = settings.getByRole("switch", { name: "Dezaktywuj moduł Sport", exact: true });
    await sportToggle.focus();
    await page.keyboard.press("Space");
    await expect(settings.getByRole("switch", { name: "Aktywuj moduł Sport", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.reload();
    await page.getByRole("button", { name: "Ustawienia", exact: true }).click();
    await page.getByRole("dialog", { name: "Ustawienia aplikacji" }).getByRole("button", { name: /^Moduły:/ }).click();
    const restoredSettings = page.getByRole("dialog", { name: "Ustawienia aplikacji" });
    const restoreSport = restoredSettings.getByRole("switch", { name: "Aktywuj moduł Sport", exact: true });
    await expect(restoreSport).toBeVisible();
    await restoreSport.focus();
    await page.keyboard.press("Space");
    await expect(restoredSettings.getByRole("switch", { name: "Dezaktywuj moduł Sport", exact: true })).toBeVisible();

    await restoredSettings.getByRole("button", { name: /^Reszta:/ }).click();
    await page.getByRole("button", { name: "Kopie zapasowe", exact: true }).click();
    const recovery = page.getByRole("dialog", { name: "Kopia i odzyskiwanie" });
    await recovery.getByLabel("Wybierz plik kopii danych Rootine").setInputFiles({
      name: "uszkodzona-kopia.json",
      mimeType: "application/json",
      buffer: Buffer.from("{nie jest poprawnym jsonem"),
    });
    await expect(recovery).toContainText(/nie udało się|nieprawidł|uszkodz/i);
    await recovery.getByRole("button", { name: "Zamknij", exact: true }).click();
  });

  test("Notes uses a confirmed delete with an immediate, persistent Undo recovery", async ({ rootinePage: page }) => {
    const title = `S04 recovery ${Date.now()}`;
    const renamed = `${title} po edycji`;
    await openRootineRoute(page, "/notatki?konto=lokalne");
    const quickNote = page.getByRole("form", { name: "Szybko dodaj notatkę" });
    await quickNote.getByRole("textbox", { name: "Tytuł nowej notatki" }).fill(title);
    await quickNote.getByRole("button", { name: "Dodaj notatkę", exact: true }).click();
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: title, exact: true }).click();
    const detail = page.getByRole("dialog", { name: `Edytuj ${title}` });
    await detail.locator(".notes-editor__title-field input").fill(renamed);
    await detail.getByRole("button", { name: "Zapisz notatkę", exact: true }).click();
    await expect(page.getByText(renamed, { exact: true })).toBeVisible();
    // The note editor owns deletion while it remains open after saving; this
    // deliberately exercises the real edit → confirm → Undo path.
    await detail.getByRole("button", { name: "Usuń", exact: true }).click();
    const confirm = page.getByRole("dialog", { name: `Usunąć notatkę „${renamed}”?` });
    await confirm.getByRole("button", { name: "Usuń notatkę", exact: true }).click();
    const undo = page.getByRole("button", { name: "Cofnij", exact: true });
    await expect(undo).toBeVisible();
    await undo.click();
    await expect(page.getByText(renamed, { exact: true })).toBeVisible();
    await page.waitForTimeout(750);
    await page.reload();
    await expect(page.getByText(renamed, { exact: true })).toBeVisible();
  });

  test("Sport keeps one workout ID through edit, confirmed deletion and Undo recovery", async ({ rootinePage: page }) => {
    test.setTimeout(90_000);
    const title = `S04 sport recovery ${Date.now()}`;
    const renamed = `${title} po edycji`;
    await openRootineRoute(page, "/sport?widok=cycle&konto=lokalne");
    await page.getByRole("button", { name: "Dodaj trening", exact: true }).click();
    const create = page.getByRole("dialog", { name: "Dodaj trening" });
    await create.getByRole("textbox", { name: "Nazwa" }).fill(title);
    await create.getByRole("button", { name: "Dodaj trening", exact: true }).last().click();
    const record = page.locator("button[data-workout-id]").filter({ hasText: title }).first();
    await expect(record).toBeVisible();
    const id = await record.getAttribute("data-workout-id");
    expect(id).toBeTruthy();
    await record.click();
    const detail = page.getByRole("dialog", { name: "Szczegóły treningu" });
    await detail.getByText("Więcej działań", { exact: true }).click();
    await detail.getByRole("button", { name: "Edytuj trening", exact: true }).click();
    const edit = page.getByRole("dialog", { name: "Edytuj trening" });
    await edit.getByRole("textbox", { name: "Nazwa" }).fill(renamed);
    await edit.getByRole("button", { name: "Zapisz ten trening", exact: true }).click();
    const renamedRecord = page.locator(`button[data-workout-id='${id}']`);
    await expect(renamedRecord).toContainText(renamed);
    // Saving returns to the selected DetailPanel. Reuse that actual consumer
    // rather than attempting to click through its inert background.
    await expect(detail).toBeVisible();
    await detail.getByRole("button", { name: "Usuń trening", exact: true }).click();
    const confirm = page.getByRole("dialog", { name: `Usunąć trening „${renamed}”?` });
    await confirm.getByRole("button", { name: "Usuń trening", exact: true }).click();
    await expect(page.getByRole("button", { name: "Cofnij", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Cofnij", exact: true }).click();
    await page.waitForTimeout(750);
    await page.reload();
    await expect(page.locator(`button[data-workout-id='${id}']`)).toContainText(renamed);
  });

  test("Work updates a real task and restores its exact ID after confirmed deletion", async ({ rootinePage: page }) => {
    test.setTimeout(90_000);
    const title = `S04 work recovery ${Date.now()}`;
    await openRootineRoute(page, "/praca?widok=tasks&konto=lokalne");
    await page.getByRole("button", { name: "Dodaj zadanie", exact: true }).first().click();
    await page.getByRole("menuitem", { name: "Dodaj zadanie", exact: true }).click();
    const create = page.getByRole("dialog", { name: "Nowe zadanie" });
    await create.getByRole("textbox", { name: "Nazwa zadania" }).fill(title);
    await create.getByRole("button", { name: "Dodaj zadanie", exact: true }).click();
    const record = page.locator("[data-task-id]").filter({ hasText: title }).first();
    await expect(record).toBeVisible();
    const id = await record.getAttribute("data-task-id");
    expect(id).toBeTruthy();
    await record.getByRole("button", { name: `Zmień priorytet zadania „${title}”`, exact: true }).click();
    await page.getByRole("menuitemradio", { name: "Wysoki", exact: true }).click();
    await expect(page.locator(`[data-task-id='${id}'] .work-task-priority--high`)).toHaveCount(1);
    await page.getByRole("button", { name: `Otwórz szczegóły zadania „${title}”`, exact: true }).click();
    const detail = page.getByRole("dialog", { name: "Szczegóły zadania" });
    await detail.getByRole("button", { name: "Usuń", exact: true }).click();
    const confirm = page.getByRole("dialog", { name: `Usunąć zadanie „${title}”?` });
    await confirm.getByRole("button", { name: "Usuń zadanie", exact: true }).click();
    await expect(page.getByRole("button", { name: "Cofnij", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Cofnij", exact: true }).click();
    await page.waitForTimeout(750);
    await page.reload();
    await expect(page.locator(`[data-task-id='${id}'] .work-task-priority--high`)).toHaveCount(1);
  });

  test("Goals preserve the same ID through edit, confirm-delete and Undo", async ({ rootinePage: page }) => {
    test.setTimeout(90_000);
    const title = `S04 goal recovery ${Date.now()}`;
    const renamed = `${title} po edycji`;
    await openRootineRoute(page, "/cele?widok=overview&konto=lokalne");
    await page.getByRole("button", { name: "Dodaj cel", exact: true }).first().click();
    const create = page.getByRole("dialog", { name: "Nowy cel" });
    await create.getByRole("textbox", { name: "Nazwa celu" }).fill(title);
    await create.getByRole("button", { name: "Dodaj cel", exact: true }).click();
    // Goal forms are a history layer. Saving returns to the preceding state
    // through Back, so use the browser lifecycle instead of a synthetic close.
    await page.goBack();
    await expect(create).toHaveCount(0);
    const record = page.locator(".goal-card[data-goal-id]").filter({ hasText: title }).first();
    await expect(record).toBeVisible();
    const id = await record.getAttribute("data-goal-id");
    expect(id).toBeTruthy();
    await record.getByRole("button", { name: `Więcej opcji dla celu ${title}`, exact: true }).click();
    await page.getByRole("menuitem", { name: "Edytuj cel", exact: true }).click();
    const edit = page.getByRole("dialog", { name: "Edytuj cel" });
    await edit.getByRole("textbox", { name: "Nazwa celu" }).fill(renamed);
    await edit.getByRole("button", { name: "Zapisz cel", exact: true }).click();
    const renamedRecord = page.locator(`.goal-card[data-goal-id='${id}']`);
    await expect(renamedRecord).toContainText(renamed);
    await renamedRecord.getByRole("button", { name: `Więcej opcji dla celu ${renamed}`, exact: true }).click();
    await page.getByRole("menuitem", { name: "Usuń", exact: true }).click();
    const confirm = page.getByRole("dialog", { name: `Usunąć cel „${renamed}”?` });
    await confirm.getByRole("button", { name: "Usuń cel", exact: true }).click();
    await page.getByRole("button", { name: "Cofnij", exact: true }).click();
    await page.waitForTimeout(750);
    await page.reload();
    await expect(page.locator(`.goal-card[data-goal-id='${id}']`)).toContainText(renamed);
  });

  test("Travel preserves its dossier ID through edit, confirmed delete and Undo", async ({ rootinePage: page }) => {
    test.setTimeout(90_000);
    const title = `S04 travel recovery ${Date.now()}`;
    const renamed = `${title} po edycji`;
    await openRootineRoute(page, "/podroze?konto=lokalne");
    await page.getByRole("button", { name: "Dodaj podróż", exact: true }).first().click();
    const create = page.getByRole("dialog", { name: "Nowa podróż" });
    await create.getByRole("textbox", { name: "Nazwa podróży" }).fill(title);
    await create.getByRole("textbox", { name: "Trasa / kierunek" }).fill("Gdańsk");
    await create.getByRole("button", { name: /Data rozpoczęcia/ }).click();
    await page.locator(".ui-date-picker").getByRole("button", { name: "Dzisiaj", exact: true }).click();
    await create.getByRole("button", { name: /Data zakończenia/ }).click();
    await page.locator(".ui-date-picker").getByRole("button", { name: "Dzisiaj", exact: true }).click();
    await create.getByRole("button", { name: "Dodaj podróż", exact: true }).click();
    const record = page.locator("[data-trip-id]").filter({ hasText: title }).first();
    await expect(record).toHaveCount(1);
    const id = await record.getAttribute("data-trip-id");
    expect(id).toBeTruthy();
    // The detail route reads the persisted travel workspace. Commit the
    // local-first write before replacing the route, rather than relying on a
    // render that may still be ahead of IndexedDB on a clean profile.
    await page.waitForTimeout(750);
    await openRootineRoute(page, `/podroze/${id}?konto=lokalne`);
    await expect(page.getByRole("button", { name: "Więcej opcji podróży", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Więcej opcji podróży", exact: true }).click();
    await page.getByRole("menuitem", { name: "Edytuj podróż", exact: true }).click();
    const edit = page.getByRole("dialog", { name: "Edytuj podróż" });
    await edit.getByRole("textbox", { name: "Nazwa podróży" }).fill(renamed);
    await edit.getByRole("button", { name: "Zapisz podróż", exact: true }).click();
    await expect(page.getByRole("button", { name: "Więcej opcji podróży", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Więcej opcji podróży", exact: true }).click();
    await page.getByRole("menuitem", { name: "Usuń podróż", exact: true }).click();
    const confirm = page.getByRole("dialog", { name: `Usunąć podróż „${renamed}”?` });
    await confirm.getByRole("button", { name: "Usuń podróż", exact: true }).click();
    await page.getByRole("button", { name: "Cofnij", exact: true }).click();
    await page.waitForTimeout(750);
    await page.reload();
    await expect(page.locator(`[data-trip-id='${id}']`)).toHaveCount(1);
  });

  test("Affairs edits one ID and makes its confirmed permanent-delete recovery explicit", async ({ rootinePage: page }) => {
    test.setTimeout(90_000);
    const title = `S04 affair recovery ${Date.now()}`;
    const renamed = `${title} po edycji`;
    await openRootineRoute(page, "/sprawy?widok=all&konto=lokalne");
    await page.getByRole("button", { name: "Dodaj sprawę", exact: true }).first().click();
    const create = page.getByRole("dialog", { name: "Nowa sprawa" });
    await create.getByRole("textbox", { name: "Nazwa sprawy" }).fill(title);
    await create.getByRole("button", { name: "Dodaj sprawę", exact: true }).click();
    const record = page.locator("[data-affair-id]").filter({ hasText: title }).first();
    await expect(record).toBeVisible();
    const id = await record.getAttribute("data-affair-id");
    expect(id).toBeTruthy();
    const detail = page.getByRole("dialog", { name: `Szczegóły: ${title}` });
    await expect(detail).toBeVisible();
    await detail.getByRole("button", { name: "Edytuj sprawę", exact: true }).click();
    const edit = page.getByRole("dialog", { name: "Edytuj sprawę" });
    await edit.getByRole("textbox", { name: "Nazwa sprawy" }).fill(renamed);
    await edit.getByRole("button", { name: "Zapisz sprawę", exact: true }).click();
    await expect(page.locator(`[data-affair-id='${id}']`)).toContainText(renamed);
    const renamedDetail = page.getByRole("dialog", { name: `Szczegóły: ${renamed}` });
    await renamedDetail.getByRole("button", { name: "Usuń sprawę", exact: true }).click();
    const confirm = page.getByRole("dialog", { name: `Usunąć sprawę „${renamed}”?` });
    await confirm.getByRole("button", { name: "Usuń sprawę", exact: true }).click();
    await expect(page.locator(`[data-affair-id='${id}']`)).toHaveCount(0);
    await page.waitForTimeout(750);
    await page.reload();
    await expect(page.locator(`[data-affair-id='${id}']`)).toHaveCount(0);
  });

  test("six More workspaces persist one real local record through UI and hydration", async ({ rootinePage: page }) => {
    test.setTimeout(180_000);
    const suffix = `S04 ${Date.now()}`;
    const returnThroughMore = async (module: string, record: string) => {
      await mobileNavigation(page).getByRole("button", { name: "Więcej", exact: true }).click();
      const more = page.getByRole("dialog", { name: "Wszystkie obszary aplikacji" });
      await more.getByRole("link", { name: module, exact: true }).click();
      if (module === "Cele") {
        // Select's visible listbox is portal-rendered and intentionally
        // repositions after route hydration. Select the native control to
        // assert the same active view without racing that repositioning.
        await page.locator(".goals-filter-select select.ui-select-native").selectOption("overview");
      }
      if (module === "Pozostałe") {
        const affairsView = page.getByRole("combobox", { name: "Wybierz widok spraw" }).last();
        await affairsView.focus();
        await page.keyboard.press("w");
        await page.keyboard.press("Enter");
      }
      await expect(page.locator(record)).toHaveCount(1);
    };

    await openRootineRoute(page, "/sport?widok=cycle&konto=lokalne");
    await page.getByRole("button", { name: "Dodaj trening", exact: true }).click();
    const sport = page.getByRole("dialog");
    await sport.getByRole("textbox", { name: "Nazwa" }).fill(`${suffix} Sport`);
    await sport.getByRole("button", { name: "Dodaj trening", exact: true }).last().click();
    const sportRecord = page.locator("button[data-workout-id]").filter({ hasText: `${suffix} Sport` }).first();
    await expect(sportRecord).toBeVisible();
    const sportId = await sportRecord.getAttribute("data-workout-id");
    expect(sportId).toBeTruthy();
    await page.waitForTimeout(750);
    await page.reload();
    await expect(page.locator(`button[data-workout-id='${sportId}']`)).toContainText(`${suffix} Sport`);
    await returnThroughMore("Sport", `button[data-workout-id='${sportId}']`);

    await openRootineRoute(page, "/praca?widok=tasks&konto=lokalne");
    await page.getByRole("button", { name: "Dodaj zadanie", exact: true }).first().click();
    await page.getByRole("menuitem", { name: "Dodaj zadanie", exact: true }).click();
    const work = page.getByRole("dialog", { name: "Nowe zadanie" });
    await work.getByRole("textbox", { name: "Nazwa zadania" }).fill(`${suffix} Praca`);
    await work.getByRole("button", { name: "Dodaj zadanie", exact: true }).click();
    const workRecord = page.locator("[data-task-id]").filter({ hasText: `${suffix} Praca` }).first();
    await expect(workRecord).toBeVisible();
    const workId = await workRecord.getAttribute("data-task-id");
    expect(workId).toBeTruthy();
    // Work persists through its subscription; wait for the committed local-first
    // write before deliberately tearing the page down for hydration.
    await page.waitForTimeout(750);
    await page.reload();
    await expect(page.locator(`[data-task-id='${workId}']`)).toContainText(`${suffix} Praca`);
    await returnThroughMore("Praca", `[data-task-id='${workId}']`);

    await openRootineRoute(page, "/cele?widok=overview&konto=lokalne");
    await page.getByRole("button", { name: "Dodaj cel", exact: true }).first().click();
    const goal = page.getByRole("dialog", { name: "Nowy cel" });
    await goal.getByRole("textbox", { name: "Nazwa celu" }).fill(`${suffix} Cel`);
    await goal.getByRole("button", { name: "Dodaj cel", exact: true }).click();
    await page.goBack();
    await expect(goal).toHaveCount(0);
    const goalRecord = page.locator("[data-goal-id]").filter({ hasText: `${suffix} Cel` }).first();
    await expect(goalRecord).toBeVisible();
    const goalId = await goalRecord.getAttribute("data-goal-id");
    expect(goalId).toBeTruthy();
    await page.waitForTimeout(750);
    await page.reload();
    await expect(page.locator(`[data-goal-id='${goalId}']`)).toContainText(`${suffix} Cel`);
    await returnThroughMore("Cele", `[data-goal-id='${goalId}']`);

    await openRootineRoute(page, "/podroze?konto=lokalne");
    await page.getByRole("button", { name: "Dodaj podróż", exact: true }).first().click();
    const trip = page.getByRole("dialog", { name: "Nowa podróż" });
    await trip.getByRole("textbox", { name: "Nazwa podróży" }).fill(`${suffix} Podróż`);
    await trip.getByRole("textbox", { name: "Trasa / kierunek" }).fill("Gdańsk");
    await trip.getByRole("button", { name: /Data rozpoczęcia/ }).click();
    await page.locator(".ui-date-picker").getByRole("button", { name: "Dzisiaj", exact: true }).click();
    await trip.getByRole("button", { name: /Data zakończenia/ }).click();
    await page.locator(".ui-date-picker").getByRole("button", { name: "Dzisiaj", exact: true }).click();
    await trip.getByRole("button", { name: "Dodaj podróż", exact: true }).click();
    const tripRecord = page.getByText(`${suffix} Podróż`, { exact: true }).last();
    await expect(tripRecord).toBeVisible();
    const tripId = await page.locator("[data-trip-id]").filter({ hasText: `${suffix} Podróż` }).first().getAttribute("data-trip-id");
    expect(tripId).toBeTruthy();
    await page.waitForTimeout(750);
    await page.reload();
    await expect(page.locator(`[data-trip-id='${tripId}']`)).toHaveCount(1);
    await returnThroughMore("Podróże", `[data-trip-id='${tripId}']`);

    await openRootineRoute(page, "/notatki?konto=lokalne");
    const quickNote = page.getByRole("form", { name: "Szybko dodaj notatkę" });
    await quickNote.getByRole("textbox", { name: "Tytuł nowej notatki" }).fill(`${suffix} Notatka`);
    await quickNote.getByRole("button", { name: "Dodaj notatkę", exact: true }).click();
    const noteRecord = page.locator("[data-note-id]").filter({ hasText: `${suffix} Notatka` }).first();
    await expect(noteRecord).toBeVisible();
    const noteId = await noteRecord.getAttribute("data-note-id");
    expect(noteId).toBeTruthy();
    await page.waitForTimeout(750);
    await page.reload();
    await expect(page.locator(`[data-note-id='${noteId}']`)).toContainText(`${suffix} Notatka`);
    await returnThroughMore("Notatki", `[data-note-id='${noteId}']`);

    await openRootineRoute(page, "/sprawy?widok=matters&konto=lokalne");
    await page.getByRole("button", { name: "Dodaj sprawę", exact: true }).first().click();
    const affair = page.getByRole("dialog", { name: "Nowa sprawa" });
    await affair.getByRole("textbox", { name: "Nazwa sprawy" }).fill(`${suffix} Sprawa`);
    await affair.getByRole("button", { name: "Dodaj sprawę", exact: true }).click();
    const persistedAffair = page.getByText(`${suffix} Sprawa`, { exact: true }).first();
    await expect(persistedAffair).toBeVisible();
    const affairRow = page.locator("[data-affair-id]").filter({ hasText: `${suffix} Sprawa` }).first();
    const affairId = await affairRow.getAttribute("data-affair-id");
    expect(affairId).toBeTruthy();
    await page.waitForTimeout(750);
    await page.reload();
    await expect(page.locator(`[data-affair-id='${affairId}']`)).toContainText(`${suffix} Sprawa`);
    await returnThroughMore("Pozostałe", `[data-affair-id='${affairId}']`);
  });

  test("real module overlays trap focus, expose closing frames and honor app and system reduced motion", async ({ rootinePage: page }) => {
    const openWorkEditor = async () => {
      const trigger = page.getByRole("button", { name: "Dodaj zadanie", exact: true }).first();
      await trigger.click();
      await page.getByRole("menuitem", { name: "Dodaj zadanie", exact: true }).click();
      return { trigger, dialog: page.getByRole("dialog", { name: "Nowe zadanie" }) };
    };
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await openRootineRoute(page, "/praca?widok=tasks&konto=lokalne");
    const normal = await openWorkEditor();
    await expect(normal.dialog).toHaveAttribute("aria-modal", "true");
    await expect.poll(() => page.locator(".ui-modal-backdrop").count()).toBe(1);
    await page.keyboard.press("Tab");
    await expect(normal.dialog).toContainText("Nazwa zadania");
    const normalDuration = await normal.dialog.evaluate((element) => Math.max(...getComputedStyle(element).animationDuration.split(",").map((value) => Number.parseFloat(value) * 1000)));
    expect(normalDuration).toBeGreaterThanOrEqual(90);
    expect(normalDuration).toBeLessThanOrEqual(240);
    await page.keyboard.press("Escape");
    await expect(normal.dialog).toHaveCount(0);

    // A saved module record consumes the shared DetailPanel, not a route-local
    // imitation. Its browser history must close and restore the same layer.
    const detailTrigger = page.getByRole("button", { name: /Otwórz szczegóły zadania/ }).first();
    await expect(detailTrigger).toBeVisible();
    await detailTrigger.click();
    const detail = page.getByRole("dialog", { name: "Szczegóły zadania" });
    await expect(detail).toHaveAttribute("aria-modal", "true");
    await expect(page.locator(".ui-detail-panel-backdrop")).toHaveCount(1);
    const detailAxe = await new AxeBuilder({ page }).include(".ui-detail-panel").analyze();
    expect(detailAxe.violations).toEqual([]);
    await page.goBack();
    await expect(detail).toHaveCount(0);

    await page.addInitScript(() => localStorage.setItem("rootine.experience.preferences.v1", JSON.stringify({ version: 1, motion: "reduced", density: "standard", privacy: false })));
    await openRootineRoute(page, "/praca?widok=tasks&konto=lokalne");
    const appReduced = await openWorkEditor();
    await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
    const appDuration = await appReduced.dialog.evaluate((element) => Math.max(...getComputedStyle(element).animationDuration.split(",").map((value) => Number.parseFloat(value) * 1000)));
    expect(appDuration).toBeLessThanOrEqual(20);
    await page.keyboard.press("Escape");

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => localStorage.setItem("rootine.experience.preferences.v1", JSON.stringify({ version: 1, motion: "system", density: "standard", privacy: false })));
    await openRootineRoute(page, "/praca?widok=tasks&konto=lokalne");
    const systemReduced = await openWorkEditor();
    await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
    const systemDuration = await systemReduced.dialog.evaluate((element) => Math.max(...getComputedStyle(element).animationDuration.split(",").map((value) => Number.parseFloat(value) * 1000)));
    expect(systemDuration).toBeLessThanOrEqual(20);
    const axe = await new AxeBuilder({ page }).include(".ui-modal").analyze();
    expect(axe.violations).toEqual([]);
    await page.keyboard.press("Escape");
  });

  test("corrupt module memory and workspace never prevent the More or Work recovery shell", async ({ rootinePage: page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("rootine.module-memory.v1", JSON.stringify({ version: 1, modules: { work: { state: { tasks: "https://outside.example" } } } }));
      localStorage.setItem("rootine.work-workspace.v1", JSON.stringify({ version: 999, tasks: "corrupt workspace" }));
    });
    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));
    test.setTimeout(60_000);
    await openRootineRoute(page, "/praca?widok=tasks&konto=lokalne");
    await expect(page.locator("h1:visible")).toHaveCount(1);
    await mobileNavigation(page).getByRole("button", { name: "Więcej", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Wszystkie obszary aplikacji" })).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test("a valid export restores one exact local payload into a clean profile without duplicating it", async ({ rootinePage: page, browser }) => {
    test.setTimeout(120_000);
    const title = `S04 backup ${Date.now()}`;
    const openRecovery = async (target: typeof page) => {
      await mobileNavigation(target).getByRole("button", { name: "Więcej", exact: true }).click();
      await target.getByRole("button", { name: "Ustawienia", exact: true }).click();
      const settings = target.getByRole("dialog", { name: "Ustawienia aplikacji" });
      await settings.getByRole("button", { name: /^Reszta:/ }).click();
      await target.getByRole("button", { name: "Kopie zapasowe", exact: true }).click();
      return target.getByRole("dialog", { name: "Kopia i odzyskiwanie" });
    };

    await openRootineRoute(page, "/notatki?konto=lokalne");
    const noteForm = page.getByRole("form", { name: "Szybko dodaj notatkę" });
    await noteForm.getByRole("textbox", { name: "Tytuł nowej notatki" }).fill(title);
    await noteForm.getByRole("button", { name: "Dodaj notatkę", exact: true }).click();
    const sourceNote = page.locator("[data-note-id]").filter({ hasText: title }).first();
    await expect(sourceNote).toBeVisible();
    const sourceNoteId = await sourceNote.getAttribute("data-note-id");
    expect(sourceNoteId).toBeTruthy();

    const recovery = await openRecovery(page);
    const downloadPromise = page.waitForEvent("download");
    await recovery.getByRole("button", { name: "Eksportuj kopię", exact: true }).click();
    const backup = await downloadPromise;
    const backupPath = await backup.path();
    expect(backupPath).toBeTruthy();

    const cleanContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const clean = await cleanContext.newPage();
    try {
      await openRootineRoute(clean, "/dzisiaj?konto=lokalne");
      const cleanRecovery = await openRecovery(clean);
      await cleanRecovery.getByLabel("Wybierz plik kopii danych Rootine").setInputFiles(backupPath!);
      await expect(cleanRecovery.getByText("Potwierdź przywrócenie", { exact: true })).toBeVisible();
      await cleanRecovery.getByRole("button", { name: "Przywróć kopię", exact: true }).click();
      await expect(cleanRecovery).toContainText(/Przywrócono/);
      await clean.reload();
      await openRootineRoute(clean, "/notatki?konto=lokalne");
      const restoredNote = clean.locator("[data-note-id]").filter({ hasText: title });
      await expect(restoredNote).toHaveCount(1);
      await expect(restoredNote).toHaveAttribute("data-note-id", sourceNoteId!);

      // A second import is explicitly replace-based: same exported payload stays one record.
      const secondRecovery = await openRecovery(clean);
      await secondRecovery.getByLabel("Wybierz plik kopii danych Rootine").setInputFiles(backupPath!);
      await secondRecovery.getByRole("button", { name: "Przywróć kopię", exact: true }).click();
      await expect(secondRecovery).toContainText(/Przywrócono/);
      const records = secondRecovery.getByRole("list", { name: "Zabezpieczone zapisy danych" }).getByRole("listitem");
      const recoveryRestore = secondRecovery.getByRole("button", { name: "Przywróć", exact: true }).first();
      await expect(recoveryRestore).toBeVisible();
      await recoveryRestore.click();
      await expect(secondRecovery).toContainText(/Przywrócono zabezpieczony zapis|Przywrócono/);
      const recordCountBeforeDelete = await records.count();
      const recoveryDelete = secondRecovery.getByRole("button", { name: "Usuń", exact: true }).first();
      await recoveryDelete.click();
      await expect.poll(() => records.count()).toBeLessThan(recordCountBeforeDelete);
      await clean.reload();
      await openRootineRoute(clean, "/notatki?konto=lokalne");
      await expect(clean.locator(`[data-note-id='${sourceNoteId}']`)).toHaveCount(1);
    } finally {
      await cleanContext.close();
    }
  });
});
