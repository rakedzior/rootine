import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const baseURL = "http://127.0.0.1:4174";
const outputDir = path.resolve("artifacts/audit-visual-agent-c");
const auditNow = new Date("2026-08-10T08:00:00.000Z");
const report = { generatedAt: new Date().toISOString(), taskHeader: [], sportSearch: null, nutritionAction: null, todayRedundancy: null };

async function makePage(browser, width, height) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: "dark", locale: "pl-PL", timezoneId: "Europe/Warsaw" });
  const page = await context.newPage();
  await page.clock.install({ time: auditNow });
  await page.route("https://api.open-meteo.com/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ current: { temperature_2m: 19, weather_code: 1 }, daily: { temperature_2m_min: [12], temperature_2m_max: [23], precipitation_probability_max: [15], weather_code: [1] } }) }));
  await page.route("https://fonts.googleapis.com/**", (route) => route.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("https://fonts.gstatic.com/**", (route) => route.abort("blockedbyclient"));
  return { context, page };
}

async function settle(page, route) {
  await page.goto(`${baseURL}${route}`, { waitUntil: "domcontentloaded" });
  await page.locator(".ui-page-shell").first().waitFor({ state: "visible" });
  await page.waitForTimeout(250);
}

const browser = await chromium.launch({ headless: true });
try {
  for (const [width, height] of [[1366, 768], [1440, 900], [1920, 1080], [2560, 1440]]) {
    const { context, page } = await makePage(browser, width, height);
    await settle(page, "/zadania?widok=dzis");
    const description = page.locator(".ui-content-header__description").first();
    report.taskHeader.push({ width, height, ...(await description.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        text: element.textContent?.trim() ?? "",
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        clipped: element.scrollWidth > element.clientWidth,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        overflow: style.overflow,
        textOverflow: style.textOverflow,
        whiteSpace: style.whiteSpace,
      };
    })) });
    await context.close();
  }

  {
    const { context, page } = await makePage(browser, 1440, 900);
    await settle(page, "/sport?widok=templates");
    const input = page.locator("input[placeholder*='Szukaj po nazwie']").first();
    report.sportSearch = await input.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.font = style.font;
      const placeholder = element.getAttribute("placeholder") ?? "";
      const textWidth = ctx?.measureText(placeholder).width ?? null;
      return { placeholder, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, clientWidth: element.clientWidth, horizontalPadding: parseFloat(style.paddingLeft) + parseFloat(style.paddingRight), measuredTextWidth: textWidth, likelyClipped: textWidth != null && textWidth > element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) };
    });
    await context.close();
  }

  {
    const { context, page } = await makePage(browser, 1440, 900);
    await settle(page, "/odzywianie");
    const headerAction = page.getByRole("button", { name: "Dodaj posiłek" });
    const sourceText = (await headerAction.textContent())?.trim().replace(/\s+/g, " ") ?? "";
    await headerAction.click();
    const dialog = page.getByRole("dialog").last();
    await dialog.waitFor({ state: "visible" });
    report.nutritionAction = {
      sourceText,
      dialogName: await dialog.getAttribute("aria-labelledby").then(async (id) => id ? page.locator(`#${CSS.escape(id)}`).textContent() : null).catch(() => null),
      headingText: (await dialog.getByRole("heading").first().textContent())?.trim() ?? "",
      primaryText: (await dialog.getByRole("button", { name: /Dodaj do dziennika/ }).textContent())?.trim().replace(/\s+/g, " ") ?? "",
    };
    await page.keyboard.press("Escape");
    await context.close();
  }

  {
    const { context, page } = await makePage(browser, 1440, 900);
    await settle(page, "/dzisiaj");
    report.todayRedundancy = await page.evaluate(() => {
      const root = document.querySelector(".ui-page-shell") ?? document.body;
      const allText = root.textContent?.replace(/\s+/g, " ").trim() ?? "";
      const count = (phrase) => allText.match(new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"))?.length ?? 0;
      const selectors = [".ui-content-header", ".today-command", ".living-day", ".today-overdue-panel", ".today-module-register"];
      return {
        phraseCounts: { "25 pozostało": count("25 pozostało"), "15 zaległych": count("15 zaległych"), "6 wymaga uwagi": count("6 wymaga uwagi") },
        regions: selectors.map((selector) => ({ selector, text: document.querySelector(selector)?.textContent?.replace(/\s+/g, " ").trim().slice(0, 500) ?? null })),
      };
    });
    await context.close();
  }
} finally {
  await browser.close();
}

await fs.writeFile(path.join(outputDir, "copy-checks.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
