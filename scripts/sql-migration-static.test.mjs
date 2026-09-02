import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationRoot = join(repositoryRoot, "supabase", "migrations");

async function migrationNames() {
  return (await readdir(migrationRoot))
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

test("migration filenames are deterministic and timestamped", async () => {
  const names = await migrationNames();
  assert.ok(names.length > 0);
  assert.deepEqual(names, [...names].sort());
  assert.equal(new Set(names).size, names.length);
  for (const name of names) {
    assert.match(name, /^\d{14}_[a-z0-9_]+\.sql$/);
  }
});

test("same-timestamp integrations keep their declared lexical order", async () => {
  const names = await migrationNames();
  const sameTimestamp = names.filter((name) => name.startsWith("20260902120000_"));
  assert.deepEqual(sameTimestamp, [
    "20260902120000_rootine_backfill_materializer.sql",
    "20260902120000_rootine_devices.sql",
    "20260902120000_rootine_server_notifications.sql",
  ]);
  assert.ok(names.indexOf("20260902130000_rootine_mobile_sync_v3_register_device.sql") > names.indexOf("20260902120000_rootine_server_notifications.sql"));
  assert.ok(names.at(-1)?.startsWith("20260902140000_rootine_database_hardening.sql"));
});

test("hardening migration is additive and service-role gated", async () => {
  const source = await readFile(join(migrationRoot, "20260902140000_rootine_database_hardening.sql"), "utf8");
  assert.match(source, /add constraint rootine_devices_device_id_format_check/);
  assert.match(source, /add constraint rootine_notification_jobs_user_device_fk/);
  assert.match(source, /create or replace function public\.rootine_sync_retention/);
  assert.match(source, /policy\.outbox_retention/);
  assert.match(source, /policy\.tombstone_retention/);
  assert.match(source, /policy\.revision_retention/);
  assert.match(source, /last_cursor = case/);
  assert.match(source, /rootine_snapshot_materializations_retention_idx/);
  assert.match(source, /grant execute on function public\.rootine_sync_retention\(interval\) to service_role/);
  assert.match(source, /revoke all on function public\.rootine_sync_retention\(interval\) from public, anon, authenticated/);
  assert.doesNotMatch(source, /drop table|drop column|truncate table|delete from public\.rootine_workspace_snapshots\b/i);
});
