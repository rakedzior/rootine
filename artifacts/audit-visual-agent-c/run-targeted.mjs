import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const baseURL = "http://127.0.0.1:4174";
const outputDir = path.resolve("artifacts/audit-visual-agent-c");
const auditNow = new Date("2026-08-10T08:00:00.000Z");
const report = { generatedAt: new Date().toISOString(), detailPanels: [], goalModals: [], breakpoints: [], skipLink: null, notesEditor: null, affairsBudget: [] };

async function installNetworkStubs(page) {
  await page.route("https://api.open-meteo.com/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      current: { temperature_2m: 19, weather_code: 1 },
      daily: {
        temperature_2m_min: [12],
        temperature_2m_max: [23],
        precipitation_probability_max: [15],
        weather_code: [1],
      },
    }),
  }));
  await page.route("https://fonts.googleapis.com/**", (route) => route.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("https://fonts.gstatic.com/**", (route) => route.abort("blockedbyclient"));
  await page.route("**/api/openfoodfacts/search**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ hits: [] }),
  }));
}

async function makePage(browser, profile) {
  const context = await browser.newContext({
    viewport: { width: profile.width, height: profile.height },
    deviceScaleFactor: profile.deviceScaleFactor ?? 1,
    colorScheme: "dark",
    locale: "pl-PL",
    timezoneId: "Europe/Warsaw",
  });
  const page = await context.newPage();
  await page.clock.install({ time: auditNow });
  await installNetworkStubs(page);
  return { context, page };
}

async function settle(page, routePath) {
  await page.goto(`${baseURL}${routePath}`, { waitUntil: "domcontentloaded", timeout: 20_000 });
  await page.locator(".ui-page-shell:visible").first().waitFor({ state: "visible", timeout: 15_000 });
  await page.waitForFunction(() => !document.querySelector(".app-route-state"), null, { timeout: 15_000 });
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.scrollingElement?.scrollTo(0, 0);
    for (const element of document.querySelectorAll(".ui-module-main, .ui-page-shell")) element.scrollTo(0, 0);
  });
  await page.waitForTimeout(250);
}

function round(value) {
  return value == null ? null : Math.round(value * 100) / 100;
}

function box(boxValue) {
  if (!boxValue) return null;
  return { x: round(boxValue.x), y: round(boxValue.y), width: round(boxValue.width), height: round(boxValue.height) };
}

async function screenshot(page, name) {
  const file = `${name}.png`;
  await page.screenshot({ path: path.join(outputDir, file), fullPage: false, animations: "disabled" });
  return file;
}

async function detailPanelMatrix(browser) {
  const profiles = [
    { id: "1366x768", width: 1366, height: 768 },
    { id: "1440x900", width: 1440, height: 900 },
    { id: "1920x1080", width: 1920, height: 1080 },
    { id: "2560x1440", width: 2560, height: 1440 },
    { id: "zoom-125", width: 1536, height: 864, deviceScaleFactor: 1.25 },
    { id: "zoom-150", width: 1280, height: 720, deviceScaleFactor: 1.5 },
  ];

  for (const profile of profiles) {
    const { context, page } = await makePage(browser, profile);
    await settle(page, "/zadania?widok=dzis");
    const firstTask = page.locator(".task-item-row").first();
    await firstTask.click();
    const panel = page.locator(".task-detail-panel");
    await panel.waitFor({ state: "visible" });
    await page.waitForTimeout(180);
    const measurements = await page.evaluate(() => {
      const rect = (selector) => {
        const element = document.querySelector(selector);
        if (!(element instanceof HTMLElement)) return null;
        const value = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          x: value.x,
          y: value.y,
          width: value.width,
          height: value.height,
          right: value.right,
          bottom: value.bottom,
          position: style.position,
          zIndex: style.zIndex,
          overflowX: style.overflowX,
          overflowY: style.overflowY,
        };
      };
      const detail = document.querySelector(".task-detail-panel");
      const main = document.querySelector(".ui-module-main");
      const detailRect = detail?.getBoundingClientRect();
      const mainRect = main?.getBoundingClientRect();
      return {
        viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
        detail: rect(".task-detail-panel"),
        moduleMain: rect(".ui-module-main"),
        pageShell: rect(".ui-page-shell"),
        moduleShell: rect(".ui-module-shell"),
        overlapsMain: Boolean(detailRect && mainRect && detailRect.left < mainRect.right && detailRect.right > mainRect.left),
        bodyScroll: { x: scrollX, y: scrollY, scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth },
      };
    });
    report.detailPanels.push({ profile, ...measurements, screenshot: await screenshot(page, `targeted-${profile.id}__task-detail`) });
    await context.close();
  }
}

async function openGoalEditor(page) {
  await settle(page, "/cele?widok=overview");
  const trigger = page.locator(".goal-card-more button").first();
  await trigger.click();
  const edit = page.getByRole("menuitem", { name: "Edytuj cel" });
  await edit.click();
  const modal = page.locator(".ui-modal").last();
  await modal.waitFor({ state: "visible" });
  await page.waitForTimeout(180);
  return { trigger, modal };
}

async function modalMeasurements(page) {
  return page.evaluate(() => {
    const modal = document.querySelector(".ui-modal:last-of-type") ?? [...document.querySelectorAll(".ui-modal")].at(-1);
    const primary = [...(modal?.querySelectorAll("button") ?? [])].find((button) => button.textContent?.trim() === "Zapisz zmiany");
    const footer = primary?.parentElement;
    const modalRect = modal?.getBoundingClientRect();
    const footerRect = footer?.getBoundingClientRect();
    const primaryRect = primary?.getBoundingClientRect();
    const style = modal ? getComputedStyle(modal) : null;
    const visibility = (rect) => rect ? {
      top: rect.top,
      bottom: rect.bottom,
      height: rect.height,
      visibleTop: Math.max(0, rect.top),
      visibleBottom: Math.min(innerHeight, rect.bottom),
      visibleHeight: Math.max(0, Math.min(innerHeight, rect.bottom) - Math.max(0, rect.top)),
      fullyInViewport: rect.top >= 0 && rect.bottom <= innerHeight,
      fullyInsideModal: Boolean(modalRect && rect.top >= modalRect.top && rect.bottom <= modalRect.bottom),
    } : null;
    return {
      viewport: { width: innerWidth, height: innerHeight },
      modal: modalRect ? { x: modalRect.x, y: modalRect.y, width: modalRect.width, height: modalRect.height } : null,
      clientHeight: modal?.clientHeight,
      scrollHeight: modal?.scrollHeight,
      scrollTop: modal?.scrollTop,
      scrollable: Boolean(modal && modal.scrollHeight > modal.clientHeight),
      overflowY: style?.overflowY,
      scrollbarWidthCss: style?.scrollbarWidth,
      offsetMinusClient: modal ? modal.offsetWidth - modal.clientWidth : null,
      footer: visibility(footerRect),
      primary: visibility(primaryRect),
      activeName: document.activeElement?.getAttribute("aria-label") || document.activeElement?.textContent?.trim() || "",
    };
  });
}

async function goalModalChecks(browser) {
  for (const profile of [{ id: "1366x768", width: 1366, height: 768 }, { id: "1440x900", width: 1440, height: 900 }]) {
    const { context, page } = await makePage(browser, profile);
    const { trigger, modal } = await openGoalEditor(page);
    const initial = await modalMeasurements(page);
    const initialScreenshot = await screenshot(page, `targeted-${profile.id}__goal-edit-initial`);
    const beforeWheel = await modal.evaluate((element) => element.scrollTop);
    const modalBox = await modal.boundingBox();
    if (modalBox) await page.mouse.move(modalBox.x + modalBox.width - 10, modalBox.y + modalBox.height / 2);
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(120);
    const afterWheel = await modalMeasurements(page);
    await modal.evaluate((element) => { element.scrollTop = 0; });
    const primary = page.getByRole("button", { name: "Zapisz zmiany" });
    await primary.focus();
    await page.waitForTimeout(120);
    const afterPrimaryFocus = await modalMeasurements(page);
    const focusedScreenshot = await screenshot(page, `targeted-${profile.id}__goal-edit-primary-focused`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
    const escaped = !(await modal.isVisible().catch(() => false));
    const returnedToTrigger = await trigger.evaluate((element) => element === document.activeElement).catch(() => false);
    const activeAfterEscape = await page.evaluate(() => ({
      tag: document.activeElement?.tagName ?? null,
      text: document.activeElement?.textContent?.trim().replace(/\s+/g, " ").slice(0, 120) ?? "",
      ariaLabel: document.activeElement?.getAttribute("aria-label") ?? "",
      connected: document.activeElement?.isConnected ?? false,
    }));
    report.goalModals.push({ profile, initial, initialScreenshot, beforeWheel, afterWheel, afterPrimaryFocus, focusedScreenshot, escaped, returnedToTrigger, activeAfterEscape });
    await context.close();
  }
}

async function breakpointChecks(browser) {
  const widths = [1379, 1381, 1179, 1181, 979, 981, 759, 761];
  for (const width of widths) {
    const profile = { id: `${width}x900`, width, height: 900 };
    const { context, page } = await makePage(browser, profile);
    await settle(page, "/zadania?widok=dzis");
    const row = page.locator(".task-item-row").first();
    if (await row.count()) await row.click();
    const panel = page.locator(".task-detail-panel");
    await panel.waitFor({ state: "visible" });
    await page.waitForTimeout(180);
    const state = await page.evaluate(() => {
      const info = (selector) => {
        const element = document.querySelector(selector);
        if (!(element instanceof HTMLElement)) return null;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          displayed: style.display !== "none",
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          position: style.position,
          zIndex: style.zIndex,
          paddingLeft: style.paddingLeft,
          paddingRight: style.paddingRight,
          gridTemplateColumns: style.gridTemplateColumns,
        };
      };
      const detail = document.querySelector(".task-detail-panel");
      return {
        viewport: { width: innerWidth, height: innerHeight },
        primarySidebar: info("#primary-sidebar"),
        moduleBody: info(".ui-module-shell__body"),
        contextSidebar: info(".ui-context-sidebar"),
        mobileNavigation: info(".ui-content-header__mobile-nav"),
        mainContent: info(".ui-main-content"),
        pageShell: info(".ui-page-shell"),
        detailPanel: info(".task-detail-panel"),
        detailRole: detail?.getAttribute("role") ?? null,
        detailAriaModal: detail?.getAttribute("aria-modal") ?? null,
        managedDrawer: detail?.getAttribute("data-drawer-managed") ?? null,
        backdropDisplayed: (() => {
          const backdrop = document.querySelector(".ui-detail-panel-backdrop");
          return backdrop instanceof HTMLElement && getComputedStyle(backdrop).display !== "none";
        })(),
        focusedInsideDetail: Boolean(detail?.contains(document.activeElement)),
        taskContextDisplayed: (() => {
          const element = document.querySelector(".task-row__context");
          return element instanceof HTMLElement && getComputedStyle(element).display !== "none";
        })(),
        taskPriorityDisplayed: (() => {
          const element = document.querySelector(".task-row__priority");
          return element instanceof HTMLElement && getComputedStyle(element).display !== "none";
        })(),
        documentOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    const shouldShoot = [1379, 1381, 759, 761].includes(width);
    report.breakpoints.push({ width, desktopScopeNote: width <= 761 ? "outside requested desktop viewport range; breakpoint probe only" : null, ...state, screenshot: shouldShoot ? await screenshot(page, `targeted-breakpoint-${width}__task-detail`) : null });
    await context.close();
  }
}

async function skipLinkCheck(browser) {
  const { context, page } = await makePage(browser, { id: "1440x900", width: 1440, height: 900 });
  await settle(page, "/dzisiaj");
  await page.keyboard.press("Tab");
  const link = page.locator(".app-skip-link");
  const measure = () => link.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      active: element === document.activeElement,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      transform: style.transform,
      transitionDuration: style.transitionDuration,
    };
  });
  const immediate = await measure();
  await page.waitForTimeout(250);
  const settled = await measure();
  const screenshotName = await screenshot(page, "targeted-1440x900__skip-link-focus");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(80);
  const targetFocused = await page.locator("#primary-workspace").evaluate((element) => element === document.activeElement).catch(() => false);
  report.skipLink = { immediate, settled, targetFocused, screenshot: screenshotName };
  await context.close();
}

async function notesEditorCheck(browser) {
  const { context, page } = await makePage(browser, { id: "1440x900", width: 1440, height: 900 });
  await settle(page, "/notatki");
  const candidates = await page.getByRole("button").evaluateAll((buttons) => buttons.map((button) => ({ text: button.textContent?.trim() || "", ariaLabel: button.getAttribute("aria-label") || "" })).filter((item) => /notatk/i.test(`${item.text} ${item.ariaLabel}`)));
  const add = page.getByRole("button", { name: "Dodaj notatkę", exact: true }).first();
  if (await add.count()) {
    await add.click();
    const editor = page.locator(".notes-editor").last();
    if (await editor.isVisible().catch(() => false)) {
      report.notesEditor = {
        candidates,
        box: box(await editor.boundingBox()),
        role: await editor.getAttribute("role"),
        ariaModal: await editor.getAttribute("aria-modal"),
        screenshot: await screenshot(page, "targeted-1440x900__notes-editor"),
      };
      await page.keyboard.press("Escape");
    } else report.notesEditor = { candidates, error: "Editor did not become visible" };
  } else report.notesEditor = { candidates, error: "Add note button was not found" };
  await context.close();
}

async function affairsBudgetResetCheck(browser) {
  for (const profile of [
    { id: "zoom-125", width: 1536, height: 864, deviceScaleFactor: 1.25 },
    { id: "zoom-150", width: 1280, height: 720, deviceScaleFactor: 1.5 },
  ]) {
    const { context, page } = await makePage(browser, profile);
    await settle(page, "/sprawy?widok=budget");
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      document.scrollingElement?.scrollTo(0, 0);
      for (const element of document.querySelectorAll(".ui-module-main, .ui-page-shell")) element.scrollTo(0, 0);
    });
    await page.waitForTimeout(100);
    const scroll = await page.evaluate(() => ({ windowY: scrollY, documentY: document.scrollingElement?.scrollTop ?? null, moduleY: document.querySelector(".ui-module-main")?.scrollTop ?? null, pageShellY: document.querySelector(".ui-page-shell")?.scrollTop ?? null }));
    report.affairsBudget.push({ profile, scroll, screenshot: await screenshot(page, `targeted-${profile.id}__affairs-budget-scroll-reset`) });
    await context.close();
  }
}

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  await detailPanelMatrix(browser);
  await goalModalChecks(browser);
  await breakpointChecks(browser);
  await skipLinkCheck(browser);
  await notesEditorCheck(browser);
  await affairsBudgetResetCheck(browser);
} finally {
  await browser.close();
}

await fs.writeFile(path.join(outputDir, "targeted-data.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
