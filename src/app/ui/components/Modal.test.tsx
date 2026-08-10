import { useRef, useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Modal } from "./Modal";

function MenuToModalHarness() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => setMenuOpen(true)}>Więcej opcji</button>
      {menuOpen && (
        <button
          type="button"
          onClick={() => {
            setMenuOpen(false);
            setModalOpen(true);
          }}
        >
          Edytuj cel
        </button>
      )}
      {modalOpen && (
        <Modal title="Edytuj cel" onClose={() => setModalOpen(false)} returnFocusRef={triggerRef}>
          <input aria-label="Nazwa celu" />
        </Modal>
      )}
    </>
  );
}

describe("Modal", () => {
  it("returns focus to a stable invoker after a menu item unmounts", async () => {
    const user = userEvent.setup();
    render(<MenuToModalHarness />);

    const trigger = screen.getByRole("button", { name: "Więcej opcji" });
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Edytuj cel" }));
    expect(screen.getByRole("textbox", { name: "Nazwa celu" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
  });
});
