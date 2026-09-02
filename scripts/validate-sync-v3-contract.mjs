import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(".");
const schemaPath = resolve(root, "contracts/schemas/sync-v3.schema.json");
const manifestPath = resolve(root, "contracts/manifest.json");
const fixtureDirectory = resolve(root, "contracts/fixtures");
const failures = [];
const correlationPattern = /^rt3_(development|staging|production)_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const operationPattern = /^op3_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const devicePattern = /^ios_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const privateMarkers = ["prywatna treść", "wynik badania", "bank account", "password=", "authorization: bearer"];

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    failures.push(`Invalid JSON: ${path}`);
    return null;
  }
}

function walk(value, visit) {
  visit(value);
  if (Array.isArray(value)) value.forEach((item) => walk(item, visit));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => walk(item, visit));
}

const schema = readJson(schemaPath);
const manifest = readJson(manifestPath);
if (!existsSync(schemaPath)) failures.push(`Missing sync-v3 schema: ${schemaPath}`);
if (!existsSync(manifestPath)) failures.push(`Missing contracts manifest: ${manifestPath}`);

if (schema) {
  if (schema.$id !== "https://rootine.app/contracts/sync-v3.schema.json") failures.push("sync-v3 schema has an unexpected $id");
  for (const definition of [
    "bootstrapRequest",
    "pullRequest",
    "pushRequest",
    "registerDeviceRequest",
    "bootstrapResponse",
    "pullResponse",
    "pushResponse",
    "registerDeviceResponse",
    "errorResponse",
  ]) {
    if (!schema.$defs?.[definition]) failures.push(`sync-v3 schema is missing ${definition}`);
  }
  if (schema.$defs?.responseEnvelope?.properties?.contract_version?.const !== 3) {
    failures.push("sync-v3 response envelope must require contract_version 3");
  }
}

if (manifest) {
  if (manifest.syncV3?.contractVersion !== 3) failures.push("contracts manifest must register sync-v3 contractVersion 3");
  if (manifest.syncV3?.schema !== "schemas/sync-v3.schema.json") failures.push("contracts manifest points to the wrong sync-v3 schema");
  if (manifest.syncV3?.endpoint !== "functions/v1/mobile-sync") failures.push("contracts manifest must use the action-dispatched mobile-sync endpoint");
  if (manifest.syncV3?.dispatchField !== "action") failures.push("contracts manifest must register action as the mobile-sync dispatch field");
  if (manifest.featureFlags?.default !== false) failures.push("feature flag default must be false");
  for (const flag of ["normalized_sync_enabled", "normalized_read_enabled", "notifications_enabled"]) {
    if (!manifest.featureFlags?.names?.includes(flag)) failures.push(`feature flag is missing from manifest: ${flag}`);
  }
}

const fixtureNames = [
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
for (const fixtureName of fixtureNames) {
  const fixture = readJson(resolve(fixtureDirectory, fixtureName));
  if (!fixture) continue;
  if (typeof fixture.correlation_id !== "string" || !correlationPattern.test(fixture.correlation_id)) {
    failures.push(`${fixtureName} has an invalid correlation_id`);
  }
  if (fixtureName.includes("response") || fixtureName.includes("error")) {
    if (fixture.contract_version !== 3) failures.push(`${fixtureName} must use contract_version 3`);
  }
  if (fixture.device_id !== undefined && !devicePattern.test(fixture.device_id)) {
    failures.push(`${fixtureName} has an invalid device_id`);
  }
  walk(fixture, (value) => {
    if (typeof value === "string" && privateMarkers.some((marker) => value.toLowerCase().includes(marker))) {
      failures.push(`${fixtureName} contains a private payload marker`);
    }
  });
}

const pushRequest = readJson(resolve(fixtureDirectory, "sync-v3-push-request.json"));
const pushResponse = readJson(resolve(fixtureDirectory, "sync-v3-push-response.json"));
if (pushRequest?.commands?.some((command) => !operationPattern.test(command.operation_id))) {
  failures.push("sync-v3 push request has an invalid operation_id");
}
if (pushResponse?.results?.some((result) => !operationPattern.test(result.operation_id))) {
  failures.push("sync-v3 push response has an invalid operation_id");
}

const expectedActions = {
  "sync-v3-bootstrap-request.json": "bootstrap",
  "sync-v3-pull-request.json": "pull",
  "sync-v3-push-request.json": "push",
  "sync-v3-register-device-request.json": "register_device",
  "sync-v3-register-device-no-apns-request.json": "register_device",
};
for (const [fixtureName, expectedAction] of Object.entries(expectedActions)) {
  const fixture = readJson(resolve(fixtureDirectory, fixtureName));
  if (fixture?.action !== expectedAction) failures.push(`${fixtureName} must dispatch with action=${expectedAction}`);
}

// A future or legacy response must not be treated as a sync-v3 response.
const legacyCandidate = { ...(pushResponse ?? {}), contract_version: 2 };
if (legacyCandidate.contract_version === 3) failures.push("incompatible contract version was accepted by the validator");

if (failures.length > 0) {
  console.error("sync-v3 contract validation failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`sync-v3 contract validation passed: schema, ${fixtureNames.length} fixtures, IDs, version gate, and flag registry.`);
