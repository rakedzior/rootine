import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import test from "node:test";
import ts from "typescript";

const ROOT = process.cwd();
const GOALS_DIRECTORY = join(ROOT, "src/app/goals");
const GOALS_PAGES = [
  join(ROOT, "src/app/pages/Cele.tsx"),
  join(ROOT, "src/app/pages/CelSzczegoly.tsx"),
];

const STRUCTURAL_UTILITIES = new Set([
  "absolute",
  "block",
  "flex",
  "fixed",
  "grid",
  "inline-block",
  "inline-flex",
  "inline-grid",
  "relative",
  "sticky",
  "truncate",
  "uppercase",
]);

const VISUAL_UTILITY_PREFIX = /^(?:-?m[trblxy]?|p[trblxy]?|gap(?:-[xy])?|space-[xy]|inset|top|right|bottom|left|w|h|min-w|min-h|max-w|max-h|size|rounded(?:-[trbl]{1,2})?|grid-cols|grid-rows|col-span|row-span|order|basis|items|justify|content|self|place|flex|shrink|grow|text|font|leading|tracking|object|border|bg)-/;

function normalizeUtility(token) {
  const variantParts = token.split(":");
  return variantParts.at(-1) ?? token;
}

export function isGoalsDesignUtility(token) {
  const utility = normalizeUtility(token);
  return utility.startsWith("[")
    || STRUCTURAL_UTILITIES.has(utility)
    || VISUAL_UTILITY_PREFIX.test(utility)
    || utility === "border"
    || utility === "tabular-nums";
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
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return [...stringFragments(node.left), ...stringFragments(node.right)];
  }
  return [];
}

export function scanGoalsDesignUtilities(source, file = "fixture.tsx") {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const findings = [];
  function visit(node) {
    if (ts.isJsxAttribute(node) && /className$/i.test(node.name.getText(sourceFile)) && node.initializer) {
      const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      for (const fragment of stringFragments(node.initializer)) {
        for (const token of fragment.split(/\s+/).filter(Boolean)) {
          if (isGoalsDesignUtility(token)) {
            findings.push({ file, line: position.line + 1, token });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return findings;
}

test("goals module uses feature classes instead of a parallel utility design scale", async () => {
  const componentFiles = (await readdir(GOALS_DIRECTORY, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".tsx"))
    .map((entry) => join(GOALS_DIRECTORY, entry.name));
  const files = [...componentFiles, ...GOALS_PAGES];
  const findings = [];
  for (const absoluteFile of files) {
    const file = relative(ROOT, absoluteFile).replaceAll("\\", "/");
    findings.push(...scanGoalsDesignUtilities(await readFile(absoluteFile, "utf8"), file));
  }
  assert.deepEqual(findings, [], findings.map((finding) => (
    `${finding.file}:${finding.line} uses design utility ${finding.token}`
  )).join("\n"));
});

test("goals utility gate catches visual utilities but permits behavioral visibility hooks", () => {
  const source = `
    <div className="goal-card px-4 rounded-xl font-semibold grid" />
    <input className="hidden" />
    <article className="group goal-card" />
  `;
  assert.deepEqual(
    scanGoalsDesignUtilities(source).map(({ token }) => token),
    ["px-4", "rounded-xl", "font-semibold", "grid"],
  );
});
