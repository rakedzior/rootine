import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { baseEvidence, finishEvidence, hasFlag, runCommand, safeError, writeEvidence, commandExists } from "./release-gate-utils.mjs";
import { validateSyncContractShape } from "./sync-contract-validation.mjs";

const strict = hasFlag("--strict") || process.env.CI === "true";
const allowMissingTooling = hasFlag("--allow-missing-tooling");
const skipMissingTooling = allowMissingTooling && !strict;
const root = new URL("../supabase/functions/", import.meta.url);
const canonicalSchema = new URL("../contracts/schemas/sync-v3.schema.json", import.meta.url);

async function findTests(directory, prefix = "") {
  const tests = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = join(prefix, entry.name);
    if (entry.isDirectory()) tests.push(...await findTests(new URL(`${entry.name}/`, directory), relative));
    else if (/\.(test|contract)\.ts$/.test(entry.name)) tests.push(relative);
  }
  return tests.sort();
}

async function findApiContractTests(directory, prefix = "") {
  const tests = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = join(prefix, entry.name);
    if (entry.isDirectory()) tests.push(...await findApiContractTests(new URL(`${entry.name}/`, directory), relative));
    else if (/mobile-sync\.test\.ts$/.test(entry.name)) tests.push(relative);
  }
  return tests.sort();
}

function resolveDeno() {
  const configured = process.env.DENO_BIN?.trim();
  if (configured) return configured;
  return commandExists("deno") ? "deno" : null;
}

function resolveVitest() {
  const configured = process.env.VITEST_BIN?.trim();
  if (configured) return configured;
  if (existsSync("node_modules/.bin/vitest")) return "node_modules/.bin/vitest";
  return commandExists("vitest") ? "vitest" : null;
}

async function validateSyncContract() {
  const contract = JSON.parse(await readFile(canonicalSchema, "utf8"));
  return validateSyncContractShape(contract);
}

async function main() {
  const started = Date.now();
  const evidence = baseEvidence("edge-contract-gate", {
    mode: strict ? "strict" : "local",
    checks: [],
    functions: [],
  });
  let passed = true;
  const deno = resolveDeno();
  const tests = await findTests(root);
  const apiDirectory = new URL("../api/", import.meta.url);
  const apiTests = existsSync(new URL("../api/", import.meta.url))
    ? await findApiContractTests(apiDirectory)
    : [];
  evidence.functions = tests;
  evidence.api_contract_tests = apiTests;

  try {
    const contract = await validateSyncContract();
    evidence.checks.push({
      name: "sync-v3 executable contract schema",
      passed: contract.valid,
      status: contract.valid ? "present" : "blocked",
      contract_version: contract.contract_version,
      definitions: contract.definitions,
    });
    passed &&= contract.valid;
  } catch (error) {
    const missing = error?.code === "ENOENT";
    evidence.checks.push({
      name: "sync-v3 executable contract schema",
      passed: missing && !strict,
      status: missing ? (strict ? "blocked" : "scaffold-pending") : "blocked",
      reason: missing
        ? "B01 canonical contracts/schemas/sync-v3.schema.json is required; strict release gate blocks until it is integrated."
        : safeError(error),
    });
    passed = missing ? (missing && !strict) : false;
  }

  if (!deno) {
    evidence.checks.push({
      name: "Deno tooling",
      passed: skipMissingTooling,
      status: skipMissingTooling ? "skipped" : "blocked",
      reason: "Deno is required for Edge Function contract tests. The CI workflow installs it explicitly.",
    });
    passed = skipMissingTooling;
  } else if (tests.length === 0) {
    evidence.checks.push({
      name: "Edge contract test inventory",
      passed: !strict,
      status: strict ? "blocked" : "skipped",
      reason: "No *.test.ts or *.contract.ts Edge tests were found.",
    });
    passed &&= !strict;
  } else {
    for (const test of tests) {
      const result = runCommand(deno, ["test", "--node-modules-dir=auto", "--allow-env", "--allow-net", join("supabase/functions", test)], {
        env: { ...process.env, DENO_NO_PROMPT: "1" },
      });
      evidence.checks.push({
        name: `Edge contract: ${test}`,
        passed: result.ok,
        command: result.command,
        output: result.ok ? undefined : `${result.stdout}\n${result.stderr}`.trim().slice(-8_000),
      });
      passed &&= result.ok;
    }
  }

  const vitest = resolveVitest();
  if (apiTests.length > 0) {
    if (!vitest) {
      const reason = "Vitest is required for the mobile-sync API contract test; CI installs it with npm ci.";
      evidence.checks.push({ name: "mobile-sync API contract tooling", passed: !strict, status: strict ? "blocked" : "scaffold-pending", reason });
      passed &&= !strict;
    } else {
      for (const test of apiTests) {
        const result = runCommand(vitest, ["run", join("api", test)], { env: process.env });
        evidence.checks.push({
          name: `mobile-sync API contract: ${test}`,
          passed: result.ok,
          command: result.command,
          output: result.ok ? undefined : `${result.stdout}\n${result.stderr}`.trim().slice(-8_000),
        });
        passed &&= result.ok;
      }
    }
  }

  const mobileSyncDirectory = new URL("mobile-sync/", root);
  let mobileSyncExists = true;
  try {
    const entries = await readdir(mobileSyncDirectory);
    mobileSyncExists = entries.includes("index.ts");
  } catch {
    mobileSyncExists = false;
  }
  const mobileSyncTestExists = tests.some((test) => test.startsWith("mobile-sync/"))
    || apiTests.some((test) => test === "mobile-sync.test.ts");
  evidence.checks.push({
    name: "mobile-sync Edge Function and contract test",
    passed: (mobileSyncExists && mobileSyncTestExists) || !strict,
    status: mobileSyncExists && mobileSyncTestExists ? "present" : strict ? "blocked" : "scaffold-pending",
    reason: mobileSyncExists && mobileSyncTestExists
      ? undefined
      : "B03 implementation and a mobile-sync *.test.ts/*.contract.ts are required by the strict release gate.",
    implementation: mobileSyncExists,
    contract_test: mobileSyncTestExists,
  });
  passed &&= (mobileSyncExists && mobileSyncTestExists) || !strict;

  evidence.duration_ms = Date.now() - started;
  const complete = finishEvidence(evidence, passed);
  const path = await writeEvidence(complete, "edge-contract-gate.json");
  console.log(`Evidence: ${path}`);
  if (!passed) {
    console.error(`Edge contract gate blocked (${strict ? "strict" : "local"} mode).`);
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  const evidence = finishEvidence(baseEvidence("edge-contract-gate"), false, { error: safeError(error) });
  const path = await writeEvidence(evidence, "edge-contract-gate.json");
  console.error(`Edge contract gate failed: ${safeError(error)}\nEvidence: ${path}`);
  process.exitCode = 1;
});
