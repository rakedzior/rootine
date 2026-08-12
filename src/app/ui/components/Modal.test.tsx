import { useRef, useState } from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { Modal } from "./Modal";
import { TimePicker } from "./TimePicker";

afterEach(cleanup);

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

function TimePickerModalHarness() {
  const [open, setOpen] = useState(true);
  const [time, setTime] = useState("08:00");
  return open ? (
    <Modal title="Zaplanuj spotkanie" onClose={() => setOpen(false)}>
      <TimePicker
        label="Godzina"
        value={time}
        options={["08:00", "08:30", "09:00"]}
        onChange={setTime}
      />
    </Modal>
  ) : null;
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

  it("keeps an AnchoredPopover listbox inside the modal focus boundary", async () => {
    const user = userEvent.setup();
    render(<TimePickerModalHarness />);
    const trigger = screen.getByRole("button", { name: "Wybierz godzinę z listy: Godzina" });

    await user.click(trigger);
    const listbox = screen.getByRole("listbox", { name: "Dostępne godziny: Godzina" });
    expect(listbox).toHaveAttribute("data-ui-owned-overlay", "anchored-popover");
    await waitFor(() => expect(within(listbox).getByRole("option", { name: "08:00" })).toHaveFocus());

    await user.keyboard("{End}");
    expect(within(listbox).getByRole("option", { name: "09:00" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Zaplanuj spotkanie" })).toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Zaplanuj spotkanie" })).not.toBeInTheDocument();
  });
});
