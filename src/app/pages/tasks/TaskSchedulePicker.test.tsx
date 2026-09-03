import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DatePickerPopup } from "./TaskSchedulePicker";
import type { DateVal } from "./taskPageModel";

const baseValue: DateVal = {
  date: new Date("2026-08-12T12:00:00"),
  endDate: new Date("2026-08-12T12:00:00"),
  time: "",
  reminder: "",
  repeat: "",
  startTime: "09:00",
  endTime: "10:00",
  duration: false,
  allDay: true,
  timezone: "Europe/Warsaw",
};

const anchors: HTMLElement[] = [];

function renderPicker(value: DateVal = baseValue) {
  const anchor = document.createElement("button");
  anchor.textContent = "Termin";
  document.body.append(anchor);
  anchors.push(anchor);
  const onClose = vi.fn();
  const onConfirm = vi.fn();

  render(
    <DatePickerPopup
      value={value}
      onClose={onClose}
      onConfirm={onConfirm}
      anchorEl={anchor}
    />,
  );

  return { anchor, onClose, onConfirm };
}

function renderPickerWithFocusTarget(focusAfterConfirm: HTMLElement) {
  const anchor = document.createElement("button");
  anchor.textContent = "Termin";
  document.body.append(anchor);
  anchors.push(anchor);
  const onClose = vi.fn();
  const onConfirm = vi.fn();

  render(
    <DatePickerPopup
      value={baseValue}
      onClose={onClose}
      onConfirm={onConfirm}
      anchorEl={anchor}
      focusAfterConfirm={focusAfterConfirm}
    />,
  );

  return { anchor, onClose, onConfirm };
}

afterEach(() => {
  cleanup();
  anchors.splice(0).forEach((anchor) => anchor.remove());
});

describe("TaskSchedulePicker layered interactions", () => {
  it("returns focus to the composer after confirming a new task date", async () => {
    const user = userEvent.setup();
    const input = document.createElement("input");
    document.body.append(input);
    anchors.push(input);
    const { anchor, onClose, onConfirm } = renderPickerWithFocusTarget(input);

    await user.click(screen.getByRole("button", { name: "Zapisz termin" }));

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
    await waitFor(() => expect(input).toHaveFocus());
    expect(anchor).not.toHaveFocus();
  });

  it("opens time and reminder in one child layer without replacing the parent", async () => {
    const user = userEvent.setup();
    const { onClose } = renderPicker();
    const parent = screen.getByRole("dialog", { name: "Ustaw termin zadania" });
    const initialWidth = parent.style.width;

    await user.click(within(parent).getByRole("button", { name: "Czas" }));
    const timeLayer = screen.getByRole("dialog", { name: "Wybierz godzinę" });
    expect(timeLayer).toBeVisible();
    expect(parent.style.width).toBe(initialWidth);

    const now = new Date();
    const rounded = (Math.floor((now.getHours() * 60 + now.getMinutes()) / 30) + 1) * 30;
    const expectedTime = rounded >= 24 * 60
      ? "00:00"
      : `${String(Math.floor(rounded / 60)).padStart(2, "0")}:${String(rounded % 60).padStart(2, "0")}`;
    expect(within(timeLayer).getByRole("option", { name: expectedTime })).toHaveAttribute("aria-selected", "true");

    await user.click(within(parent).getByRole("button", { name: "Przypomnienie" }));
    expect(screen.queryByRole("dialog", { name: "Wybierz godzinę" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Przypomnienie" })).toBeVisible();
    expect(parent.style.width).toBe(initialWidth);
    expect(onClose).not.toHaveBeenCalled();

    await user.click(within(parent).getByText(/sierpień 2026/i));
    expect(screen.queryByRole("dialog", { name: "Przypomnienie" })).not.toBeInTheDocument();
    expect(parent).toBeVisible();
    expect(onClose).not.toHaveBeenCalled();

    await user.click(document.body);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps the all-day switch linked and exposes editable duration controls", async () => {
    const user = userEvent.setup();
    renderPicker({ ...baseValue, allDay: false, time: "16:00", startTime: "16:00", endTime: "17:00" });
    const parent = screen.getByRole("dialog", { name: "Ustaw termin zadania" });

    await user.click(within(parent).getByRole("tab", { name: "Czas trwania" }));
    expect(within(parent).getByText("Start", { exact: true })).toBeVisible();
    expect(within(parent).getByText("Koniec", { exact: true })).toBeVisible();
    const durationControls = parent.querySelectorAll<HTMLButtonElement>(".task-sched__duration-control");
    expect(durationControls).toHaveLength(4);

    await user.click(durationControls[0]);
    expect(screen.getByRole("dialog", { name: "Wybierz datę" })).toBeVisible();
    await user.click(durationControls[0]);
    expect(screen.queryByRole("dialog", { name: "Wybierz datę" })).not.toBeInTheDocument();

    const timezoneButton = within(parent).getByRole("button", { name: /Warsaw, GMT/i });
    await user.click(timezoneButton);
    const timezoneLayer = screen.getByRole("dialog", { name: "Wybierz strefę czasową" });
    await user.type(within(timezoneLayer).getByRole("searchbox"), "London");
    await user.click(within(timezoneLayer).getByRole("menuitemradio", { name: /London, GMT/i }));
    expect(within(parent).getByRole("button", { name: /London, GMT/i })).toBeVisible();

    const durationAllDay = within(parent).getByRole("switch", { name: "Cały dzień" });
    expect(durationAllDay).toHaveClass("ui-switch__input");
    await user.click(durationAllDay);
    expect(durationAllDay).toBeChecked();
    expect(parent.querySelectorAll<HTMLButtonElement>(".task-sched__duration-control--time")[0]).toBeDisabled();

    await user.click(within(parent).getByRole("tab", { name: "Data" }));
    const dateAllDay = within(parent).getByRole("switch", { name: "Cały dzień" });
    expect(dateAllDay).toHaveClass("ui-switch__input");
    expect(dateAllDay).toBeChecked();
    await user.click(dateAllDay);
    expect(dateAllDay).not.toBeChecked();
  }, 15_000);
});
