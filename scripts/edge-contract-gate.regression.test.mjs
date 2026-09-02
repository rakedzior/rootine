import test from "node:test";
import assert from "node:assert/strict";
import { SYNC_CONTRACT_ID, SYNC_CONTRACT_VERSION, validateSyncContractShape } from "./sync-contract-validation.mjs";

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
