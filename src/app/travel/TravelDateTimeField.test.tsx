import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TravelDateTimeField,
} from "./TravelDateTimeField";
import { joinLocalDateTime, splitLocalDateTime } from "./travelDateTime";

afterEach(cleanup);

describe("TravelDateTimeField", () => {
  it("keeps the persisted local datetime contract", () => {
    expect(splitLocalDateTime("2026-08-12T08:30")).toEqual({ date: "2026-08-12", time: "08:30" });
    expect(splitLocalDateTime("")).toEqual({ date: "", time: "" });
    expect(joinLocalDateTime("2026-08-12", "08:30")).toBe("2026-08-12T08:30");
    expect(joinLocalDateTime("2026-08-12", "")).toBe("");
  });

  it("maps same-day datetime boundaries to the shared time field", () => {
    const onChange = vi.fn();
    render(
      <TravelDateTimeField
        label="Odjazd / wylot"
        value="2026-08-12T08:30"
        min="2026-08-12T08:00"
        max="2026-08-12T10:00"
        onChange={onChange}
      />,
    );

    const group = screen.getByRole("group", { name: "Odjazd / wylot" });
    const timeInput = within(group).getByLabelText("Godzina");
    expect(timeInput).toHaveAttribute("type", "time");
    expect(timeInput).toHaveAttribute("min", "08:00");
    expect(timeInput).toHaveAttribute("max", "10:00");

    fireEvent.change(timeInput, { target: { value: "09:30" } });
    expect(onChange).toHaveBeenCalledWith("2026-08-12T09:30");
  });

  it("keeps time unavailable until a travel date exists", () => {
    render(<TravelDateTimeField label="Przyjazd / przylot" value="" onChange={() => undefined} />);

    const group = screen.getByRole("group", { name: "Przyjazd / przylot" });
    expect(within(group).getByLabelText("Godzina")).toBeDisabled();
  });
});
