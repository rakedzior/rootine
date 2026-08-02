import { beforeEach, describe, expect, it } from "vitest";
import type { NotesWorkspace } from "../../app/data/notesWorkspace";
import { resetDomainTestStorage } from "../testSupport";
import { createSafeNoteSnippet, searchNotes } from "./noteQueries";

describe("note query privacy boundary", () => {
  beforeEach(() => {
    resetDomainTestStorage();
    const workspace: NotesWorkspace = {
      version: 1,
      updatedAt: "2026-08-02T08:00:00.000Z",
      lists: [],
      notes: [{
        id: "note-sensitive",
        title: "Dane prywatne",
        body: `<script>apiKey = "never expose"</script><p>${"Poufna treść ".repeat(30)}</p>`,
        kind: "text",
        items: [],
        tags: ["prywatne"],
        listId: "",
        color: "graphite",
        pinned: false,
        archived: false,
        createdAt: "2026-08-02T08:00:00.000Z",
        updatedAt: "2026-08-02T08:00:00.000Z",
      }],
    };
    window.localStorage.setItem("rootine.notes-workspace.v1", JSON.stringify(workspace));
  });

  it("returns only a short plain-text snippet and removes executable content", () => {
    const result = searchNotes({ query: "dane prywatne" });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].snippet.length).toBeLessThanOrEqual(120);
    expect(result.items[0].snippet).not.toContain("apiKey");
    expect(result.items[0]).not.toHaveProperty("body");
  });

  it("strips control characters and markup from standalone snippets", () => {
    expect(createSafeNoteSnippet("<b>Hasło</b>\u0000  test", 50)).toBe("Hasło test");
  });
});
