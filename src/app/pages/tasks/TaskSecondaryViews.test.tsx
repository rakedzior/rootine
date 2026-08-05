import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toCalendarDateKey } from "../../data/taskWorkspace";
import type { Habit } from "./taskPageModel";
import { HabitsWorkspace } from "./TaskSecondaryViews";

afterEach(cleanup);

describe("HabitsWorkspace", () => {
  it("opens details from anywhere in the row while keeping the completion control separate", async () => {
    const user = userEvent.setup();
    const onSelectHabit = vi.fn();
    const onToggleHabit = vi.fn();
    const habit: Habit = {
      id: 7,
      name: "Poranna rutyna",
      streak: 0,
      done: false,
      schedule: { type: "daily", startDate: toCalendarDateKey(new Date()) },
    };

    render(
      <HabitsWorkspace
        habits={[habit]}
        onToggleHabit={onToggleHabit}
        onSelectHabit={onSelectHabit}
        onAddHabit={() => undefined}
      />,
    );

    await user.click(screen.getByText("Codziennie", { exact: true, selector: ".task-habit-row__schedule" }));
    expect(onSelectHabit).toHaveBeenCalledWith(habit.id);

    onSelectHabit.mockClear();
    await user.click(screen.getByRole("button", { name: `Ukończ nawyk: ${habit.name}` }));
    await waitFor(() => expect(onToggleHabit).toHaveBeenCalledWith(habit.id));
    expect(onSelectHabit).not.toHaveBeenCalled();
  });
});
