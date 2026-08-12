import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractGlobalCustomProperties,
  extractRadiusScale,
  findingMatchesException,
  scanCssGovernance,
  scanLegacyVisualTokens,
  scanPrimaryCtaIcons,
} from "./design-system-source-audit.mjs";

const tokenSource = `
  :root {
    --radius-xs: 3px;
    --radius-sm: 6px;
    --radius-md: 8px;
    --radius-lg: 12px;
    --radius-xl: 16px;
    --radius-pill: 999px;
    --control-height-sm: 28px;
  }
`;
const radiusScale = extractRadiusScale(tokenSource);
const globalTokenNames = extractGlobalCustomProperties(tokenSource);

describe("design-system CSS source scanner", () => {
  it("rejects radii outside the token scale and permits semantic/circular values", () => {
    const findings = scanCssGovernance(`
      .bad { border-radius: 14px; }
      .token { border-radius: var(--radius-md); }
      .scale { border-radius: 16px 16px 0 0; }
      .circle { border-radius: 50%; }
      .inherited { border-radius: inherit; }
    `, { radiusScale, globalTokenNames, featureCss: false });

    assert.deepEqual(findings.map(({ selector, value }) => ({ selector, value })), [
      { selector: ".bad", value: "14px" },
    ]);
  });

  it("flags visual overrides of shared internals but not layout-only composition", () => {
    const findings = scanCssGovernance(`
      .feature .ui-date-picker__week button { height: 29px; display: grid; }
      .feature > .ui-field { min-width: 12rem; flex: 1; }
    `, { radiusScale, globalTokenNames, featureCss: true });

    assert.equal(findings.filter((finding) => finding.category === "uiInternalOverride").length, 1);
    assert.equal(findings[0].selector, ".feature .ui-date-picker__week button");
  });

  it("finds feature shadowing of a global token", () => {
    const [finding] = scanCssGovernance(`
      .feature { --control-height-sm: 34px; }
    `, { radiusScale, globalTokenNames, featureCss: true });

    assert.equal(finding.category, "globalTokenOverride");
    assert.equal(finding.property, "--control-height-sm");
  });

  it("flags literal local control heights and ignores tokenized or decorative geometry", () => {
    const findings = scanCssGovernance(`
      .feature-option { min-height: 34px; }
      .feature-trigger { height: var(--control-height-sm); }
      .feature-button > svg { height: 13px; }
      .feature-bar { height: 4px; }
    `, { radiusScale, globalTokenNames, featureCss: true });

    assert.deepEqual(findings.filter((finding) => finding.category === "localControlHeight")
      .map(({ selector, value }) => ({ selector, value })), [
      { selector: ".feature-option", value: "34px" },
    ]);
  });

  it("matches migration exceptions by exact selector, property, and value", () => {
    const finding = {
      file: "src/styles/feature.css",
      selector: ".feature > .ui-button",
      property: "min-height",
      value: "34px",
    };
    const entry = {
      paths: ["src/styles/feature.css"],
      selectors: [".feature>.ui-button"],
      properties: ["min-height"],
      values: ["34px"],
    };

    assert.equal(findingMatchesException(finding, entry), true);
    assert.equal(findingMatchesException({ ...finding, value: "36px" }, entry), false);
  });

  it("rejects the retired visual alias vocabulary", () => {
    const findings = scanLegacyVisualTokens(`
      .legacy { color: var(--color-precision-blue-text); background: var(--color-graphite-panel); }
      .semantic { color: var(--color-primary-text); background: var(--color-surface-1); }
    `);

    assert.deepEqual(findings.map((finding) => finding.value), [
      "--color-precision-blue-text",
      "--color-graphite-panel",
    ]);
  });

});

describe("primary CTA icon grammar", () => {
  it("accepts 13px icons with default or shared stroke", () => {
    const findings = scanPrimaryCtaIcons(`
      import { Plus, Save } from "lucide-react";
      const Fixture = () => <>
        <Button variant="primary" leadingIcon={<Plus size={13} />}>Add</Button>
        <Button variant="primary" leadingIcon={<Save size={13} strokeWidth={1.7} />}>Save</Button>
      </>;
    `);

    assert.deepEqual(findings, []);
  });

  it("rejects missing, oversized, and locally restroked primary CTA icons", () => {
    const findings = scanPrimaryCtaIcons(`
      import { Plus, Save } from "lucide-react";
      const Fixture = () => <>
        <Button variant="primary" leadingIcon={<Plus size={16} strokeWidth={2} />}>Add</Button>
        <MenuTrigger className="ui-button ui-button--primary"><Save /></MenuTrigger>
      </>;
    `);

    assert.deepEqual(findings.map(({ category, selector, value }) => ({ category, selector, value })), [
      { category: "ctaIconSize", selector: "Plus", value: "16" },
      { category: "ctaIconStroke", selector: "Plus", value: "2" },
      { category: "ctaIconSize", selector: "Save", value: "missing" },
    ]);
  });
});
