import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Menu, MenuItem } from "./Menu";

afterEach(cleanup);

describe("Menu", () => {
  it("keeps semantic layer and width choices in the public contract", () => {
    render(
      <Menu aria-label="Akcje" layer="systemOverlay" size="wide">
        <MenuItem>Edytuj</MenuItem>
      </Menu>,
    );

    const menu = screen.getByRole("menu", { name: "Akcje" });
    expect(menu).toHaveClass("ui-menu--wide");
    expect(menu).toHaveStyle({ zIndex: "var(--layer-system-overlay)" });
  });

  it("uses named row density without changing the compact default", () => {
    const { rerender } = render(<Menu aria-label="Akcje"><MenuItem>Edytuj</MenuItem></Menu>);
    expect(screen.getByRole("menu", { name: "Akcje" })).toHaveClass("ui-menu--density-compact");

    rerender(<Menu aria-label="Agenda" density="comfortable"><MenuItem>Spotkanie</MenuItem></Menu>);
    expect(screen.getByRole("menu", { name: "Agenda" })).toHaveClass("ui-menu--density-comfortable");
  });

  it("dismisses on Escape from a managed menu", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(
      <>
        <button type="button">Otwórz</button>
        <Menu aria-label="Akcje" onDismiss={onDismiss}>
          <MenuItem>Edytuj</MenuItem>
        </Menu>
      </>,
    );

    const item = screen.getByRole("menuitem", { name: "Edytuj" });
    item.focus();
    await user.keyboard("{Escape}");
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("does not steal text-entry or cursor keys from an input nested in the menu", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(
      <Menu aria-label="Wybierz listę" onDismiss={onDismiss} initialFocus="none">
        <input aria-label="Szukaj listy" />
        <MenuItem>Inbox</MenuItem>
      </Menu>,
    );

    const input = screen.getByRole("textbox", { name: "Szukaj listy" });
    input.focus();
    await user.keyboard("Projekt{ArrowLeft}{ArrowDown}");
    expect(input).toHaveValue("Projekt");
    expect(input).toHaveFocus();
    expect(onDismiss).not.toHaveBeenCalled();

    await user.keyboard("{Escape}");
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
