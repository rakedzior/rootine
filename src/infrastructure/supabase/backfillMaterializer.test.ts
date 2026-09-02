import { describe, expect, it } from "vitest";
import manifest from "../../../contracts/manifest.json";
import affairsFixture from "../../../contracts/fixtures/affairs-workspace-v2.json";
import affairsLegacyFixture from "../../../contracts/fixtures/affairs-workspace-v1-legacy.json";
import goalsFixture from "../../../contracts/fixtures/goals-workspace-v1.json";
import healthFixture from "../../../contracts/fixtures/health-workspace-v1.json";
import jdgFixture from "../../../contracts/fixtures/jdg-workspace-v2.json";
import jdgLegacyFixture from "../../../contracts/fixtures/jdg-workspace-v1-legacy.json";
import notesFixture from "../../../contracts/fixtures/notes-workspace-v1.json";
import nutritionFixture from "../../../contracts/fixtures/nutrition-workspace-v6.json";
import nutritionLegacyFixture from "../../../contracts/fixtures/nutrition-workspace-v5-legacy.json";
import sportFixture from "../../../contracts/fixtures/sport-planner-v5.json";
import sportLegacyFixture from "../../../contracts/fixtures/sport-planner-v3-legacy.json";
import taskFixture from "../../../contracts/fixtures/task-workspace-v2.json";
import taskLegacyFixture from "../../../contracts/fixtures/task-workspace-v1-legacy.json";
import travelFixture from "../../../contracts/fixtures/travel-workspace-v2.json";
import workFixture from "../../../contracts/fixtures/work-workspace-v3.json";
import {
  adaptLegacySnapshot,
  adapterForStorageKey,
  backfillUserSnapshots,
  BACKFILL_ADAPTERS,
  canonicalDiff,
  canonicalJson,
  type BackfillMaterialization,
  type BackfillRelationalCommit,
  type BackfillStore,
} from "./backfillMaterializer";

const domainFixtures: Array<[string, unknown]> = [
  ["rootine.task-workspace.v1", taskFixture],
  ["rootine.nutrition-workspace.v1", nutritionFixture],
  ["rootine.notes-workspace.v1", notesFixture],
  ["rootine-sport-planner-v1", sportFixture],
  ["rootine.goals.v1", goalsFixture],
  ["rootine.work-workspace.v1", workFixture],
  ["rootine.travel-workspace.v1", travelFixture],
  ["rootine.health.workspace.v1", healthFixture],
  ["rootine.affairs.workspace.v1", affairsFixture],
  ["rootine.jdg.workspace.v1", jdgFixture],
];

const legacyFixtures: Array<[string, unknown]> = [
  ["rootine.task-workspace.v1", taskLegacyFixture],
  ["rootine.nutrition-workspace.v1", nutritionLegacyFixture],
  ["rootine-sport-planner-v1", sportLegacyFixture],
  ["rootine.affairs.workspace.v1", affairsLegacyFixture],
  ["rootine.jdg.workspace.v1", jdgLegacyFixture],
];

class MemoryBackfillStore implements BackfillStore {
  readonly commits = new Map<string, BackfillRelationalCommit>();
  readonly materializations = new Map<string, BackfillMaterialization>();
  readonly quarantine: unknown[] = [];
  readonly events: string[] = [];
  failMaterialization = false;

  async commitRelational(commit: BackfillRelationalCommit) {
    const key = `${commit.userId}:${commit.source.storageKey}:${commit.source.sourceRevision}:${commit.adapted.adapterVersion}`;
    this.events.push(`commit:${key}`);
    this.commits.set(key, commit);
  }

  async materializeLegacy(materialization: BackfillMaterialization) {
    const key = `${materialization.userId}:${materialization.source.storageKey}:${materialization.source.sourceRevision}:${materialization.adapted.adapterVersion}`;
    if (this.failMaterialization) throw new Error("simulated materializer interruption");
    expect(this.commits.has(key)).toBe(true);
    this.events.push(`materialize:${key}`);
    this.materializations.set(key, materialization);
  }

  async recordQuarantine(_userId: string, entries: unknown[], _runId: string) {
    this.quarantine.push(...entries);
  }
}

describe("B04 backfill adapter contract", () => {
  it("keeps the manifest registry in sync with every deterministic adapter", () => {
    const manifestKeys = new Set(manifest.backfill.adapters.map((adapter) => adapter.storageKey));
    expect(manifest.backfill.sourceIsImmutable).toBe(true);
    expect(manifest.backfill.materializeAfterRelationalCommit).toBe(true);
    expect(BACKFILL_ADAPTERS).toHaveLength(manifest.backfill.adapters.length);
    BACKFILL_ADAPTERS.forEach((adapter) => {
      expect(manifestKeys.has(adapter.storageKey)).toBe(true);
      expect(adapterForStorageKey(adapter.storageKey)).toEqual(adapter);
    });
  });

  it.each(domainFixtures)("maps %s to stable relational records and canonical JSON", (storageKey, fixture) => {
    const first = adaptLegacySnapshot(storageKey, fixture);
    const second = adaptLegacySnapshot(storageKey, JSON.parse(JSON.stringify(fixture)));
    expect(first.status).toBe("migrated");
    expect(first.quarantine).toEqual([]);
    expect(canonicalJson(first.canonicalSnapshot)).toBe(canonicalJson(second.canonicalSnapshot));
    expect(first.records).toEqual(second.records);
  });

  it.each(legacyFixtures)("migrates the supported legacy fixture %s to its current adapter version", (storageKey, fixture) => {
    const adapter = adapterForStorageKey(storageKey);
    const adapted = adaptLegacySnapshot(storageKey, fixture);
    expect(adapter).not.toBeNull();
    expect(adapted.sourceVersion).toBeLessThan(adapter?.currentVersion ?? 0);
    expect(adapted.canonicalSnapshot).toMatchObject({ version: adapter?.currentVersion });
    expect(adapted.status).toBe("migrated");
  });

  it("canonicalizes identifiers, timestamps, currencies, timezone and soft delete deterministically", () => {
    const adapted = adaptLegacySnapshot("rootine.affairs.workspace.v1", {
      version: 2,
      matters: [{
        id: 42,
        title: "Zamknąć sprawę",
        category: "dom",
        priority: "normal",
        status: "done",
        dueDate: "2026-09-01",
        note: "",
        createdAt: "2026-09-01T10:00:00+02:00",
        updatedAt: "2026-09-01T10:00:00+02:00",
        deleted: true,
      }],
      oneTimePayments: [], payments: [], subscriptions: [], documents: [], vehicles: [], vehicleItems: [], budgets: [],
    });
    const record = adapted.records.find((candidate) => candidate.entity === "affair_matter");
    expect(record?.entityId).toBe("42");
    expect(record?.payload.createdAt).toBe("2026-09-01T08:00:00.000Z");
    expect(record?.deletedAt).toBe("2026-09-01T08:00:00.000Z");
  });

  it("supports a controlled array-order exception without hiding real differences", () => {
    const left = { tags: ["b", "a"], entries: [{ id: "1", value: 1 }] };
    const right = { tags: ["a", "b"], entries: [{ id: "1", value: 2 }] };
    expect(canonicalDiff(left, right, { unorderedArrayPaths: ["/tags"] }).equal).toBe(false);
    expect(canonicalDiff({ tags: left.tags }, { tags: right.tags }, { unorderedArrayPaths: ["/tags"] }).equal).toBe(true);
    expect(canonicalDiff(left, right, { unorderedArrayPaths: ["/tags"] }).differences).toEqual([
      { path: "/entries/0/value", left: 1, right: 2 },
    ]);
  });

  it("quarantines unknown keys, unsupported versions and duplicate records", () => {
    const unknown = adaptLegacySnapshot("rootine.unknown.v1", { version: 1, value: true });
    expect(unknown.status).toBe("quarantined");
    expect(unknown.quarantine[0]?.reason).toBe("unknown_storage_key");

    const unsupported = adaptLegacySnapshot("rootine.task-workspace.v1", { version: 99, tasks: [], habits: [], lists: [], tags: [] });
    expect(unsupported.quarantine.some((entry) => entry.reason === "unsupported_version")).toBe(true);

    const duplicate = adaptLegacySnapshot("rootine.task-workspace.v1", {
      version: 2,
      updatedAt: "2026-09-01T00:00:00Z",
      tasks: [{ id: 1, text: "a", done: false, view: "dzis" }, { id: 1, text: "b", done: false, view: "dzis" }],
      habits: [], lists: [], tags: [],
    });
    expect(duplicate.quarantine.some((entry) => entry.reason === "duplicate_record_id")).toBe(true);
  });

  it("quarantines invalid canonical date, timestamp, currency and timezone fields", () => {
    const adapted = adaptLegacySnapshot("rootine.task-workspace.v1", {
      version: 2,
      updatedAt: "not-a-timestamp",
      tasks: [{
        id: "bad-fields",
        text: "Nie materializować",
        done: false,
        view: "dzis",
        dueDate: "2026-02-30",
        timezone: "Mars/Olympus",
        currency: "PL",
      }],
      habits: [],
      lists: [],
      tags: [],
    });
    expect(adapted.status).toBe("quarantined");
    expect(adapted.records).toEqual([]);
    expect(adapted.quarantine.map((entry) => entry.path)).toEqual(expect.arrayContaining([
      "/updatedAt",
      "/tasks/bad-fields/dueDate",
      "/tasks/bad-fields/timezone",
      "/tasks/bad-fields/currency",
    ]));
  });

  it("backfills after a relational commit, is idempotent at the store boundary, and keeps source immutable", async () => {
    const source = JSON.parse(JSON.stringify(taskFixture)) as Record<string, unknown>;
    const original = JSON.stringify(source);
    const store = new MemoryBackfillStore();
    const snapshots = [{ storageKey: "rootine.task-workspace.v1", payload: source, sourceRevision: 7, sourceContentHash: "legacy-hash" }];

    const first = await backfillUserSnapshots("user-a", snapshots, store, { now: "2026-09-02T00:00:00.000Z" });
    const second = await backfillUserSnapshots("user-a", snapshots, store, { now: "2026-09-02T00:00:00.000Z" });
    expect(first).toEqual(second);
    expect(store.events[0]).toMatch(/^commit:/);
    expect(store.events[1]).toMatch(/^materialize:/);
    expect(store.events[2]).toMatch(/^commit:/);
    expect(JSON.stringify(source)).toBe(original);
    expect(store.commits.size).toBe(1);
    expect(store.materializations.size).toBe(1);
  });

  it("reports canonical differences and keeps identical IDs isolated per user", async () => {
    const store = new MemoryBackfillStore();
    const snapshots = [{
      storageKey: "rootine.task-workspace.v1",
      payload: taskFixture,
      sourceRevision: 8,
    }];
    const relationalSnapshots = new Map<string, unknown>([[
      "rootine.task-workspace.v1",
      { ...taskFixture, tasks: [{ ...(taskFixture as { tasks: Array<Record<string, unknown>> }).tasks[0], text: "Różnica" }] },
    ]]);
    const first = await backfillUserSnapshots("user-a", snapshots, store, { relationalSnapshots });
    const second = await backfillUserSnapshots("user-b", snapshots, store);
    expect(first.domains[0]?.status).toBe("different");
    expect(first.totals.different).toBe(1);
    expect(store.commits.size).toBe(2);
    expect(store.materializations.size).toBe(1);
    expect(second.domains[0]?.status).toBe("migrated");
  });

  it("leaves a committed revision pending when materialization is interrupted", async () => {
    const store = new MemoryBackfillStore();
    store.failMaterialization = true;
    await expect(backfillUserSnapshots("user-a", [{
      storageKey: "rootine.notes-workspace.v1",
      payload: notesFixture,
      sourceRevision: 3,
    }], store)).rejects.toThrow("simulated materializer interruption");
    expect(store.commits.size).toBe(1);
    expect(store.materializations.size).toBe(0);
  });

  it("commits quarantine for a known malformed snapshot without materializing it", async () => {
    const store = new MemoryBackfillStore();
    const report = await backfillUserSnapshots("user-a", [{
      storageKey: "rootine.task-workspace.v1",
      sourceRevision: 4,
      payload: {
        version: 2,
        updatedAt: "invalid",
        tasks: [],
        habits: [],
        lists: [],
        tags: [],
      },
    }], store);
    expect(report.totals.quarantined).toBeGreaterThan(0);
    expect(store.commits.size).toBe(1);
    expect(store.materializations.size).toBe(0);
  });
});
