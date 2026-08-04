import { beforeEach, describe, expect, it } from "vitest";
import {
  assignTaskToWorkProject,
  commitmentTaskId,
  projectCommitments,
} from "./commitmentRepository";
import {
  loadTaskWorkspace,
  saveTaskWorkspace,
  type TaskWorkspace,
} from "./taskWorkspace";
import {
  TRAVEL_STORAGE_KEY,
  type TravelTask,
  type TravelTrip,
  type TravelWorkspace,
} from "./travelWorkspace";
import {
  WORK_STORAGE_KEY,
  type WorkWorkspace,
} from "./workWorkspace";

function workFixture(): WorkWorkspace {
  return {
    version: 2,
    updatedAt: "2026-07-28T08:00:00.000Z",
    companies: [
      { id: "company-a", name: "Acme", description: "", color: "#4772fa" },
    ],
    projects: [
      {
        id: "project-active",
        companyId: "company-a",
        name: "Launch",
        description: "",
        status: "active",
      },
      {
        id: "project-paused",
        companyId: "company-a",
        name: "Later",
        description: "",
        status: "paused",
      },
      {
        id: "project-completed",
        companyId: "company-a",
        name: "Shipped",
        description: "",
        status: "completed",
      },
    ],
    tasks: [
      {
        id: "work-open",
        projectId: "project-active",
        parentId: null,
        title: "Prepare launch",
        completed: false,
        priority: "high",
        dueDate: "2026-07-28",
        createdAt: "2026-07-20T08:00:00.000Z",
        linkedTask: { originTaskId: 101, view: "dzis" },
      },
      {
        id: "work-done",
        projectId: "project-active",
        parentId: "work-open",
        title: "Approved copy",
        completed: true,
        priority: "none",
        dueDate: "",
        createdAt: "2026-07-20T09:00:00.000Z",
        linkedTask: { originTaskId: 102, view: "skrzynka" },
      },
      {
        id: "work-paused",
        projectId: "project-paused",
        parentId: null,
        title: "Do not project paused work",
        completed: false,
        priority: "medium",
        dueDate: "2026-07-29",
        createdAt: "2026-07-20T10:00:00.000Z",
      },
      {
        id: "work-completed-project",
        projectId: "project-completed",
        parentId: null,
        title: "Do not project completed projects",
        completed: false,
        priority: "low",
        dueDate: "2026-07-29",
        createdAt: "2026-07-20T11:00:00.000Z",
      },
    ],
  };
}

function travelTask(overrides: Partial<TravelTask> = {}): TravelTask {
  return {
    id: "travel-task",
    title: "Check in",
    category: "booking",
    dueDate: "2026-07-29",
    completed: false,
    linkedTask: { originTaskId: 201, view: "jutro" },
    ...overrides,
  };
}

function travelTrip(overrides: Partial<TravelTrip> = {}): TravelTrip {
  return {
    id: "trip-active",
    name: "Lisbon",
    destination: "Lisbon · Sintra",
    startDate: "2026-09-10",
    endDate: "2026-09-13",
    status: "planning",
    travelers: ["Ada"],
    baseCurrency: "PLN",
    note: "",
    archivedAt: null,
    stays: [],
    transports: [],
    itinerary: [],
    budget: [],
    documents: [],
    tasks: [travelTask()],
    ...overrides,
  };
}

function travelFixture(): TravelWorkspace {
  return {
    version: 2,
    updatedAt: "2026-07-28T08:00:00.000Z",
    trips: [
      travelTrip(),
      travelTrip({
        id: "trip-archived",
        name: "Archived",
        archivedAt: "2026-07-01T08:00:00.000Z",
        tasks: [travelTask({ id: "archived-task" })],
      }),
      travelTrip({
        id: "trip-completed",
        name: "Completed",
        status: "completed",
        tasks: [travelTask({ id: "completed-trip-task" })],
      }),
    ],
  };
}

describe("commitment projection", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("projects commitments only from active Work projects and current trips", () => {
    const tasks = projectCommitments(
      { work: workFixture(), travel: travelFixture() },
      new Date(2026, 6, 28, 12),
    );

    expect(tasks.map((task) => task.text)).toEqual([
      "Prepare launch",
      "Approved copy",
      "Check in",
    ]);

    const workTask = tasks.find((task) => task.text === "Prepare launch");
    expect(workTask).toMatchObject({
      done: false,
      priority: "high",
      calendarDate: "2026-07-28",
      date: "2026-07-28",
      view: "dzis",
      list: "praca",
      tags: ["praca"],
      source: {
        kind: "work",
        entity: "project-active/work-open",
        context: "Acme · Launch",
        href: "/praca?firma=company-a&projekt=project-active",
      },
    });

    const completedWorkTask = tasks.find((task) => task.text === "Approved copy");
    expect(completedWorkTask).toMatchObject({ done: true, view: "skrzynka" });
    expect(completedWorkTask).not.toHaveProperty("priority");
    expect(completedWorkTask).not.toHaveProperty("calendarDate");

    const tripTask = tasks.find((task) => task.text === "Check in");
    expect(tripTask).toMatchObject({
      done: false,
      calendarDate: "2026-07-29",
      view: "jutro",
      source: {
        kind: "travel",
        entity: "trip-active/travel-task",
        context: "Lisbon · Lisbon · Sintra",
        href: "/podroze/trip-active?sekcja=tasks",
      },
    });
    expect(tripTask).not.toHaveProperty("priority");
  });

  it("does not project unlinked Work or Travel items by default", () => {
    const work = workFixture();
    work.tasks = work.tasks.map((task) => ({ ...task, linkedTask: undefined }));
    const travel = travelFixture();
    travel.trips = travel.trips.map((trip) => ({
      ...trip,
      tasks: trip.tasks.map((task) => ({ ...task, linkedTask: undefined })),
    }));
    expect(projectCommitments({ work, travel })).toEqual([]);
  });

  it("uses deterministic, distinct, negative safe-integer IDs", () => {
    const inputs = { work: workFixture(), travel: travelFixture() };
    const first = projectCommitments(inputs);
    const reordered = projectCommitments({
      work: { ...inputs.work, tasks: [...inputs.work.tasks].reverse() },
      travel: { ...inputs.travel, trips: [...inputs.travel.trips].reverse() },
    });
    const firstIds = new Map(first.map((task) => [task.source?.entity, task.id]));
    const reorderedIds = new Map(reordered.map((task) => [task.source?.entity, task.id]));

    expect(reorderedIds).toEqual(firstIds);
    expect([...firstIds.values()].every((id) => id < 0 && Number.isSafeInteger(id))).toBe(true);
    expect(new Set(firstIds.values()).size).toBe(firstIds.size);
    expect(commitmentTaskId("work", "same/entity")).not.toBe(
      commitmentTaskId("travel", "same/entity"),
    );
  });

  it("writes supported edits through to Work and Travel while persisting only native tasks", () => {
    const work = workFixture();
    const travel = travelFixture();
    const nativeWorkspace: TaskWorkspace = {
      version: 2,
      updatedAt: "2026-07-28T08:00:00.000Z",
      tasks: [{ id: 42, text: "Native task", done: false, view: "bezterminu" }],
      habits: [],
      lists: [],
      tags: [],
    };
    window.localStorage.setItem(WORK_STORAGE_KEY, JSON.stringify(work));
    window.localStorage.setItem(TRAVEL_STORAGE_KEY, JSON.stringify(travel));
    window.localStorage.setItem("rootine.task-workspace.v1", JSON.stringify(nativeWorkspace));

    const loaded = loadTaskWorkspace();
    const edited: TaskWorkspace = {
      ...loaded,
      tasks: loaded.tasks.map((task) => {
        if (task.source?.kind === "work" && task.text === "Prepare launch") {
          return {
            ...task,
            text: "Prepare launch plan",
            done: true,
            priority: "low",
            calendarDate: "2026-08-03",
            date: "2026-08-03",
            notes: "This remains local to the global task representation",
          };
        }
        if (task.source?.kind === "travel" && task.text === "Check in") {
          return {
            ...task,
            text: "Complete online check-in",
            done: true,
            priority: "high",
            calendarDate: undefined,
            date: undefined,
          };
        }
        return task;
      }),
    };

    expect(saveTaskWorkspace(edited)).toBe(true);

    const storedNative = JSON.parse(
      window.localStorage.getItem("rootine.task-workspace.v1") ?? "",
    ) as TaskWorkspace;
    expect(storedNative.tasks).toEqual(nativeWorkspace.tasks);
    expect(storedNative.tasks.every((task) => task.source === undefined)).toBe(true);

    const storedWork = JSON.parse(
      window.localStorage.getItem(WORK_STORAGE_KEY) ?? "",
    ) as WorkWorkspace;
    expect(storedWork.tasks.find((task) => task.id === "work-open")).toMatchObject({
      title: "Prepare launch plan",
      completed: true,
      priority: "low",
      dueDate: "2026-08-03",
    });

    const storedTravel = JSON.parse(
      window.localStorage.getItem(TRAVEL_STORAGE_KEY) ?? "",
    ) as TravelWorkspace;
    expect(storedTravel.trips[0].tasks[0]).toEqual({
      ...travel.trips[0].tasks[0],
      title: "Complete online check-in",
      completed: true,
      dueDate: "",
    });
    expect(storedTravel.trips[0].tasks[0]).not.toHaveProperty("priority");

    const reloaded = loadTaskWorkspace();
    expect(reloaded.tasks.find((task) => task.source?.kind === "work" && task.source.entity === "project-active/work-open"))
      .toMatchObject({
        text: "Prepare launch plan",
        done: true,
        priority: "low",
        calendarDate: "2026-08-03",
      });
    expect(reloaded.tasks.find((task) => task.source?.kind === "travel"))
      .toMatchObject({
        text: "Complete online check-in",
        done: true,
      });
  });

  it("patches only fields changed in the projection and preserves concurrent source edits", () => {
    const work = workFixture();
    const travel = travelFixture();
    const nativeWorkspace: TaskWorkspace = {
      version: 2,
      updatedAt: "2026-07-28T08:00:00.000Z",
      tasks: [],
      habits: [],
      lists: [],
      tags: [],
    };
    window.localStorage.setItem(WORK_STORAGE_KEY, JSON.stringify(work));
    window.localStorage.setItem(TRAVEL_STORAGE_KEY, JSON.stringify(travel));
    window.localStorage.setItem("rootine.task-workspace.v1", JSON.stringify(nativeWorkspace));

    const loaded = loadTaskWorkspace();
    const concurrentWork: WorkWorkspace = {
      ...work,
      tasks: work.tasks.map((task) => task.id === "work-open"
        ? {
            ...task,
            title: "Title changed in Work",
            dueDate: "2026-08-20",
            priority: "medium",
          }
        : task),
    };
    const concurrentTravel: TravelWorkspace = {
      ...travel,
      trips: travel.trips.map((trip) => trip.id === "trip-active"
        ? {
            ...trip,
            tasks: trip.tasks.map((task) => ({
              ...task,
              completed: true,
              dueDate: "2026-09-01",
            })),
          }
        : trip),
    };
    window.localStorage.setItem(WORK_STORAGE_KEY, JSON.stringify(concurrentWork));
    window.localStorage.setItem(TRAVEL_STORAGE_KEY, JSON.stringify(concurrentTravel));

    const oneFieldEdited: TaskWorkspace = {
      ...loaded,
      tasks: loaded.tasks.map((task) => {
        if (task.source?.kind === "work" && task.source.entity === "project-active/work-open") {
          return { ...task, done: true };
        }
        if (task.source?.kind === "travel" && task.source.entity === "trip-active/travel-task") {
          return { ...task, text: "Check in from the global task list" };
        }
        return task;
      }),
    };

    expect(saveTaskWorkspace(oneFieldEdited)).toBe(true);

    const storedWork = JSON.parse(
      window.localStorage.getItem(WORK_STORAGE_KEY) ?? "",
    ) as WorkWorkspace;
    expect(storedWork.tasks.find((task) => task.id === "work-open")).toMatchObject({
      title: "Title changed in Work",
      completed: true,
      dueDate: "2026-08-20",
      priority: "medium",
    });

    const storedTravel = JSON.parse(
      window.localStorage.getItem(TRAVEL_STORAGE_KEY) ?? "",
    ) as TravelWorkspace;
    expect(storedTravel.trips[0].tasks[0]).toMatchObject({
      title: "Check in from the global task list",
      completed: true,
      dueDate: "2026-09-01",
    });
  });

  it("promotes an assigned native task to canonical Work storage without duplicates after reload", () => {
    const work = workFixture();
    const travel = travelFixture();
    const nativeWorkspace: TaskWorkspace = {
      version: 2,
      updatedAt: "2026-07-28T08:00:00.000Z",
      tasks: [{
        id: 501,
        text: "Spotkanie z klientem",
        done: false,
        view: "dzis",
        calendarDate: "2026-07-28",
        date: "Dziś",
        time: "09:00",
        endTime: "10:00",
        notes: "Omówić zakres",
        priority: "high",
        schedule: {
          allDay: false,
          startTime: "09:00",
          endTime: "10:00",
          reminderMinutes: 15,
          timezone: "Europe/Warsaw",
        },
      }],
      habits: [],
      lists: [],
      tags: [],
    };
    window.localStorage.setItem(WORK_STORAGE_KEY, JSON.stringify(work));
    window.localStorage.setItem(TRAVEL_STORAGE_KEY, JSON.stringify(travel));
    window.localStorage.setItem("rootine.task-workspace.v1", JSON.stringify(nativeWorkspace));

    const nativeTask = loadTaskWorkspace().tasks.find((task) => task.id === 501);
    expect(nativeTask).toBeDefined();
    const assignment = assignTaskToWorkProject(nativeTask!, "project-active");
    expect(assignment.status).toBe("ok");

    const reloaded = loadTaskWorkspace();
    const assigned = reloaded.tasks.filter((task) => task.source?.originTaskId === 501);
    expect(assigned).toHaveLength(1);
    expect(reloaded.tasks.some((task) => task.id === 501)).toBe(false);
    expect(assigned[0]).toMatchObject({
      text: "Spotkanie z klientem",
      calendarDate: "2026-07-28",
      time: "09:00",
      endTime: "10:00",
      notes: "Omówić zakres",
      priority: "high",
      source: {
        kind: "work",
        context: "Acme · Launch",
        href: "/praca?firma=company-a&projekt=project-active",
        originTaskId: 501,
      },
    });

    const storedWork = JSON.parse(
      window.localStorage.getItem(WORK_STORAGE_KEY) ?? "",
    ) as WorkWorkspace;
    expect(storedWork.tasks.filter((task) => task.linkedTask?.originTaskId === 501)).toHaveLength(1);
    expect(storedWork.tasks.find((task) => task.linkedTask?.originTaskId === 501)).toMatchObject({
      projectId: "project-active",
      title: "Spotkanie z klientem",
      dueDate: "2026-07-28",
      linkedTask: {
        originTaskId: 501,
        notes: "Omówić zakres",
        schedule: {
          reminderMinutes: 15,
          timezone: "Europe/Warsaw",
        },
      },
    });

    const withCompletedOccurrence: TaskWorkspace = {
      ...reloaded,
      tasks: reloaded.tasks.map((task) => task.source?.originTaskId === 501
        ? {
            ...task,
            schedule: task.schedule
              ? { ...task.schedule, completedDates: ["2026-08-28"] }
              : undefined,
          }
        : task),
    };
    expect(saveTaskWorkspace(withCompletedOccurrence)).toBe(true);
    const storedNative = JSON.parse(
      window.localStorage.getItem("rootine.task-workspace.v1") ?? "",
    ) as TaskWorkspace;
    expect(storedNative.tasks).toEqual([]);
    const storedWorkAfterTaskEdit = JSON.parse(
      window.localStorage.getItem(WORK_STORAGE_KEY) ?? "",
    ) as WorkWorkspace;
    expect(storedWorkAfterTaskEdit.tasks.find((task) => task.linkedTask?.originTaskId === 501)
      ?.linkedTask?.schedule?.completedDates).toEqual(["2026-08-28"]);
    expect(loadTaskWorkspace().tasks.filter((task) => task.source?.originTaskId === 501)).toHaveLength(1);
  });

  it("moves an assigned task between active projects without creating a second Work task", () => {
    const work = workFixture();
    work.projects = work.projects.map((project) => project.id === "project-paused"
      ? { ...project, status: "active" }
      : project);
    window.localStorage.setItem(WORK_STORAGE_KEY, JSON.stringify(work));
    window.localStorage.setItem(TRAVEL_STORAGE_KEY, JSON.stringify(travelFixture()));
    window.localStorage.setItem("rootine.task-workspace.v1", JSON.stringify({
      version: 2,
      updatedAt: "",
      tasks: [],
      habits: [],
      lists: [],
      tags: [],
    } satisfies TaskWorkspace));

    const projected = loadTaskWorkspace().tasks.find((task) => (
      task.source?.entity === "project-active/work-open"
    ));
    expect(projected).toBeDefined();
    expect(assignTaskToWorkProject(projected!, "project-paused")).toMatchObject({ status: "ok" });

    const storedWork = JSON.parse(
      window.localStorage.getItem(WORK_STORAGE_KEY) ?? "",
    ) as WorkWorkspace;
    expect(storedWork.tasks.filter((task) => task.id === "work-open")).toHaveLength(1);
    expect(storedWork.tasks.find((task) => task.id === "work-open")?.projectId).toBe("project-paused");

    const reloaded = loadTaskWorkspace();
    expect(reloaded.tasks.filter((task) => task.source?.entity.endsWith("/work-open"))).toHaveLength(1);
    expect(reloaded.tasks.find((task) => task.source?.entity === "project-paused/work-open")?.source)
      .toMatchObject({
        context: "Acme · Later",
        href: "/praca?firma=company-a&projekt=project-paused",
      });
  });
});
