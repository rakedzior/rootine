import { describe, expect, it } from "vitest";
import { deterministicQuickCaptureParser } from "./quickCapture";

const SUNDAY_MORNING = new Date(2026, 7, 2, 9, 30, 0, 0);

describe("deterministicQuickCaptureParser", () => {
  it("parses the brief's quick-capture example without pretending to save it", () => {
    const result = deterministicQuickCaptureParser.parse(
      "Jutro o 16 odebrać garnitur",
      SUNDAY_MORNING,
    );

    expect(result).toMatchObject({
      source: "Jutro o 16 odebrać garnitur",
      title: "Jutro o 16 odebrać garnitur",
      kind: "task",
      date: "2026-08-03",
      time: "16:00",
    });
    expect(result.matched).toEqual(expect.arrayContaining(["jutro", "o 16"]));
  });

  it("understands today, the day after tomorrow and time with minutes", () => {
    expect(deterministicQuickCaptureParser.parse("Dziś o 7.05 ważne", SUNDAY_MORNING)).toMatchObject({
      date: "2026-08-02",
      time: "07:05",
      priority: "medium",
    });
    expect(deterministicQuickCaptureParser.parse("Pojutrze 18:30", SUNDAY_MORNING)).toMatchObject({
      date: "2026-08-04",
      time: "18:30",
    });
  });

  it("resolves Polish weekday names to the next occurrence", () => {
    expect(deterministicQuickCaptureParser.parse("W środę przegląd", SUNDAY_MORNING).date)
      .toBe("2026-08-05");
    expect(deterministicQuickCaptureParser.parse("W niedzielę spacer", SUNDAY_MORNING).date)
      .toBe("2026-08-09");
  });

  it.each([
    ["Codziennie poranna rutyna", "habit"],
    ["Trening na siłowni", "workout"],
    ["Obiad z rodziną", "meal"],
    ["Opłacić rachunek", "payment"],
    ["Wydatek — zakup butów", "expense"],
    ["Notatka: pomysł na prezent", "note"],
    ["Cel: kamień milowy projektu", "goal"],
    ["Sprawa w urzędzie", "affair"],
    ["Oddzwonić do Ani", "task"],
  ] as const)("classifies %s as %s", (source, kind) => {
    expect(deterministicQuickCaptureParser.parse(source, SUNDAY_MORNING).kind).toBe(kind);
  });

  it.each([
    ["pilne: wysłać ofertę", "high"],
    ["kiedyś uporządkować archiwum", "low"],
    ["ważne spotkanie", "medium"],
  ] as const)("recognizes priority in %s", (source, priority) => {
    expect(deterministicQuickCaptureParser.parse(source, SUNDAY_MORNING).priority).toBe(priority);
  });

  it("keeps the original source and trims only the proposed title", () => {
    const result = deterministicQuickCaptureParser.parse("  Jutro zadzwonić  ", SUNDAY_MORNING);

    expect(result.source).toBe("  Jutro zadzwonić  ");
    expect(result.title).toBe("Jutro zadzwonić");
  });
});
