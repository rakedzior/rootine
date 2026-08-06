import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProgressBar } from "./ProgressBar";

describe("ProgressBar", () => {
  it("clamps values and exposes the configured range to assistive technology", () => {
    render(<ProgressBar value={140} min={20} max={120} label="Realizacja" valueText="140 punktów" />);

    const progress = screen.getByRole("progressbar", { name: "Realizacja" });
    expect(progress).toHaveAttribute("aria-valuemin", "20");
    expect(progress).toHaveAttribute("aria-valuemax", "120");
    expect(progress).toHaveAttribute("aria-valuenow", "120");
    expect(progress).toHaveAttribute("aria-valuetext", "140 punktów");
  });
});
