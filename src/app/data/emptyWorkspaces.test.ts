import { beforeEach, describe, expect, it } from "vitest";
import { createBrowserWorkspacePayloadStore } from "./indexedDbWorkspaceStore";
import { setWorkspacePayloadStoreForTests } from "./localRepository";
import { loadTaskWorkspaceResult } from "./taskWorkspace";
import { loadWorkWorkspaceResult } from "./workWorkspace";
import { loadTravelWorkspaceResult } from "./travelWorkspace";
import { loadNotesWorkspaceResult } from "./notesWorkspace";
import { loadAffairsWorkspaceResult } from "./affairsWorkspace";
import { loadHealthWorkspaceResult } from "./healthWorkspace";
import { loadJdgWorkspaceResult } from "./jdgWorkspace";
import { loadGoalsWorkspaceResult } from "../goals/goalsRepository";
import { loadSportPlannerStateResult } from "../sport/plannerModel";

describe("fresh real-user workspaces", () => {
  beforeEach(() => {
    window.localStorage.clear();
    setWorkspacePayloadStoreForTests(createBrowserWorkspacePayloadStore(undefined));
  });

  it("starts content domains empty instead of silently injecting demo records", () => {
    const tasks = loadTaskWorkspaceResult();
    const work = loadWorkWorkspaceResult();
    const travel = loadTravelWorkspaceResult();
    const notes = loadNotesWorkspaceResult();
    const affairs = loadAffairsWorkspaceResult();
    const health = loadHealthWorkspaceResult();
    const jdg = loadJdgWorkspaceResult();
    const goals = loadGoalsWorkspaceResult();
    const sport = loadSportPlannerStateResult();

    [tasks, work, travel, notes, affairs, health, jdg, goals, sport]
      .forEach((result) => expect(result.status).toBe("missing"));

    expect(tasks.workspace).toMatchObject({ tasks: [], habits: [], lists: [], tags: [] });
    expect(work.workspace).toMatchObject({ companies: [], projects: [], tasks: [] });
    expect(travel.workspace.trips).toEqual([]);
    expect(notes.workspace).toMatchObject({ lists: [], notes: [] });
    expect(affairs.workspace).toMatchObject({
      matters: [],
      oneTimePayments: [],
      payments: [],
      subscriptions: [],
      documents: [],
      vehicles: [],
      vehicleItems: [],
      budgets: [],
    });
    expect(health.workspace.entries).toEqual([]);
    expect(jdg.workspace).toMatchObject({ months: [], history: [] });
    expect(goals.workspace.goals).toEqual([]);
    expect(sport.workspace).toMatchObject({
      activeCycle: null,
      cycles: [],
      history: [],
      sessions: [],
      workoutOutcomes: {},
    });
  });
});

