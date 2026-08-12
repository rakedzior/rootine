import ts from "typescript";

const PROTECTED_UI_ROOTS = new Set([
  "ui-button",
  "ui-date-trigger",
  "ui-menu-item",
  "ui-select-option",
  "ui-select-trigger",
  "ui-tab",
]);

const PROTECTED_UI_INTERNAL_PREFIXES = [
  "ui-checkbox__",
  "ui-date-picker__",
  "ui-field__control",
  "ui-menu-item__",
  "ui-modal__",
  "ui-select-option__",
  "ui-select-trigger__",
  "ui-tabs__",
];

const UI_VISUAL_CONTRACT_PROPERTIES = new Set([
  "border-radius",
  "font-size",
  "height",
  "line-height",
  "max-height",
  "min-height",
  "padding",
  "padding-block",
  "padding-block-end",
  "padding-block-start",
  "padding-bottom",
  "padding-inline",
  "padding-inline-end",
  "padding-inline-start",
  "padding-left",
  "padding-right",
  "padding-top",
]);

const LEGACY_VISUAL_TOKEN_PATTERN = /--color-(?:precision-blue(?:-[a-z]+)?|graphite-[a-z]+|border-subtle|chalk-white|text-muted|text-disabled|success-seaglass|success-soft|warning-ochre|warning-soft|danger-coral|danger-soft|accent-violet|violet-soft)\b/gi;

function lineNumber(source, index) {
  return source.slice(0, index).split("\n").length;
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));
}

function splitSelectors(value) {
  const selectors = [];
  let start = 0;
  let parentheses = 0;
  let brackets = 0;
  let quote = null;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === "\"" || character === "'") quote = character;
    else if (character === "(") parentheses += 1;
    else if (character === ")") parentheses = Math.max(0, parentheses - 1);
    else if (character === "[") brackets += 1;
    else if (character === "]") brackets = Math.max(0, brackets - 1);
    else if (character === "," && parentheses === 0 && brackets === 0) {
      selectors.push(value.slice(start, index));
      start = index + 1;
    }
  }
  selectors.push(value.slice(start));
  return selectors;
}

export function normalizeCssSelector(selector) {
  return selector
    .replace(/\s+/g, " ")
    .replace(/\s*([>+~])\s*/g, "$1")
    .trim();
}

/**
 * Extracts ordinary CSS rules without depending on a full CSS parser. The expression intentionally
 * matches innermost blocks, so selectors nested in @media/@supports are still returned while the
 * at-rule itself is ignored. Comments are blanked without changing offsets for stable line numbers.
 */
export function scanCssRules(source, file = "fixture.css") {
  const sanitized = stripComments(source);
  const rules = [];
  const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
  for (const match of sanitized.matchAll(rulePattern)) {
    const rawPrelude = match[1];
    const prelude = rawPrelude.trim();
    if (!prelude || prelude.startsWith("@") || /^(?:from|to|\d+(?:\.\d+)?%)$/.test(prelude)) continue;
    const block = match[2];
    const declarations = [];
    for (const declaration of block.matchAll(/(?:^|;)\s*(--[a-z0-9_-]+|[a-z-]+)\s*:\s*([^;]*)/gi)) {
      declarations.push({
        property: declaration[1].toLowerCase(),
        value: declaration[2].trim(),
      });
    }
    if (!declarations.length) continue;
    const preludeOffset = (match.index ?? 0) + rawPrelude.indexOf(prelude);
    for (const selector of splitSelectors(prelude).map(normalizeCssSelector).filter(Boolean)) {
      rules.push({ file, line: lineNumber(source, preludeOffset), selector, declarations });
    }
  }
  return rules;
}

function replaceFunction(value, functionName) {
  const lower = value.toLowerCase();
  let output = "";
  let cursor = 0;
  while (cursor < value.length) {
    const start = lower.indexOf(`${functionName}(`, cursor);
    if (start < 0) return output + value.slice(cursor);
    output += value.slice(cursor, start);
    let depth = 1;
    let index = start + functionName.length + 1;
    let quote = null;
    for (; index < value.length && depth > 0; index += 1) {
      const character = value[index];
      if (quote) {
        if (character === "\\") index += 1;
        else if (character === quote) quote = null;
      } else if (character === "\"" || character === "'") quote = character;
      else if (character === "(") depth += 1;
      else if (character === ")") depth -= 1;
    }
    if (depth > 0) return output + value.slice(start);
    output += " var-token ";
    cursor = index;
  }
  return output;
}

export function extractRadiusScale(tokenSource) {
  return new Set([...tokenSource.matchAll(/--radius-[a-z0-9-]+\s*:\s*([^;]+);/gi)]
    .map((match) => match[1].trim().toLowerCase()));
}

export function extractGlobalCustomProperties(tokenSource) {
  return new Set([...tokenSource.matchAll(/(?:^|[;{]\s*)(--[a-z0-9-]+)\s*:/gim)]
    .map((match) => match[1]));
}

export function isAllowedRadiusValue(value, radiusScale) {
  const withoutVariables = replaceFunction(value.toLowerCase(), "var");
  const components = withoutVariables.split(/[\s/]+/).filter(Boolean);
  if (!components.length) return false;
  return components.every((component) => (
    component === "0"
    || component === "0px"
    || component === "50%"
    || component === "inherit"
    || component === "initial"
    || component === "unset"
    || component === "revert"
    || component === "revert-layer"
    || component === "var-token"
    || radiusScale.has(component)
  ));
}

function protectedUiClasses(selector) {
  const withoutNegations = selector.replace(/:not\([^)]*\)/gi, "");
  return [...withoutNegations.matchAll(/\.((?:ui|context)-[a-z0-9_-]+)/gi)]
    .map((match) => match[1].toLowerCase())
    .filter((className) => (
      PROTECTED_UI_INTERNAL_PREFIXES.some((prefix) => className.startsWith(prefix))
      || PROTECTED_UI_ROOTS.has(className)
      || className === "context-nav-item"
    ));
}

function isLocalInteractiveSelector(selector) {
  if (/\.(?:ui|context)-[a-z0-9_-]+/i.test(selector)) return false;
  const lastCompound = selector.split(/\s+|>|\+|~/).filter(Boolean).at(-1) ?? "";
  if (/::(?:before|after)\b/i.test(lastCompound)) return false;
  if (/^(?:svg|path|circle|canvas)(?:\b|[.#:[].*)/i.test(lastCompound)) return false;
  if (/\[role\s*=\s*["']?(?:button|menuitem|option)["']?\]/i.test(lastCompound)) return true;
  if (/\.[a-z0-9_-]*(?:button|btn|trigger|control|option|menu-item)(?:--[a-z0-9_-]+)?(?:\b|[:.[])/i.test(lastCompound)
    && !/\.(?:button|btn|trigger|control|option|menu-item)-(?:group|list|row|wrap|container)(?:\b|[:.[])/i.test(lastCompound)) return true;
  return /\.[a-z0-9_-]*(?:control|options|menu)[a-z0-9_-]*\s+(?:button|input|select)(?:\b|[.#:[].*)/i.test(selector);
}

function literalPixelValue(value) {
  const match = value.trim().match(/^(\d+(?:\.\d+)?)px$/i);
  return match ? `${Number(match[1])}px` : null;
}

export function scanCssGovernance(source, {
  file = "fixture.css",
  featureCss = true,
  globalTokenNames = new Set(),
  radiusScale = new Set(["3px", "6px", "8px", "12px", "16px", "999px"]),
} = {}) {
  const findings = [];
  for (const rule of scanCssRules(source, file)) {
    for (const declaration of rule.declarations) {
      if (declaration.property === "border-radius" && !isAllowedRadiusValue(declaration.value, radiusScale)) {
        findings.push({
          category: "cssLiteralRadius",
          file,
          line: rule.line,
          selector: rule.selector,
          property: declaration.property,
          value: declaration.value,
        });
      }
      if (globalTokenNames.has(declaration.property)) {
        findings.push({
          category: "globalTokenOverride",
          file,
          line: rule.line,
          selector: rule.selector,
          property: declaration.property,
          value: declaration.value,
        });
      }
    }

    if (!featureCss) continue;

    const protectedClasses = protectedUiClasses(rule.selector);
    if (protectedClasses.length) {
      for (const declaration of rule.declarations) {
        if (!UI_VISUAL_CONTRACT_PROPERTIES.has(declaration.property)) continue;
        findings.push({
          category: "uiInternalOverride",
          file,
          line: rule.line,
          selector: rule.selector,
          property: declaration.property,
          value: declaration.value,
        });
      }
    }

    if (isLocalInteractiveSelector(rule.selector)) {
      for (const declaration of rule.declarations) {
        if (declaration.property !== "height" && declaration.property !== "min-height") continue;
        const literal = literalPixelValue(declaration.value);
        if (!literal || literal === "0px") continue;
        findings.push({
          category: "localControlHeight",
          file,
          line: rule.line,
          selector: rule.selector,
          property: declaration.property,
          value: literal,
        });
      }
    }
  }
  return findings;
}

export function scanLegacyVisualTokens(source, file = "fixture.css") {
  return [...source.matchAll(LEGACY_VISUAL_TOKEN_PATTERN)].map((match) => ({
    category: "legacyVisualToken",
    file,
    line: lineNumber(source, match.index ?? 0),
    value: match[0],
  }));
}

function jsxTagName(node, sourceFile) {
  return node.tagName.getText(sourceFile);
}

function jsxAttribute(node, name) {
  return node.attributes.properties.find((property) => (
    ts.isJsxAttribute(property) && property.name.getText() === name
  ));
}

function jsxAttributeText(attribute, sourceFile) {
  if (!attribute?.initializer) return attribute ? "true" : null;
  if (ts.isStringLiteral(attribute.initializer)) return attribute.initializer.text;
  if (ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression) {
    return attribute.initializer.expression.getText(sourceFile);
  }
  return attribute.initializer.getText(sourceFile);
}

function numericJsxAttribute(node, name, sourceFile) {
  const text = jsxAttributeText(jsxAttribute(node, name), sourceFile);
  if (text === null) return null;
  const normalized = text.replace(/^\{?|\}?$/g, "").trim();
  return /^\d+(?:\.\d+)?$/.test(normalized) ? Number(normalized) : normalized;
}

function isPrimaryCta(node, sourceFile) {
  const tagName = jsxTagName(node, sourceFile);
  if (tagName === "Button") {
    return jsxAttributeText(jsxAttribute(node, "variant"), sourceFile) === "primary";
  }
  if (tagName !== "button" && tagName !== "MenuTrigger") return false;
  return (jsxAttributeText(jsxAttribute(node, "className"), sourceFile) ?? "").includes("ui-button--primary");
}

function collectLucideIcons(node, lucideNames, sourceFile) {
  const icons = [];
  function visit(current) {
    if (ts.isJsxOpeningElement(current) || ts.isJsxSelfClosingElement(current)) {
      if (lucideNames.has(jsxTagName(current, sourceFile))) icons.push(current);
    }
    ts.forEachChild(current, visit);
  }
  visit(node);
  return icons;
}

/** Enforces the primary-CTA icon grammar: 13px and the shared/default 1.7 stroke. */
export function scanPrimaryCtaIcons(source, file = "fixture.tsx", grammar = {}) {
  const expectedSize = grammar.size ?? 13;
  const expectedStrokeWidth = grammar.strokeWidth ?? 1.7;
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const lucideNames = new Set();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || statement.moduleSpecifier.text !== "lucide-react") continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) lucideNames.add(element.name.text);
  }

  const findings = [];
  function visit(node) {
    if ((ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node))) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      if (isPrimaryCta(opening, sourceFile)) {
        const icons = collectLucideIcons(node, lucideNames, sourceFile);
        for (const icon of icons) {
          const position = sourceFile.getLineAndCharacterOfPosition(icon.getStart(sourceFile));
          const iconName = jsxTagName(icon, sourceFile);
          const size = numericJsxAttribute(icon, "size", sourceFile);
          if (size !== expectedSize) {
            findings.push({
              category: "ctaIconSize",
              file,
              line: position.line + 1,
              selector: iconName,
              property: "size",
              value: size === null ? "missing" : String(size),
            });
          }
          const strokeWidth = numericJsxAttribute(icon, "strokeWidth", sourceFile);
          if (strokeWidth !== null && strokeWidth !== expectedStrokeWidth) {
            findings.push({
              category: "ctaIconStroke",
              file,
              line: position.line + 1,
              selector: iconName,
              property: "strokeWidth",
              value: String(strokeWidth),
            });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return findings;
}

export function findingMatchesException(finding, entry) {
  if (!entry.paths.includes(finding.file)) return false;
  if (entry.allow) {
    return entry.allow.some((allowed) => {
      if (normalizeCssSelector(allowed.selector) !== normalizeCssSelector(finding.selector)) return false;
      const properties = finding.property.split(", ");
      return properties.includes(allowed.property) && (allowed.value === "*" || allowed.value === finding.value);
    });
  }
  if (entry.selectors && !entry.selectors.map(normalizeCssSelector).includes(normalizeCssSelector(finding.selector))) return false;
  if (entry.properties && !entry.properties.includes(finding.property)) return false;
  if (entry.values && !entry.values.includes(finding.value)) return false;
  return true;
}
