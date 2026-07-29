import { beforeEach, describe, expect, it } from "vitest";
import { loadTaskWorkspace } from "./taskWorkspace";
import { addExternalTask } from "./taskLinks";

describe("external task links", () => {
  beforeEach(() => window.localStorage.clear());

  it("adds a native task once and keeps its source marker", () => {
    const input = {
      source: {
        kind: "notes" as const,
        entity: "note-a/note",
        context: "Pomysły",
        href: "/notatki?notatka=note-a",
      },
      text: "Sprawdzić pomysł",
      calendarDate: "2026-08-02",
      list: "notatki",
      tags: ["notatki"],
    };

    const first = addExternalTask(input);
    expect(first.status).toBe("added");
    if (first.status === "added") {
      expect(first.task.id).toBeLessThan(0);
      expect(first.task.source).toMatchObject({ kind: "notes", managed: "native" });
      expect(first.task.calendarDate).toBe("2026-08-02");
    }

    const second = addExternalTask({ ...input, text: "Zmieniony tytuł" });
    expect(second.status).toBe("exists");
    expect(loadTaskWorkspace().tasks.filter((task) => task.source?.entity === "note-a/note")).toHaveLength(1);
  });
});
