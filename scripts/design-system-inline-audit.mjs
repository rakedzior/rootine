import ts from "typescript";

function unwrapExpression(expression) {
  let current = expression;
  while (
    ts.isAsExpression(current)
    || ts.isTypeAssertionExpression(current)
    || ts.isParenthesizedExpression(current)
    || ts.isNonNullExpression(current)
    || ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function propertyNameText(name, sourceFile) {
  if (!name) return "*unknown*";
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) return name.text;
  if (ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return name.getText(sourceFile);
}

function isStaticExpression(expression) {
  const current = unwrapExpression(expression);
  if (
    ts.isStringLiteral(current)
    || ts.isNumericLiteral(current)
    || ts.isNoSubstitutionTemplateLiteral(current)
    || current.kind === ts.SyntaxKind.TrueKeyword
    || current.kind === ts.SyntaxKind.FalseKeyword
    || current.kind === ts.SyntaxKind.NullKeyword
  ) return true;
  if (ts.isPrefixUnaryExpression(current)) return isStaticExpression(current.operand);
  if (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
    let owner = current.expression;
    while (ts.isPropertyAccessExpression(owner) || ts.isElementAccessExpression(owner)) owner = owner.expression;
    return ts.isIdentifier(owner) && ["C", "uiColors", "uiLayers", "uiShadows"].includes(owner.text);
  }
  if (ts.isTemplateExpression(current)) {
    return current.templateSpans.every((span) => isStaticExpression(span.expression));
  }
  return false;
}

function objectLiteralFromStyleAttribute(attribute) {
  if (!attribute.initializer || !ts.isJsxExpression(attribute.initializer) || !attribute.initializer.expression) {
    return null;
  }
  const expression = unwrapExpression(attribute.initializer.expression);
  return ts.isObjectLiteralExpression(expression) ? expression : null;
}

/**
 * Returns literal JSX style objects with their individual property names. Values are marked
 * dynamic only when they are not a literal; policy remains in design-system-audit.mjs.
 */
export function scanInlineStyleObjects(source, file = "fixture.tsx") {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.TSX,
  );
  const occurrences = [];

  function visit(node) {
    if (ts.isJsxAttribute(node) && node.name.text === "style") {
      const object = objectLiteralFromStyleAttribute(node);
      if (object) {
        const properties = object.properties.map((property) => {
          if (ts.isPropertyAssignment(property)) {
            return {
              name: propertyNameText(property.name, sourceFile),
              dynamic: !isStaticExpression(property.initializer),
              value: property.initializer.getText(sourceFile),
            };
          }
          if (ts.isShorthandPropertyAssignment(property)) {
            return { name: property.name.text, dynamic: true, value: property.name.text };
          }
          if (ts.isSpreadAssignment(property)) {
            return { name: "*spread*", dynamic: true, value: property.expression.getText(sourceFile) };
          }
          return { name: "*unknown*", dynamic: true, value: property.getText(sourceFile) };
        });
        const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        occurrences.push({ file, line: position.line + 1, properties });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return occurrences;
}

export function propertyMatchesContract(property, allowedProperties) {
  return allowedProperties.some((allowed) => (
    allowed === property || (allowed.endsWith("*") && property.startsWith(allowed.slice(0, -1)))
  ));
}
