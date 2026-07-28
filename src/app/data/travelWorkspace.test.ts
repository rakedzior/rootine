import { describe, expect, it } from "vitest";
import {
  isDateWithinTrip,
  normalizeIsoCurrency,
  summarizeTravelBudget,
  type TravelTrip,
} from "./travelWorkspace";

function createTrip(): TravelTrip {
  return {
    id: "trip-test",
    name: "Test",
    destination: "Test",
    startDate: "2026-08-10",
    endDate: "2026-08-15",
    status: "planning",
    travelers: ["A"],
    baseCurrency: "PLN",
    note: "",
    archivedAt: null,
    stays: [{
      id: "stay-1",
      name: "Hotel",
      city: "Test",
      address: "",
      checkIn: "2026-08-10",
      checkOut: "2026-08-15",
      bookingRef: "",
      status: "paid",
      amount: 800,
    }],
    transports: [{
      id: "transport-1",
      mode: "train",
      title: "Pociąg",
      from: "A",
      to: "B",
      departure: "2026-08-10T08:00",
      arrival: "2026-08-10T10:00",
      bookingRef: "",
      status: "booked",
      amount: 300,
    }],
    itinerary: [],
    budget: [
      { id: "budget-stay", category: "stay", label: "Nocleg", planned: 1_000, actual: 800, paid: true },
      { id: "budget-food", category: "food", label: "Jedzenie", planned: 400, actual: 100, paid: false },
    ],
    documents: [],
    tasks: [],
  };
}

describe("travel workspace domain helpers", () => {
  it("accepts supported three-letter currencies and rejects malformed values", () => {
    expect(normalizeIsoCurrency("pln")).toBe("PLN");
    expect(normalizeIsoCurrency("EU")).toBeNull();
    expect(normalizeIsoCurrency("12A")).toBeNull();
  });

  it("validates dates against the inclusive trip range", () => {
    const trip = createTrip();
    expect(isDateWithinTrip("2026-08-10", trip)).toBe(true);
    expect(isDateWithinTrip("2026-08-15", trip)).toBe(true);
    expect(isDateWithinTrip("2026-08-16", trip)).toBe(false);
  });

  it("includes linked reservations without double-counting matching budget actuals", () => {
    const summary = summarizeTravelBudget(createTrip());
    expect(summary.planned).toBe(1_700);
    expect(summary.actual).toBe(1_200);
    expect(summary.paid).toBe(800);
    expect(summary.reservationCommitted).toBe(1_100);
    expect(summary.unbudgetedReservations).toBe(300);
    expect(summary.remaining).toBe(500);
  });
});
