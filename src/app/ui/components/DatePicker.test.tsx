import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { DatePicker } from "./DatePicker";

function ControlledDatePicker({ initial = "2026-07-28" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <DatePicker label="Termin" value={value} onChange={setValue} />;
}

describe("DatePicker", () => {
  it("uses a roving APG grid and returns focus on Escape", async () => {
    const user = userEvent.setup();
    render(<ControlledDatePicker />);
    const trigger = screen.getByRole("button", { name: /Termin.*28 lipca 2026/i });

    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: /Wybierz datę.*lipiec 2026/i });
    const dayButtons = within(dialog).getAllByRole("button")
      .filter((button) => button.hasAttribute("data-date-key"));

    expect(within(dialog).getByRole("columnheader", { name: "Poniedziałek" })).toBeInTheDocument();
    expect(dayButtons.filter((button) => button.tabIndex === 0)).toHaveLength(1);
    await waitFor(() => expect(screen.getByRole("button", { name: "28 lipca 2026" })).toHaveFocus());

    await user.keyboard("{PageDown}");
    await waitFor(() => expect(screen.getByRole("button", { name: "28 sierpnia 2026" })).toHaveFocus());

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("changes only after a date is explicitly selected", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <div>
        <DatePicker aria-label="Data zadania" value="2026-07-28" onChange={onChange} />
        <button type="button">Poza kalendarzem</button>
      </div>,
    );

    await user.click(screen.getByRole("button", { name: /Data zadania.*28 lipca 2026/i }));
    await user.click(screen.getByRole("button", { name: "Poza kalendarzem" }));
    expect(onChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /Data zadania.*28 lipca 2026/i }));
    await user.click(screen.getByRole("button", { name: "30 lipca 2026" }));
    expect(onChange).toHaveBeenCalledWith("2026-07-30");
  });
});
