import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { useRef, useState } from "react";
import { AnchoredPopover, type AnchoredPopoverPlacement } from "./AnchoredPopover";

afterEach(cleanup);

function Harness({ placement = "auto" }: { placement?: AnchoredPopoverPlacement }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={triggerRef} type="button" aria-expanded={open} onClick={() => setOpen(true)}>
        Otwórz warstwę
      </button>
      <AnchoredPopover
        open={open}
        anchorRef={triggerRef}
        onDismiss={() => setOpen(false)}
        initialFocus="first"
        placement={placement}
        role="dialog"
        aria-label="Wspólna warstwa"
      >
        <button type="button">Akcja w warstwie</button>
      </AnchoredPopover>
      <button type="button">Poza warstwą</button>
    </>
  );
}

function NestedHarness() {
  const [parentOpen, setParentOpen] = useState(false);
  const [childOpen, setChildOpen] = useState(false);
  const parentTriggerRef = useRef<HTMLButtonElement>(null);
  const parentPopoverRef = useRef<HTMLDivElement>(null);
  const childTriggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button ref={parentTriggerRef} type="button" onClick={() => setParentOpen(true)}>
        Ustaw termin
      </button>
      <AnchoredPopover
        ref={parentPopoverRef}
        open={parentOpen}
        anchorRef={parentTriggerRef}
        onDismiss={() => setParentOpen(false)}
        initialFocus="first"
        role="dialog"
        aria-label="Termin"
      >
        <button ref={childTriggerRef} type="button" onClick={() => setChildOpen(true)}>Czas</button>
        <button type="button">Akcja rodzica</button>
        <AnchoredPopover
          open={childOpen}
          anchorRef={childTriggerRef}
          portalRoot={parentPopoverRef.current}
          onDismiss={() => setChildOpen(false)}
          initialFocus="first"
          layer="nestedPopover"
          role="dialog"
          aria-label="Wybierz czas"
        >
          <button type="button">08:30</button>
        </AnchoredPopover>
      </AnchoredPopover>
      <button type="button">Poza stosem</button>
    </>
  );
}

describe("AnchoredPopover", () => {
  it("renders in a portal, focuses its content and restores the anchor on Escape", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Otwórz warstwę" });

    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Wspólna warstwa" });
    expect(dialog.parentElement).toBe(document.body);
    await waitFor(() => expect(screen.getByRole("button", { name: "Akcja w warstwie" })).toHaveFocus());

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Wspólna warstwa" })).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("dismisses on an outside pointer and chooses the collision-safe side", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Otwórz warstwę" });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 220 });
    trigger.getBoundingClientRect = () => ({
      x: 20,
      y: 180,
      top: 180,
      right: 140,
      bottom: 208,
      left: 20,
      width: 120,
      height: 28,
      toJSON: () => ({}),
    });

    await user.click(trigger);
    expect(screen.getByRole("dialog", { name: "Wspólna warstwa" })).toHaveAttribute("data-placement", "top");

    await user.click(screen.getByRole("button", { name: "Poza warstwą" }));
    expect(screen.queryByRole("dialog", { name: "Wspólna warstwa" })).not.toBeInTheDocument();
  });

  it("supports a side placement and falls back to the opposite side", async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 360 });
    render(<Harness placement="right" />);
    const trigger = screen.getByRole("button", { name: "Otwórz warstwę" });
    trigger.getBoundingClientRect = () => ({
      x: 300,
      y: 40,
      top: 40,
      right: 340,
      bottom: 68,
      left: 300,
      width: 40,
      height: 28,
      toJSON: () => ({}),
    });

    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Wspólna warstwa" });
    expect(dialog).toHaveAttribute("data-placement", "left");
  });

  it("dismisses only the topmost nested layer per Escape and restores each anchor", async () => {
    const user = userEvent.setup();
    render(<NestedHarness />);
    const parentTrigger = screen.getByRole("button", { name: "Ustaw termin" });

    await user.click(parentTrigger);
    const childTrigger = screen.getByRole("button", { name: "Czas" });
    await waitFor(() => expect(childTrigger).toHaveFocus());
    await user.click(childTrigger);
    await waitFor(() => expect(screen.getByRole("button", { name: "08:30" })).toHaveFocus());

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Wybierz czas" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Termin" })).toBeInTheDocument();
    await waitFor(() => expect(childTrigger).toHaveFocus());

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Termin" })).not.toBeInTheDocument();
    await waitFor(() => expect(parentTrigger).toHaveFocus());
  });

  it("keeps the parent open when an outside gesture dismisses only its child", async () => {
    const user = userEvent.setup();
    render(<NestedHarness />);
    await user.click(screen.getByRole("button", { name: "Ustaw termin" }));
    await user.click(screen.getByRole("button", { name: "Czas" }));

    await user.click(screen.getByRole("button", { name: "Akcja rodzica" }));
    expect(screen.queryByRole("dialog", { name: "Wybierz czas" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Termin" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Poza stosem" }));
    expect(screen.queryByRole("dialog", { name: "Termin" })).not.toBeInTheDocument();
  });
});
