import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { baseEvidence, finishEvidence, hasFlag, redact, runCommand, safeError, writeEvidence, commandExists } from "./release-gate-utils.mjs";

const strict = hasFlag("--strict") || process.env.CI === "true";
const allowMissingTooling = hasFlag("--allow-missing-tooling");
const localOnly = hasFlag("--local-only");
const skipMissingTooling = allowMissingTooling && !strict;
const migrationDirectory = new URL("../supabase/migrations/", import.meta.url);

async function migrationVersions() {
  const names = (await readdir(migrationDirectory))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  const files = await Promise.all(names.map(async (name) => ({
    name,
    contents: await readFile(new URL(name, migrationDirectory), "utf8"),
  })));
  return { files, latest: names.at(-1)?.split("_")[0] ?? "unknown" };
}

function resolveSupabaseCommand() {
  const configured = process.env.SUPABASE_CLI?.trim();
  if (configured) return { command: configured, prefix: [] };
  if (commandExists("supabase")) return { command: "supabase", prefix: [] };
  if (existsSync("node_modules/.bin/supabase")) return { command: "node_modules/.bin/supabase", prefix: [] };
  return null;
}

function runSupabase(cli, args) {
  const result = runCommand(cli.command, [...cli.prefix, ...args]);
  const displayArgs = [...cli.prefix, ...args];
  const dbUrlIndex = displayArgs.indexOf("--db-url");
  if (dbUrlIndex >= 0 && displayArgs[dbUrlIndex + 1]) displayArgs[dbUrlIndex + 1] = "[REDACTED_DB_URL]";
  const displayCommand = redact([cli.command, ...displayArgs].join(" "));
  console.log(`${result.ok ? "PASS" : "FAIL"} ${displayCommand}`);
  if (!result.ok && result.stderr) console.error(result.stderr.trim());
  return { ...result, command: displayCommand };
}

function validateUpgradeDatabaseURL(value) {
  if (!value || /[\u0000-\u001f\u007f]/.test(value)) return false;
  try {
    const parsed = new URL(value);
    return ["postgres:", "postgresql:"].includes(parsed.protocol) && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

async function main() {
  const started = Date.now();
  const versions = await migrationVersions();
  const evidence = baseEvidence("sql-migration-gate", {
    migration_version: versions.latest,
    migrations: versions.files.map(({ name }) => name.replace(/\.sql$/, "")),
    mode: strict ? "strict" : "local",
    checks: [],
  });
  let passed = true;

  const cli = resolveSupabaseCommand();
  if (!cli) {
    const reason = "Supabase CLI is unavailable. Install it or use --allow-missing-tooling for a non-gating local check.";
    evidence.checks.push({ name: "tooling", passed: skipMissingTooling, status: skipMissingTooling ? "skipped" : "blocked", reason });
    passed = skipMissingTooling;
  } else {
    const start = runSupabase(cli, ["start", "--ignore-health-check"]);
    evidence.checks.push({ name: "local database start", passed: start.ok, command: start.command });
    passed &&= start.ok;

    const reset = runSupabase(cli, ["db", "reset", "--local", "--no-seed", "--yes"]);
    evidence.checks.push({ name: "empty database migration", passed: reset.ok, command: reset.command });
    passed &&= reset.ok;

    const tests = runSupabase(cli, ["test", "db"]);
    evidence.checks.push({ name: "SQL and RLS pgTAP", passed: tests.ok, command: tests.command });
    passed &&= tests.ok;

    const upgradeURL = process.env.ROOTINE_UPGRADE_DB_URL?.trim();
    if (upgradeURL) {
      if (!validateUpgradeDatabaseURL(upgradeURL)) {
        evidence.checks.push({
          name: "staging copy upgrade",
          passed: false,
          status: "blocked",
          reason: "ROOTINE_UPGRADE_DB_URL must be a valid PostgreSQL URL; the value is never written to evidence.",
        });
        passed = false;
      } else {
        const upgrade = runSupabase(cli, ["db", "push", "--db-url", upgradeURL, "--include-all", "--yes"]);
        evidence.checks.push({ name: "staging copy upgrade", passed: upgrade.ok, command: upgrade.command });
        passed &&= upgrade.ok;
        if (upgrade.ok) {
          const upgradeTests = runSupabase(cli, ["test", "db", "--db-url", upgradeURL]);
          evidence.checks.push({ name: "staging copy SQL and RLS", passed: upgradeTests.ok, command: upgradeTests.command });
          passed &&= upgradeTests.ok;
        }
      }
    } else if (localOnly) {
      const configured = { name: "staging copy upgrade", passed: true, status: "local-only", reason: "PR quality gate intentionally omits secret-bearing staging upgrade; protected main release gate runs it after merge." };
      evidence.checks.push(configured);
    } else {
      const configured = { name: "staging copy upgrade", passed: !strict, status: strict ? "blocked" : "skipped", reason: "ROOTINE_UPGRADE_DB_URL is required in strict mode and must point to a disposable staging copy." };
      evidence.checks.push(configured);
      passed &&= configured.passed;
    }

  }

  evidence.duration_ms = Date.now() - started;
  const complete = finishEvidence(evidence, passed);
  const path = await writeEvidence(complete, "sql-migration-gate.json");
  console.log(`Evidence: ${path}`);
  if (!passed) {
    console.error(`SQL migration gate blocked (${strict ? "strict" : "local"} mode).`);
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  const evidence = finishEvidence(baseEvidence("sql-migration-gate"), false, { error: safeError(error) });
  const path = await writeEvidence(evidence, "sql-migration-gate.json");
  console.error(`SQL migration gate failed: ${safeError(error)}\nEvidence: ${path}`);
  process.exitCode = 1;
});
