import { useState } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, Link, RouterProvider, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { readSessionDraft, useDraftProtection } from "./useDraftProtection";

const STORAGE_KEY = "rootine.test-draft.v1";

function DraftHarness() {
  const location = useLocation();
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState("");
  const protection = useDraftProtection({
    active: open,
    isDirty: draft !== "",
    draft,
    storageKey: STORAGE_KEY,
    onDiscard: () => setOpen(false),
  });

  return (
    <>
      <Link to="/next">Przejdź dalej</Link>
      <Link to="/?widok=all">Zmień widok</Link>
      <p>Query: {location.search || "brak"}</p>
      {open ? (
        <>
          <label htmlFor="draft">Szkic</label>
          <input id="draft" value={draft} onChange={(event) => setDraft(event.target.value)} />
          <button type="button" onClick={protection.requestClose}>Zamknij formularz</button>
        </>
      ) : <p>Formularz zamknięty</p>}
      {protection.promptOpen && (
        <ConfirmDialog
          title="Odrzucić zmiany?"
          onCancel={protection.keepEditing}
          onConfirm={protection.confirmDiscard}
        />
      )}
    </>
  );
}

function renderHarness() {
  const router = createMemoryRouter([
    { path: "/", element: <DraftHarness /> },
    { path: "/next", element: <h1>Następny widok</h1> },
  ]);
  render(<RouterProvider router={router} />);
}

describe("useDraftProtection", () => {
  beforeEach(() => window.sessionStorage.clear());
  afterEach(cleanup);

  it("persists a dirty draft and asks before a local close", async () => {
    const user = userEvent.setup();
    renderHarness();

    await user.type(screen.getByRole("textbox", { name: "Szkic" }), "ważne");
    await waitFor(() => expect(readSessionDraft(STORAGE_KEY)).toBe("ważne"));
    await user.click(screen.getByRole("button", { name: "Zamknij formularz" }));
    expect(screen.getByRole("dialog", { name: "Odrzucić zmiany?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Usuń" }));

    expect(screen.getByText("Formularz zamknięty")).toBeInTheDocument();
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("blocks SPA navigation until the user explicitly discards", async () => {
    const user = userEvent.setup();
    renderHarness();

    await user.type(screen.getByRole("textbox", { name: "Szkic" }), "ważne");
    await user.click(screen.getByRole("link", { name: "Przejdź dalej" }));
    expect(screen.queryByRole("heading", { name: "Następny widok" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Usuń" }));
    expect(await screen.findByRole("heading", { name: "Następny widok" })).toBeInTheDocument();
  });

  it("closes the local editor when a confirmed navigation only changes query state", async () => {
    const user = userEvent.setup();
    renderHarness();

    await user.type(screen.getByRole("textbox", { name: "Szkic" }), "ważne");
    await user.click(screen.getByRole("link", { name: "Zmień widok" }));
    expect(screen.getByRole("dialog", { name: "Odrzucić zmiany?" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Usuń" }));

    expect(screen.getByText("Formularz zamknięty")).toBeInTheDocument();
    expect(screen.getByText("Query: ?widok=all")).toBeInTheDocument();
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
