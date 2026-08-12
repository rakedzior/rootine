import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkCompanyActionsMenu, WorkProjectActionsMenu } from "./PracaMenus";

const initialInnerHeight = window.innerHeight;

afterEach(() => {
  cleanup();
  Object.defineProperty(window, "innerHeight", { configurable: true, value: initialInnerHeight });
});

describe("Work action menus", () => {
  it("uses the shared collision-safe portal, roving focus and Escape restore", async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 220 });
    render(
      <WorkCompanyActionsMenu
        companyId="company-1"
        companyName="Studio North"
        onEdit={vi.fn()}
        onArchive={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    const trigger = screen.getByRole("button", { name: "Więcej akcji dla firmy Studio North" });
    trigger.getBoundingClientRect = () => ({
      x: 20,
      y: 180,
      top: 180,
      right: 48,
      bottom: 208,
      left: 20,
      width: 28,
      height: 28,
      toJSON: () => ({}),
    });

    await user.click(trigger);
    const menu = screen.getByRole("menu", { name: "Więcej akcji dla firmy Studio North" });
    const popover = menu.parentElement;
    expect(trigger).toHaveAttribute("aria-controls", "work-company-actions-company-1");
    expect(trigger).toHaveAttribute("id", "work-company-actions-company-1-trigger");
    expect(menu).toHaveAttribute("id", "work-company-actions-company-1");
    expect(menu).toHaveAttribute("aria-labelledby", "work-company-actions-company-1-trigger");
    expect(popover).toHaveClass("ui-anchored-popover", "work-project-actions-menu__popover");
    expect(popover?.parentElement).toBe(document.body);
    expect(popover).toHaveAttribute("data-placement", "top");
    expect(popover).toHaveStyle({ width: "190px", maxHeight: "128px" });

    const edit = screen.getByRole("menuitem", { name: "Edytuj firmę" });
    await waitFor(() => expect(edit).toHaveFocus());
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Archiwizuj firmę" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("preserves project action callbacks and closes after each selection", async () => {
    const user = userEvent.setup();
    const onOpenDetails = vi.fn();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(
      <WorkProjectActionsMenu
        projectId="project-1"
        projectName="Nowa strona"
        onOpenDetails={onOpenDetails}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    );
    const trigger = screen.getByRole("button", { name: "Więcej akcji dla projektu Nowa strona" });

    await user.click(trigger);
    await user.click(screen.getByRole("menuitem", { name: "Szczegóły projektu" }));
    expect(onOpenDetails).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await user.click(trigger);
    await user.click(screen.getByRole("menuitem", { name: "Edytuj projekt" }));
    expect(onEdit).toHaveBeenCalledOnce();

    await user.click(trigger);
    await user.click(screen.getByRole("menuitem", { name: "Usuń projekt" }));
    expect(onDelete).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("dismisses on Tab and an outside pointer without invoking an action", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onArchive = vi.fn();
    const onDelete = vi.fn();
    render(
      <>
        <WorkCompanyActionsMenu
          companyId="company-2"
          companyName="Acme"
          onEdit={onEdit}
          onArchive={onArchive}
          onDelete={onDelete}
        />
        <button type="button">Poza menu</button>
      </>,
    );
    const trigger = screen.getByRole("button", { name: "Więcej akcji dla firmy Acme" });

    await user.click(trigger);
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Edytuj firmę" })).toHaveFocus());
    await user.tab();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Poza menu" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(onEdit).not.toHaveBeenCalled();
    expect(onArchive).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });
});
