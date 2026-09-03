import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { SYNC_CONTRACT_ID, SYNC_CONTRACT_VERSION, SYNC_SCHEMA_DIALECT, validateSyncContractFixtures, validateSyncContractShape } from "./sync-contract-validation.mjs";
import { findTests, isDenoContractTestSource } from "./edge-contract-gate.mjs";

function contractFixture(overrides = {}) {
  const definitions = [
    "bootstrapRequest",
    "pullRequest",
    "pushRequest",
    "registerDeviceRequest",
    "bootstrapResponse",
    "pullResponse",
    "pushResponse",
    "registerDeviceResponse",
    "errorResponse",
  ];
  return {
    $schema: SYNC_SCHEMA_DIALECT,
    $id: SYNC_CONTRACT_ID,
    oneOf: definitions.map((definition) => ({ $ref: `#/$defs/${definition}` })),
    $defs: {
      correlationId: { pattern: "^rt3_(development|staging|production)_" },
      operationId: { pattern: "^op3_" },
      deviceId: { pattern: "^ios_" },
      requestEnvelope: { required: ["correlation_id"] },
      responseEnvelope: {
        required: ["contract_version", "correlation_id"],
        properties: { contract_version: { const: SYNC_CONTRACT_VERSION } },
      },
      ...Object.fromEntries(definitions.map((definition, index) => [definition, {
        allOf: [{ $ref: `#/$defs/${index < 4 ? "requestEnvelope" : "responseEnvelope"}` }],
      }])),
    },
    ...overrides,
  };
}

test("sync-v3 gate accepts the canonical request/response envelope", () => {
  const result = validateSyncContractShape(contractFixture());
  assert.equal(result.valid, true);
  assert.equal(result.contract_version, 3);
});

test("sync-v3 gate rejects the retired v1 contract envelope", () => {
  const legacy = contractFixture();
  legacy.$defs.responseEnvelope.properties.contract_version.const = 1;
  const result = validateSyncContractShape(legacy);
  assert.equal(result.valid, false);
});

test("sync-v3 gate rejects a response envelope without correlation_id", () => {
  const invalid = contractFixture();
  invalid.$defs.responseEnvelope.required = ["contract_version"];
  const result = validateSyncContractShape(invalid);
  assert.equal(result.valid, false);
});

test("canonical sync-v3 fixtures validate against the executable schema", () => {
  const schema = JSON.parse(readFileSync("contracts/schemas/sync-v3.schema.json", "utf8"));
  const fixtures = Object.fromEntries(readdirSync("contracts/fixtures")
    .filter((name) => name.startsWith("sync-v3-") && name.endsWith(".json"))
    .map((name) => [name, JSON.parse(readFileSync(`contracts/fixtures/${name}`, "utf8"))]));
  const result = validateSyncContractFixtures(schema, fixtures);
  assert.equal(result.valid, true);
  assert.equal(result.results.length, 11);
});

test("executable sync-v3 schema rejects an out-of-range pull limit", () => {
  const schema = JSON.parse(readFileSync("contracts/schemas/sync-v3.schema.json", "utf8"));
  const fixture = JSON.parse(readFileSync("contracts/fixtures/sync-v3-pull-request.json", "utf8"));
  fixture.limit = 501;
  const result = validateSyncContractFixtures(schema, { fixture });
  assert.equal(result.valid, false);
});

test("edge inventory executes only Deno-native contract tests", async () => {
  const tests = await findTests(new URL("../supabase/functions/", import.meta.url));
  assert.deepEqual(tests, ["delete-account/index.test.ts", "mobile-sync/index.test.ts"]);
  assert.equal(isDenoContractTestSource(readFileSync("supabase/functions/_shared/notification-worker.test.ts", "utf8")), false);
  assert.equal(isDenoContractTestSource(readFileSync("supabase/functions/mobile-sync/index.test.ts", "utf8")), true);
});
