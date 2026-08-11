import { describe, expect, it } from "vitest";
import { buildItineraryDays, formatDate, formatDateTime, formatMoney } from "./travelPresentation";
import type { TravelTrip } from "../data/travelWorkspace";

describe("travelPresentation formatters", () => {
  it("preserves grosze in travel budgets", () => {
    expect(formatMoney(1_431.99, "PLN")).toBe("1\u00a0431,99\u00a0zł");
    expect(formatMoney(23_120, "PLN")).toBe("23\u00a0120\u00a0zł");
  });

  it("keeps domain fallbacks while delegating valid values", () => {
    expect(formatDate("")).toBe("Bez daty");
    expect(formatDate("2026-12-31")).toBe("31 gru 2026");
    expect(formatDateTime("")).toBe("Nie ustalono");
  });

  it("builds a complete, chronologically ordered day plan", () => {
    const trip = {
      startDate: "2026-10-03",
      endDate: "2026-10-06",
      itinerary: [
        { id: "late", date: "2026-10-05", time: "18:00", title: "Kolacja", location: "Porto", kind: "food", note: "", reserved: false },
        { id: "early", date: "2026-10-05", time: "09:00", title: "Spacer", location: "Ribeira", kind: "sightseeing", note: "", reserved: false },
      ],
    } as TravelTrip;

    expect(buildItineraryDays(trip)).toEqual([
      { date: "2026-10-03", dayNumber: 1, items: [] },
      { date: "2026-10-04", dayNumber: 2, items: [] },
      { date: "2026-10-05", dayNumber: 3, items: [trip.itinerary[1], trip.itinerary[0]] },
      { date: "2026-10-06", dayNumber: 4, items: [] },
    ]);
  });
});
