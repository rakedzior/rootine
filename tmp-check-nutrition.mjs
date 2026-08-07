import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:4175";
const OUT = process.argv[2] ?? ".";

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.on("console", (message) => {
  if (message.type() === "error") console.log("CONSOLE ERROR:", message.text());
});
page.on("pageerror", (error) => console.log("PAGE ERROR:", error.message));

await page.goto(`${BASE}/odzywianie`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/01-today.png`, fullPage: false });
console.log("today h1:", await page.locator("h1").first().innerText());
console.log("sidebar items:", await page.locator(".nutrition-context-sidebar .context-nav-item").allInnerTexts());
console.log("active item:", await page.locator(".nutrition-context-sidebar .context-nav-item[aria-current='page']").innerText());

// Navigate to the library
await page.getByRole("button", { name: "Własne posiłki" }).click();
await page.waitForURL("**/odzywianie/posilki");
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/02-library-empty.png` });
console.log("library h1:", await page.locator("h1").first().innerText());
console.log("empty state:", await page.locator(".ui-empty-state__title").innerText());

// Create a meal
await page.getByRole("button", { name: "Dodaj własny posiłek" }).first().click();
await page.waitForSelector(".ui-modal");
await page.getByLabel("Nazwa posiłku").fill("Owsianka proteinowa");

await page.getByLabel("Produkt").fill("płatki owsiane");
await page.waitForTimeout(400);
await page.locator(".nutrition-suggestion").first().click();
await page.getByLabel("Ilość", { exact: true }).fill("80");
await page.getByRole("button", { name: "Dodaj składnik" }).last().click();
await page.waitForTimeout(200);

await page.getByLabel("Produkt").fill("mleko");
await page.waitForTimeout(400);
await page.locator(".nutrition-suggestion").first().click();
await page.getByLabel("Ilość", { exact: true }).fill("250");
await page.getByRole("button", { name: "Dodaj składnik" }).last().click();
await page.waitForTimeout(200);

await page.getByLabel("Masa gotowego dania (g)").fill("300");
await page.getByLabel("Liczba porcji").fill("2");
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/03-editor.png` });
console.log("summary:", (await page.locator(".nutrition-meal-summary-panel").innerText()).replace(/\n/g, " | "));

await page.getByRole("button", { name: "Zapisz posiłek" }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/04-library.png` });
console.log("card:", (await page.locator(".nutrition-library-card").innerText()).replace(/\n/g, " | "));

// Persistence across reload
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(500);
console.log("after reload cards:", await page.locator(".nutrition-library-card").count());

// Quick add to a day
await page.getByRole("button", { name: "Dodaj do Dzisiaj" }).click();
await page.waitForSelector(".ui-modal");
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/05-quick-add.png` });
console.log("preview:", (await page.locator(".nutrition-meal-summary-panel").innerText()).replace(/\n/g, " | "));
await page.getByRole("button", { name: "Dodaj do dziennika" }).click();
await page.waitForTimeout(400);
console.log("notice:", await page.locator(".nutrition-library-notice").innerText());

// Back to the daily register
await page.locator(".nutrition-context-sidebar .context-nav-item", { hasText: "Dzisiaj" }).click();
await page.waitForURL("**/odzywianie");
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/06-today-with-entry.png` });
console.log("lunch card:", (await page.locator(".nutrition-meal-card[data-meal='lunch']").innerText()).replace(/\n/g, " | "));
console.log("header:", await page.locator(".nutrition-content-header .ui-content-header__description").innerText());

// Analysis from the sidebar
await page.locator(".nutrition-context-sidebar .context-nav-item", { hasText: "Analiza" }).click();
await page.waitForSelector(".ui-modal");
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/07-analysis.png` });
console.log("analysis modal:", await page.locator(".ui-modal h2, .ui-modal__title").first().innerText());

await browser.close();
console.log("OK");
