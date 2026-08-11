import AxeBuilder from "@axe-core/playwright";
import type { Page, TestInfo } from "@playwright/test";
import { test, expect, openRootineRoute } from "./fixtures";

const DESKTOP_A11Y_ROUTES = [
  { name: "shell and Today", path: "/dzisiaj" },
  { name: "Tasks", path: "/zadania" },
  { name: "Calendar", path: "/kalendarz" },
  { name: "Notes", path: "/notatki" },
  { name: "Sport", path: "/sport" },
  { name: "Travel", path: "/podroze" },
  { name: "JDG", path: "/sprawy?widok=jdg" },
  { name: "Goals", path: "/cele" },
  { name: "Goal detail", path: "/cele/rehab-app" },
  { name: "Affairs", path: "/sprawy" },
] as const;

const MOBILE_A11Y_ROUTES = [
  { name: "shell and Today", path: "/dzisiaj" },
  { name: "Tasks", path: "/zadania" },
  { name: "Notes", path: "/notatki" },
  { name: "Goals", path: "/cele" },
  { name: "Goal detail", path: "/cele/rehab-app" },
  { name: "Affairs", path: "/sprawy" },
  { name: "Travel", path: "/podroze" },
] as const;

type AxeViolation = {
  id: string;
  impact: string | null;
  help: string;
  helpUrl: string;
  nodes: Array<{
    target: unknown;
    failureSummary?: string;
  }>;
};

function violationSummary(violations: AxeViolation[]) {
  return violations
    .map((violation) => {
      const nodes = violation.nodes
        .slice(0, 5)
        .map((node) => [
          `  target: ${JSON.stringify(node.target)}`,
          node.failureSummary ? `  ${node.failureSummary.replace(/\n/g, "\n  ")}` : "",
        ].filter(Boolean).join("\n"))
        .join("\n");
      const omittedNodes = violation.nodes.length > 5
        ? `\n  … ${violation.nodes.length - 5} additional affected nodes (see axe-findings.json)`
        : "";
      return [
        `${violation.id} [${violation.impact ?? "impact unknown"}] · ${violation.nodes.length} node(s): ${violation.help}`,
        `  ${violation.helpUrl}`,
        `${nodes}${omittedNodes}`,
      ].join("\n");
    })
    .join("\n\n");
}

async function expectNoWcagViolations(page: Page, testInfo: TestInfo) {
  const results = await new AxeBuilder({ page })
    .withTags([
      "wcag2a",
      "wcag2aa",
      "wcag21a",
      "wcag21aa",
      "wcag22a",
      "wcag22aa",
    ])
    .analyze();

  await testInfo.attach("axe-findings.json", {
    body: JSON.stringify(
      {
        url: page.url(),
        violations: results.violations,
        incomplete: results.incomplete,
      },
      null,
      2,
    ),
    contentType: "application/json",
  });

  expect(
    results.violations.length,
    `WCAG A/AA violations at ${page.url()}:\n${violationSummary(results.violations)}`,
  ).toBe(0);
}

test.describe("desktop accessibility matrix", { tag: "@desktop" }, () => {
  for (const route of DESKTOP_A11Y_ROUTES) {
    test(`axe: ${route.name}`, async ({ rootinePage: page }, testInfo) => {
      await openRootineRoute(page, route.path);
      await expectNoWcagViolations(page, testInfo);
    });
  }
});

test.describe("mobile accessibility matrix", { tag: "@mobile" }, () => {
  for (const route of MOBILE_A11Y_ROUTES) {
    test(`axe: ${route.name}`, async ({ rootinePage: page }, testInfo) => {
      await openRootineRoute(page, route.path);
      await expectNoWcagViolations(page, testInfo);
    });
  }

  test("axe: open More drawer", async ({ rootinePage: page }, testInfo) => {
    await openRootineRoute(page, "/dzisiaj");
    await page
      .getByRole("navigation", { name: "Główna nawigacja mobilna" })
      .getByRole("button", { name: "Więcej" })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Wszystkie obszary aplikacji" }),
    ).toBeVisible();
    await expectNoWcagViolations(page, testInfo);
  });
});
