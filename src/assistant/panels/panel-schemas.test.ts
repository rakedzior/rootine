import { describe, expect, it } from "vitest";
import { assistantPanelSpecSchema, assistantViewSchema } from "./panel-schemas";

describe("assistant panel schemas", () => {
  it("accepts a closed task candidate panel", () => {
    expect(assistantPanelSpecSchema.safeParse({
      id: "panel-1",
      type: "task_candidates",
      data: { items: [{ id: "1", label: "Raport" }], total: 1 },
    }).success).toBe(true);
  });

  it("rejects arbitrary panel and layout names", () => {
    expect(assistantPanelSpecSchema.safeParse({ id: "x", type: "html", data: {} }).success).toBe(false);
    expect(assistantViewSchema.safeParse({
      id: "view",
      title: "X",
      layout: "twelve_columns",
      panels: [],
    }).success).toBe(false);
  });

  it("rejects presentation-controlled CSS", () => {
    expect(assistantPanelSpecSchema.safeParse({
      id: "panel-1",
      type: "priority_tasks",
      className: "bg-red-500",
      data: { items: [], total: 0 },
    }).success).toBe(false);
  });
});
