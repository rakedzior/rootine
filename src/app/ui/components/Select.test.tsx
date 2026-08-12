import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Flag, Folder } from "lucide-react";
import { Select } from "./Select";

afterEach(cleanup);

describe("Select", () => {
  it("renders rich options with a named density while preserving combobox ARIA", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const selectedValues: string[] = [];
    render(
      <Select
        label="Priorytet"
        value="medium"
        density="compact"
        onChange={(event) => {
          selectedValues.push(event.currentTarget.value);
          onChange(event);
        }}
        options={[
          { value: "medium", label: "Średni", leadingIcon: <Flag data-testid="medium-icon" />, meta: "2", tone: "warning" },
          { value: "high", label: "Wysoki", description: "Wymaga uwagi", leadingIcon: <Folder />, meta: "1", tone: "danger" },
        ]}
      />,
    );

    const trigger = screen.getByRole("combobox", { name: /Priorytet.*Średni/ });
    expect(trigger).toHaveAttribute("aria-haspopup", "listbox");
    expect(trigger).toHaveClass("ui-select-trigger--compact");
    expect(within(trigger).getByTestId("medium-icon")).toBeInTheDocument();

    await user.click(trigger);
    const listbox = screen.getByRole("listbox", { name: "Priorytet" });
    expect(listbox).toHaveClass("ui-select-menu--compact");
    const high = within(listbox).getByRole("option", { name: /Wysoki.*Wymaga uwagi.*1/ });
    expect(high).toHaveClass("ui-select-option--danger");
    expect(high).toHaveAttribute("aria-selected", "false");

    await user.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalled();
    expect(selectedValues).toContain("high");
  });

  it("keeps the compact boolean as a backwards-compatible alias", () => {
    render(<Select aria-label="Widok" compact defaultValue="all" options={[{ value: "all", label: "Wszystkie" }]} />);
    expect(screen.getByRole("combobox", { name: /Widok.*Wszystkie/ })).toHaveClass("ui-select-trigger--compact");
  });
});
