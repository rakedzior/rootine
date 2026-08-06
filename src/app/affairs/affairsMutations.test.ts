import { describe, expect, it } from "vitest";
import { createDefaultAffairsWorkspace } from "../data/affairsWorkspace";
import { EMPTY_DRAFT } from "./affairsPresentation";
import { applyAffairsEditor } from "./affairsMutations";

describe("affairs matter editor", () => {
  it("stores appointments with time, place, and the selected reminder schedule", () => {
    const result = applyAffairsEditor({
      editor: { kind: "matter", mode: "add" },
      workspace: createDefaultAffairsWorkspace(),
      budgetMonthKey: "2026-08",
      draft: {
        ...EMPTY_DRAFT,
        title: "Wizyta w urzędzie",
        dueDate: "2026-08-20",
        matterKind: "appointment",
        time: "10:30",
        location: "Urząd Miasta",
        reminderPreset: "day-and-two-hours",
        sourceAttentionKey: "document:passport:2026-08-20",
      },
    });

    expect("error" in result).toBe(false);
    if ("nextWorkspace" in result) {
      expect(result.nextWorkspace.matters.at(-1)).toMatchObject({
        kind: "appointment",
        time: "10:30",
        location: "Urząd Miasta",
        reminderMinutes: [1_440, 120],
        sourceAttentionKey: "document:passport:2026-08-20",
      });
    }
  });

  it("requires a time for an appointment", () => {
    const result = applyAffairsEditor({
      editor: { kind: "matter", mode: "add" },
      workspace: createDefaultAffairsWorkspace(),
      budgetMonthKey: "2026-08",
      draft: {
        ...EMPTY_DRAFT,
        title: "Wizyta",
        dueDate: "2026-08-20",
        matterKind: "appointment",
        time: "",
      },
    });

    expect(result).toMatchObject({ error: "Wybierz datę i godzinę wizyty." });
  });

  it("allows an ordinary task without a deadline", () => {
    const result = applyAffairsEditor({
      editor: { kind: "matter", mode: "add" },
      workspace: createDefaultAffairsWorkspace(),
      budgetMonthKey: "2026-08",
      draft: {
        ...EMPTY_DRAFT,
        title: "Zebrać dokumenty",
        matterKind: "task",
        dueDate: "",
      },
    });

    expect("error" in result).toBe(false);
    if ("nextWorkspace" in result) {
      expect(result.nextWorkspace.matters.at(-1)).toMatchObject({
        title: "Zebrać dokumenty",
        dueDate: "",
      });
    }
  });
});
