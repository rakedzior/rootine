import type { Locator, Page } from "@playwright/test";
import { expect, openRootineRoute, test } from "./fixtures";

type ComposerProfile = {
  route: string;
  formName: string;
  controlsName: string;
  inputName: string;
  firstPropertyName: RegExp;
  priorityPropertyName: RegExp;
  propertyMenuCount: number;
};

type FullEditorProfile = {
  route: string;
  dialogName: string;
  titleInputName: string;
  selectName: RegExp;
  timeExpected: boolean;
};

const QUICK_COMPOSERS: ComposerProfile[] = [
  {
    route: "/zadania?widok=dzis",
    formName: "Dodaj zadanie",
    controlsName: "Właściwości nowego zadania",
    inputName: "Nazwa nowego zadania",
    firstPropertyName: /Ustaw priorytet nowego zadania/,
    priorityPropertyName: /Ustaw priorytet nowego zadania/,
    propertyMenuCount: 2,
  },
  {
    route: "/praca",
    formName: "Szybkie dodawanie zadania do pracy",
    controlsName: "Właściwości nowego elementu",
    inputName: "Nazwa nowego zadania w pracy",
    firstPropertyName: /^Firma:/,
    priorityPropertyName: /^Priorytet:/,
    propertyMenuCount: 4,
  },
];

const FULL_EDITORS: FullEditorProfile[] = [
  {
    route: "/praca?akcja=nowe-zadanie&data=2026-08-06&godzina=09:00",
    dialogName: "Nowe zadanie",
    titleInputName: "Nazwa zadania",
    selectName: /^Status/,
    timeExpected: true,
  },
  {
    route: "/sprawy?akcja=nowa-sprawa&data=2026-08-06&godzina=09:00",
    dialogName: "Nowa sprawa",
    titleInputName: "Nazwa sprawy",
    selectName: /^Typ wpisu/,
    timeExpected: true,
  },
  {
    route: "/cele?akcja=nowy-cel&data=2026-08-31&priorytet=high",
    dialogName: "Nowy cel",
    titleInputName: "Nazwa celu",
    selectName: /^Priorytet/,
    timeExpected: false,
  },
];

async function tokenPixels(locator: Locator, token: string) {
  return locator.evaluate((element, tokenName) => ({
    actual: element.getBoundingClientRect().height,
    expected: Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(tokenName)),
  }), token);
}

async function expectTokenHeight(locator: Locator, token: string) {
  await expect(locator).toBeVisible();
  const height = await tokenPixels(locator, token);
  expect(height.expected, `${token} must resolve to a numeric CSS length`).toBeGreaterThan(0);
  expect(Math.abs(height.actual - height.expected), `${await locator.getAttribute("class")} must use ${token}`).toBeLessThanOrEqual(1);
}

async function expectEveryTokenHeight(locator: Locator, token: string) {
  const measurements = await locator.evaluateAll((elements, tokenName) => {
    const expected = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(tokenName));
    return elements.map((element) => ({
      classes: element.getAttribute("class"),
      actual: element.getBoundingClientRect().height,
      expected,
    }));
  }, token);

  expect(measurements.length, `${token}: expected at least one rendered control`).toBeGreaterThan(0);
  for (const measurement of measurements) {
    expect(measurement.expected, `${token} must resolve to a numeric CSS length`).toBeGreaterThan(0);
    expect(
      Math.abs(measurement.actual - measurement.expected),
      `${measurement.classes ?? "control"} must use ${token}`,
    ).toBeLessThanOrEqual(1);
  }
}

async function exerciseMenuKeyboard(page: Page, trigger: Locator, menuName: RegExp) {
  await trigger.focus();
  await page.keyboard.press("Enter");

  const menu = page.getByRole("menu", { name: menuName });
  await expect(menu).toBeVisible();
  await expect(menu).toHaveClass(/ui-menu--density-compact/);
  await expect(trigger).toHaveAttribute("aria-expanded", "true");

  // Property choices are single-select menuitemradio controls, while action
  // menus use menuitem. The shared Menu keyboard contract owns both roles.
  const items = menu.locator("[role^='menuitem']");
  expect(await items.count()).toBeGreaterThan(1);
  await expect(menu.locator(":focus")).toHaveCount(1);

  await page.keyboard.press("Home");
  await expect(items.first()).toBeFocused();
  await page.keyboard.press("End");
  await expect(items.last()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(items.first()).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
}

async function exerciseSelectKeyboard(page: Page, dialog: Locator, accessibleName: RegExp) {
  const trigger = dialog.getByRole("combobox", { name: accessibleName }).first();
  await expect(trigger).toHaveClass(/ui-select-trigger--standard/);
  await expectTokenHeight(trigger, "--control-height-md");
  await trigger.focus();
  await page.keyboard.press("ArrowDown");

  const listboxId = await trigger.getAttribute("aria-controls");
  expect(listboxId).toBeTruthy();
  const listbox = page.locator(`#${listboxId}`);
  await expect(listbox).toBeVisible();
  await expect(listbox).toHaveAttribute("role", "listbox");
  await expect(listbox).toHaveClass(/ui-select-menu--standard/);
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(trigger).toHaveAttribute("aria-activedescendant", /.+/);
  await expectEveryTokenHeight(listbox.getByRole("option"), "--component-option-height-standard");

  const firstActive = await trigger.getAttribute("aria-activedescendant");
  await page.keyboard.press("ArrowDown");
  const secondActive = await trigger.getAttribute("aria-activedescendant");
  expect(secondActive).not.toBe(firstActive);

  await page.keyboard.press("Escape");
  await expect(listbox).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
}

async function exercisePriorityIconGrammar(page: Page, dialog: Locator) {
  const trigger = dialog.getByRole("combobox", { name: /^Priorytet/ }).first();
  await expect(trigger.locator(".ui-priority-icon")).toHaveCount(1);
  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  const listboxId = await trigger.getAttribute("aria-controls");
  expect(listboxId).toBeTruthy();
  const options = page.locator(`#${listboxId}`).getByRole("option");
  // The listbox is mounted in a portal after the key handler returns.  Wait for
  // its second option rather than sampling the portal during that transition.
  await expect(options.nth(1)).toBeVisible();
  await expect(options.locator(".ui-priority-icon")).toHaveCount(await options.count());
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
}

async function exerciseDatePickerKeyboard(page: Page, dialog: Locator) {
  const trigger = dialog.locator(".ui-date-trigger--standard").first();
  await expectTokenHeight(trigger, "--control-height-md");
  await trigger.focus();
  await page.keyboard.press("Enter");

  const pickerId = await trigger.getAttribute("aria-controls");
  expect(pickerId).toBeTruthy();
  const picker = page.locator(`#${pickerId}`);
  await expect(picker).toBeVisible();
  await expect(picker).toHaveAttribute("role", "dialog");
  await expect(picker).toHaveAttribute("aria-modal", "false");
  await expect(picker).toHaveClass(/ui-date-picker--standard/);
  await expect(picker.getByRole("grid")).toBeVisible();
  await expect(picker.getByRole("gridcell").locator("button:focus")).toHaveCount(1);

  await page.keyboard.press("Escape");
  await expect(picker).toHaveCount(0);
  await expect(trigger).toBeFocused();
}

async function exerciseTimePickerKeyboard(page: Page, dialog: Locator) {
  const picker = dialog.locator(".ui-time-picker--standard").first();
  await expect(picker).toBeVisible();
  const input = picker.locator(".ui-time-picker__input");
  const trigger = picker.locator(".ui-time-picker__list-trigger");
  await expectTokenHeight(input, "--control-height-md");
  await expectTokenHeight(trigger, "--control-height-md");
  await expect(input).toBeEnabled();

  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  const listboxId = await trigger.getAttribute("aria-controls");
  expect(listboxId).toBeTruthy();
  const listbox = page.locator(`#${listboxId}`);
  await expect(listbox).toBeVisible();
  await expect(listbox).toHaveAttribute("role", "listbox");
  await expect(listbox).toHaveClass(/ui-time-picker__options--standard/);
  await expectEveryTokenHeight(listbox.getByRole("option"), "--component-option-height-standard");
  await expect(listbox.getByRole("option").first()).toBeFocused();

  await page.keyboard.press("End");
  await expect(listbox.getByRole("option").last()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(listbox).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
}

test.describe("cross-module creation primitives", { tag: "@shared" }, () => {
  test("Tasks and Work expose the same named QuickComposer and PropertyMenu contract", async ({ rootinePage: page, isMobile }) => {
    const editorFontSizes: string[] = [];
    const composerRadii: string[] = [];

    for (const profile of QUICK_COMPOSERS) {
      await openRootineRoute(page, profile.route);
      const form = page.getByRole("form", { name: profile.formName });
      await expect(form).toBeVisible();
      await expect(form).toHaveClass(/ui-quick-composer--compact/);
      await expect(form.getByRole("group", { name: profile.controlsName })).toBeVisible();
      const editor = form.getByRole("textbox", { name: profile.inputName });
      await expect(editor).toBeVisible();

      const sharedGeometry = await form.evaluate((element) => ({
        radius: getComputedStyle(element).borderRadius,
        editorFontSize: getComputedStyle(element.querySelector(".ui-quick-composer__editor input")!).fontSize,
      }));
      editorFontSizes.push(sharedGeometry.editorFontSize);
      composerRadii.push(sharedGeometry.radius);

      const propertyMenus = form.locator(".ui-property-menu");
      await expect(propertyMenus).toHaveCount(profile.propertyMenuCount);
      await expectEveryTokenHeight(
        propertyMenus.locator(".ui-property-menu__trigger"),
        isMobile ? "--component-option-height-touch" : "--control-height-sm",
      );
      for (let index = 0; index < profile.propertyMenuCount; index += 1) {
        await expect(propertyMenus.nth(index)).toHaveClass(/ui-property-menu--compact/);
        await expect(propertyMenus.nth(index).locator(".ui-property-menu__trigger"))
          .toHaveAttribute("aria-haspopup", "menu");
      }

      const firstProperty = form.getByRole("button", { name: profile.firstPropertyName });
      await exerciseMenuKeyboard(page, firstProperty, profile.firstPropertyName);

      const priorityProperty = form.getByRole("button", { name: profile.priorityPropertyName });
      await priorityProperty.click();
      const priorityMenu = page.getByRole("menu", { name: profile.priorityPropertyName });
      const priorityItems = priorityMenu.locator("[role='menuitemradio']");
      await expect(priorityItems.locator(".ui-priority-icon")).toHaveCount(await priorityItems.count());
      await page.keyboard.press("Escape");
    }

    expect(new Set(editorFontSizes).size, "both quick editors use one type token").toBe(1);
    expect(new Set(composerRadii).size, "both quick composers use one radius token").toBe(1);
  });

  test("the task scheduler composes canonical DatePicker and TimePicker primitives", async ({ rootinePage: page }) => {
    await openRootineRoute(page, "/zadania?widok=dzis");
    const trigger = page.getByRole("button", { name: "Ustaw termin nowego zadania" });
    await trigger.click();

    const scheduler = page.getByRole("dialog", { name: "Ustaw termin zadania" });
    await expect(scheduler).toBeVisible();
    await expect(scheduler).toHaveClass(/ui-anchored-popover/);
    await expect(scheduler.locator(".ui-date-picker--compact.ui-date-picker--inline")).toBeVisible();
    await expect(scheduler.locator(".ui-date-picker").getByRole("grid")).toBeVisible();

    const timeRow = scheduler.getByRole("button", { name: /^Czas/ });
    await timeRow.click();
    const timeLayer = page.getByRole("dialog", { name: "Wybierz godzinę", exact: true });
    await expect(timeLayer).toBeVisible();
    await expect(timeLayer).toHaveClass(/ui-anchored-popover/);
    await expect(timeLayer.locator(".ui-time-picker--compact")).toBeVisible();
    const timeOptions = timeLayer.getByRole("listbox", { name: /Dostępne godziny/ });
    await expect(timeOptions).toHaveClass(/ui-time-picker__options--inline/);
    await expectEveryTokenHeight(timeOptions.getByRole("option"), "--component-option-height-compact");

    await page.keyboard.press("Escape");
    await expect(timeLayer).toHaveCount(0);
    await expect(timeRow).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(scheduler).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("the Work quick composer keeps optional time inside the date picker", async ({ rootinePage: page, isMobile }) => {
    await openRootineRoute(page, "/praca");
    const form = page.getByRole("form", { name: "Szybkie dodawanie zadania do pracy" });
    const dateTrigger = form.locator(".ui-date-trigger--compact");

    await expect(dateTrigger).toHaveAttribute("aria-haspopup", "dialog");
    await expect(form.locator(".ui-time-picker--compact")).toHaveCount(0);
    await expect(form.getByText("Dodaj zadanie", { exact: true })).toHaveCount(0);
    const expectedHeight = isMobile ? "--component-option-height-touch" : "--control-height-sm";
    await expectTokenHeight(dateTrigger, expectedHeight);
    await expect(dateTrigger).toContainText("Dziś");
    await dateTrigger.click();

    const datePicker = page.getByRole("dialog", { name: /Termin zadania/ });
    const timePicker = datePicker.locator(".ui-time-picker--compact");
    await expect(datePicker).toBeVisible();
    await expect(datePicker.getByText(/Godzina/)).toBeVisible();
    await expect(datePicker.getByText("opcjonalnie", { exact: true })).toHaveCount(0);
    await expectTokenHeight(datePicker.locator(".ui-time-picker__input"), expectedHeight);
    await expect(timePicker.locator(".ui-time-picker__list-trigger")).toHaveCount(0);
  });
});

test.describe("cross-module full creation editors", { tag: "@shared" }, () => {
  test("Command Center maps an important Affair to the binary high-priority scale", async ({ rootinePage: page }) => {
    await openRootineRoute(page, "/dzisiaj");
    await page.getByRole("button", { name: "Dodaj do dzisiejszego planu" }).click();

    const commandCenter = page.getByRole("dialog", { name: "Dodaj" });
    const quickInput = commandCenter.getByRole("textbox", { name: "Szybkie dodawanie" });
    await quickInput.press("ArrowUp");
    await expect(commandCenter.getByRole("button", { name: /^Wydatek/ })).toBeFocused();
    await page.keyboard.press("/");
    await expect(quickInput).toBeFocused();
    await quickInput.fill("Sprawa w urzędzie jutro ważne");
    await expect(commandCenter).toContainText("wysoki priorytet");
    await commandCenter.getByRole("button", { name: "Otwórz: Sprawa" }).click();

    const affairDialog = page.getByRole("dialog", { name: "Nowa sprawa" });
    await expect(affairDialog).toBeVisible();
    await expect(affairDialog.getByRole("combobox", { name: /^Priorytet Ważny$/ })).toBeVisible();
  });

  test("Work, Affairs and Goals use the standard Select and DatePicker contract", async ({ rootinePage: page }) => {
    const fieldHeights: number[] = [];

    for (const profile of FULL_EDITORS) {
      await openRootineRoute(page, profile.route);
      const dialog = page.getByRole("dialog", { name: profile.dialogName });
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveClass(/ui-modal/);
      await expect(dialog).toHaveAttribute("aria-modal", "true");
      await expect(dialog.getByRole("textbox", { name: profile.titleInputName })).toBeFocused();

      await expectEveryTokenHeight(dialog.locator(".ui-select-trigger--standard"), "--control-height-md");
      await expectEveryTokenHeight(dialog.locator(".ui-date-trigger--standard"), "--control-height-md");
      await exerciseSelectKeyboard(page, dialog, profile.selectName);
      await exercisePriorityIconGrammar(page, dialog);
      await exerciseDatePickerKeyboard(page, dialog);

      const representative = await tokenPixels(dialog.locator(".ui-date-trigger--standard").first(), "--control-height-md");
      fieldHeights.push(representative.actual);

      if (profile.timeExpected) {
        await exerciseTimePickerKeyboard(page, dialog);
      } else {
        await expect(dialog.locator(".ui-time-picker")).toHaveCount(0);
      }

      await dialog.getByRole("button", { name: "Zamknij", exact: true }).click();
      await expect(dialog).toHaveCount(0);
    }

    expect(new Set(fieldHeights.map((height) => Math.round(height))).size, "all full forms use one control height").toBe(1);
  });
});

test.describe("cross-module destructive confirmation", { tag: "@shared" }, () => {
  test("ConfirmDialog keeps one role, action order, tone and geometry", async ({ rootinePage: page }) => {
    const dialogGeometry: Array<{ maxWidth: string; radius: string }> = [];

    await openRootineRoute(page, "/praca");
    await page.getByRole("button", { name: /Otwórz szczegóły zadania/ }).first().click();
    const workDelete = page.locator(".work-detail-panel").getByRole("button", { name: "Usuń", exact: true });
    await workDelete.click();
    const workConfirm = page.getByRole("dialog", { name: /^Usunąć zadanie/ });
    await assertConfirmationContract(workConfirm);
    dialogGeometry.push(await confirmationGeometry(workConfirm));
    expect(await workConfirm.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(workConfirm).toHaveCount(0);
    await expect(workDelete).toBeFocused();

    await openRootineRoute(page, "/cele?widok=overview");
    const goalMenuTrigger = page.locator(".goal-card-more button").first();
    await goalMenuTrigger.click();
    const goalMenu = page.getByRole("menu").last();
    await goalMenu.getByRole("menuitem", { name: "Usuń", exact: true }).click();
    const goalConfirm = page.getByRole("dialog", { name: /^Usunąć cel/ });
    await assertConfirmationContract(goalConfirm);
    dialogGeometry.push(await confirmationGeometry(goalConfirm));
    await goalConfirm.getByRole("button", { name: "Anuluj", exact: true }).click();
    await expect(goalConfirm).toHaveCount(0);

    expect(dialogGeometry[1]).toEqual(dialogGeometry[0]);
  });
});

async function confirmationGeometry(dialog: Locator) {
  return dialog.evaluate((element) => {
    const style = getComputedStyle(element);
    return { maxWidth: style.maxWidth, radius: style.borderRadius };
  });
}

async function assertConfirmationContract(dialog: Locator) {
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveClass(/ui-modal/);
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(dialog.locator(".ui-modal__eyebrow")).toHaveText("Potwierdzenie");

  const actions = dialog.locator(".ui-modal__footer .ui-button");
  await expect(actions).toHaveCount(2);
  await expect(actions.first()).toHaveText("Anuluj");
  await expect(actions.first()).toHaveClass(/ui-button--ghost/);
  await expect(actions.last()).toHaveClass(/ui-button--danger/);
}
