import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { propertyMatchesContract, scanInlineStyleObjects } from "./design-system-inline-audit.mjs";
import {
  extractGlobalCustomProperties,
  extractRadiusScale,
  findingMatchesException,
  normalizeCssSelector,
  scanCssGovernance,
  scanLegacyVisualTokens,
  scanPrimaryCtaIcons,
} from "./design-system-source-audit.mjs";

const root = process.cwd();
const sourceRoot = path.join(root, "src");
const exceptionsPath = path.join(root, "docs", "design-system-exceptions.json");
const contractsPath = path.join(root, "docs", "design-system-contracts.json");
const migrationsPath = path.join(root, "docs", "design-system-migrations.json");
const baselinePath = path.join(root, "docs", "design-system-baseline.json");
const breakpointsPath = path.join(root, "src", "app", "ui", "breakpoints.ts");
const tokensPath = path.join(root, "src", "styles", "tokens.css");

const sourceExtensions = new Set([".css", ".scss", ".ts", ".tsx"]);
// New stylesheets are feature-owned by default. Only files that implement the shared UI layer may
// style protected .ui-* contracts without a migration entry.
const sharedStyleFiles = new Set(["ui.css", "experience.css"]);
const governedSourceCategories = new Set([
  "cssLiteralRadius",
  "uiInternalOverride",
  "globalTokenOverride",
  "localControlHeight",
  "ctaIconSize",
  "ctaIconStroke",
]);

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

function findingMatchesTokenOverrideContract(finding, contract) {
  return contract.paths.includes(finding.file)
    && contract.selectors.map(normalizeCssSelector).includes(normalizeCssSelector(finding.selector))
    && contract.properties.includes(finding.property);
}

const [breakpointSource, tokenSource, contractSource, migrationSource] = await Promise.all([
  readFile(breakpointsPath, "utf8"),
  readFile(tokensPath, "utf8"),
  readFile(contractsPath, "utf8"),
  readFile(migrationsPath, "utf8"),
]);
const officialBreakpointEntries = parseBreakpointObject(breakpointSource, "BREAKPOINTS");
const featureBreakpointEntries = parseBreakpointObject(breakpointSource, "BREAKPOINT_EXCEPTIONS");
const officialBreakpoints = new Set(Object.values(officialBreakpointEntries));
const exceptions = JSON.parse(await readFile(exceptionsPath, "utf8"));
const contracts = JSON.parse(contractSource);
const migrations = JSON.parse(migrationSource);
const files = (await walk(sourceRoot)).map(relative).filter((file) => !isTest(file));
const sourceFileSet = new Set(files);
const rawColorSources = new Set((contracts.rawColorSources ?? []).map((entry) => entry.path));
const nativeCheckboxPrimitives = new Set((contracts.nativeCheckboxPrimitives ?? []).map((entry) => entry.path));
const nativeFormPrimitives = new Map((contracts.nativeFormPrimitives ?? []).map((entry) => [entry.kind, entry.path]));
const priorityIconPrimitive = contracts.priorityIconPrimitive?.path;
const rawColorExceptions = exceptionPaths(exceptions, "rawColors");
const motionExceptions = exceptionPaths(exceptions, "motion");
const checkboxExceptions = exceptionPaths(exceptions, "checkboxes");
const findings = [];
const inlineStylesByFile = {};
const inlineStyleViolationsByFile = {};
const unregisteredMedia = [];
const sourceByFile = new Map();
const sourceAuditCandidates = [];
const contractCoveredFindings = [];
const registeredMigrationDebt = [];
const radiusScale = extractRadiusScale(tokenSource);
const globalTokenNames = extractGlobalCustomProperties(tokenSource);

for (const file of files) {
  const source = await readFile(path.join(root, file), "utf8");
  sourceByFile.set(file, source);
  const ext = path.extname(file);
  findings.push(...scanLegacyVisualTokens(source, file));

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
    if (!nativeCheckboxPrimitives.has(file) && !isExcepted(file, checkboxExceptions)) {
      findMatches(source, /type=["']checkbox["']/g, file, "rawCheckbox", findings);
    }
    if (!nativeCheckboxPrimitives.has(file)) {
      findMatches(
        source,
        /\brole\s*=\s*(?:["']switch["']|\{\s*["']switch["']\s*\})/g,
        file,
        "rawSwitch",
        findings,
      );
    }
    if (nativeFormPrimitives.get("select") !== file) {
      findMatches(source, /<select\b/g, file, "rawSelect", findings);
    }
    if (nativeFormPrimitives.get("textarea") !== file) {
      findMatches(source, /<textarea\b/g, file, "rawTextarea", findings);
    }
    if (nativeFormPrimitives.get("time-input") !== file) {
      findMatches(source, /\btype\s*=\s*["']time["']/g, file, "rawTimeInput", findings);
    }
    if (priorityIconPrimitive !== file) {
      findMatches(source, /<Flag\b/g, file, "rawPriorityIcon", findings);
    }
    findMatches(source, /\bfrom\s+["'][^"']*\/ui\/components\//g, file, "directUiImport", findings);
    if (!rawColorSources.has(file) && !isExcepted(file, rawColorExceptions)) {
      findMatches(source, /#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(/gi, file, "rawColor", findings);
    }
    if (!isExcepted(file, motionExceptions)) {
      findMatches(source, /\btransition\s*:\s*["'`][^"'`]*(?:\d+ms|\d+s)/g, file, "rawTransition", findings);
    }
    if (ext === ".tsx") {
      sourceAuditCandidates.push(...scanPrimaryCtaIcons(source, file, contracts.primaryCtaIcon));
    }
  }

  if (ext === ".css" || ext === ".scss") {
    findMatches(source, /\bz-index\s*:\s*(-?\d+)\b/g, file, "zIndex", findings, (match) => match[1]);
    findMatches(source, /@media\s*\([^)]*(?:max|min)-width\s*:\s*(\d+)px[^)]*\)/g, file, "mediaQuery", findings, (match) => match[1]);
    if (!rawColorSources.has(file) && !isExcepted(file, rawColorExceptions)) {
      findMatches(source, /#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(/gi, file, "rawColor", findings);
    }
    if (file !== "src/styles/tokens.css" && !isExcepted(file, motionExceptions)) {
      findMatches(source, /\btransition(?:-duration)?\s*:[^;]*(?:\d+ms|\d+s)[^;]*/g, file, "rawTransition", findings);
    }
    if (file !== "src/styles/tokens.css") {
      sourceAuditCandidates.push(...scanCssGovernance(source, {
        file,
        featureCss: !sharedStyleFiles.has(path.basename(file)),
        globalTokenNames,
        radiusScale,
      }));
    }
  }
}

for (const finding of sourceAuditCandidates) {
  if (
    finding.category === "globalTokenOverride"
    && contracts.tokenOverrideContracts.some((contract) => findingMatchesTokenOverrideContract(finding, contract))
  ) {
    contractCoveredFindings.push(finding);
    continue;
  }
  const registered = migrations.entries.some((entry) => (
    entry.category === finding.category && findingMatchesException(finding, entry)
  ));
  if (registered) registeredMigrationDebt.push(finding);
  else findings.push(finding);
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
  "rawSwitch",
  "rawSelect",
  "rawTextarea",
  "rawTimeInput",
  "rawPriorityIcon",
  "zIndex",
  "mediaQuery",
  "directUiImport",
  "cssLiteralRadius",
  "uiInternalOverride",
  "globalTokenOverride",
  "localControlHeight",
  "ctaIconSize",
  "ctaIconStroke",
  "legacyVisualToken",
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

if (contracts.version !== 1) registryFailures.push(`contractVersion: expected 1, received ${contracts.version}`);
if (!Number.isFinite(contracts.primaryCtaIcon?.size) || !Number.isFinite(contracts.primaryCtaIcon?.strokeWidth)) {
  registryFailures.push("contractMetadata primaryCtaIcon: numeric size and strokeWidth are required");
}
for (const contract of contracts.rawColorSources ?? []) {
  for (const field of ["path", "owner", "reason"]) {
    if (typeof contract[field] !== "string" || !contract[field].trim()) {
      registryFailures.push(`contractMetadata rawColorSources: missing ${field}`);
    }
  }
  if (typeof contract.path === "string" && !sourceFileSet.has(contract.path)) {
    registryFailures.push(`contractPath rawColorSources: missing ${contract.path}`);
  }
}
for (const contract of contracts.nativeFormPrimitives ?? []) {
  if (typeof contract.path !== "string" || !contract.path.trim() || typeof contract.kind !== "string" || !contract.kind.trim()) {
    registryFailures.push("contractMetadata nativeFormPrimitives: path and kind are required");
  } else if (!sourceFileSet.has(contract.path)) {
    registryFailures.push(`contractPath nativeFormPrimitives: missing ${contract.path}`);
  }
}
if (typeof contracts.priorityIconPrimitive?.path !== "string" || typeof contracts.priorityIconPrimitive?.owner !== "string") {
  registryFailures.push("contractMetadata priorityIconPrimitive: path and owner are required");
} else if (!sourceFileSet.has(contracts.priorityIconPrimitive.path)) {
  registryFailures.push(`contractPath priorityIconPrimitive: missing ${contracts.priorityIconPrimitive.path}`);
}
for (const contract of contracts.tokenOverrideContracts ?? []) {
  for (const field of ["owner", "reason"]) {
    if (typeof contract[field] !== "string" || !contract[field].trim()) {
      registryFailures.push(`contractMetadata tokenOverrideContracts: missing ${field}`);
    }
  }
  if (!Array.isArray(contract.paths) || !contract.paths.length
    || !Array.isArray(contract.selectors) || !contract.selectors.length
    || !Array.isArray(contract.properties) || !contract.properties.length) {
    registryFailures.push("contractMetadata tokenOverrideContracts: paths, selectors, and properties are required");
    continue;
  }
  for (const file of contract.paths) {
    if (!sourceFileSet.has(file)) registryFailures.push(`contractPath tokenOverrideContracts: missing ${file}`);
    for (const selector of contract.selectors) {
      for (const property of contract.properties) {
        const used = contractCoveredFindings.some((finding) => (
          finding.file === file
          && normalizeCssSelector(finding.selector) === normalizeCssSelector(selector)
          && finding.property === property
        ));
        if (!used) registryFailures.push(`contractConsumer ${file}: ${selector} does not set ${property}`);
      }
    }
  }
}

if (migrations.version !== 1 || !Array.isArray(migrations.entries)) {
  registryFailures.push("migrationRegistry: version 1 and entries array are required");
} else for (const entry of migrations.entries) {
  for (const field of ["owner", "reason", "migration", "review"]) {
    if (typeof entry[field] !== "string" || !entry[field].trim()) {
      registryFailures.push(`migrationMetadata ${entry.category ?? "unknown"}: missing ${field}`);
    }
  }
  if (!governedSourceCategories.has(entry.category)) {
    registryFailures.push(`migrationMetadata: unknown category ${entry.category}`);
  }
  if (!Array.isArray(entry.paths) || entry.paths.length !== 1) {
    registryFailures.push(`migrationMetadata ${entry.category}: exactly one path is required`);
  }
  if (typeof entry.expires !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(entry.expires)) {
    registryFailures.push(`migrationMetadata ${entry.category}: expires must use YYYY-MM-DD`);
  } else if (entry.expires < new Date().toISOString().slice(0, 10)) {
    registryFailures.push(`migrationMetadata ${entry.category}: expired ${entry.expires}`);
  }
  if (!Array.isArray(entry.allow) || !entry.allow.length || entry.allow.some((allowed) => (
    typeof allowed.selector !== "string" || !allowed.selector.trim()
    || typeof allowed.property !== "string" || !allowed.property.trim()
    || typeof allowed.value !== "string" || !allowed.value.trim()
  ))) {
    registryFailures.push(`migrationMetadata ${entry.category}: exact selector/property/value allow triples are required`);
    continue;
  }
  const file = entry.paths[0];
  if (!sourceFileSet.has(file)) registryFailures.push(`migrationPath ${entry.category}: missing ${file}`);
  const candidates = sourceAuditCandidates.filter((finding) => (
    finding.category === entry.category && finding.file === file
  ));
  for (const allowed of entry.allow) {
    const used = candidates.some((finding) => findingMatchesException(finding, {
      paths: [file],
      allow: [allowed],
    }));
    if (!used) registryFailures.push(`staleMigration ${entry.category}: ${file} ${allowed.selector} ${allowed.property}=${allowed.value}`);
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
    version: 3,
    inventory: {
      inlineStyleObjects: inlineStyleObjectsTotal,
      registeredMigrationDebt: registeredMigrationDebt.length,
    },
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
if (baseline.version !== 3) failures.push(`baselineVersion: expected 3, received ${baseline.version ?? "missing"}`);
for (const category of governedSourceCategories) {
  if ((baseline.counts[category] ?? 0) !== 0) {
    failures.push(`baselinePolicy ${category}: source-governance categories must keep a zero baseline`);
  }
}
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

for (const finding of findings.filter((item) => governedSourceCategories.has(item.category))) {
  failures.push(`${finding.category} ${finding.file}:${finding.line} ${finding.selector} (${finding.property}=${finding.value})`);
}

console.log(`Design-system audit: inlineStyleObjects=${inlineStyleObjectsTotal} (inventory), registeredMigrationDebt=${registeredMigrationDebt.length}, ${Object.entries(counts).map(([key, value]) => `${key}=${value}`).join(", ")}`);
if (process.argv.includes("--list-debt")) {
  for (const finding of registeredMigrationDebt) {
    console.log(`DEBT ${finding.category} ${finding.file}:${finding.line} ${finding.selector} (${finding.property}=${finding.value})`);
  }
}
if (failures.length) {
  console.error("Design-system governance violations:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
