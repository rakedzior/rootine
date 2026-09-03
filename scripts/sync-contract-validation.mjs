export const SYNC_CONTRACT_VERSION = 3;
export const SYNC_CONTRACT_ID = "https://rootine.app/contracts/sync-v3.schema.json";
export const SYNC_SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema";

const expectedDefinitions = [
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
const requestDefinitions = expectedDefinitions.slice(0, 4);
const responseDefinitions = expectedDefinitions.slice(4);

function references(definition, target) {
  return definition?.allOf?.some((entry) => entry.$ref === `#/$defs/${target}`) === true;
}

export function validateSyncContractShape(contract) {
  const definitions = new Set(contract?.oneOf?.map((entry) => entry.$ref?.split("/").at(-1)) || []);
  const responseEnvelope = contract?.$defs?.responseEnvelope;
  const requestEnvelope = contract?.$defs?.requestEnvelope;
  const valid = contract?.$id === SYNC_CONTRACT_ID
    && contract?.$schema === SYNC_SCHEMA_DIALECT
    && contract?.oneOf?.length === expectedDefinitions.length
    && expectedDefinitions.every((definition) => definitions.has(definition) && contract.$defs?.[definition])
    && requestDefinitions.every((definition) => references(contract.$defs?.[definition], "requestEnvelope"))
    && responseDefinitions.every((definition) => references(contract.$defs?.[definition], "responseEnvelope"))
    && responseEnvelope?.properties?.contract_version?.const === SYNC_CONTRACT_VERSION
    && responseEnvelope?.required?.includes("contract_version")
    && responseEnvelope?.required?.includes("correlation_id")
    && requestEnvelope?.required?.includes("correlation_id")
    && contract?.$defs?.correlationId?.pattern?.includes("rt3_")
    && contract?.$defs?.operationId?.pattern?.includes("op3_")
    && contract?.$defs?.deviceId?.pattern?.includes("ios_");
  return {
    valid,
    contract_version: responseEnvelope?.properties?.contract_version?.const,
    definitions: expectedDefinitions,
  };
}

function resolveRef(root, reference) {
  if (!reference?.startsWith("#/$defs/")) return undefined;
  return root?.$defs?.[reference.slice("#/$defs/".length)];
}

function typeMatches(value, type) {
  if (type === "object") return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  if (type === "array") return Array.isArray(value);
  if (type === "integer") return typeof value === "number" && Number.isSafeInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "string") return typeof value === "string";
  if (type === "boolean") return typeof value === "boolean";
  if (type === "null") return value === null;
  return true;
}

function pathFor(path, key) {
  return `${path}.${key}`;
}

function collectObjectProperties(schema, root, properties = new Set()) {
  if (!schema || typeof schema !== "object") return properties;
  Object.keys(schema.properties || {}).forEach((key) => properties.add(key));
  for (const entry of schema.allOf || []) collectObjectProperties(entry, root, properties);
  if (schema.$ref) collectObjectProperties(resolveRef(root, schema.$ref), root, properties);
  return properties;
}

function validateJson(value, schema, root, path, errors, options = {}) {
  if (!schema || typeof schema !== "object") return;
  if (schema.$ref) {
    validateJson(value, resolveRef(root, schema.$ref), root, path, errors, options);
    return;
  }
  if (schema.oneOf) {
    const matches = schema.oneOf.filter((candidate) => {
      const candidateErrors = [];
      validateJson(value, candidate, root, path, candidateErrors, options);
      return candidateErrors.length === 0;
    });
    if (matches.length !== 1) errors.push(`${path} must match exactly one schema (matched ${matches.length})`);
    return;
  }
  if (schema.allOf) {
    for (const entry of schema.allOf) validateJson(value, entry, root, path, errors, options);
  }
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((type) => typeMatches(value, type))) {
      errors.push(`${path} has an invalid type`);
      return;
    }
  }
  if (schema.const !== undefined && value !== schema.const) errors.push(`${path} must equal ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path} has an invalid value`);
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path} is too short`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${path} is too long`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${path} has an invalid format`);
    if (schema.format === "date-time" && (Number.isNaN(Date.parse(value)) || !value.includes("T"))) errors.push(`${path} must be an ISO date-time`);
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path} is below the minimum`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path} is above the maximum`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path} has too few items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path} has too many items`);
    if (schema.items) value.forEach((item, index) => validateJson(item, schema.items, root, `${path}[${index}]`, errors, options));
  }
  if (typeMatches(value, "object")) {
    for (const key of schema.required || []) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) errors.push(`${path} is missing ${key}`);
    }
    const properties = collectObjectProperties(schema, root);
    for (const [key, propertySchema] of Object.entries(schema.properties || {})) {
      if (Object.prototype.hasOwnProperty.call(value, key)) validateJson(value[key], propertySchema, root, pathFor(path, key), errors, options);
    }
    if (schema.additionalProperties === false || schema.unevaluatedProperties === false) {
      for (const key of Object.keys(value)) {
        if (!properties.has(key)) errors.push(`${path} contains an unsupported property ${key}`);
      }
    }
  }
  if (schema.if) {
    const conditionErrors = [];
    validateJson(value, schema.if, root, path, conditionErrors, options);
    if (conditionErrors.length === 0 && schema.then) validateJson(value, schema.then, root, path, errors, options);
    if (conditionErrors.length > 0 && schema.else) validateJson(value, schema.else, root, path, errors, options);
  }
  if (schema.not) {
    const notErrors = [];
    validateJson(value, schema.not, root, path, notErrors, options);
    if (notErrors.length === 0) errors.push(`${path} matches a forbidden schema`);
  }
}

export function validateSyncContractFixtures(contract, fixtures) {
  const results = Object.entries(fixtures || {}).map(([name, value]) => {
    const errors = [];
    validateJson(value, contract, contract, "$", errors);
    return { name, valid: errors.length === 0, errors };
  });
  return { valid: results.every((result) => result.valid), results };
}
