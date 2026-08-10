import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs/promises";
import path from "node:path";

const baseURL = "http://127.0.0.1:4174";
const outputDir = path.resolve("artifacts/audit-visual-agent-c");
const auditNow = new Date("2026-08-10T08:00:00.000Z");

const fullMatrix = [
  { id: "today", path: "/dzisiaj", group: "Dzisiaj" },
  { id: "tasks-today", path: "/zadania?widok=dzis", group: "Zadania" },
  { id: "tasks-tomorrow", path: "/zadania?widok=jutro", group: "Zadania" },
  { id: "tasks-7-days", path: "/zadania?widok=7dni", group: "Zadania" },
  { id: "tasks-30-days", path: "/zadania?widok=30dni", group: "Zadania" },
  { id: "tasks-unscheduled", path: "/zadania?widok=bezterminu", group: "Zadania" },
  { id: "tasks-all", path: "/zadania?widok=wszystkie", group: "Zadania" },
  { id: "tasks-habits", path: "/zadania?widok=nawyki", group: "Zadania" },
  { id: "tasks-summary", path: "/zadania?widok=podsumowanie", group: "Zadania" },
  { id: "tasks-completed", path: "/zadania?widok=ukonczone", group: "Zadania" },
  { id: "tasks-trash", path: "/zadania?widok=kosz", group: "Zadania" },
  { id: "calendar", path: "/kalendarz", group: "Zadania" },
  { id: "nutrition-today", path: "/odzywianie", group: "Odżywianie" },
  { id: "nutrition-meals", path: "/odzywianie/posilki", group: "Odżywianie" },
  { id: "nutrition-analysis", path: "/odzywianie/analiza", group: "Odżywianie" },
  { id: "sport-today", path: "/sport", group: "Sport" },
  { id: "sport-cycle", path: "/sport?widok=cycle", group: "Sport" },
  { id: "sport-templates", path: "/sport?widok=templates", group: "Sport" },
  { id: "sport-exercises", path: "/sport?widok=exercises", group: "Sport" },
  { id: "sport-history", path: "/sport?widok=history", group: "Sport" },
  { id: "sport-analysis", path: "/sport?widok=analysis", group: "Sport" },
  { id: "work-today", path: "/praca", group: "Praca" },
  { id: "work-week", path: "/praca?widok=week", group: "Praca" },
  { id: "work-active", path: "/praca?widok=active", group: "Praca" },
  { id: "work-unscheduled", path: "/praca?widok=bezterminu", group: "Praca" },
  { id: "work-unassigned", path: "/praca?widok=unassigned", group: "Praca" },
  { id: "work-archive", path: "/praca?widok=archive", group: "Praca" },
  { id: "goals-active", path: "/cele?widok=overview", group: "Cele" },
  { id: "goals-next", path: "/cele?widok=next", group: "Cele" },
  { id: "goals-week", path: "/cele?widok=week", group: "Cele" },
  { id: "goals-all", path: "/cele?widok=all", group: "Cele" },
  { id: "goals-risk", path: "/cele?widok=risk", group: "Cele" },
  { id: "goals-completed", path: "/cele?widok=completed", group: "Cele" },
  { id: "goals-archive", path: "/cele?widok=archived", group: "Cele" },
  { id: "goal-detail", path: "/cele/rehab-app", group: "Cele" },
  { id: "affairs-today", path: "/sprawy", group: "Sprawy" },
  { id: "affairs-week", path: "/sprawy?widok=week", group: "Sprawy" },
  { id: "affairs-all", path: "/sprawy?widok=all", group: "Sprawy" },
  { id: "affairs-one-time", path: "/sprawy?widok=oneTime", group: "Sprawy" },
  { id: "affairs-recurring", path: "/sprawy?widok=payments", group: "Sprawy" },
  { id: "affairs-subscriptions", path: "/sprawy?widok=subscriptions", group: "Sprawy" },
  { id: "affairs-budget", path: "/sprawy?widok=budget", group: "Sprawy" },
  { id: "affairs-documents", path: "/sprawy?widok=documents", group: "Sprawy" },
  { id: "affairs-vehicles", path: "/sprawy?widok=vehicles", group: "Sprawy" },
  { id: "affairs-jdg", path: "/sprawy?widok=jdg", group: "Sprawy" },
  { id: "affairs-travel", path: "/sprawy?widok=travel", group: "Sprawy" },
  { id: "travel-alias", path: "/podroze", group: "Sprawy" },
  { id: "notes-all", path: "/notatki", group: "Notatki" },
  { id: "notes-pinned", path: "/notatki?widok=pinned", group: "Notatki" },
  { id: "notes-archive", path: "/notatki?widok=archive", group: "Notatki" },
];

const representativeIds = new Set([
  "today",
  "tasks-today",
  "calendar",
  "nutrition-today",
  "sport-cycle",
  "work-today",
  "goals-active",
  "affairs-budget",
  "notes-all",
]);

const viewportProfiles = [
  { id: "1366x768", width: 1366, height: 768, routes: "representative" },
  { id: "1440x900", width: 1440, height: 900, routes: "all" },
  { id: "1920x1080", width: 1920, height: 1080, routes: "representative" },
  { id: "2560x1440", width: 2560, height: 1440, routes: "representative" },
];

const zoomProfiles = [
  { id: "zoom-125", width: 1536, height: 864, deviceScaleFactor: 1.25, percent: 125 },
  { id: "zoom-150", width: 1280, height: 720, deviceScaleFactor: 1.5, percent: 150 },
];

const report = {
  generatedAt: new Date().toISOString(),
  auditedAt: auditNow.toISOString(),
  baseURL,
  viewportProfiles,
  zoomProfiles,
  routes: [],
  states: [],
  keyboard: [],
  reducedMotion: [],
  runtimeErrors: [],
};

function round(value) {
  return value == null ? null : Math.round(value * 100) / 100;
}

function boxOrNull(box) {
  if (!box) return null;
  return { x: round(box.x), y: round(box.y), width: round(box.width), height: round(box.height) };
}

async function installNetworkStubs(page) {
  await page.route("https://api.open-meteo.com/**", async (route) => {
    await route.fulfill({
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
    });
  });
  await page.route("https://fonts.googleapis.com/**", (route) => route.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("https://fonts.gstatic.com/**", (route) => route.abort("blockedbyclient"));
  await page.route("**/api/openfoodfacts/search**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "cache-control": "public, max-age=300" },
    body: JSON.stringify({ hits: [] }),
  }));
}

async function newAuditPage(context) {
  const page = await context.newPage();
  await page.clock.install({ time: auditNow });
  await installNetworkStubs(page);
  page.on("console", (message) => {
    if (message.type() === "error") report.runtimeErrors.push({ type: "console", url: page.url(), message: message.text() });
  });
  page.on("pageerror", (error) => report.runtimeErrors.push({ type: "pageerror", url: page.url(), message: error.message }));
  return page;
}

async function settle(page, routePath) {
  await page.goto(`${baseURL}${routePath}`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.locator(".ui-page-shell:visible").first().waitFor({ state: "visible", timeout: 15000 });
  await page.waitForFunction(() => !document.querySelector(".app-route-state"), null, { timeout: 15000 });
  await page.waitForFunction(() => {
    const main = document.querySelector(".ui-module-main");
    if (!main) return true;
    const transform = getComputedStyle(main).transform;
    return ["none", "matrix(1, 0, 0, 1, 0, 0)"].includes(transform)
      && main.getAnimations().every((animation) => ["finished", "idle"].includes(animation.playState));
  }, null, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(220);
}

async function collectDomAudit(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement) || !visible(element)) return null;
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    };
    const labelText = (element) => {
      const labelledBy = element.getAttribute("aria-labelledby");
      const labelledText = labelledBy
        ? labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent?.trim() ?? "").filter(Boolean).join(" ")
        : "";
      const explicitLabel = element.id
        ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`)?.textContent?.trim() ?? ""
        : "";
      return (
        element.getAttribute("aria-label")
        || labelledText
        || explicitLabel
        || element.textContent?.trim()
        || element.getAttribute("title")
        || element.getAttribute("alt")
        || ""
      ).replace(/\s+/g, " ").trim();
    };
    const selectorFor = (element) => {
      if (element.id) return `#${CSS.escape(element.id)}`;
      const classes = [...element.classList].slice(0, 2).map((name) => `.${CSS.escape(name)}`).join("");
      return `${element.tagName.toLowerCase()}${classes}`;
    };
    const interactiveSelector = [
      "button",
      "a[href]",
      "input:not([type='hidden'])",
      "select",
      "textarea",
      "[role='button']",
      "[role='menuitem']",
      "[role='tab']",
      "[role='checkbox']",
      "[role='switch']",
    ].join(",");
    const interactive = [...document.querySelectorAll(interactiveSelector)].filter((element) => visible(element));
    const unnamed = interactive.filter((element) => !labelText(element)).map((element) => selectorFor(element)).slice(0, 50);
    const undersized24 = interactive.map((element) => {
      const box = element.getBoundingClientRect();
      return { selector: selectorFor(element), name: labelText(element).slice(0, 100), width: box.width, height: box.height };
    }).filter((item) => item.width < 24 || item.height < 24).slice(0, 100);
    const under44 = interactive.map((element) => {
      const box = element.getBoundingClientRect();
      return { selector: selectorFor(element), name: labelText(element).slice(0, 100), width: box.width, height: box.height };
    }).filter((item) => item.width < 44 || item.height < 44).slice(0, 100);

    const textSamples = [];
    const parseColor = (value) => {
      const match = value.match(/rgba?\(([^)]+)\)/i);
      if (!match) return null;
      const normalized = match[1].replace(/\//g, " ").replace(/,/g, " ").split(/\s+/).filter(Boolean);
      if (normalized.length < 3) return null;
      return {
        r: Number(normalized[0]),
        g: Number(normalized[1]),
        b: Number(normalized[2]),
        a: normalized.length > 3 ? Number(normalized[3]) : 1,
      };
    };
    const mix = (front, back) => {
      const alpha = front.a + back.a * (1 - front.a);
      if (alpha <= 0) return { r: 0, g: 0, b: 0, a: 0 };
      return {
        r: (front.r * front.a + back.r * back.a * (1 - front.a)) / alpha,
        g: (front.g * front.a + back.g * back.a * (1 - front.a)) / alpha,
        b: (front.b * front.a + back.b * back.a * (1 - front.a)) / alpha,
        a: alpha,
      };
    };
    const backgroundFor = (element) => {
      const layers = [];
      for (let current = element; current; current = current.parentElement) {
        const color = parseColor(getComputedStyle(current).backgroundColor);
        if (color && color.a > 0) layers.push(color);
      }
      let output = { r: 255, g: 255, b: 255, a: 1 };
      for (let index = layers.length - 1; index >= 0; index -= 1) output = mix(layers[index], output);
      return output;
    };
    const luminance = (color) => {
      const linear = [color.r, color.g, color.b].map((channel) => {
        const value = channel / 255;
        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    };
    const contrast = (front, back) => {
      const foreground = mix(front, back);
      const first = luminance(foreground);
      const second = luminance(back);
      return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    };
    for (const element of document.querySelectorAll("body *")) {
      if (!(element instanceof HTMLElement) || !visible(element)) continue;
      const hasDirectText = [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
      if (!hasDirectText) continue;
      const style = getComputedStyle(element);
      const foreground = parseColor(style.color);
      if (!foreground) continue;
      foreground.a *= Number(style.opacity || 1);
      const background = backgroundFor(element);
      const ratio = contrast(foreground, background);
      const fontSize = Number.parseFloat(style.fontSize);
      const fontWeight = Number.parseInt(style.fontWeight, 10) || 400;
      const large = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
      const required = large ? 3 : 4.5;
      if (ratio + 0.01 < required) {
        textSamples.push({
          selector: selectorFor(element),
          text: element.textContent.trim().replace(/\s+/g, " ").slice(0, 120),
          color: style.color,
          background: `rgb(${Math.round(background.r)}, ${Math.round(background.g)}, ${Math.round(background.b)})`,
          ratio,
          required,
          fontSize,
          fontWeight,
        });
      }
    }

    const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")]
      .filter((element) => visible(element))
      .map((element) => ({ level: Number(element.tagName.slice(1)), text: element.textContent?.trim().replace(/\s+/g, " ") ?? "" }));
    const skippedHeadings = headings.filter((heading, index) => index > 0 && heading.level > headings[index - 1].level + 1);
    const html = document.documentElement;
    const body = document.body;
    const header = document.querySelector(".ui-content-header");
    const content = document.querySelector(".ui-page-shell__content");
    const headerBox = header instanceof HTMLElement ? header.getBoundingClientRect() : null;
    const contentBox = content instanceof HTMLElement ? content.getBoundingClientRect() : null;
    const focusableCount = interactive.filter((element) => !element.hasAttribute("disabled") && element.getAttribute("aria-disabled") !== "true").length;
    return {
      title: document.title,
      h1Count: headings.filter((heading) => heading.level === 1).length,
      headings,
      skippedHeadings,
      landmarks: {
        main: document.querySelectorAll("main").length,
        nav: document.querySelectorAll("nav").length,
        complementary: document.querySelectorAll("aside,[role='complementary']").length,
      },
      boxes: {
        appSidebar: rect(".app-sidebar"),
        moduleSidebar: rect(".ui-module-sidebar"),
        main: rect("main.ui-main-content"),
        contentHeader: rect(".ui-content-header"),
        contentHeaderInner: rect(".ui-content-header__inner"),
        pageContent: rect(".ui-page-shell__content"),
        detailPanel: rect(".ui-detail-panel, .task-detail-panel"),
      },
      headerContentDelta: headerBox && contentBox ? {
        x: headerBox.x - contentBox.x,
        width: headerBox.width - contentBox.width,
      } : null,
      overflow: {
        viewportWidth: html.clientWidth,
        viewportHeight: html.clientHeight,
        documentWidth: html.scrollWidth,
        documentHeight: html.scrollHeight,
        bodyWidth: body.scrollWidth,
        horizontal: html.scrollWidth > html.clientWidth + 1 || body.scrollWidth > html.clientWidth + 1,
      },
      interactiveCount: interactive.length,
      focusableCount,
      unnamed,
      undersized24,
      under44,
      disabledVisible: interactive.filter((element) => element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true").map((element) => ({ selector: selectorFor(element), name: labelText(element) })).slice(0, 50),
      contrastFailures: textSamples.slice(0, 100),
      stateClassCounts: {
        selected: document.querySelectorAll("[aria-selected='true'],[aria-current='page'],[aria-pressed='true'],.is-selected,.selected").length,
        completed: document.querySelectorAll(".completed,.is-completed,[data-status='completed']").length,
        overdue: document.querySelectorAll(".overdue,.is-overdue,[data-status='overdue']").length,
        disabled: document.querySelectorAll(":disabled,[aria-disabled='true']").length,
      },
    };
  });
}

async function axeAudit(page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"])
    .analyze();
  return {
    violations: results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      helpUrl: violation.helpUrl,
      nodes: violation.nodes.map((node) => ({ target: node.target, failureSummary: node.failureSummary })),
    })),
    incomplete: results.incomplete.map((item) => ({
      id: item.id,
      impact: item.impact,
      help: item.help,
      nodes: item.nodes.slice(0, 20).map((node) => ({ target: node.target, failureSummary: node.failureSummary })),
    })),
  };
}

async function screenshot(page, name) {
  const destination = path.join(outputDir, `${name}.png`);
  await page.screenshot({ path: destination, fullPage: false, animations: "disabled", caret: "hide" });
  return path.relative(outputDir, destination).replace(/\\/g, "/");
}

async function auditRoute(page, route, profile, runAxe = false) {
  await settle(page, route.path);
  const dom = await collectDomAudit(page);
  const shot = await screenshot(page, `${profile.id}__${route.id}`);
  const axe = runAxe ? await axeAudit(page) : null;
  report.routes.push({
    profile: profile.id,
    routeId: route.id,
    group: route.group,
    requestedPath: route.path,
    finalURL: page.url(),
    screenshot: shot,
    dom,
    axe,
  });
}

async function auditViewport(browser, profile) {
  const context = await browser.newContext({
    viewport: { width: profile.width, height: profile.height },
    colorScheme: "dark",
    reducedMotion: "no-preference",
    locale: "pl-PL",
    timezoneId: "Europe/Warsaw",
  });
  const page = await newAuditPage(context);
  const routes = profile.routes === "all" ? fullMatrix : fullMatrix.filter((route) => representativeIds.has(route.id));
  for (const route of routes) {
    try {
      await auditRoute(page, route, profile, profile.routes === "all");
    } catch (error) {
      report.routes.push({ profile: profile.id, routeId: route.id, group: route.group, requestedPath: route.path, error: String(error) });
    }
  }
  await context.close();
}

async function collectStyle(locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return {
      backgroundColor: style.backgroundColor,
      borderColor: style.borderColor,
      color: style.color,
      boxShadow: style.boxShadow,
      outline: style.outline,
      outlineColor: style.outlineColor,
      outlineOffset: style.outlineOffset,
      transform: style.transform,
      opacity: style.opacity,
      box: { x: box.x, y: box.y, width: box.width, height: box.height },
    };
  });
}

async function recordState(reportEntry) {
  report.states.push(reportEntry);
}

async function auditInteractiveStates(browser) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: "dark",
    locale: "pl-PL",
    timezoneId: "Europe/Warsaw",
  });
  const page = await newAuditPage(context);

  await settle(page, "/zadania?widok=dzis");
  const firstTask = page.locator(".task-item-row").first();
  if (await firstTask.count()) {
    const before = await collectStyle(firstTask);
    await firstTask.hover();
    await page.waitForTimeout(120);
    const hover = await collectStyle(firstTask);
    await firstTask.focus();
    const focus = await collectStyle(firstTask);
    await recordState({ id: "task-row-hover-focus", route: "/zadania?widok=dzis", before, hover, focus, screenshot: await screenshot(page, "1440x900__state-task-row-focus") });
    await firstTask.click();
    const panel = page.locator(".task-detail-panel");
    if (await panel.isVisible()) {
      await recordState({ id: "task-detail", route: page.url(), box: boxOrNull(await panel.boundingBox()), screenshot: await screenshot(page, "1440x900__state-task-detail") });
      const dateTrigger = page.locator(".task-detail__date");
      if (await dateTrigger.count()) {
        await dateTrigger.click();
        const picker = page.getByRole("dialog", { name: "Ustaw termin zadania" });
        if (await picker.isVisible()) {
          await recordState({ id: "task-date-picker", role: await picker.getAttribute("role"), ariaModal: await picker.getAttribute("aria-modal"), box: boxOrNull(await picker.boundingBox()), screenshot: await screenshot(page, "1440x900__state-task-date-picker") });
          await page.keyboard.press("Escape");
        }
      }
      const menuTrigger = page.locator(".task-detail__toggle--plain");
      if (await menuTrigger.count()) {
        await menuTrigger.click();
        const menu = page.getByRole("menu", { name: "Akcje zadania" });
        if (await menu.isVisible()) {
          await recordState({ id: "task-actions-menu", box: boxOrNull(await menu.boundingBox()), screenshot: await screenshot(page, "1440x900__state-task-actions-menu") });
          await page.keyboard.press("Escape");
        }
      }
    }
  }

  await settle(page, "/cele?widok=overview");
  const goalMenuTrigger = page.locator(".goal-card-more button").first();
  if (await goalMenuTrigger.count()) {
    await goalMenuTrigger.click();
    const goalMenu = page.getByRole("menu").last();
    if (await goalMenu.isVisible()) {
      await recordState({ id: "goal-menu", box: boxOrNull(await goalMenu.boundingBox()), screenshot: await screenshot(page, "1440x900__state-goal-menu") });
      const edit = goalMenu.getByRole("menuitem", { name: "Edytuj cel" });
      if (await edit.count()) {
        await edit.click();
        const dialog = page.getByRole("dialog").last();
        if (await dialog.isVisible()) {
          await recordState({ id: "goal-edit-dialog", box: boxOrNull(await dialog.boundingBox()), screenshot: await screenshot(page, "1440x900__state-goal-edit-dialog") });
          await page.keyboard.press("Escape");
        }
      }
    }
  }

  await settle(page, "/sport?widok=templates");
  const templateTrigger = page.getByRole("button", { name: "Dodaj szablon" });
  if (await templateTrigger.count()) {
    await templateTrigger.click();
    const dialog = page.getByRole("dialog", { name: "Nowy szablon" });
    if (await dialog.isVisible()) {
      await recordState({ id: "sport-new-template-dialog", box: boxOrNull(await dialog.boundingBox()), screenshot: await screenshot(page, "1440x900__state-sport-new-template-dialog") });
      await page.keyboard.press("Escape");
    }
  }

  await settle(page, "/praca");
  const workMenuTrigger = page.locator(".work-add-menu > button");
  if (await workMenuTrigger.count()) {
    await workMenuTrigger.click();
    const workMenu = page.locator("#work-add-menu");
    if (await workMenu.isVisible()) {
      await recordState({ id: "work-add-menu", box: boxOrNull(await workMenu.boundingBox()), screenshot: await screenshot(page, "1440x900__state-work-add-menu") });
      await page.keyboard.press("Escape");
    }
  }

  await settle(page, "/odzywianie");
  const addProduct = page.getByRole("button", { name: /^(Dodaj pierwszy produkt|Dodaj produkt do:)/ }).first();
  if (await addProduct.count()) {
    await addProduct.click();
    const dialog = page.getByRole("dialog", { name: "Dodaj produkt" });
    if (await dialog.isVisible()) {
      const axe = await axeAudit(page);
      await recordState({ id: "nutrition-add-product-dialog", box: boxOrNull(await dialog.boundingBox()), axe, screenshot: await screenshot(page, "1440x900__state-nutrition-add-product-dialog") });
      await page.keyboard.press("Escape");
    }
  }

  await settle(page, "/notatki");
  const addNote = page.getByRole("button", { name: /Dodaj notatk|Nowa notatk/ }).first();
  if (await addNote.count()) {
    await addNote.click();
    const dialog = page.getByRole("dialog").last();
    const editor = dialog.isVisible().catch(() => false) ? dialog : page.locator(".notes-editor").last();
    if (await editor.count() && await editor.isVisible()) {
      await recordState({ id: "notes-editor", box: boxOrNull(await editor.boundingBox()), screenshot: await screenshot(page, "1440x900__state-notes-editor") });
      await page.keyboard.press("Escape");
    }
  }

  await settle(page, "/sprawy");
  const addAffair = page.getByRole("button", { name: "Dodaj sprawę" }).first();
  if (await addAffair.count()) {
    await addAffair.click();
    const dialog = page.getByRole("dialog").last();
    if (await dialog.isVisible()) {
      await recordState({ id: "affairs-add-dialog", box: boxOrNull(await dialog.boundingBox()), screenshot: await screenshot(page, "1440x900__state-affairs-add-dialog") });
      await page.keyboard.press("Escape");
    }
  }

  await context.close();
}

async function auditKeyboard(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark", locale: "pl-PL", timezoneId: "Europe/Warsaw" });
  const page = await newAuditPage(context);

  await settle(page, "/dzisiaj");
  await page.evaluate(() => document.activeElement?.blur());
  const tabStops = [];
  for (let index = 0; index < 28; index += 1) {
    await page.keyboard.press("Tab");
    tabStops.push(await page.evaluate(() => {
      const element = document.activeElement;
      if (!(element instanceof HTMLElement)) return null;
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return {
        index: 0,
        tag: element.tagName.toLowerCase(),
        role: element.getAttribute("role"),
        name: element.getAttribute("aria-label") || element.textContent?.trim().replace(/\s+/g, " ").slice(0, 100) || "",
        box: { x: box.x, y: box.y, width: box.width, height: box.height },
        outline: style.outline,
        outlineColor: style.outlineColor,
        outlineOffset: style.outlineOffset,
        boxShadow: style.boxShadow,
      };
    }));
  }
  tabStops.forEach((item, index) => { if (item) item.index = index + 1; });
  report.keyboard.push({ id: "today-tab-sequence", tabStops });

  await settle(page, "/sport?widok=templates");
  const trigger = page.getByRole("button", { name: "Dodaj szablon" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Nowy szablon" });
  const focusedOnOpen = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") || document.activeElement?.textContent?.trim() || document.activeElement?.tagName || "");
  const focusInside = [];
  for (let index = 0; index < 18; index += 1) {
    await page.keyboard.press("Tab");
    focusInside.push(await page.evaluate(() => ({
      insideDialog: Boolean(document.activeElement?.closest("[role='dialog']")),
      tag: document.activeElement?.tagName ?? "",
      name: document.activeElement?.getAttribute("aria-label") || document.activeElement?.textContent?.trim().replace(/\s+/g, " ").slice(0, 80) || "",
    })));
  }
  await page.keyboard.press("Escape");
  report.keyboard.push({
    id: "sport-dialog-focus-trap",
    focusedOnOpen,
    focusInside,
    escaped: (await dialog.count()) === 0,
    returnedToTrigger: await trigger.evaluate((element) => document.activeElement === element),
  });

  await settle(page, "/praca");
  const menuTrigger = page.locator(".work-add-menu > button");
  await menuTrigger.click();
  const menu = page.locator("#work-add-menu");
  const menuSequence = [];
  if (await menu.isVisible()) {
    for (const key of ["ArrowDown", "ArrowDown", "End", "Home", "Escape"]) {
      await page.keyboard.press(key);
      menuSequence.push({ key, active: await page.evaluate(() => document.activeElement?.textContent?.trim().replace(/\s+/g, " ").slice(0, 80) || ""), open: await menu.isVisible().catch(() => false) });
    }
  }
  report.keyboard.push({ id: "work-menu-arrows", menuSequence, returnedToTrigger: await menuTrigger.evaluate((element) => document.activeElement === element) });

  await context.close();
}

async function auditReducedMotion(browser) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: "dark",
    reducedMotion: "reduce",
    locale: "pl-PL",
    timezoneId: "Europe/Warsaw",
  });
  const page = await newAuditPage(context);
  for (const route of fullMatrix.filter((item) => ["today", "tasks-today", "sport-cycle", "goals-active", "affairs-today"].includes(item.id))) {
    await settle(page, route.path);
    const motion = await page.evaluate(() => {
      const animations = document.getAnimations().map((animation) => ({
        playState: animation.playState,
        currentTime: animation.currentTime,
        effect: animation.effect?.getTiming?.() ?? null,
      }));
      const transitioned = [...document.querySelectorAll("body *")].map((element) => {
        const style = getComputedStyle(element);
        return {
          selector: element.id ? `#${element.id}` : `${element.tagName.toLowerCase()}.${[...element.classList].slice(0, 1).join("")}`,
          duration: style.transitionDuration,
          animation: style.animationName,
          animationDuration: style.animationDuration,
        };
      }).filter((item) => item.duration !== "0s" || (item.animation !== "none" && item.animationDuration !== "0s"));
      return {
        matches: matchMedia("(prefers-reduced-motion: reduce)").matches,
        runningAnimations: animations.filter((item) => item.playState === "running"),
        transitioned: transitioned.slice(0, 100),
      };
    });
    report.reducedMotion.push({ route: route.path, routeId: route.id, motion, screenshot: await screenshot(page, `reduced-motion__${route.id}`) });
  }
  await context.close();
}

async function auditZoom(browser, profile) {
  const context = await browser.newContext({
    viewport: { width: profile.width, height: profile.height },
    deviceScaleFactor: profile.deviceScaleFactor,
    colorScheme: "dark",
    reducedMotion: "no-preference",
    locale: "pl-PL",
    timezoneId: "Europe/Warsaw",
  });
  const page = await newAuditPage(context);
  const routes = fullMatrix.filter((route) => representativeIds.has(route.id));
  for (const route of routes) {
    try {
      await auditRoute(page, route, profile, false);
    } catch (error) {
      report.routes.push({ profile: profile.id, routeId: route.id, group: route.group, requestedPath: route.path, error: String(error) });
    }
  }
  await context.close();
}

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const profile of viewportProfiles) await auditViewport(browser, profile);
  await auditInteractiveStates(browser);
  await auditKeyboard(browser);
  await auditReducedMotion(browser);
  for (const profile of zoomProfiles) await auditZoom(browser, profile);
} finally {
  await browser.close();
}

await fs.writeFile(path.join(outputDir, "audit-data.json"), JSON.stringify(report, null, 2), "utf8");
const summary = {
  routeChecks: report.routes.length,
  routeErrors: report.routes.filter((item) => item.error).length,
  axeViolations: report.routes.reduce((sum, item) => sum + (item.axe?.violations?.length ?? 0), 0),
  domContrastFailures: report.routes.reduce((sum, item) => sum + (item.dom?.contrastFailures?.length ?? 0), 0),
  horizontalOverflow: report.routes.filter((item) => item.dom?.overflow?.horizontal).map((item) => `${item.profile}:${item.routeId}`),
  h1Failures: report.routes.filter((item) => item.dom && item.dom.h1Count !== 1).map((item) => `${item.profile}:${item.routeId}:${item.dom.h1Count}`),
  unnamedInteractive: report.routes.reduce((sum, item) => sum + (item.dom?.unnamed?.length ?? 0), 0),
  undersized24: report.routes.reduce((sum, item) => sum + (item.dom?.undersized24?.length ?? 0), 0),
  runtimeErrors: report.runtimeErrors.length,
  stateChecks: report.states.length,
  keyboardChecks: report.keyboard.length,
};
await fs.writeFile(path.join(outputDir, "summary.json"), JSON.stringify(summary, null, 2), "utf8");
console.log(JSON.stringify(summary, null, 2));
