import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Textarea } from "./Textarea";

describe("Textarea", () => {
  it("connects its label, hint and error to the multiline control", () => {
    render(<Textarea label="Notatka" hint="Opcjonalnie" error="Za długa treść" />);

    const control = screen.getByRole("textbox", { name: "Notatka" });
    expect(control).toHaveAttribute("aria-invalid", "true");
    expect(control).toHaveAccessibleDescription("Opcjonalnie Za długa treść");
  });

  it("can participate directly in a feature-owned layout", () => {
    render(<Textarea embedded aria-label="Opis" className="feature-textarea" />);

    const control = screen.getByRole("textbox", { name: "Opis" });
    expect(control.parentElement).toHaveClass("ui-field--embedded");
    expect(control).toHaveClass("ui-field__textarea", "feature-textarea");
  });
});
