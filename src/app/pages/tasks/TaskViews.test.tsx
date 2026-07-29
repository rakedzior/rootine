import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  projectTaskOccurrences,
  setTaskOccurrenceCompletion,
} from "../../data/taskSchedule";
import type { WorkspaceTask } from "../../data/taskWorkspace";
import { TaskDetail } from "./TaskViews";

const OCCURRENCE_DATE = "2026-02-28";

afterEach(cleanup);

function recurringTask(): WorkspaceTask {
  return {
    id: 42,
    text: "Rozliczenie",
    done: false,
    view: "skrzynka",
    calendarDate: "2026-01-31",
    date: "31 sty",
    time: "09:00",
    schedule: {
      allDay: false,
      startTime: "09:00",
      recurrence: "monthly",
      timezone: "Europe/Warsaw",
    },
  };
}

function OccurrenceDetailHarness({ onDelete = () => undefined }: {
  onDelete?: (id: number) => void;
}) {
  const [task, setTask] = useState(recurringTask);
  const occurrence = projectTaskOccurrences(
    [task],
    OCCURRENCE_DATE,
    OCCURRENCE_DATE,
  )[0];

  return (
    <>
      <TaskDetail
        task={task}
        occurrence={{ date: OCCURRENCE_DATE, done: occurrence?.done ?? false }}
        onClose={() => undefined}
        onToggleCompletion={(done) => {
          setTask((current) => setTaskOccurrenceCompletion(current, OCCURRENCE_DATE, done));
        }}
        onUpdate={(id, patch) => {
          setTask((current) => current.id === id ? { ...current, ...patch } : current);
        }}
        onDelete={onDelete}
        listy={[]}
        tagi={[]}
      />
      <output data-testid="source-done">{String(task.done)}</output>
      <output data-testid="completed-dates">{task.schedule?.completedDates?.join(",") ?? ""}</output>
    </>
  );
}

describe("TaskDetail virtual occurrence semantics", () => {
  it("shows the occurrence date and completes only that date", async () => {
    const user = userEvent.setup();
    render(<OccurrenceDetailHarness />);

    expect(screen.getByRole("region", { name: "Wybrane wystąpienie cykliczne" })).toHaveTextContent(
      "sobota, 28 lutego 2026",
    );
    expect(screen.getByRole("textbox", { name: "Tytuł całej serii" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edytuj harmonogram całej serii" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", {
      name: "Oznacz jako wykonane wystąpienie z sobota, 28 lutego 2026",
    }));

    expect(screen.getByTestId("source-done")).toHaveTextContent("false");
    expect(screen.getByTestId("completed-dates")).toHaveTextContent(OCCURRENCE_DATE);
    expect(screen.getByRole("button", {
      name: "Oznacz jako niewykonane wystąpienie z sobota, 28 lutego 2026",
    })).toBeInTheDocument();
  });

  it("names deletion as a series action and requires confirmation", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<OccurrenceDetailHarness onDelete={onDelete} />);

    await user.click(screen.getByRole("button", { name: "Więcej akcji całej serii" }));
    await user.click(screen.getByRole("menuitem", { name: "Przenieś całą serię do Kosza" }));

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Przenieść całą serię do Kosza?" })).toHaveTextContent(
      "sobota, 28 lutego 2026",
    );

    await user.click(screen.getByRole("button", { name: "Przenieś całą serię" }));
    expect(onDelete).toHaveBeenCalledWith(42);
  });
});

describe("TaskDetail Work assignment", () => {
  it("offers active company projects and reports the selected project", () => {
    const onWorkProjectChange = vi.fn();
    const task = recurringTask();
    const { container } = render(
      <TaskDetail
        task={task}
        onClose={() => undefined}
        onToggleCompletion={() => undefined}
        onUpdate={() => undefined}
        onDelete={() => undefined}
        listy={[]}
        tagi={[]}
        workProjectId=""
        workProjectOptions={[
          { value: "", label: "Bez firmy i projektu" },
          { value: "project-launch", label: "Acme · Launch" },
        ]}
        onWorkProjectChange={onWorkProjectChange}
      />,
    );

    expect(screen.getByRole("combobox", { name: /Firma i projekt/ })).toBeInTheDocument();
    fireEvent.change(container.querySelector("select")!, { target: { value: "project-launch" } });

    expect(onWorkProjectChange).toHaveBeenCalledWith("project-launch");
  });
});
