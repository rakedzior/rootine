/* global document, getComputedStyle */

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const option = (name) => process.argv.find((argument) => argument.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const baseUrl = option("url") ?? process.env.ROOTINE_AUDIT_URL ?? "http://127.0.0.1:5173";
const outputDir = option("output") ?? process.env.ROOTINE_AUDIT_DIR ?? "/private/tmp/rootine-responsive-audit";
const widths = (option("widths") ?? process.env.ROOTINE_AUDIT_WIDTHS ?? "2560,1440,1024,390")
  .split(",")
  .map(Number)
  .filter(Number.isFinite);

const routes = [
  ["dzisiaj", "/dzisiaj?konto=testowe"],
  ["sport-dzis", "/sport?konto=testowe"],
  ["sport-cykl", "/sport?widok=cycle&tydzien=1&konto=testowe"],
  ["sport-szablony", "/sport?widok=templates&konto=testowe"],
  ["praca-dzis", "/praca?konto=testowe"],
  ["praca-tydzien", "/praca?widok=week&konto=testowe"],
  ["cele", "/cele?konto=testowe"],
  ["cele-przeglad", "/cele?widok=overview&konto=testowe"],
  ["podroze", "/podroze?konto=testowe"],
  ["notatki", "/notatki?konto=testowe"],
  ["sprawy", "/sprawy?konto=testowe"],
  ["sprawy-finanse", "/sprawy?widok=finance-recurring&konto=testowe"],
  ["sprawy-zdrowie", "/sprawy?widok=health&konto=testowe"],
  ["sprawy-jdg", "/sprawy?widok=jdg&konto=testowe"],
];

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const results = [];

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
await page.route("https://fonts.googleapis.com/**", (route) => route.fulfill({
  status: 200,
  contentType: "text/css",
  body: "",
}));
await page.route("https://fonts.gstatic.com/**", (route) => route.abort());

for (const width of widths) {
  await page.setViewportSize({ width, height: width <= 760 ? 844 : width <= 1024 ? 900 : 1000 });
  for (const [name, path] of routes) {
    await page.goto(`${baseUrl}${path}`, { waitUntil: "domcontentloaded" });
    await page.locator(".ui-page-shell:visible").waitFor({ state: "visible", timeout: 20_000 });
    await page.locator(".app-route-state").waitFor({ state: "detached", timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(250);

    const geometry = await page.evaluate(() => {
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = document.documentElement.clientHeight;
      const visible = (element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      };
      const offenders = [...document.querySelectorAll("body *")]
        .filter(visible)
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            element,
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
          };
        })
        .filter(({ element, left, right }) => {
          if (getComputedStyle(element).position === "fixed") return false;
          return left < -1 || right > viewportWidth + 1;
        })
        .slice(0, 8)
        .map(({ element, left, right }) => ({
          selector: `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}${[...element.classList].slice(0, 3).map((name) => `.${name}`).join("")}`,
          left: Math.round(left),
          right: Math.round(right),
        }));

      const body = document.body.getBoundingClientRect();
      const main = document.querySelector(".ui-module-main")?.getBoundingClientRect();
      const workRow = document.querySelector(".work-task-row--with-context");
      const workCopy = workRow?.querySelector(".ui-list-row__copy");
      const box = (element) => {
        if (!element) return null;
        const bounds = element.getBoundingClientRect();
        return {
          x: Math.round(bounds.x),
          width: Math.round(bounds.width),
          right: Math.round(bounds.right),
          display: getComputedStyle(element).display,
        };
      };
      return {
        documentOverflow: document.documentElement.scrollWidth > viewportWidth + 1,
        bodyWidth: Math.round(body.width),
        scrollWidth: document.documentElement.scrollWidth,
        viewportWidth,
        viewportHeight,
        main: main ? {
          left: Math.round(main.left),
          right: Math.round(main.right),
          width: Math.round(main.width),
        } : null,
        work: workRow ? {
          row: box(workRow),
          copy: box(workCopy),
          grid: getComputedStyle(workRow).gridTemplateColumns,
          container: box(workRow.closest(".ui-main-content")),
        } : null,
        offenders,
      };
    });

    await page.screenshot({
      path: `${outputDir}/${width}-${name}.png`,
      fullPage: false,
      animations: "disabled",
    });
    results.push({ width, name, path, ...geometry });
  }
}

await browser.close();
console.log(JSON.stringify(results, null, 2));
