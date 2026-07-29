import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, formatMoney } from "./travelPresentation";

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
});
