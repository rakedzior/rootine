import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { propertyMatchesContract, scanInlineStyleObjects } from "./design-system-inline-audit.mjs";

describe("design-system inline-style scanner", () => {
  it("separates dynamic CSS properties from static presentation", () => {
    const [occurrence] = scanInlineStyleObjects(`
      const progress = 42;
      export const Fixture = () => (
        <div style={{ "--goal-progress": \`${"${progress}"}%\`, padding: "12px", fontSize: 11 }} />
      );
    `);

    assert.deepEqual(occurrence.properties, [
      { name: "--goal-progress", dynamic: true, value: "`${progress}%`" },
      { name: "padding", dynamic: false, value: '"12px"' },
      { name: "fontSize", dynamic: false, value: "11" },
    ]);
  });

  it("supports explicit prefix contracts without permitting unrelated properties", () => {
    assert.equal(propertyMatchesContract("--calendar-column", ["--calendar-*", "transform"]), true);
    assert.equal(propertyMatchesContract("transform", ["--calendar-*", "transform"]), true);
    assert.equal(propertyMatchesContract("borderRadius", ["--calendar-*", "transform"]), false);
  });

  it("treats semantic token aliases as static presentation but data members as dynamic", () => {
    const [occurrence] = scanInlineStyleObjects(`
      export const Fixture = ({ goal }) => (
        <div style={{ color: C.textMuted, borderColor: uiColors.border, background: goal.color }} />
      );
    `);

    assert.deepEqual(occurrence.properties.map(({ name, dynamic }) => ({ name, dynamic })), [
      { name: "color", dynamic: false },
      { name: "borderColor", dynamic: false },
      { name: "background", dynamic: true },
    ]);
  });
});
