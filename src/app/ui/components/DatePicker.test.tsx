import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DatePicker } from "./DatePicker";

afterEach(cleanup);

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

  it("applies compact density to both the trigger and inline calendar", async () => {
    const user = userEvent.setup();
    const view = render(
      <DatePicker label="Termin" value="2026-07-28" density="compact" onChange={() => undefined} />,
    );
    const trigger = screen.getByRole("button", { name: /Termin.*28 lipca 2026/i });
    expect(trigger).toHaveClass("ui-date-trigger--compact");
    await user.click(trigger);
    expect(screen.getByRole("dialog", { name: /Wybierz datę/i })).toHaveClass("ui-date-picker--compact");

    view.unmount();
    render(<DatePicker aria-label="Termin" value="2026-07-28" density="compact" inline onChange={() => undefined} />);
    const inlineCalendar = screen.getByRole("dialog", { name: /Termin.*lipiec 2026/i });
    expect(inlineCalendar).toHaveClass("ui-date-picker--compact", "ui-date-picker--inline");
  });

  it("applies a feature hook directly to the trigger root", () => {
    render(
      <DatePicker
        aria-label="Termin projektu"
        value="2026-07-28"
        triggerClassName="work-project-date-trigger"
        onChange={() => undefined}
      />,
    );

    expect(screen.getByRole("button", { name: /Termin projektu.*28 lipca 2026/i }))
      .toHaveClass("ui-date-trigger", "work-project-date-trigger");
  });
});
