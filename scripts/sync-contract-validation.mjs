export const SYNC_CONTRACT_VERSION = 3;
export const SYNC_CONTRACT_ID = "https://rootine.app/contracts/sync-v3.schema.json";

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
