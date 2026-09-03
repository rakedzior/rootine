import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  adaptLegacySnapshot,
  BACKFILL_ADAPTERS,
  canonicalDiff,
  canonicalHash,
  canonicalJson,
} from "./backfillMaterializer";

const contractsRoot = resolve(process.cwd(), "contracts");

describe("Step 21 deterministic quality fixtures", () => {
  it("loads and adapts every registered domain and web-only fixture", () => {
    for (const adapter of BACKFILL_ADAPTERS) {
      const fixturePath = resolve(contractsRoot, adapter.fixture);
      const source = JSON.parse(readFileSync(fixturePath, "utf8")) as unknown;
      const first = adaptLegacySnapshot(adapter.storageKey, source);
      const second = adaptLegacySnapshot(adapter.storageKey, JSON.parse(JSON.stringify(source)));

      expect(first.status, adapter.storageKey).toBe("migrated");
      expect(first.quarantine, adapter.storageKey).toEqual([]);
      expect(first.adapterVersion, adapter.storageKey).toBe(adapter.adapterVersion);
      expect(canonicalHash(first.canonicalSnapshot), adapter.storageKey)
        .toBe(canonicalHash(second.canonicalSnapshot));
      expect(first.records, adapter.storageKey).toEqual(second.records);
    }
  });

  it("keeps canonical hashes stable for a high-cardinality performance fixture", () => {
    const rows = Array.from({ length: 2_048 }, (_, index) => ({
      id: `fixture-${String(index).padStart(4, "0")}`,
      amount: (index % 97) + 0.25,
      currency: index % 2 === 0 ? "PLN" : "EUR",
      dueDate: `2026-${String((index % 12) + 1).padStart(2, "0")}-15`,
      updatedAt: "2026-09-03T10:00:00+02:00",
      metadata: { source: "deterministic-performance-fixture", ordinal: index },
    }));
    const first = { version: 1, records: rows };
    const second = {
      records: rows.map(({ id, amount, currency, dueDate, updatedAt, metadata }) => ({
        metadata,
        updatedAt,
        dueDate,
        currency,
        amount,
        id,
      })),
      version: 1,
    };

    expect(canonicalHash(first)).toBe(canonicalHash(second));
    expect(canonicalJson(first)).toBe(canonicalJson(second));

    const changed = {
      ...second,
      records: second.records.map((row, index) => index < 128 ? { ...row, amount: row.amount + 1 } : row),
    };
    const diff = canonicalDiff(first, changed);
    expect(diff.equal).toBe(false);
    expect(diff.differences).toHaveLength(100);
    expect(diff.differences[0]?.path).toBe("/records/0/amount");
    expect(diff.differences.at(-1)?.path).toBe("/records/99/amount");
  });

  it("does not make unordered collection order a false conflict while preserving ordered fields", () => {
    const first = {
      activities: [{ id: "strength", minutes: 45 }, { id: "walk", minutes: 20 }],
      note: "same",
    };
    const reordered = {
      activities: [{ minutes: 20, id: "walk" }, { minutes: 45, id: "strength" }],
      note: "same",
    };
    const changed = {
      activities: [{ minutes: 20, id: "walk" }, { minutes: 50, id: "strength" }],
      note: "same",
    };

    expect(canonicalDiff(first, reordered, { unorderedArrayPaths: ["/activities"] }).equal).toBe(true);
    expect(canonicalDiff(first, changed, { unorderedArrayPaths: ["/activities"] }).equal).toBe(false);
  });
});
