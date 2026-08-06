import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Checkbox } from "./Checkbox";

afterEach(cleanup);

describe("Checkbox", () => {
  it("exposes the round completion variant without losing checkbox semantics", () => {
    render(<Checkbox aria-label="Ukończ zadanie" size="sm" shape="round" indeterminate />);

    const checkbox = screen.getByRole("checkbox", { name: "Ukończ zadanie" });
    const control = checkbox.closest("label");

    expect(control).toHaveClass("ui-checkbox", "ui-checkbox--sm", "ui-checkbox--round");
    expect(checkbox).toHaveClass("ui-checkbox__input");
    expect(checkbox).toHaveProperty("indeterminate", true);
  });
});
