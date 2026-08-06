import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const sourceRoot = path.join(root, "src");
const exceptionsPath = path.join(root, "docs", "design-system-exceptions.json");
const baselinePath = path.join(root, "docs", "design-system-baseline.json");

const officialBreakpoints = new Set([1380, 1180, 980, 760]);
const sourceExtensions = new Set([".css", ".scss", ".ts", ".tsx"]);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(entryPath));
    else if (sourceExtensions.has(path.extname(entry.name))) files.push(entryPath);
  }
  return files;
}

function relative(filePath) {
  return path.relative(root, filePath).replaceAll(path.sep, "/");
}

function lineNumber(source, index) {
  return source.slice(0, index).split("\n").length;
}

function isTest(file) {
  return /(?:\.test|\.spec)\.[^.]+$/.test(file) || file.startsWith("e2e/");
}

function exceptionPaths(exceptions, category) {
  return new Set(exceptions[category].flatMap((entry) => entry.paths));
}

function isExcepted(file, paths) {
  return paths.has(file);
}

function findMatches(source, pattern, file, category, results, transform = (match) => match[0]) {
  for (const match of source.matchAll(pattern)) {
    results.push({ category, file, line: lineNumber(source, match.index ?? 0), value: transform(match) });
  }
}

const exceptions = JSON.parse(await readFile(exceptionsPath, "utf8"));
const files = (await walk(sourceRoot)).map(relative).filter((file) => !isTest(file));
const rawColorExceptions = exceptionPaths(exceptions, "rawColors");
const inlineExceptions = exceptionPaths(exceptions, "inlineStyles");
const motionExceptions = exceptionPaths(exceptions, "motion");
const checkboxExceptions = exceptionPaths(exceptions, "checkboxes");
const registeredBreakpointValues = new Set(exceptions.mediaQueries.map((entry) => entry.value));
const findings = [];
const inlineStylesByFile = {};
const unregisteredMedia = [];

for (const file of files) {
  const source = await readFile(path.join(root, file), "utf8");
  const ext = path.extname(file);

  if (ext === ".tsx" || ext === ".ts") {
    const inlineMatches = [...source.matchAll(/style\s*=\s*\{\{/g)];
    if (inlineMatches.length) inlineStylesByFile[file] = inlineMatches.length;
    if (!isExcepted(file, inlineExceptions)) {
      findMatches(source, /style\s*=\s*\{\{/g, file, "inlineStyles", findings);
    }
    findMatches(source, /\bzIndex\s*:\s*(-?\d+)\b/g, file, "zIndex", findings, (match) => match[1]);
    findMatches(source, /\bz-\[-?\d+\]/g, file, "zIndex", findings);
    findMatches(source, /\bz--?\d+\b/g, file, "zIndex", findings);
    findMatches(source, /\b(?:text|tracking|leading)-\[(?!var\(--)[^\]]+\]/g, file, "arbitraryTypography", findings);
    findMatches(source, /\brounded-\[(?!var\(--)[^\]]+\]/g, file, "arbitraryRadius", findings);
    if (file !== "src/app/ui/components/Checkbox.tsx" && !isExcepted(file, checkboxExceptions)) {
      findMatches(source, /type=["']checkbox["']/g, file, "rawCheckbox", findings);
    }
    findMatches(source, /\bfrom\s+["'][^"']*\/ui\/components\//g, file, "directUiImport", findings);
    if (!isExcepted(file, rawColorExceptions)) {
      findMatches(source, /#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(/gi, file, "rawColor", findings);
    }
    if (!isExcepted(file, motionExceptions)) {
      findMatches(source, /\btransition\s*:\s*["'`][^"'`]*(?:\d+ms|\d+s)/g, file, "rawTransition", findings);
    }
  }

  if (ext === ".css" || ext === ".scss") {
    findMatches(source, /\bz-index\s*:\s*(-?\d+)\b/g, file, "zIndex", findings, (match) => match[1]);
    findMatches(source, /@media\s*\([^)]*(?:max|min)-width\s*:\s*(\d+)px[^)]*\)/g, file, "mediaQuery", findings, (match) => match[1]);
    if (file !== "src/styles/tokens.css" && !isExcepted(file, rawColorExceptions)) {
      findMatches(source, /#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(/gi, file, "rawColor", findings);
    }
    if (file !== "src/styles/tokens.css" && !isExcepted(file, motionExceptions)) {
      findMatches(source, /\btransition(?:-duration)?\s*:[^;]*(?:\d+ms|\d+s)[^;]*/g, file, "rawTransition", findings);
    }
  }
}

for (const finding of findings.filter((item) => item.category === "mediaQuery")) {
  const value = Number(finding.value);
  const registered = exceptions.mediaQueries.some((entry) => entry.value === value && entry.paths.includes(finding.file));
  const derivedComplement = officialBreakpoints.has(value - 1) || registeredBreakpointValues.has(value - 1);
  if (!officialBreakpoints.has(value) && !registered && !derivedComplement) unregisteredMedia.push(finding);
}

const counts = Object.fromEntries([...new Set(findings.map((finding) => finding.category))].map((category) => [
  category,
  findings.filter((finding) => finding.category === category).length,
]));
counts.unregisteredMedia = unregisteredMedia.length;

if (process.argv.includes("--print-baseline")) {
  console.log(JSON.stringify({ version: 1, counts, inlineStylesByFile }, null, 2));
  process.exit(0);
}

let baseline = { version: 1, counts: {}, inlineStylesByFile: {} };
try {
  baseline = JSON.parse(await readFile(baselinePath, "utf8"));
} catch {
  console.error(`Missing ${relative(baselinePath)}. Run with --print-baseline and review the result before creating it.`);
  process.exit(1);
}

const failures = [];
for (const [category, count] of Object.entries(counts)) {
  const allowed = baseline.counts[category] ?? 0;
  if (count > allowed) failures.push(`${category}: ${count} findings (baseline ${allowed})`);
}

for (const [file, count] of Object.entries(inlineStylesByFile)) {
  const allowed = baseline.inlineStylesByFile[file] ?? 0;
  if (count > allowed && !isExcepted(file, inlineExceptions)) {
    failures.push(`inlineStyles ${file}: ${count} (baseline ${allowed})`);
  }
}

if (findings.some((finding) => finding.category === "directUiImport")) {
  failures.push("directUiImport: import shared UI components through src/app/ui");
}

if (unregisteredMedia.length) {
  for (const finding of unregisteredMedia) failures.push(`unregisteredMedia ${finding.file}:${finding.line} (${finding.value}px)`);
}

console.log(`Design-system audit: ${Object.entries(counts).map(([key, value]) => `${key}=${value}`).join(", ")}`);
if (failures.length) {
  console.error("Design-system governance violations:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
