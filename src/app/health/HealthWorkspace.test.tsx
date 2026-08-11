import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HealthWorkspace } from "../data/healthWorkspace";
import { HealthWorkspace as HealthWorkspaceView } from "./HealthWorkspace";

const testState = vi.hoisted(() => ({
  saveWorkspace: vi.fn((_workspace: HealthWorkspace) => true),
}));

vi.mock("../data/healthWorkspace", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../data/healthWorkspace")>();
  return {
    ...actual,
    loadHealthWorkspace: () => actual.createDefaultHealthWorkspace(),
    saveHealthWorkspace: testState.saveWorkspace,
  };
});

vi.mock("../data/localRepository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../data/localRepository")>();
  return {
    ...actual,
    subscribeToLocalWorkspace: () => () => undefined,
  };
});

describe("HealthWorkspace", () => {
  beforeEach(() => {
    testState.saveWorkspace.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows the four health capabilities as real grouped registers without tabs", () => {
    render(<HealthWorkspaceView />);

    expect(screen.getByRole("heading", { name: "Wizyty", hidden: true })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Badania", hidden: true })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Recepty", hidden: true })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Szczepienia", hidden: true })).toBeInTheDocument();
    expect(screen.queryByRole("tablist", { hidden: true })).not.toBeInTheDocument();
  });

  it("opens a category-specific prescription editor and creates the entry", () => {
    render(<HealthWorkspaceView />);

    fireEvent.click(screen.getByRole("button", { name: "Dodaj receptę", hidden: true }));
    const dialog = screen.getByRole("dialog", { name: "Nowa recepta", hidden: true });

    expect(within(dialog).getByLabelText("Termin odnowienia")).toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Godzina")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Miejsce")).not.toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText("Nazwa recepty"), {
      target: { value: "Recepta testowa" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Dodaj receptę", hidden: true }));

    expect(screen.getByText("Recepta testowa")).toBeInTheDocument();
    expect(testState.saveWorkspace).toHaveBeenCalled();
  });

  it("completes and restores an entry from its category", () => {
    const onWorkspaceChange = vi.fn();
    render(<HealthWorkspaceView onWorkspaceChange={onWorkspaceChange} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Oznacz jako zakończone: Odnowić receptę", hidden: true }));
    expect(onWorkspaceChange).toHaveBeenLastCalledWith(expect.objectContaining({
      entries: expect.arrayContaining([
        expect.objectContaining({ id: "health-prescription", status: "done" }),
      ]),
    }));
    const completedToggle = document.querySelector<HTMLButtonElement>(".health-category__completed .ui-completed-section__toggle");
    expect(completedToggle).not.toBeNull();
    fireEvent.click(completedToggle!);

    expect(screen.getByText("Odnowiona")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Przywróć wpis: Odnowić receptę", hidden: true }));
    expect(screen.getByText("Do 7 dni")).toBeInTheDocument();
  });
});
