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
});
