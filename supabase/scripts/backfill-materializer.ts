/**
 * Run B04 against a staging Supabase project.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node --experimental-strip-types supabase/scripts/backfill-materializer.ts [--user UUID ...]
 *
 * The service-role key is required because the commit/materialize RPCs are
 * intentionally unavailable to normal authenticated clients. The script only
 * reads rootine_workspace_snapshots and writes B04 tables; it never updates or
 * deletes the source table.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  backfillUserSnapshots,
  type BackfillMaterialization,
  type BackfillRelationalCommit,
  type BackfillStore,
  type LegacySnapshotInput,
} from "../../src/infrastructure/supabase/backfillMaterializer";

type SourceRow = {
  user_id: string;
  storage_key: string;
  payload: unknown;
  content_hash: string;
  revision: number;
};

function env(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable ${name}.`);
  return value;
}

function requestedUsers() {
  const users: string[] = [];
  for (let index = 2; index < process.argv.length; index += 1) {
    if (process.argv[index] === "--user") {
      const userId = process.argv[index + 1]?.trim();
      if (!userId) throw new Error("--user requires a UUID.");
      users.push(userId);
      index += 1;
    }
  }
  return users;
}

function rpcError(error: { message?: string } | null, name: string) {
  if (error) throw new Error(`${name} failed: ${error.message ?? "unknown error"}`);
}

function storeFor(client: SupabaseClient): BackfillStore {
  return {
    async commitRelational(commit: BackfillRelationalCommit) {
      const { error } = await client.rpc("rootine_backfill_commit", {
        p_user_id: commit.userId,
        p_storage_key: commit.source.storageKey,
        p_source_revision: commit.source.sourceRevision,
        p_adapter_version: commit.adapted.adapterVersion,
        p_source_content_hash: commit.source.sourceContentHash ?? null,
        p_canonical_hash: commit.canonicalHash,
        p_canonical_payload: commit.adapted.canonicalSnapshot,
        p_records: commit.adapted.records,
        p_quarantine: commit.adapted.quarantine,
        p_manifest: {
          contractVersion: 1,
          storageKey: commit.source.storageKey,
          domain: commit.adapted.domain,
          adapterVersion: commit.adapted.adapterVersion,
          sourceVersion: commit.adapted.sourceVersion,
          status: commit.status,
          report: commit.report,
        },
        p_status: commit.status,
        p_run_id: commit.runId,
        p_diff: commit.report.differences,
      });
      rpcError(error, "rootine_backfill_commit");
    },
    async materializeLegacy(materialization: BackfillMaterialization) {
      const { error } = await client.rpc("rootine_materialize_legacy_snapshot", {
        p_user_id: materialization.userId,
        p_storage_key: materialization.source.storageKey,
        p_source_revision: materialization.source.sourceRevision,
        p_adapter_version: materialization.adapted.adapterVersion,
      });
      rpcError(error, "rootine_materialize_legacy_snapshot");
    },
  };
}

async function readSourceRows(client: SupabaseClient, userId?: string): Promise<SourceRow[]> {
  let query = client
    .from("rootine_workspace_snapshots")
    .select("user_id,storage_key,payload,content_hash,revision")
    .order("user_id", { ascending: true })
    .order("storage_key", { ascending: true });
  if (userId) query = query.eq("user_id", userId);
  const { data, error } = await query;
  rpcError(error, "rootine_workspace_snapshots read");
  return (data ?? []) as SourceRow[];
}

function input(row: SourceRow): LegacySnapshotInput {
  if (!Number.isSafeInteger(row.revision) || row.revision < 1) {
    throw new Error(`Invalid source revision for ${row.user_id}/${row.storage_key}.`);
  }
  return {
    storageKey: row.storage_key,
    payload: row.payload,
    sourceRevision: row.revision,
    sourceContentHash: row.content_hash,
  };
}

async function main() {
  const client = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const users = requestedUsers();
  const rows = users.length === 0
    ? await readSourceRows(client)
    : (await Promise.all(users.map((userId) => readSourceRows(client, userId)))).flat();
  const grouped = new Map<string, SourceRow[]>();
  rows.forEach((row) => grouped.set(row.user_id, [...(grouped.get(row.user_id) ?? []), row]));
  const store = storeFor(client);
  const reports = [];
  for (const [userId, userRows] of grouped) {
    reports.push(await backfillUserSnapshots(userId, userRows.map(input), store));
  }
  // Reports contain canonical diffs and should stay in the database audit log;
  // do not print payloads, paths or other potentially private user data.
  const summary = reports.map((report) => ({
    userId: report.userId,
    runId: report.runId,
    generatedAt: report.generatedAt,
    totals: report.totals,
    domains: report.domains.map((domain) => ({
      domain: domain.domain,
      storageKey: domain.storageKey,
      sourceRevision: domain.sourceRevision,
      adapterVersion: domain.adapterVersion,
      migrated: domain.migrated,
      quarantined: domain.quarantined,
      different: domain.different,
      status: domain.status,
      quarantineReasons: domain.quarantineReasons,
    })),
  }));
  process.stdout.write(`${JSON.stringify({ users: reports.length, summaries: summary })}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "B04 backfill failed."}\n`);
  process.exitCode = 1;
});
