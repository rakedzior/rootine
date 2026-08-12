import { describe, expect, it } from "vitest";
import type { QuickCaptureResult } from "./quickCapture";
import {
  COMMAND_CENTER_ACTIONS,
  actionTarget,
  payloadForAction,
  type CommandCenterActionId,
} from "./commandCenterActions";

const FULL_CAPTURE: QuickCaptureResult = {
  source: "Jutro o 16 przygotować raport, pilne",
  title: "Jutro o 16 przygotować raport, pilne",
  kind: "work",
  date: "2026-08-13",
  time: "16:00",
  priority: "high",
  matched: ["jutro", "o 16", "wysoki priorytet"],
};

function action(id: CommandCenterActionId) {
  const result = COMMAND_CENTER_ACTIONS.find((candidate) => candidate.id === id);
  if (!result) throw new Error(`Missing command-center action: ${id}`);
  return result;
}

function targetParams(id: CommandCenterActionId) {
  const target = actionTarget(action(id), FULL_CAPTURE);
  return new URL(target, "https://rootine.test").searchParams;
}

describe("Command Center payload capabilities", () => {
  it("preserves the complete schedule only for targets that support it", () => {
    expect(Object.fromEntries(targetParams("task"))).toMatchObject({
      akcja: "nowe-zadanie",
      tytul: FULL_CAPTURE.title,
      data: "2026-08-13",
      godzina: "16:00",
      priorytet: "high",
    });

    expect(Object.fromEntries(targetParams("affair"))).toMatchObject({
      akcja: "nowa-sprawa",
      tytul: FULL_CAPTURE.title,
      data: "2026-08-13",
      godzina: "16:00",
      priorytet: "high",
    });
  });

  it("keeps the full supported schedule for Work tasks", () => {
    const params = targetParams("work");

    expect(params.get("tytul")).toBe(FULL_CAPTURE.title);
    expect(params.get("data")).toBe("2026-08-13");
    expect(params.get("priorytet")).toBe("high");
    expect(params.get("godzina")).toBe("16:00");
  });

  it("keeps Goal title, due date and priority without adding time to the model", () => {
    const params = targetParams("goal");

    expect(params.get("tytul")).toBe(FULL_CAPTURE.title);
    expect(params.get("data")).toBe("2026-08-13");
    expect(params.get("priorytet")).toBe("high");
    expect(params.has("godzina")).toBe(false);
  });

  it("limits title-only and dated actions to their declared fields", () => {
    expect([...targetParams("habit").keys()].sort()).toEqual(["akcja", "tytul", "widok"]);
    expect([...targetParams("note").keys()].sort()).toEqual(["akcja", "tytul"]);
    expect([...targetParams("meal").keys()].sort()).toEqual(["akcja", "data", "tytul"]);
    expect([...targetParams("payment").keys()].sort()).toEqual(["akcja", "data", "tytul", "widok"]);
  });

  it("filters preview data with the same capability contract as navigation", () => {
    expect(payloadForAction(action("work"), FULL_CAPTURE)).toEqual({
      title: FULL_CAPTURE.title,
      date: "2026-08-13",
      time: "16:00",
      priority: "high",
    });
    expect(payloadForAction(action("note"), FULL_CAPTURE)).toEqual({
      title: FULL_CAPTURE.title,
    });
  });

  it("normalizes parsed priority to the binary priority scale used by Affairs", () => {
    const mediumCapture = { ...FULL_CAPTURE, priority: "medium" as const };
    const lowCapture = { ...FULL_CAPTURE, priority: "low" as const };

    expect(payloadForAction(action("affair"), mediumCapture).priority).toBe("high");
    expect(actionTarget(action("affair"), mediumCapture)).toContain("priorytet=high");
    expect(payloadForAction(action("affair"), lowCapture).priority).toBe("normal");
    expect(actionTarget(action("affair"), lowCapture)).toContain("priorytet=normal");

    expect(payloadForAction(action("task"), mediumCapture).priority).toBe("medium");
  });

  it("declares every payload capability on every action", () => {
    for (const item of COMMAND_CENTER_ACTIONS) {
      expect(Object.keys(item.capabilities).sort()).toEqual(["date", "priority", "time", "title"]);
      expect(item.capabilities.title).toBe(true);
    }
  });
});
