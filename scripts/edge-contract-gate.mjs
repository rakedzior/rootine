import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { baseEvidence, finishEvidence, hasFlag, runCommand, safeError, writeEvidence, commandExists } from "./release-gate-utils.mjs";

const strict = hasFlag("--strict") || process.env.CI === "true";
const allowMissingTooling = hasFlag("--allow-missing-tooling");
const skipMissingTooling = allowMissingTooling && !strict;
const root = new URL("../supabase/functions/", import.meta.url);

async function findTests(directory, prefix = "") {
  const tests = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = join(prefix, entry.name);
    if (entry.isDirectory()) tests.push(...await findTests(new URL(`${entry.name}/`, directory), relative));
    else if (/\.(test|contract)\.ts$/.test(entry.name)) tests.push(relative);
  }
  return tests.sort();
}

function resolveDeno() {
  const configured = process.env.DENO_BIN?.trim();
  if (configured) return configured;
  return commandExists("deno") ? "deno" : null;
}

async function validateSyncContract() {
  const contract = JSON.parse(await readFile(new URL("../contracts/sync-v3.contract.json", import.meta.url), "utf8"));
  const required = new Set(contract.required || []);
  const actions = contract.properties?.action?.enum || [];
  const valid = contract.type === "object"
    && contract.properties?.contract_version?.const === 1
    && required.has("contract_version")
    && required.has("action")
    && required.has("device_id")
    && actions.includes("register_device")
    && actions.includes("bootstrap")
    && actions.includes("pull")
    && actions.includes("push")
    && contract["x-transport"]?.method === "POST"
    && contract["x-transport"]?.path === "/functions/v1/mobile-sync"
    && contract["x-response"]?.required?.includes("contract_version")
    && contract["x-response"]?.properties?.round_trip_domains?.type === "array"
    && contract["x-response"]?.properties?.round_trip_domains?.items?.required?.includes("client_a_to_b")
    && contract["x-response"]?.properties?.round_trip_domains?.items?.required?.includes("client_b_to_a")
    && contract["x-privacy"]?.logs_must_not_include_tokens === true;
  return { valid, contract_version: contract.properties?.contract_version?.const, actions };
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
  evidence.functions = tests;

  try {
    const contract = await validateSyncContract();
    evidence.checks.push({
      name: "sync-v3 executable contract schema",
      passed: contract.valid,
      status: contract.valid ? "present" : "blocked",
      contract_version: contract.contract_version,
      actions: contract.actions,
    });
    passed &&= contract.valid;
  } catch (error) {
    evidence.checks.push({ name: "sync-v3 executable contract schema", passed: false, status: "blocked", reason: safeError(error) });
    passed = false;
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

  const mobileSyncDirectory = new URL("mobile-sync/", root);
  let mobileSyncExists = true;
  try {
    const entries = await readdir(mobileSyncDirectory);
    mobileSyncExists = entries.includes("index.ts");
  } catch {
    mobileSyncExists = false;
  }
  const mobileSyncTestExists = tests.some((test) => test.startsWith("mobile-sync/"));
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
