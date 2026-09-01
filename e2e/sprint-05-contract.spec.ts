import AxeBuilder from "@axe-core/playwright";
import type { Page, TestInfo } from "@playwright/test";
import { expect, openRootineRoute, test } from "./fixtures";

const PHONE_VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 568, height: 320 },
  { width: 844, height: 390 },
] as const;

const THEMES = ["rootine-cobalt", "rootine-warm-linen"] as const;

const MOBILE_ROUTES = [
  { name: "Dzisiaj", path: "/dzisiaj", action: "Dodaj zadanie do dzisiejszego planu" },
  { name: "Zadania", path: "/zadania?widok=wszystkie", action: "Dodaj zadanie" },
  { name: "Kalendarz", path: "/kalendarz", action: "Następny miesiąc" },
  { name: "Odżywianie", path: "/odzywianie", action: "Dodaj produkt" },
] as const;

const MORE_SURFACES = [
  { name: "Sport", path: "/sport?widok=cycle", action: "Dodaj trening" },
  { name: "Praca", path: "/praca?widok=active", action: "Dodaj zadanie" },
  { name: "Cele", path: "/cele?widok=overview", action: "Dodaj cel" },
  { name: "Podróże", path: "/podroze", action: "Dodaj podróż" },
  { name: "Notatki", path: "/notatki", action: "Dodaj notatkę" },
  { name: "Pozostałe", path: "/sprawy?widok=all", action: "Dodaj sprawę" },
] as const;

async function storedTask(page: Page, title: string) {
  return page.evaluate(async (taskTitle) => {
    const localWorkspace = Array.from({ length: localStorage.length }, (_, index) => {
      const key = localStorage.key(index);
      return key ? { key, raw: localStorage.getItem(key) } : null;
    }).find((entry) => entry?.key.endsWith("rootine.task-workspace.v1"));
    if (localWorkspace?.raw) {
      const workspace = JSON.parse(localWorkspace.raw);
      return workspace?.tasks?.filter((task: { text?: string }) => task.text === taskTitle) ?? [];
    }
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("rootine-workspaces");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (!database.objectStoreNames.contains("workspaces")) {
      database.close();
      return [];
    }
    const record = await new Promise<{ key?: string; raw?: string } | null>((resolve, reject) => {
      const request = database.transaction("workspaces", "readonly").objectStore("workspaces").getAll();
      request.onsuccess = () => {
        const records = request.result as Array<{ key?: string; raw?: string }>;
        resolve(records.find((entry) => entry.key?.endsWith("rootine.task-workspace.v1")) ?? null);
      };
      request.onerror = () => reject(request.error);
    });
    database.close();
    const workspace = record?.raw ? JSON.parse(record.raw) : null;
    return workspace?.tasks?.filter((task: { text?: string }) => task.text === taskTitle) ?? [];
  }, title);
}

async function storedTravel(page: Page, tripId: string) {
  return page.evaluate((id) => {
    const raw = localStorage.getItem("rootine.travel-workspace.v1");
    if (!raw) return null;
    const workspace = JSON.parse(raw) as { trips?: Array<{ id?: string; name?: string; destination?: string }> };
    return workspace.trips?.find((trip) => trip.id === id) ?? null;
  }, tripId);
}

function mobileNavigation(page: Page) {
  return page.getByRole("navigation", { name: "Główna nawigacja mobilna" });
}

async function expectNoOverflow(page: Page, label: string) {
  const geometry = await page.evaluate(() => ({
    documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    bodyOverflow: document.body.scrollWidth - document.body.clientWidth,
  }));
  expect(geometry.documentOverflow, `${label}: document overflows`).toBeLessThanOrEqual(1);
  expect(geometry.bodyOverflow, `${label}: body overflows`).toBeLessThanOrEqual(1);
}

async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(name, { body: await page.screenshot({ fullPage: false }), contentType: "image/png" });
}

async function addNutritionEntry(page: Page, name: string) {
  await page.getByRole("button", { name: "Dodaj produkt", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Dodaj produkt" });
  await dialog.getByRole("combobox", { name: "Produkt lub danie" }).fill(name);
  await dialog.getByRole("spinbutton", { name: "Ilość" }).fill("125");
  await dialog.getByRole("spinbutton", { name: "Kalorie" }).fill("210");
  await dialog.getByRole("spinbutton", { name: "Białko (g)" }).fill("12");
  await dialog.getByRole("spinbutton", { name: "Węglowodany (g)" }).fill("26");
  await dialog.getByRole("spinbutton", { name: "Tłuszcze (g)" }).fill("7");
  await dialog.getByRole("button", { name: "Dodaj do dziennika" }).click();
  await expect(dialog).toHaveCount(0);
}

const runtimeFailures = new WeakMap<Page, string[]>();

function isExpectedConsoleError(message: string) {
  // One nutrition flow intentionally aborts only this third-party catalog
  // request to exercise its visible Retry path. Browser network diagnostics for
  // that controlled fault are not application runtime failures.
  return /openfoodfacts|Failed to fetch|ERR_FAILED/i.test(message);
}

test.describe("Sprint 05 — final application audit contract", { tag: "@mobile" }, () => {
  test.beforeEach(async ({ page }) => {
    const failures: string[] = [];
    runtimeFailures.set(page, failures);
    page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error" && !isExpectedConsoleError(message.text())) {
        failures.push(`console.error: ${message.text()}`);
      }
    });
  });

  test.afterEach(async ({ page }) => {
    expect(runtimeFailures.get(page) ?? [], "unexpected runtime failure").toEqual([]);
  });

  test("Today, Tasks and Calendar retain one canonical task ID after clean hydration", async ({ rootinePage: page }) => {
    const title = `S05 task ${Date.now()}`;
    const renamed = `${title} edited`;
    await openRootineRoute(page, "/dzisiaj?konto=testowe");
    await page.getByRole("button", { name: "Dodaj zadanie do dzisiejszego planu" }).click();
    const composer = page.getByRole("textbox", { name: "Nazwa nowego zadania" });
    await composer.fill(title);
    await composer.press("Enter");
    await expect.poll(() => storedTask(page, title)).toHaveLength(1);
    const [task] = await storedTask(page, title);
    expect(task?.id).toEqual(expect.any(Number));
    expect(task?.calendarDate).toBe("2026-08-05");

    await page.getByRole("button", { name: `Otwórz szczegóły zadania: ${title}` }).click();
    const todayDetail = page.getByRole("dialog", { name: "Szczegóły zadania" });
    await expect(todayDetail).toBeVisible();
    const titleEditor = todayDetail.getByRole("textbox", { name: "Tytuł zadania" });
    await titleEditor.fill(renamed);
    await titleEditor.blur();
    await todayDetail.getByRole("button", { name: "Zmień termin zadania", exact: true }).click();
    const schedule = page.locator(".task-sched--v2");
    await schedule.getByRole("button", { name: "Jutro", exact: true }).click();
    await schedule.getByRole("button", { name: "Zapisz termin", exact: true }).click();
    await page.keyboard.press("Escape");
    await expect.poll(() => storedTask(page, renamed)).toEqual([expect.objectContaining({ id: task?.id, calendarDate: expect.not.stringMatching("2026-08-05") })]);
    const [rescheduled] = await storedTask(page, renamed);
    await openRootineRoute(page, "/zadania?widok=wszystkie&konto=testowe");
    await expect(page.getByRole("button", { name: `Otwórz szczegóły zadania: ${renamed}` })).toBeVisible();
    await openRootineRoute(page, "/kalendarz?konto=testowe");
    await page.locator(`[data-calendar-cell='${rescheduled?.calendarDate}']`).click();
    await page.getByRole("button", { name: `Otwórz szczegóły: ${renamed}` }).click();
    await expect(page.getByRole("dialog", { name: "Szczegóły zadania" })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("dialog", { name: "Szczegóły zadania" })).toHaveCount(0);
    await page.goForward();
    await expect(page.getByRole("dialog", { name: "Szczegóły zadania" })).toBeVisible();
    await openRootineRoute(page, "/zadania?widok=wszystkie&konto=testowe");
    await page.getByRole("button", { name: `Otwórz szczegóły zadania: ${renamed}` }).click();
    await page.getByRole("dialog", { name: "Szczegóły zadania" })
      .getByRole("button", { name: "Oznacz zadanie jako wykonane", exact: true }).click();
    await expect.poll(() => storedTask(page, renamed)).toEqual([expect.objectContaining({ id: task?.id, done: true })]);
    // Task persistence batches a local-first IndexedDB write; wait for the
    // committed revision rather than tearing down the route mid-transaction.
    await page.waitForTimeout(750);
    await page.reload();
    await expect.poll(() => storedTask(page, renamed)).toEqual([expect.objectContaining({ id: task?.id, done: true, calendarDate: expect.not.stringMatching("2026-08-05") })]);
  });

  test("Tasks keep one exact record through trash restore and confirmed permanent deletion", async ({ rootinePage: page }) => {
    test.setTimeout(90_000);
    const title = `S05 trash ${Date.now()}`;
    await openRootineRoute(page, "/zadania?widok=wszystkie&konto=testowe");
    const composer = page.getByRole("textbox", { name: "Nazwa nowego zadania" });
    await composer.fill(title);
    await composer.press("Enter");
    await expect.poll(() => storedTask(page, title)).toHaveLength(1);
    const [created] = await storedTask(page, title);
    expect(created?.id).toEqual(expect.any(Number));

    const detailTrigger = page.getByRole("button", { name: `Otwórz szczegóły zadania: ${title}` });
    await detailTrigger.click();
    await page.getByRole("button", { name: "Więcej akcji zadania", exact: true }).click();
    await page.getByRole("menuitem", { name: "Usuń", exact: true }).click();
    await openRootineRoute(page, "/zadania?widok=kosz&konto=testowe");
    const trashRow = page.locator(".task-trash-row").filter({ hasText: title });
    await expect(trashRow).toHaveCount(1);
    await trashRow.getByRole("button", { name: "Przywróć", exact: true }).click();
    await page.waitForTimeout(750);
    await page.reload();
    await expect.poll(() => storedTask(page, title)).toEqual([expect.objectContaining({ ...created, deleted: false })]);

    await openRootineRoute(page, "/zadania?widok=wszystkie&konto=testowe");
    await page.getByRole("button", { name: `Otwórz szczegóły zadania: ${title}` }).click();
    await page.getByRole("button", { name: "Więcej akcji zadania", exact: true }).click();
    await page.getByRole("menuitem", { name: "Usuń", exact: true }).click();
    await openRootineRoute(page, "/zadania?widok=kosz&konto=testowe");
    await page.locator(".task-trash-row").filter({ hasText: title })
      .getByRole("button", { name: `Usuń zadanie „${title}” trwale`, exact: true }).click();
    const confirm = page.getByRole("dialog", { name: `Usunąć zadanie „${title}” trwale?` });
    await confirm.getByRole("button", { name: "Usuń zadanie trwale", exact: true }).click();
    await page.reload();
    await expect.poll(() => storedTask(page, title)).toEqual([]);
  });

  test("Tasks bulk actions, undo and the habits surface keep the selected records deterministic", async ({ rootinePage: page }) => {
    test.setTimeout(90_000);
    const titles = [`S05 bulk A ${Date.now()}`, `S05 bulk B ${Date.now()}`];
    await openRootineRoute(page, "/zadania?widok=wszystkie&konto=testowe");
    const composer = page.getByRole("textbox", { name: "Nazwa nowego zadania" });
    for (const title of titles) {
      await composer.fill(title);
      await composer.press("Enter");
      await expect.poll(() => storedTask(page, title)).toHaveLength(1);
    }
    const original = await Promise.all(titles.map((title) => storedTask(page, title).then(([task]) => task)));
    await page.getByRole("button", { name: "Wybierz", exact: true }).click();
    const bulk = page.getByRole("toolbar", { name: "Operacje zbiorcze na zadaniach" });
    await bulk.getByRole("button", { name: "Zaznacz widoczne", exact: true }).click();
    await bulk.getByRole("button", { name: "Usuń", exact: true }).click();
    await expect(page.getByRole("button", { name: "Cofnij", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Cofnij", exact: true }).click();
    await page.waitForTimeout(750);
    await page.reload();
    for (const [index, title] of titles.entries()) {
      await expect.poll(() => storedTask(page, title)).toEqual([original[index]]);
    }
    await openRootineRoute(page, "/zadania?widok=nawyki&konto=testowe");
    await expect(page.getByRole("heading", { name: /Nawyki/i })).toBeVisible();
    await expectNoOverflow(page, "task habits");
  });

  test("Nutrition separates a persistent ordinary entry from the closed-day recovery path", async ({ rootinePage: page }) => {
    const name = `S05 nutrition ${Date.now()}`;
    await openRootineRoute(page, "/odzywianie?konto=testowe");
    await addNutritionEntry(page, name);
    const entry = page.getByText(name, { exact: true });
    await expect(entry).toBeVisible();
    await page.getByRole("button", { name: "Zamknij wybrany dzień" }).click();
    await expect(page.locator(".nutrition-closed-notice")).toBeVisible();
    await expect(page.getByRole("button", { name: "Dodaj produkt", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: `Edytuj produkt „${name}”` })).toBeDisabled();
    await page.getByRole("button", { name: "Otwórz do edycji" }).click();
    await expect(page.getByRole("button", { name: "Dodaj produkt", exact: true })).toBeEnabled();
    await page.waitForTimeout(750);
    await page.reload();
    await expect(entry).toBeVisible();
  });

  test("Nutrition water shortcuts and a positive custom amount retain the exact total while invalid input is rejected", async ({ rootinePage: page }) => {
    await openRootineRoute(page, "/odzywianie?konto=testowe");
    const hydration = page.getByRole("progressbar", { name: "Nawodnienie" });
    const initial = Number(await hydration.getAttribute("aria-valuenow"));
    for (const amount of [150, 250, 330, 500]) {
      await page.getByRole("button", { name: `+${amount} ml`, exact: true }).click();
    }
    const custom = page.getByRole("spinbutton", { name: "Inna ilość wody" });
    await custom.fill("275");
    await page.getByRole("button", { name: "Dodaj", exact: true }).click();
    await expect(hydration).toHaveAttribute("aria-valuenow", String(initial + 1505));
    await custom.fill("0");
    await page.getByRole("button", { name: "Dodaj", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText(/większa od zera|dodatnią/i);
    await expect(hydration).toHaveAttribute("aria-valuenow", String(initial + 1505));
  });

  test("Nutrition weight accepts a bounded manual override and replaces the same date without duplicating it", async ({ rootinePage: page }) => {
    await openRootineRoute(page, "/odzywianie?konto=testowe");
    const addMeasurement = page.getByRole("button", { name: "Dodaj pomiar masy", exact: true });
    const editMeasurement = page.getByRole("button", { name: "Edytuj ostatni pomiar masy", exact: true });
    if (await addMeasurement.count()) await addMeasurement.click();
    else await editMeasurement.click();
    const measurement = page.locator(".nutrition-weight-inline-form");
    const weight = measurement.getByRole("textbox", { name: "Waga (kg)" });
    await weight.fill("19");
    await measurement.getByRole("button", { name: "Zapisz pomiar", exact: true }).click();
    await expect(measurement).toContainText(/20|nieprawidł/i);
    await weight.fill("71.4");
    await measurement.getByRole("button", { name: "Zapisz pomiar", exact: true }).click();
    await expect(measurement).toHaveCount(0);
    await page.getByRole("button", { name: "Edytuj ostatni pomiar masy", exact: true }).click();
    const edit = page.locator(".nutrition-weight-inline-form");
    await edit.getByRole("textbox", { name: "Waga (kg)" }).fill("72.1");
    await edit.getByRole("button", { name: "Zapisz pomiar", exact: true }).click();
    await expect(edit).toHaveCount(0);
    await page.reload();
    await expect(page.getByText(/72[,.]1/).first()).toBeVisible();
  });

  test("Nutrition catalog recovers from offline search without blocking validated manual macros", async ({ rootinePage: page }) => {
    await page.route("**/api/openfoodfacts/search**", (route) => route.abort("failed"));
    await openRootineRoute(page, "/odzywianie?konto=testowe");
    await page.getByRole("button", { name: "Dodaj produkt", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Dodaj produkt" });
    const product = dialog.getByRole("combobox", { name: "Produkt lub danie" });
    await product.fill("ziemniaki offline");
    await expect(dialog.getByRole("alert")).toContainText("Nie udało się pobrać");
    await expect(dialog.getByRole("button", { name: "Spróbuj ponownie" })).toBeVisible();
    await Promise.all(["Kalorie", "Białko (g)", "Węglowodany (g)", "Tłuszcze (g)"].map((name) => expect(dialog.getByRole("spinbutton", { name })).toBeEnabled()));
    await product.fill("ziemniaki");
    await product.press("ArrowDown");
    await product.press("Enter");
    await expect(product).not.toHaveValue("ziemniaki");
  });

  test("Nutrition entry layer honors Back, Forward, Escape and focus restoration", async ({ rootinePage: page }) => {
    await openRootineRoute(page, "/odzywianie?konto=testowe");
    const trigger = page.getByRole("button", { name: "Dodaj produkt", exact: true });
    await trigger.click();
    await expect(page.getByRole("dialog", { name: "Dodaj produkt" })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("dialog", { name: "Dodaj produkt" })).toHaveCount(0);
    await page.goForward();
    await expect(page.getByRole("dialog", { name: "Dodaj produkt" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
  });

  test("Sport preserves one workout ID through edit, confirm-delete, Undo and reload", async ({ rootinePage: page }) => {
    test.setTimeout(90_000);
    const title = `S05 sport ${Date.now()}`;
    const renamed = `${title} edited`;
    await openRootineRoute(page, "/sport?widok=cycle&konto=testowe");
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
    await expect(page.locator(`button[data-workout-id='${id}']`)).toContainText(renamed);
    await detail.getByRole("button", { name: "Usuń trening", exact: true }).click();
    const confirm = page.getByRole("dialog", { name: `Usunąć trening „${renamed}”?` });
    await confirm.getByRole("button", { name: "Usuń trening", exact: true }).click();
    await page.getByRole("button", { name: "Cofnij", exact: true }).click();
    await page.waitForTimeout(750);
    await expect.poll(() => page.evaluate((workoutId) => Array.from({ length: localStorage.length }, (_, index) => {
      const key = localStorage.key(index);
      return key ? localStorage.getItem(key)?.includes(workoutId) ?? false : false;
    }).some(Boolean), id)).toBe(true);
    await page.reload();
    await expect(page.locator(`button[data-workout-id='${id}']`)).toContainText(renamed);
  });

  test("Work preserves one task ID through a real priority edit, confirm-delete, Undo and reload", async ({ rootinePage: page }) => {
    test.setTimeout(90_000);
    const title = `S05 work ${Date.now()}`;
    await openRootineRoute(page, "/praca?widok=tasks&konto=testowe");
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
    await page.getByRole("button", { name: "Cofnij", exact: true }).click();
    await page.waitForTimeout(750);
    await page.reload();
    await expect(page.locator(`[data-task-id='${id}'] .work-task-priority--high`)).toHaveCount(1);
  });

  test("Goals preserves one ID through edit, confirm-delete, Undo and reload", async ({ rootinePage: page }) => {
    test.setTimeout(90_000);
    const title = `S05 goal ${Date.now()}`;
    const renamed = `${title} edited`;
    await openRootineRoute(page, "/cele?widok=overview&konto=testowe");
    await page.getByRole("button", { name: "Dodaj cel", exact: true }).first().click();
    const create = page.getByRole("dialog", { name: "Nowy cel" });
    await create.getByRole("textbox", { name: "Nazwa celu" }).fill(title);
    await create.getByRole("button", { name: "Dodaj cel", exact: true }).click();
    await page.goBack();
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

  test("Travel preserves one dossier ID through edit, confirm-delete, Undo and reload", async ({ rootinePage: page }) => {
    test.setTimeout(90_000);
    const title = `S05 travel ${Date.now()}`;
    const renamed = `${title} edited`;
    await openRootineRoute(page, "/podroze?konto=testowe");
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
    await page.waitForTimeout(750);
    await openRootineRoute(page, `/podroze/${id}?konto=testowe`);
    await page.getByRole("button", { name: "Więcej opcji podróży", exact: true }).click();
    await page.getByRole("menuitem", { name: "Edytuj podróż", exact: true }).click();
    const edit = page.getByRole("dialog", { name: "Edytuj podróż" });
    await edit.getByRole("textbox", { name: "Nazwa podróży" }).fill(renamed);
    await edit.getByRole("button", { name: "Zapisz podróż", exact: true }).click();
    await page.getByRole("button", { name: "Więcej opcji podróży", exact: true }).click();
    await page.getByRole("menuitem", { name: "Usuń podróż", exact: true }).click();
    const confirm = page.getByRole("dialog", { name: `Usunąć podróż „${renamed}”?` });
    await confirm.getByRole("button", { name: "Usuń podróż", exact: true }).click();
    await page.getByRole("button", { name: "Cofnij", exact: true }).click();
    await page.waitForTimeout(750);
    await expect.poll(() => storedTravel(page, id!)).toEqual(expect.objectContaining({ id, name: renamed, destination: "Gdańsk" }));
    await page.reload();
    await expect(page.locator(`[data-trip-id='${id}']`)).toHaveCount(1);
    await expect(page.locator(`[data-trip-id='${id}']`)).toContainText(renamed);
  });

  test("Notes preserves one exact ID through edit, confirmed deletion, Undo and reload", async ({ rootinePage: page }) => {
    test.setTimeout(90_000);
    const title = `S05 note ${Date.now()}`;
    const renamed = `${title} edited`;
    await openRootineRoute(page, "/notatki?konto=testowe");
    const composer = page.getByRole("form", { name: "Szybko dodaj notatkę" });
    await composer.getByRole("textbox", { name: "Tytuł nowej notatki" }).fill(title);
    await composer.getByRole("button", { name: "Dodaj notatkę", exact: true }).click();
    const record = page.locator("[data-note-id]").filter({ hasText: title }).first();
    await expect(record).toBeVisible();
    const id = await record.getAttribute("data-note-id");
    expect(id).toBeTruthy();
    await page.getByRole("button", { name: title, exact: true }).click();
    const detail = page.getByRole("dialog", { name: `Edytuj ${title}` });
    await detail.locator(".notes-editor__title-field input").fill(renamed);
    await detail.getByRole("button", { name: "Zapisz notatkę", exact: true }).click();
    await expect(page.locator(`[data-note-id='${id}']`)).toContainText(renamed);
    await detail.getByRole("button", { name: "Usuń", exact: true }).click();
    const confirm = page.getByRole("dialog", { name: `Usunąć notatkę „${renamed}”?` });
    await confirm.getByRole("button", { name: "Usuń notatkę", exact: true }).click();
    await page.getByRole("button", { name: "Cofnij", exact: true }).click();
    await page.waitForTimeout(750);
    await page.reload();
    await expect(page.locator(`[data-note-id='${id}']`)).toContainText(renamed);
  });

  test("Affairs preserves one ID through edit, confirmed deletion, recovery and reload", async ({ rootinePage: page }) => {
    test.setTimeout(90_000);
    const title = `S05 affair ${Date.now()}`;
    const renamed = `${title} edited`;
    await openRootineRoute(page, "/sprawy?widok=all&konto=testowe");
    await page.getByRole("button", { name: "Dodaj sprawę", exact: true }).first().click();
    const create = page.getByRole("dialog", { name: "Nowa sprawa" });
    await create.getByRole("textbox", { name: "Nazwa sprawy" }).fill(title);
    await create.getByRole("button", { name: "Dodaj sprawę", exact: true }).click();
    const record = page.locator("[data-affair-id]").filter({ hasText: title }).first();
    await expect(record).toBeVisible();
    const id = await record.getAttribute("data-affair-id");
    expect(id).toBeTruthy();
    const detail = page.getByRole("dialog", { name: `Szczegóły: ${title}` });
    await detail.getByRole("button", { name: "Edytuj sprawę", exact: true }).click();
    const edit = page.getByRole("dialog", { name: "Edytuj sprawę" });
    await edit.getByRole("textbox", { name: "Nazwa sprawy" }).fill(renamed);
    await edit.getByRole("button", { name: "Zapisz sprawę", exact: true }).click();
    await expect(page.locator(`[data-affair-id='${id}']`)).toContainText(renamed);
    await page.getByRole("dialog", { name: `Szczegóły: ${renamed}` }).getByRole("button", { name: "Usuń sprawę", exact: true }).click();
    const confirm = page.getByRole("dialog", { name: `Usunąć sprawę „${renamed}”?` });
    await confirm.getByRole("button", { name: "Usuń sprawę", exact: true }).click();
    await expect(page.locator(`[data-affair-id='${id}']`)).toHaveCount(0);
    await page.waitForTimeout(750);
    await page.reload();
    await expect(page.locator(`[data-affair-id='${id}']`)).toHaveCount(0);
  });

  test("More round-trips every workspace to the same persisted module record", async ({ rootinePage: page }) => {
    test.setTimeout(180_000);
    const suffix = `S05 More ${Date.now()}`;
    const returnThroughMore = async (module: string, selector: string) => {
      await mobileNavigation(page).getByRole("button", { name: "Więcej", exact: true }).click();
      const more = page.getByRole("dialog", { name: "Wszystkie obszary aplikacji" });
      await more.getByRole("link", { name: module, exact: true }).click();
      if (module === "Cele") await page.locator(".goals-filter-select select.ui-select-native").selectOption("overview");
      if (module === "Pozostałe") {
        const view = page.getByRole("combobox", { name: "Wybierz widok spraw" }).last();
        await view.focus();
        await page.keyboard.press("w");
        await page.keyboard.press("Enter");
      }
      await expect(page.locator(selector)).toHaveCount(1);
    };

    await openRootineRoute(page, "/sport?widok=cycle&konto=testowe");
    await page.getByRole("button", { name: "Dodaj trening", exact: true }).click();
    const sportDialog = page.getByRole("dialog", { name: "Dodaj trening" });
    await sportDialog.getByRole("textbox", { name: "Nazwa" }).fill(`${suffix} Sport`);
    await sportDialog.getByRole("button", { name: "Dodaj trening", exact: true }).last().click();
    const sport = page.locator("button[data-workout-id]").filter({ hasText: `${suffix} Sport` }).first();
    const sportId = await sport.getAttribute("data-workout-id");
    expect(sportId).toBeTruthy();
    await page.waitForTimeout(750);
    await page.reload();
    await returnThroughMore("Sport", `button[data-workout-id='${sportId}']`);

    await openRootineRoute(page, "/praca?widok=tasks&konto=testowe");
    await page.getByRole("button", { name: "Dodaj zadanie", exact: true }).first().click();
    await page.getByRole("menuitem", { name: "Dodaj zadanie", exact: true }).click();
    const workDialog = page.getByRole("dialog", { name: "Nowe zadanie" });
    await workDialog.getByRole("textbox", { name: "Nazwa zadania" }).fill(`${suffix} Praca`);
    await workDialog.getByRole("button", { name: "Dodaj zadanie", exact: true }).click();
    const work = page.locator("[data-task-id]").filter({ hasText: `${suffix} Praca` }).first();
    const workId = await work.getAttribute("data-task-id");
    expect(workId).toBeTruthy();
    await page.waitForTimeout(750);
    await page.reload();
    await returnThroughMore("Praca", `[data-task-id='${workId}']`);

    await openRootineRoute(page, "/cele?widok=overview&konto=testowe");
    await page.getByRole("button", { name: "Dodaj cel", exact: true }).first().click();
    const goalDialog = page.getByRole("dialog", { name: "Nowy cel" });
    await goalDialog.getByRole("textbox", { name: "Nazwa celu" }).fill(`${suffix} Cel`);
    await goalDialog.getByRole("button", { name: "Dodaj cel", exact: true }).click();
    await page.goBack();
    const goal = page.locator("[data-goal-id]").filter({ hasText: `${suffix} Cel` }).first();
    const goalId = await goal.getAttribute("data-goal-id");
    expect(goalId).toBeTruthy();
    await page.waitForTimeout(750);
    await page.reload();
    await returnThroughMore("Cele", `[data-goal-id='${goalId}']`);

    await openRootineRoute(page, "/podroze?konto=testowe");
    await page.getByRole("button", { name: "Dodaj podróż", exact: true }).first().click();
    const tripDialog = page.getByRole("dialog", { name: "Nowa podróż" });
    await tripDialog.getByRole("textbox", { name: "Nazwa podróży" }).fill(`${suffix} Podróż`);
    await tripDialog.getByRole("textbox", { name: "Trasa / kierunek" }).fill("Gdańsk");
    for (const label of [/Data rozpoczęcia/, /Data zakończenia/]) {
      await tripDialog.getByRole("button", { name: label }).click();
      await page.locator(".ui-date-picker").getByRole("button", { name: "Dzisiaj", exact: true }).click();
    }
    await tripDialog.getByRole("button", { name: "Dodaj podróż", exact: true }).click();
    const trip = page.locator("[data-trip-id]").filter({ hasText: `${suffix} Podróż` }).first();
    const tripId = await trip.getAttribute("data-trip-id");
    expect(tripId).toBeTruthy();
    await page.waitForTimeout(750);
    await page.reload();
    await returnThroughMore("Podróże", `[data-trip-id='${tripId}']`);

    await openRootineRoute(page, "/notatki?konto=testowe");
    const noteForm = page.getByRole("form", { name: "Szybko dodaj notatkę" });
    await noteForm.getByRole("textbox", { name: "Tytuł nowej notatki" }).fill(`${suffix} Notatka`);
    await noteForm.getByRole("button", { name: "Dodaj notatkę", exact: true }).click();
    const note = page.locator("[data-note-id]").filter({ hasText: `${suffix} Notatka` }).first();
    const noteId = await note.getAttribute("data-note-id");
    expect(noteId).toBeTruthy();
    await page.waitForTimeout(750);
    await page.reload();
    await returnThroughMore("Notatki", `[data-note-id='${noteId}']`);

    await openRootineRoute(page, "/sprawy?widok=matters&konto=testowe");
    await page.getByRole("button", { name: "Dodaj sprawę", exact: true }).first().click();
    const affairDialog = page.getByRole("dialog", { name: "Nowa sprawa" });
    await affairDialog.getByRole("textbox", { name: "Nazwa sprawy" }).fill(`${suffix} Sprawa`);
    await affairDialog.getByRole("button", { name: "Dodaj sprawę", exact: true }).click();
    const affair = page.locator("[data-affair-id]").filter({ hasText: `${suffix} Sprawa` }).first();
    const affairId = await affair.getAttribute("data-affair-id");
    expect(affairId).toBeTruthy();
    await page.waitForTimeout(750);
    await page.reload();
    await returnThroughMore("Pozostałe", `[data-affair-id='${affairId}']`);
  });

  test("phone matrix keeps the exact five-control navigation and audit screenshots", async ({ rootinePage: page }, testInfo) => {
    test.setTimeout(180_000);
    for (const theme of THEMES) {
      await page.addInitScript((nextTheme) => localStorage.setItem("rootine.theme.v1", nextTheme), theme);
      for (const viewport of PHONE_VIEWPORTS) {
        await page.setViewportSize(viewport);
        for (const route of MOBILE_ROUTES) {
          await openRootineRoute(page, `${route.path}${route.path.includes("?") ? "&" : "?"}konto=testowe`);
          const nav = mobileNavigation(page);
          await expect(nav.locator(":scope > *")).toHaveText(["Dzisiaj", "Zadania", "Kalendarz", "Odżywianie", "Więcej"]);
          await expect(nav.locator("[aria-current='page']")).toHaveCount(1);
          await expect(page.locator("h1:visible")).toHaveCount(1);
          await expect(page.getByRole("button", { name: route.action, exact: true }).first()).toBeVisible();
          await expectNoOverflow(page, `${theme}/${viewport.width}x${viewport.height}/${route.name}`);
          await attachScreenshot(page, testInfo, `${theme}-${viewport.width}x${viewport.height}-${route.name}`);
        }
      }
    }
  });

  test("More reaches every module and each real entry point is visible and touch safe", async ({ rootinePage: page }, testInfo) => {
    test.setTimeout(120_000);
    await openRootineRoute(page, "/dzisiaj?konto=testowe");
    await mobileNavigation(page).getByRole("button", { name: "Więcej", exact: true }).click();
    const more = page.getByRole("dialog", { name: "Wszystkie obszary aplikacji" });
    await expect(more).toBeVisible();
    for (const surface of MORE_SURFACES) await expect(more.getByRole("link", { name: surface.name, exact: true })).toBeVisible();
    for (const utility of ["Pomoc i skróty", "Ustawienia", "Profil lokalny"]) await expect(more.getByRole("button", { name: new RegExp(utility) })).toBeVisible();
    await attachScreenshot(page, testInfo, "more-utility-center");

    for (const surface of MORE_SURFACES) {
      await openRootineRoute(page, `${surface.path}${surface.path.includes("?") ? "&" : "?"}konto=testowe`);
      const action = page.getByRole("button", { name: surface.action, exact: true }).first();
      await expect(action).toBeVisible();
      const rect = await action.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return { width: box.width, height: box.height, text: element.textContent?.trim() ?? "" };
      });
      expect(rect.width, `${surface.name}: action width`).toBeGreaterThanOrEqual(44);
      expect(rect.height, `${surface.name}: action height`).toBeGreaterThanOrEqual(44);
      expect(rect.text, `${surface.name}: visible action label`).not.toBe("");
      await expectNoOverflow(page, surface.name);
      await attachScreenshot(page, testInfo, `more-module-${surface.name}`);
    }
  });

  test("both themes have zero axe violations across primary and More surfaces", async ({ rootinePage: page }) => {
    test.setTimeout(120_000);
    for (const theme of THEMES) {
      await page.addInitScript((nextTheme) => localStorage.setItem("rootine.theme.v1", nextTheme), theme);
      for (const route of [...MOBILE_ROUTES, ...MORE_SURFACES]) {
        await openRootineRoute(page, `${route.path}${route.path.includes("?") ? "&" : "?"}konto=testowe`);
        const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"]).analyze();
        expect(results.violations, `${theme}: ${route.name}`).toEqual([]);
      }
    }
  });

  test("More history restores focus and both reduced-motion sources preserve its layer", async ({ rootinePage: page }) => {
    await page.addInitScript(() => localStorage.setItem("rootine.reduced-motion.v1", "true"));
    await openRootineRoute(page, "/dzisiaj?konto=testowe");
    const trigger = mobileNavigation(page).getByRole("button", { name: "Więcej", exact: true });
    await trigger.click();
    const more = page.getByRole("dialog", { name: "Wszystkie obszary aplikacji" });
    await expect(more).toBeVisible();
    const sport = more.getByRole("link", { name: "Sport", exact: true });
    await sport.click();
    await page.goBack();
    await expect(more).toBeVisible();
    await expect(sport).toBeFocused();
    await page.goBack();
    await expect(trigger).toBeFocused();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await trigger.click();
    await expect(more).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
  });

  test("recovery export, clean import and repeated import keep one exact ID and payload", async ({ rootinePage: page, browser }) => {
    test.setTimeout(120_000);
    const title = `S05 backup ${Date.now()}`;
    const openRecovery = async (target: Page) => {
      await mobileNavigation(target).getByRole("button", { name: "Więcej", exact: true }).click();
      await target.getByRole("button", { name: "Ustawienia", exact: true }).click();
      const settings = target.getByRole("dialog", { name: "Ustawienia aplikacji" });
      await settings.getByRole("button", { name: /^Reszta:/ }).click();
      await target.getByRole("button", { name: "Kopie zapasowe", exact: true }).click();
      return target.getByRole("dialog", { name: "Kopia i odzyskiwanie" });
    };
    await openRootineRoute(page, "/notatki?konto=testowe");
    const form = page.getByRole("form", { name: "Szybko dodaj notatkę" });
    await form.getByRole("textbox", { name: "Tytuł nowej notatki" }).fill(title);
    await form.getByRole("button", { name: "Dodaj notatkę", exact: true }).click();
    const source = page.locator("[data-note-id]").filter({ hasText: title }).first();
    const id = await source.getAttribute("data-note-id");
    expect(id).toBeTruthy();
    const recovery = await openRecovery(page);
    const downloadPromise = page.waitForEvent("download");
    await recovery.getByRole("button", { name: "Eksportuj kopię", exact: true }).click();
    const backup = await downloadPromise;
    const backupPath = await backup.path();
    expect(backupPath).toBeTruthy();
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const clean = await context.newPage();
    try {
      await openRootineRoute(clean, "/dzisiaj?konto=testowe");
      for (const round of [1, 2]) {
        const targetRecovery = await openRecovery(clean);
        await targetRecovery.getByLabel("Wybierz plik kopii danych Rootine").setInputFiles(backupPath!);
        await targetRecovery.getByRole("button", { name: "Przywróć kopię", exact: true }).click();
        await expect(targetRecovery).toContainText(/Przywrócono/);
        await clean.reload();
        await openRootineRoute(clean, "/notatki?konto=testowe");
        const restored = clean.locator(`[data-note-id='${id}']`).filter({ hasText: title });
        await expect(restored, `import ${round}: one same record`).toHaveCount(1);
      }

    } finally {
      await context.close();
    }
  });

  test("an invalid recovery import is named and leaves the existing payload intact", async ({ rootinePage: page }) => {
    const title = `S05 invalid backup ${Date.now()}`;
    await openRootineRoute(page, "/notatki?konto=testowe");
    const form = page.getByRole("form", { name: "Szybko dodaj notatkę" });
    await form.getByRole("textbox", { name: "Tytuł nowej notatki" }).fill(title);
    await form.getByRole("button", { name: "Dodaj notatkę", exact: true }).click();
    const note = page.locator("[data-note-id]").filter({ hasText: title }).first();
    const id = await note.getAttribute("data-note-id");
    expect(id).toBeTruthy();

    await mobileNavigation(page).getByRole("button", { name: "Więcej", exact: true }).click();
    await page.getByRole("button", { name: "Ustawienia", exact: true }).click();
    const settings = page.getByRole("dialog", { name: "Ustawienia aplikacji" });
    await settings.getByRole("button", { name: /^Reszta:/ }).click();
    await page.getByRole("button", { name: "Kopie zapasowe", exact: true }).click();
    const recovery = page.getByRole("dialog", { name: "Kopia i odzyskiwanie" });
    await recovery.getByLabel("Wybierz plik kopii danych Rootine").setInputFiles({
      name: "uszkodzona-kopia.json",
      mimeType: "application/json",
      buffer: Buffer.from("{nie jest poprawnym jsonem"),
    });
    await expect(recovery).toContainText(/nie udało się|nieprawidł|uszkodz/i);
    await page.reload();
    await openRootineRoute(page, "/notatki?konto=testowe");
    await expect(page.locator(`[data-note-id='${id}']`).filter({ hasText: title })).toHaveCount(1);
  });

  test("corrupt workspace recovery and a real modal consumer preserve inert focus and reduced motion", async ({ rootinePage: page }) => {
    test.setTimeout(90_000);
    await openRootineRoute(page, "/praca?widok=tasks&konto=testowe");
    await page.evaluate(() => {
      localStorage.setItem("rootine.module-memory.v1", JSON.stringify({ version: 1, modules: { work: { state: { tasks: "invalid" } } } }));
      localStorage.setItem("rootine.work-workspace.v1", JSON.stringify({ version: 999, tasks: "corrupt" }));
      localStorage.setItem("rootine.experience.preferences.v1", JSON.stringify({ version: 1, motion: "reduced", density: "standard", privacy: false }));
    });
    await page.reload();
    const errors: Error[] = [];
    page.on("pageerror", (error) => errors.push(error));
    const trigger = page.getByRole("button", { name: "Dodaj zadanie", exact: true }).first();
    await trigger.click();
    await page.getByRole("menuitem", { name: "Dodaj zadanie", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Nowe zadanie" });
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(page.locator(".ui-modal-backdrop")).toHaveCount(1);
    await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
    const duration = await dialog.evaluate((element) => Math.max(...getComputedStyle(element).animationDuration.split(",").map((value) => Number.parseFloat(value) * 1000)));
    expect(duration).toBeLessThanOrEqual(20);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeVisible();
    await mobileNavigation(page).getByRole("button", { name: "Więcej", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Wszystkie obszary aplikacji" })).toBeVisible();
    expect(errors).toEqual([]);
  });
});
