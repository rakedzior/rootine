import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TimePicker } from "./TimePicker";

afterEach(cleanup);

describe("TimePicker", () => {
  it("keeps native 24-hour entry, constraints and accessible field messages", () => {
    const onChange = vi.fn();
    render(
      <TimePicker
        label="Godzina rozpoczęcia"
        hint="Format 24-godzinny"
        error="Wybierz późniejszą godzinę"
        value="08:00"
        min="07:00"
        max="18:00"
        step={900}
        density="compact"
        onChange={onChange}
      />,
    );

    const input = screen.getByLabelText("Godzina rozpoczęcia");
    expect(input).toHaveAttribute("type", "time");
    expect(input).toHaveAttribute("lang", "pl-PL");
    expect(input).toHaveAttribute("min", "07:00");
    expect(input).toHaveAttribute("max", "18:00");
    expect(input).toHaveAttribute("step", "900");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(/Format 24-godzinny.*Wybierz późniejszą godzinę/);
    expect(input).toHaveClass("ui-time-picker__input");
    expect(input.closest(".ui-time-picker")).toHaveClass("ui-time-picker--compact");

    fireEvent.change(input, { target: { value: "09:30" } });
    expect(onChange).toHaveBeenCalledWith("09:30");
  });

  it("offers an optional keyboard list and returns focus after selection", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <TimePicker
        label="Godzina"
        value="08:00"
        onChange={onChange}
        options={["08:00", "08:30", "09:00"]}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Wybierz godzinę z listy: Godzina" });
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const listbox = screen.getByRole("listbox", { name: "Dostępne godziny: Godzina" });
    expect(within(listbox).getByRole("option", { name: "08:00" })).toHaveAttribute("aria-selected", "true");
    await waitFor(() => expect(within(listbox).getByRole("option", { name: "08:00" })).toHaveFocus());

    await user.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith("08:30");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Godzina")).toHaveFocus());
  });

  it("restores the list trigger on Escape and disables suggestions outside min/max/step", async () => {
    const user = userEvent.setup();
    render(
      <TimePicker
        aria-label="Termin godzinowy"
        value=""
        onChange={() => undefined}
        min="08:00"
        max="10:00"
        step={1800}
        options={["07:30", "08:15", "08:30"]}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Wybierz godzinę z listy" });
    await user.click(trigger);
    const listbox = screen.getByRole("listbox", { name: "Dostępne godziny" });
    expect(within(listbox).getByRole("option", { name: "07:30" })).toBeDisabled();
    expect(within(listbox).getByRole("option", { name: "08:15" })).toBeDisabled();
    expect(within(listbox).getByRole("option", { name: "08:30" })).toBeEnabled();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("can render the same accessible options inline inside an existing layer", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <TimePicker
        label="Czas trwania"
        value="08:00"
        onChange={onChange}
        options={["08:00", "08:30"]}
        optionsPresentation="inline"
      />,
    );

    expect(screen.queryByRole("button", { name: /Wybierz godzinę z listy/ })).not.toBeInTheDocument();
    const listbox = screen.getByRole("listbox", { name: "Dostępne godziny: Czas trwania" });
    await user.click(within(listbox).getByRole("option", { name: "08:30" }));
    expect(onChange).toHaveBeenCalledWith("08:30");
  });
});
