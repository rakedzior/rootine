import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router";
import { createSeedGoalsWorkspace, type GoalCategory } from "./goalsModel";
import { GoalFormDialog } from "./GoalDialogs";

const CATEGORIES: GoalCategory[] = [
  { id: "personal", label: "Osobiste", color: "#7FA6C9", iconKey: "target" },
];

describe("GoalFormDialog command prefill", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("preserves supported Command Center fields in the new-goal form", () => {
    const router = createMemoryRouter([{
      path: "/",
      element: (
        <GoalFormDialog
          goal={null}
          initialValues={{
            title: "Przygotować portfolio",
            dueDate: "2099-08-13",
            priority: "high",
          }}
          categories={CATEGORIES}
          onClose={vi.fn()}
          onSubmit={vi.fn()}
        />
      ),
    }]);
    render(<RouterProvider router={router} />);

    expect(screen.getByLabelText("Nazwa celu")).toHaveValue("Przygotować portfolio");
    expect(screen.getByRole("combobox", { name: /Priorytet.*Wysoki/ })).toHaveTextContent("Wysoki");
    expect(screen.getByRole("button", { name: /Termin.*13 sierpnia 2099/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dodaj cel" })).toBeInTheDocument();
  });

  it("names the edit action after the saved entity", () => {
    const goal = createSeedGoalsWorkspace().goals[0];
    const router = createMemoryRouter([{
      path: "/",
      element: (
        <GoalFormDialog
          goal={goal}
          categories={CATEGORIES}
          onClose={vi.fn()}
          onSubmit={vi.fn()}
        />
      ),
    }]);
    render(<RouterProvider router={router} />);

    expect(screen.getByRole("button", { name: "Zapisz cel" })).toBeInTheDocument();
  });
});
