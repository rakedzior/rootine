import { describe, expect, it } from "vitest";
import {
  redactPanelForPrivacy,
  redactToolFailureForSensitiveOutput,
  redactToolPayloadForPrivacy,
  stripInternalToolMetadata,
} from "./redaction";

describe("assistant privacy redaction", () => {
  it("blocks finance payloads before they reach the model", () => {
    const result = redactToolPayloadForPrivacy({ balance: 1234 }, ["finance"], true);
    expect(result).toEqual({ privacyRestricted: true, message: "Dane ukryte przez Privacy Mode." });
  });

  it("redacts notes before rendering", () => {
    const result = redactPanelForPrivacy({
      id: "notes",
      type: "note_results",
      data: { metrics: [], items: [{ id: "n1", label: "Sekret", meta: "Treść" }], total: 1 },
    }, true);
    expect(result.data.items[0]?.meta).not.toBe("Treść");
    expect(result.data.items[0]?.label).toBe("Prywatna notatka");
  });

  it("removes note snippets and every work list before model output", () => {
    expect(redactToolPayloadForPrivacy({
      items: [{ id: "n1", title: "Sekret", context: "Pełna treść" }],
    }, ["notes"], true)).toMatchObject({
      items: [{ title: "Prywatna notatka", context: "Treść ukryta przez Privacy Mode" }],
    });

    const work = redactToolPayloadForPrivacy({
      open: [{ id: "w1", title: "Poufny klient" }],
      overdue: [{ id: "w2", title: "Poufny projekt" }],
    }, ["work"], true);
    expect(work).toMatchObject({
      open: [{ title: "Prywatny element pracy" }],
      overdue: [{ title: "Prywatny element pracy" }],
    });
  });

  it("blocks private mutation snapshots while preserving local recovery metadata separately", () => {
    expect(redactToolPayloadForPrivacy({
      entityId: "n1",
      eventId: "event-1",
      undoToken: "undo-1",
      updatedSnapshot: { id: "n1", title: "Sekret" },
    }, ["notes"], true)).toEqual({
      privacyRestricted: true,
      message: "Treść notatki ukryta przez Privacy Mode.",
    });
    expect(stripInternalToolMetadata({
      entityId: "n1",
      eventId: "event-1",
      undoToken: "undo-1",
      nested: { undoExpiresAt: "later", value: 1 },
    })).toEqual({ entityId: "n1", nested: { value: 1 } });
  });

  it("redacts ambiguous candidates on model and clarification-panel boundaries", () => {
    const failure = redactToolFailureForSensitiveOutput({
      success: false,
      code: "AMBIGUOUS",
      message: "Wybierz notatkę",
      candidates: [{ id: "n1", label: "Sekretny tytuł", context: "Poufny fragment" }],
    }, ["notes"]);
    expect(failure.candidates).toEqual([{ id: "n1", label: "Prywatna notatka", context: "Treść ukryta przez Privacy Mode" }]);

    const panel = redactPanelForPrivacy({
      id: "clarify",
      type: "clarification",
      data: {
        metrics: [],
        items: [{ id: "w1", label: "Poufny klient", meta: "Projekt" }],
        prompt: "Wybierz",
      },
    }, true, ["work"]);
    expect(panel.data.items[0]).toMatchObject({ label: "Prywatny element pracy", meta: undefined });
  });
});
