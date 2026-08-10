import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router";
import Sport from "./Sport";

vi.mock("../../styles/sport.css", () => ({}));

function renderSport(path: string) {
  window.history.replaceState({}, "", path);
  const router = createMemoryRouter([
    { path: "/sport", element: <Sport /> },
  ], { initialEntries: [path] });
  render(<RouterProvider router={router} />);
}

describe("Sport destructive confirmation focus", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  it("returns focus to the template row action trigger after Escape", async () => {
    const user = userEvent.setup();
    renderSport("/sport?widok=templates");

    const trigger = screen.getAllByRole("button", { name: /^Akcje:/ })[0];
    expect(trigger).toBeDefined();
    await user.click(trigger!);
    await user.click(screen.getByRole("menuitem", { name: "Usuń" }));
    expect(screen.getByRole("dialog", { name: /Usunąć szablon/ })).toBeVisible();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: /Usunąć szablon/ })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("returns focus to the exercise row action trigger after cancel", async () => {
    const user = userEvent.setup();
    renderSport("/sport?widok=exercises");

    const trigger = screen.getAllByRole("button", { name: /^Akcje:/ })[0];
    expect(trigger).toBeDefined();
    await user.click(trigger!);
    await user.click(screen.getByRole("menuitem", { name: "Usuń" }));
    const dialog = screen.getByRole("dialog", { name: /Usunąć ćwiczenie/ });
    expect(dialog).toBeVisible();

    await user.click(within(dialog).getByRole("button", { name: "Anuluj" }));

    expect(screen.queryByRole("dialog", { name: /Usunąć ćwiczenie/ })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
