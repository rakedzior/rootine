import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { baseEvidence, finishEvidence, hasFlag, runCommand, safeError, writeEvidence, commandExists } from "./release-gate-utils.mjs";
import { validateSyncContractFixtures, validateSyncContractShape } from "./sync-contract-validation.mjs";

const strict = hasFlag("--strict") || process.env.CI === "true";
const allowMissingTooling = hasFlag("--allow-missing-tooling");
const skipMissingTooling = allowMissingTooling && !strict;
const root = new URL("../supabase/functions/", import.meta.url);
const canonicalSchema = new URL("../contracts/schemas/sync-v3.schema.json", import.meta.url);
const fixtureDirectory = new URL("../contracts/fixtures/", import.meta.url);
const requiredSyncFixtures = [
  "sync-v3-bootstrap-request.json",
  "sync-v3-bootstrap-response.json",
  "sync-v3-pull-request.json",
  "sync-v3-pull-response.json",
  "sync-v3-push-request.json",
  "sync-v3-push-response.json",
  "sync-v3-push-conflict-response.json",
  "sync-v3-register-device-request.json",
  "sync-v3-register-device-no-apns-request.json",
  "sync-v3-register-device-response.json",
  "sync-v3-error-cursor-expired.json",
];

export function isDenoContractTestSource(source) {
  return /\bDeno\.test\s*\(/.test(source)
    && !/(?:from\s+|import\s*\(|require\s*\()\s*["']vitest["']/.test(source);
}

export async function findTests(directory, prefix = "") {
  const tests = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = join(prefix, entry.name);
    if (entry.isDirectory()) tests.push(...await findTests(new URL(`${entry.name}/`, directory), relative));
    else if (/\.(test|contract)\.ts$/.test(entry.name)) {
      const source = await readFile(new URL(entry.name, directory), "utf8");
      if (isDenoContractTestSource(source)) tests.push(relative);
    }
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
  const fixtures = {};
  for (const name of requiredSyncFixtures) fixtures[name] = JSON.parse(await readFile(new URL(name, fixtureDirectory), "utf8"));
  return {
    shape: validateSyncContractShape(contract),
    fixtures: validateSyncContractFixtures(contract, fixtures),
    fixtureCount: Object.keys(fixtures).length,
  };
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
      passed: contract.shape.valid,
      status: contract.shape.valid ? "present" : "blocked",
      contract_version: contract.shape.contract_version,
      definitions: contract.shape.definitions,
    });
    passed &&= contract.shape.valid;
    const invalidFixtures = contract.fixtures.results.filter((result) => !result.valid);
    evidence.checks.push({
      name: "sync-v3 request/response fixtures validate against schema",
      passed: contract.fixtureCount === requiredSyncFixtures.length && contract.fixtures.valid,
      status: contract.fixtureCount === requiredSyncFixtures.length && contract.fixtures.valid ? "present" : "blocked",
      fixture_count: contract.fixtureCount,
      invalid_fixtures: invalidFixtures.map((result) => ({ name: result.name, errors: result.errors })),
    });
    passed &&= contract.fixtureCount === requiredSyncFixtures.length && contract.fixtures.valid;
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
    passed &&= skipMissingTooling;
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

  const requiredFunctionNames = ["delete-account", "mobile-sync"];
  const functionTestInventory = Object.fromEntries(requiredFunctionNames.map((name) => [
    name,
    tests.filter((test) => test.startsWith(`${name}/`)),
  ]));
  const missingFunctionTests = requiredFunctionNames.filter((name) => !functionTestInventory[name].length);
  evidence.checks.push({
    name: "required Edge Function contract-test inventory",
    passed: missingFunctionTests.length === 0 || !strict,
    status: missingFunctionTests.length === 0 ? "present" : strict ? "blocked" : "scaffold-pending",
    reason: missingFunctionTests.length === 0
      ? undefined
      : `Missing contract tests for: ${missingFunctionTests.join(", ")}`,
    functions: functionTestInventory,
  });
  passed &&= missingFunctionTests.length === 0 || !strict;

  evidence.duration_ms = Date.now() - started;
  const complete = finishEvidence(evidence, passed);
  const path = await writeEvidence(complete, "edge-contract-gate.json");
  console.log(`Evidence: ${path}`);
  if (!passed) {
    console.error(`Edge contract gate blocked (${strict ? "strict" : "local"} mode).`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (error) => {
    const evidence = finishEvidence(baseEvidence("edge-contract-gate"), false, { error: safeError(error) });
    const path = await writeEvidence(evidence, "edge-contract-gate.json");
    console.error(`Edge contract gate failed: ${safeError(error)}\nEvidence: ${path}`);
    process.exitCode = 1;
  });
}
