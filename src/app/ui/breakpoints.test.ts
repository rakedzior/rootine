import { describe, expect, it } from "vitest";
import { BREAKPOINTS, BREAKPOINT_EXCEPTIONS, maxWidthQuery } from "./breakpoints";

describe("responsive design-system registry", () => {
  it("keeps the four official breakpoints explicit", () => {
    expect(BREAKPOINTS).toEqual({
      detail: 1380,
      context: 1180,
      columns: 980,
      mobile: 760,
    });
  });

  it("registers feature-specific thresholds without making them official", () => {
    expect(BREAKPOINT_EXCEPTIONS).toEqual({
      settings: 560,
      densePlanner: 1100,
      nutrition: 1120,
      work: 1200,
      ambient: 1280,
    });
    expect(maxWidthQuery("mobile")).toBe("(max-width: 760px)");
  });
});
