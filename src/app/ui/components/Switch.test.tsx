import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, type ChangeEvent } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Switch } from "./Switch";
import uiCss from "../../../styles/ui.css?raw";

afterEach(cleanup);

describe("Switch", () => {
  it("keeps native checkbox state while exposing switch semantics", () => {
    render(
      <Switch
        label="Synchronizacja"
        description="Zapisuje zmiany na wszystkich urządzeniach."
        defaultChecked
      />,
    );

    const control = screen.getByRole("switch", { name: "Synchronizacja" });
    expect(control).toHaveAttribute("type", "checkbox");
    expect(control).toBeChecked();
    expect(control).toHaveAccessibleDescription("Zapisuje zmiany na wszystkich urządzeniach.");
    expect(control.closest("label")).toHaveClass("ui-switch");
  });

  it("toggles with Space and forwards focus to the native input", async () => {
    const user = userEvent.setup();
    const inputRef = createRef<HTMLInputElement>();
    render(<Switch ref={inputRef} aria-label="Tryb skupienia" />);
    const control = screen.getByRole("switch", { name: "Tryb skupienia" });

    inputRef.current?.focus();
    expect(control).toHaveFocus();
    expect(control).not.toBeChecked();

    await user.keyboard(" ");
    expect(control).toBeChecked();
    await user.keyboard(" ");
    expect(control).not.toBeChecked();
  });

  it("reports controlled checked state and emits the native change event", async () => {
    const user = userEvent.setup();
    const checkedChanges: boolean[] = [];
    const onChange = vi.fn((event: ChangeEvent<HTMLInputElement>) => {
      checkedChanges.push(event.currentTarget.checked);
    });
    render(<Switch aria-label="Powiadomienia" checked onChange={onChange} />);
    const control = screen.getByRole("switch", { name: "Powiadomienia" });

    expect(control).toBeChecked();
    await user.click(control.closest("label") as HTMLLabelElement);
    expect(onChange).toHaveBeenCalledOnce();
    expect(checkedChanges).toEqual([false]);
  });

  it("does not toggle or emit changes when disabled", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Switch aria-label="Moduł Praca" disabled onChange={onChange} />);
    const control = screen.getByRole("switch", { name: "Moduł Praca" });

    expect(control).toBeDisabled();
    await user.click(control.closest("label") as HTMLLabelElement);
    expect(control).not.toBeChecked();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps the visual track compact while enlarging the coarse-pointer hit target", () => {
    expect(uiCss).toContain("--component-switch-track-width");
    expect(uiCss).toMatch(/@media \(pointer: coarse\)[\s\S]*?\.ui-switch\s*\{[\s\S]*?min-height: var\(--component-option-height-touch\)/);
  });
});
