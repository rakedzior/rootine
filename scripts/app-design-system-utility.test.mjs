import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import test from "node:test";
import ts from "typescript";

const ROOT = process.cwd();
const APP_DIRECTORY = join(ROOT, "src/app");

const EXCLUDED_DIRECTORIES = [
  "src/app/goals/",
  "src/app/ui/components/",
];

const EXCLUDED_FILES = new Set([
  "src/app/pages/Cele.tsx",
  "src/app/pages/CelSzczegoly.tsx",
]);

const VISUAL_UTILITY_PATTERNS = [
  /^(?:-?(?:m[trblxy]?|p[trblxy]?|gap(?:-[xy])?|space-[xy])-.+)$/,
  /^(?:-?(?:inset(?:-[xy])?|top|right|bottom|left)-.+)$/,
  /^(?:(?:w|h|min-w|min-h|max-w|max-h|size|basis)-.+)$/,
  /^(?:flex-1|grow(?:-0)?|shrink(?:-0)?)$/,
  /^(?:rounded(?:-.+)?|border(?:-.+)?|shadow(?:-.+)?|ring(?:-.+)?|outline(?:-.+)?)$/,
  /^(?:text|font|leading|tracking|decoration|underline-offset|bg|fill|stroke|accent|caret|placeholder|opacity)-.+$/,
  /^(?:uppercase|lowercase|capitalize|normal-case|tabular-nums|underline|no-underline|line-through)$/,
];

function normalizePath(value) {
  return value.replaceAll("\\", "/");
}

function utilityWithoutVariants(token) {
  let bracketDepth = 0;
  let variantEnd = -1;
  for (let index = 0; index < token.length; index += 1) {
    const character = token[index];
    if (character === "[") bracketDepth += 1;
    if (character === "]") bracketDepth = Math.max(0, bracketDepth - 1);
    if (character === ":" && bracketDepth === 0) variantEnd = index;
  }
  return token.slice(variantEnd + 1).replace(/^!/, "");
}

export function isAppVisualUtility(token) {
  const utility = utilityWithoutVariants(token);
  return utility.startsWith("[") || VISUAL_UTILITY_PATTERNS.some((pattern) => pattern.test(utility));
}

function stringFragments(node) {
  if (ts.isJsxExpression(node)) return node.expression ? stringFragments(node.expression) : [];
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
  if (ts.isTemplateExpression(node)) {
    return [
      node.head.text,
      ...node.templateSpans.flatMap((span) => [...stringFragments(span.expression), span.literal.text]),
    ];
  }
  if (ts.isConditionalExpression(node)) {
    return [...stringFragments(node.whenTrue), ...stringFragments(node.whenFalse)];
  }
  if (ts.isParenthesizedExpression(node)) return stringFragments(node.expression);
  if (ts.isBinaryExpression(node)) {
    return [...stringFragments(node.left), ...stringFragments(node.right)];
  }
  return [];
}

export function scanAppVisualUtilities(source, file = "fixture.tsx") {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const findings = [];
  function record(initializer, owner) {
    const position = sourceFile.getLineAndCharacterOfPosition(owner.getStart(sourceFile));
    for (const fragment of stringFragments(initializer)) {
      for (const token of fragment.split(/\s+/).filter(Boolean)) {
        if (isAppVisualUtility(token)) findings.push({ file, line: position.line + 1, token });
      }
    }
  }
  function visit(node) {
    if (ts.isJsxAttribute(node) && /className$/i.test(node.name.getText(sourceFile)) && node.initializer) {
      record(node.initializer, node);
    }
    if (ts.isPropertyAssignment(node) && /className$/i.test(node.name.getText(sourceFile))) {
      record(node.initializer, node);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return findings;
}

async function componentFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await componentFiles(absolutePath));
    } else if (entry.name.endsWith(".tsx")) {
      files.push(absolutePath);
    }
  }
  return files;
}

function isProductionFeatureComponent(absolutePath) {
  const file = normalizePath(relative(ROOT, absolutePath));
  return !EXCLUDED_DIRECTORIES.some((directory) => file.startsWith(directory))
    && !EXCLUDED_FILES.has(file)
    && !/\.(?:test|spec)\.tsx$/.test(file);
}

test("production feature components use named CSS classes instead of a parallel visual utility scale", async () => {
  const files = (await componentFiles(APP_DIRECTORY)).filter(isProductionFeatureComponent);
  const findings = [];
  for (const absolutePath of files) {
    const file = normalizePath(relative(ROOT, absolutePath));
    findings.push(...scanAppVisualUtilities(await readFile(absolutePath, "utf8"), file));
  }
  assert.deepEqual(findings, [], findings.map((finding) => (
    `${finding.file}:${finding.line} uses visual utility ${finding.token}`
  )).join("\n"));
});

test("application utility gate catches visual scale but permits structural and behavioral hooks", () => {
  const source = `
    <div className="flex grid relative hidden overflow-y-auto items-center justify-between" />
    <article className="px-4 min-h-0 rounded-xl text-sm bg-transparent shadow-sm border" />
    <input className="[scrollbar-width:none] [&::-webkit-scrollbar]:hidden" />
    const option = { triggerClassName: "gap-2" };
  `;
  assert.deepEqual(
    scanAppVisualUtilities(source).map(({ token }) => token),
    [
      "px-4",
      "min-h-0",
      "rounded-xl",
      "text-sm",
      "bg-transparent",
      "shadow-sm",
      "border",
      "[scrollbar-width:none]",
      "gap-2",
    ],
  );
});
