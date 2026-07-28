import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const failures = [];
const pageDirectory = resolve("src/app/pages");
const globalStylesheet = resolve("src/styles/app.css");

function lineCount(content) {
  return content.split(/\r?\n/).length;
}

function read(path) {
  return readFileSync(path, "utf8");
}

for (const file of readdirSync(pageDirectory).filter((name) => name.endsWith(".tsx"))) {
  const path = join(pageDirectory, file);
  const source = read(path);
  const lines = lineCount(source);
  const inlineStyles = (source.match(/\bstyle=\{\{/g) ?? []).length;

  if (lines > 1_800) {
    failures.push(`${file}: ${lines} lines (page entrypoint budget: 1800)`);
  }
  if (inlineStyles > 260) {
    failures.push(`${file}: ${inlineStyles} inline style objects (per-file budget: 260)`);
  }
}

const globalCss = read(globalStylesheet);
const globalCssLines = lineCount(globalCss);
const globalCssBytes = statSync(globalStylesheet).size;
if (globalCssLines > 1_500) {
  failures.push(`app.css: ${globalCssLines} lines (global stylesheet budget: 1500)`);
}
if (globalCssBytes > 40_000) {
  failures.push(`app.css: ${globalCssBytes} bytes (global stylesheet budget: 40000)`);
}

for (const prefix of [".sport-", ".nutrition-", ".goal-", ".goals-", ".task-"]) {
  if (globalCss.includes(prefix)) {
    failures.push(`app.css still owns route selector prefix ${prefix}`);
  }
}

const routeStyleOwners = [
  ["src/app/pages/Sport.tsx", "../../styles/sport.css"],
  ["src/app/pages/Odzywanie.tsx", "../../styles/nutrition.css"],
  ["src/app/pages/Cele.tsx", "../../styles/goals.css"],
  ["src/app/pages/CelSzczegoly.tsx", "../../styles/goals.css"],
  ["src/app/pages/Zadania.tsx", "../../styles/tasks.css"],
  ["src/app/pages/Kalendarz.tsx", "../../styles/tasks.css"],
];

for (const [owner, stylesheet] of routeStyleOwners) {
  if (!read(resolve(owner)).includes(stylesheet)) {
    failures.push(`${owner} does not import its route stylesheet ${stylesheet}`);
  }
}

if (failures.length > 0) {
  console.error("Architecture audit failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  `Architecture audit passed: page entrypoints <= 1800 lines, app.css ${globalCssLines} lines/${globalCssBytes} bytes, route CSS ownership intact.`,
);
