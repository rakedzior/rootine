import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { propertyMatchesContract, scanInlineStyleObjects } from "./design-system-inline-audit.mjs";

const root = process.cwd();
const sourceRoot = path.join(root, "src");
const exceptionsPath = path.join(root, "docs", "design-system-exceptions.json");
const baselinePath = path.join(root, "docs", "design-system-baseline.json");
const breakpointsPath = path.join(root, "src", "app", "ui", "breakpoints.ts");
const tokensPath = path.join(root, "src", "styles", "tokens.css");

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

function parseBreakpointObject(source, exportName) {
  const block = source.match(new RegExp(`export const ${exportName} = \\{([\\s\\S]*?)\\} as const;`));
  if (!block) throw new Error(`Cannot parse ${exportName} from ${relative(breakpointsPath)}`);
  return Object.fromEntries([...block[1].matchAll(/^\s*(\w+):\s*(\d+),/gm)].map((match) => [
    match[1],
    Number(match[2]),
  ]));
}

function toKebabCase(value) {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function parseCssBreakpointTokens(source) {
  return Object.fromEntries([...source.matchAll(/--bp-([a-z0-9-]+):\s*(\d+)px;/g)].map((match) => [
    match[1],
    Number(match[2]),
  ]));
}

function findMatches(source, pattern, file, category, results, transform = (match) => match[0]) {
  for (const match of source.matchAll(pattern)) {
    results.push({ category, file, line: lineNumber(source, match.index ?? 0), value: transform(match) });
  }
}

const [breakpointSource, tokenSource] = await Promise.all([
  readFile(breakpointsPath, "utf8"),
  readFile(tokensPath, "utf8"),
]);
const officialBreakpointEntries = parseBreakpointObject(breakpointSource, "BREAKPOINTS");
const featureBreakpointEntries = parseBreakpointObject(breakpointSource, "BREAKPOINT_EXCEPTIONS");
const officialBreakpoints = new Set(Object.values(officialBreakpointEntries));
const exceptions = JSON.parse(await readFile(exceptionsPath, "utf8"));
const files = (await walk(sourceRoot)).map(relative).filter((file) => !isTest(file));
const sourceFileSet = new Set(files);
const rawColorExceptions = exceptionPaths(exceptions, "rawColors");
const motionExceptions = exceptionPaths(exceptions, "motion");
const checkboxExceptions = exceptionPaths(exceptions, "checkboxes");
const findings = [];
const inlineStylesByFile = {};
const inlineStyleViolationsByFile = {};
const unregisteredMedia = [];
const sourceByFile = new Map();

for (const file of files) {
  const source = await readFile(path.join(root, file), "utf8");
  sourceByFile.set(file, source);
  const ext = path.extname(file);

  if (ext === ".tsx" || ext === ".ts") {
    const inlineObjects = scanInlineStyleObjects(source, file);
    if (inlineObjects.length) inlineStylesByFile[file] = inlineObjects.length;
    const inlineContracts = exceptions.inlineStyles.filter((entry) => entry.paths.includes(file));
    for (const occurrence of inlineObjects) {
      const properties = occurrence.properties.length
        ? occurrence.properties
        : [{ name: "*empty*", dynamic: false, value: "" }];
      const violations = properties.filter((property) => (
        !property.dynamic
        || !inlineContracts.some((contract) => propertyMatchesContract(property.name, contract.allowedProperties))
      ));
      if (violations.length) {
        findings.push({
          category: "inlineStyleObjectsWithViolations",
          file,
          line: occurrence.line,
          value: violations.map((property) => property.name).join(", "),
        });
        inlineStyleViolationsByFile[file] = (inlineStyleViolationsByFile[file] ?? 0) + violations.length;
        for (const property of violations) {
          findings.push({
            category: "inlineStyleProperties",
            file,
            line: occurrence.line,
            value: property.name,
          });
          if (!property.dynamic) {
            findings.push({
              category: "staticInlineProperties",
              file,
              line: occurrence.line,
              value: `${property.name}=${property.value}`,
            });
          }
        }
      }
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
  const derivedComplement = officialBreakpoints.has(value - 1) || exceptions.mediaQueries.some((entry) => (
    entry.value === value - 1 && entry.paths.includes(finding.file)
  ));
  if (!officialBreakpoints.has(value) && !registered && !derivedComplement) unregisteredMedia.push(finding);
}

const governedCategories = [
  "inlineStyleObjectsWithViolations",
  "inlineStyleProperties",
  "staticInlineProperties",
  "arbitraryTypography",
  "arbitraryRadius",
  "rawTransition",
  "rawColor",
  "rawCheckbox",
  "zIndex",
  "mediaQuery",
  "directUiImport",
];
const counts = Object.fromEntries(governedCategories.map((category) => [
  category,
  findings.filter((finding) => finding.category === category).length,
]));
counts.unregisteredMedia = unregisteredMedia.length;
const inlineStyleObjectsTotal = Object.values(inlineStylesByFile).reduce((sum, count) => sum + count, 0);

const registryFailures = [];
const cssBreakpointEntries = parseCssBreakpointTokens(tokenSource);
const expectedBreakpointEntries = { ...officialBreakpointEntries, ...featureBreakpointEntries };

for (const [name, value] of Object.entries(expectedBreakpointEntries)) {
  const cssName = toKebabCase(name);
  const mirroredValue = cssBreakpointEntries[cssName];
  if (mirroredValue !== value) {
    registryFailures.push(`breakpointMirror ${name}: breakpoints.ts=${value}px, tokens.css=${mirroredValue ?? "missing"}`);
  }
}

for (const [cssName, value] of Object.entries(cssBreakpointEntries)) {
  const registered = Object.entries(expectedBreakpointEntries).some(([name, expected]) => (
    toKebabCase(name) === cssName && expected === value
  ));
  if (!registered) registryFailures.push(`breakpointMirror tokens.css has unregistered --bp-${cssName}: ${value}px`);
}

for (const [category, entries] of Object.entries(exceptions)) {
  for (const entry of entries) {
    for (const field of ["owner", "reason", "migration", "review"]) {
      if (typeof entry[field] !== "string" || !entry[field].trim()) {
        registryFailures.push(`exceptionMetadata ${category}: missing ${field}`);
      }
    }
    for (const file of entry.paths) {
      if (!sourceFileSet.has(file)) registryFailures.push(`exceptionPath ${category}: missing ${file}`);
    }
    if (
      category === "inlineStyles"
      && (!Array.isArray(entry.allowedProperties) || !entry.allowedProperties.length
        || entry.allowedProperties.some((property) => typeof property !== "string" || !property.trim()))
    ) {
      registryFailures.push("exceptionMetadata inlineStyles: allowedProperties must be a non-empty string array");
    }
  }
}

const featureBreakpointValues = new Set(Object.values(featureBreakpointEntries));
for (const entry of exceptions.mediaQueries) {
  if (!featureBreakpointValues.has(entry.value)) {
    registryFailures.push(`breakpointException ${entry.value}px is absent from BREAKPOINT_EXCEPTIONS`);
  }
  for (const file of entry.paths) {
    const source = sourceByFile.get(file);
    const mediaPattern = new RegExp(
      `@media[^\\{]*(?:(?:min|max)-width\\s*:\\s*${entry.value}px|min-width\\s*:\\s*${entry.value + 1}px)`,
    );
    if (source && !mediaPattern.test(source)) {
      registryFailures.push(`breakpointException ${file}: ${entry.value}px (or its ${entry.value + 1}px min-width complement) is not present in an @media prelude`);
    }
  }
}

for (const [name, value] of Object.entries(featureBreakpointEntries)) {
  if (!exceptions.mediaQueries.some((entry) => entry.value === value)) {
    registryFailures.push(`breakpointException ${name}: ${value}px has no path registration`);
  }
}

if (process.argv.includes("--print-baseline")) {
  if (registryFailures.length) {
    console.error("Cannot print a baseline with an invalid design-system registry:");
    for (const failure of registryFailures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log(JSON.stringify({
    version: 2,
    inventory: { inlineStyleObjects: inlineStyleObjectsTotal },
    counts,
    inlineStylesByFile,
    inlineStyleViolationsByFile,
  }, null, 2));
  process.exit(0);
}

let baseline = { version: 1, counts: {}, inlineStylesByFile: {} };
try {
  baseline = JSON.parse(await readFile(baselinePath, "utf8"));
} catch {
  console.error(`Missing ${relative(baselinePath)}. Run with --print-baseline and review the result before creating it.`);
  process.exit(1);
}

const failures = [...registryFailures];
for (const [category, count] of Object.entries(counts)) {
  const allowed = baseline.counts[category] ?? 0;
  if (count > allowed) failures.push(`${category}: ${count} findings (baseline ${allowed})`);
}

for (const [file, count] of Object.entries(inlineStyleViolationsByFile)) {
  const allowed = baseline.inlineStyleViolationsByFile?.[file] ?? 0;
  if (count > allowed) {
    const examples = findings
      .filter((finding) => finding.category === "inlineStyleObjectsWithViolations" && finding.file === file)
      .slice(0, 3)
      .map((finding) => `${finding.line} [${finding.value}]`)
      .join("; ");
    failures.push(`inlineStyleProperties ${file}: ${count} (baseline ${allowed}); ${examples}`);
  }
}

if (findings.some((finding) => finding.category === "directUiImport")) {
  failures.push("directUiImport: import shared UI components through src/app/ui");
}

if (unregisteredMedia.length) {
  for (const finding of unregisteredMedia) failures.push(`unregisteredMedia ${finding.file}:${finding.line} (${finding.value}px)`);
}

console.log(`Design-system audit: inlineStyleObjects=${inlineStyleObjectsTotal} (inventory), ${Object.entries(counts).map(([key, value]) => `${key}=${value}`).join(", ")}`);
if (failures.length) {
  console.error("Design-system governance violations:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
