import { z } from "zod";

/**
 * The wire version is deliberately independent from domain workspace versions.
 * A task workspace can move from v2 to v3 without changing this transport
 * envelope, and a transport change must be handled by every client together.
 */
export const SYNC_V3_CONTRACT_VERSION = 3 as const;

export const SYNC_V3_ENDPOINTS = [
  "bootstrap",
  "pull",
  "push",
  "register_device",
] as const;
export type SyncV3Endpoint = (typeof SYNC_V3_ENDPOINTS)[number];

export const SYNC_V3_ERROR_CODES = [
  "unauthorized",
  "invalid",
  "conflict",
  "cursor_expired",
  "rate_limited",
  "server_error",
] as const;
export type SyncV3ErrorCode = (typeof SYNC_V3_ERROR_CODES)[number];

const UUID_V4 = "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
export const correlationIdSchema = z.string().regex(
  new RegExp(`^rt3_(development|staging|production)_${UUID_V4}$`),
  "correlation_id must use rt3_<environment>_<uuidv4>",
);
export const operationIdSchema = z.string().regex(
  new RegExp(`^op3_${UUID_V4}$`),
  "operation_id must use op3_<uuidv4>",
);
export const deviceIdSchema = z.string().regex(
  new RegExp(`^ios_${UUID_V4}$`),
  "device_id must use ios_<uuidv4>",
);
const environmentSchema = z.enum(["development", "staging", "production"]);
const entitySchema = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/);
const entityIdSchema = z.string().min(1).max(180);
const jsonObjectSchema = z.record(z.string(), z.unknown());

export const syncV3RequestEnvelopeSchema = z.object({
  // Clients may echo the wire version on requests. It is optional for
  // backwards-compatible callers, but when present it must never downgrade
  // the v3 boundary.
  contract_version: z.literal(SYNC_V3_CONTRACT_VERSION).optional(),
  correlation_id: correlationIdSchema,
}).strict();

export const bootstrapRequestSchema = syncV3RequestEnvelopeSchema.extend({
  action: z.literal("bootstrap"),
  device_id: deviceIdSchema,
}).strict();

export const pullRequestSchema = syncV3RequestEnvelopeSchema.extend({
  action: z.literal("pull"),
  device_id: deviceIdSchema,
  cursor: z.number().int().nonnegative().nullable(),
  limit: z.number().int().min(1).max(500).default(500),
}).strict();

export const syncCommandSchema = z.object({
  operation_id: operationIdSchema,
  entity: entitySchema,
  entity_id: entityIdSchema,
  kind: z.enum(["upsert", "delete"]),
  base_revision: z.number().int().nonnegative(),
  payload: jsonObjectSchema.optional(),
}).strict().superRefine((command, context) => {
  if (command.kind === "upsert" && !command.payload) {
    context.addIssue({
      code: "custom",
      path: ["payload"],
      message: "upsert commands require payload",
    });
  }
  if (command.kind === "delete" && command.payload) {
    context.addIssue({
      code: "custom",
      path: ["payload"],
      message: "delete commands must not contain payload",
    });
  }
});

export const pushRequestSchema = syncV3RequestEnvelopeSchema.extend({
  action: z.literal("push"),
  device_id: deviceIdSchema,
  commands: z.array(syncCommandSchema).min(1).max(100),
}).strict();

export const registerDeviceRequestSchema = syncV3RequestEnvelopeSchema.extend({
  action: z.literal("register_device"),
  device_id: deviceIdSchema,
  platform: z.literal("ios"),
  app_version: z.string().min(1).max(40),
  environment: environmentSchema,
  apns_environment: z.enum(["sandbox", "production"]).optional(),
  push_token: z.string().min(1).max(512).optional(),
}).strict().superRefine((request, context) => {
  if (Boolean(request.push_token) !== Boolean(request.apns_environment)) {
    context.addIssue({
      code: "custom",
      path: [request.push_token ? "apns_environment" : "push_token"],
      message: "push_token and apns_environment must be supplied together",
    });
  }
});

const responseEnvelope = z.object({
  contract_version: z.literal(SYNC_V3_CONTRACT_VERSION),
  correlation_id: correlationIdSchema,
}).strict();

export const syncChangeSchema = z.object({
  cursor: z.number().int().positive(),
  entity: entitySchema,
  entity_id: entityIdSchema,
  operation: z.enum(["upsert", "delete"]),
  record: z.unknown(),
}).strict();

export const bootstrapResponseSchema = responseEnvelope.extend({
  server_cursor: z.number().int().nonnegative(),
  next_cursor: z.number().int().nonnegative(),
  has_more: z.boolean(),
  changes: z.array(syncChangeSchema).max(500),
}).strict();

export const pullResponseSchema = responseEnvelope.extend({
  from_cursor: z.number().int().nonnegative(),
  next_cursor: z.number().int().nonnegative(),
  has_more: z.boolean(),
  changes: z.array(syncChangeSchema).max(500),
}).strict();

export const pushResultSchema = z.object({
  operation_id: operationIdSchema,
  status: z.enum(["applied", "already_applied", "conflict", "invalid"]),
  entity: entitySchema,
  entity_id: entityIdSchema,
  revision: z.number().int().nonnegative().optional(),
  server_revision: z.number().int().nonnegative().optional(),
  server_record: z.unknown().optional(),
}).strict();

export const pushResponseSchema = responseEnvelope.extend({
  server_cursor: z.number().int().nonnegative(),
  results: z.array(pushResultSchema).max(100),
}).strict();

export const registerDeviceResponseSchema = responseEnvelope.extend({
  device_id: deviceIdSchema,
  environment: environmentSchema,
  registered_at: z.string().datetime({ offset: true }),
}).strict();

export const syncV3ErrorResponseSchema = responseEnvelope.extend({
  error: z.enum(SYNC_V3_ERROR_CODES),
  retry_after_seconds: z.number().int().positive().optional(),
}).strict();

export type BootstrapRequest = z.infer<typeof bootstrapRequestSchema>;
export type PullRequest = z.infer<typeof pullRequestSchema>;
export type PushRequest = z.infer<typeof pushRequestSchema>;
export type RegisterDeviceRequest = z.infer<typeof registerDeviceRequestSchema>;
export type BootstrapResponse = z.infer<typeof bootstrapResponseSchema>;
export type PullResponse = z.infer<typeof pullResponseSchema>;
export type PushResponse = z.infer<typeof pushResponseSchema>;
export type RegisterDeviceResponse = z.infer<typeof registerDeviceResponseSchema>;
export type SyncV3ErrorResponse = z.infer<typeof syncV3ErrorResponseSchema>;

const responseSchemas: Record<SyncV3Endpoint, z.ZodType> = {
  bootstrap: bootstrapResponseSchema,
  pull: pullResponseSchema,
  push: pushResponseSchema,
  register_device: registerDeviceResponseSchema,
};

/** Parse a response and reject a legacy/future envelope before using payload. */
export function parseSyncV3Response(endpoint: SyncV3Endpoint, value: unknown) {
  return responseSchemas[endpoint].parse(value);
}
export function parseSyncV3Error(value: unknown) {
  return syncV3ErrorResponseSchema.parse(value);
}
