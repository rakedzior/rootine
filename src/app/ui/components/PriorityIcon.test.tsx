import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PriorityIcon } from "./PriorityIcon";
import { priorityOptionTone } from "./priority";

describe("PriorityIcon", () => {
  it("uses one 13px flag grammar and semantic colour token", () => {
    const { container } = render(<PriorityIcon level="high" />);
    const flag = container.querySelector("svg");
    expect(flag).toHaveAttribute("width", "13");
    expect(flag).toHaveAttribute("height", "13");
    expect(flag).toHaveAttribute("stroke-width", "1.7");
    expect(flag).toHaveClass("ui-priority-icon", "ui-priority-icon--high");
    expect(flag).toHaveAttribute("fill", "currentColor");
  });

  it("maps priority levels to the shared Select tones", () => {
    expect(["none", "normal", "low", "medium", "high"].map((level) => (
      priorityOptionTone(level as Parameters<typeof priorityOptionTone>[0])
    ))).toEqual(["default", "default", "primary", "warning", "danger"]);
  });
});
