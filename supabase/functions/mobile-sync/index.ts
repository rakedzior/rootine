/**
 * Rootine sync-v3 Edge Function.
 *
 * This module deliberately uses the REST RPC endpoint instead of a
 * service-role Supabase client.  The caller's bearer token is forwarded to
 * PostgREST, so auth.uid() in every RPC remains the source of ownership.
 */

const MAX_BODY_BYTES = 1_048_576;
const MAX_BATCH = 100;
const MAX_PULL_LIMIT = 500;
const DEFAULT_TIMEOUT_MS = 8_000;
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;
const CONTRACT_VERSION = 3;
const UUID_V4 = "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const CORRELATION_ID_PATTERN = new RegExp(`^rt3_(development|staging|production)_${UUID_V4}$`);
const OPERATION_ID_PATTERN = new RegExp(`^op3_${UUID_V4}$`);
const DEVICE_ID_PATTERN = new RegExp(`^ios_${UUID_V4}$`);
const ENTITY_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
type SyncAction = "bootstrap" | "pull" | "push" | "register_device";
const rateWindows = new Map<string, { count: number; resetAt: number }>();

type Runtime = typeof globalThis & {
  Deno?: {
    env?: { get(name: string): string | undefined };
    serve?: (handler: (request: Request) => Response | Promise<Response>) => unknown;
  };
  process?: { env?: Record<string, string | undefined> };
};

export type MobileSyncAuthorization =
  | { ok: true; userId: string }
  | { ok: false; response: Response };

export type MobileSyncAuthorizer =
  (request: Request, signal: AbortSignal) => Promise<MobileSyncAuthorization>;

export type MobileSyncRpcInvoker =
  (name: string, args: Record<string, unknown>, signal: AbortSignal) => Promise<unknown>;

export interface MobileSyncHandlerOptions {
  authorize?: MobileSyncAuthorizer;
  invokeRpc?: MobileSyncRpcInvoker;
  now?: () => number;
  timeoutMs?: number;
  clientKey?: (request: Request, userId: string, deviceId: string) => string;
}

class MobileSyncTimeoutError extends Error {
  constructor() {
    super("Mobile sync request timed out");
    this.name = "MobileSyncTimeoutError";
  }
}

class MobileSyncRpcError extends Error {
  readonly status: number;

  constructor(status: number) {
    super("Mobile sync upstream request failed");
    this.name = "MobileSyncRpcError";
    this.status = status;
  }
}

function runtimeEnv(name: string) {
  const runtime = globalThis as Runtime;
  return runtime.Deno?.env?.get(name)?.trim()
    || runtime.process?.env?.[name]?.trim();
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

function errorResponse(error: string, status: number, headers: Record<string, string> = {}) {
  return jsonResponse({ error }, status, headers);
}

function runtimeEnvironment(): "development" | "staging" | "production" {
  const configured = (runtimeEnv("MOBILE_SYNC_ENVIRONMENT")
    || runtimeEnv("ROOTINE_SYNC_ENVIRONMENT")
    || runtimeEnv("SUPABASE_ENVIRONMENT")
    || runtimeEnv("ENVIRONMENT"))?.toLowerCase();
  return configured === "staging" || configured === "production" ? configured : "development";
}

function generatedCorrelationId() {
  return `rt3_${runtimeEnvironment()}_${crypto.randomUUID()}`;
}

function validCorrelationId(value: unknown): value is string {
  return typeof value === "string" && CORRELATION_ID_PATTERN.test(value);
}

function responseBody(body: Record<string, unknown>, correlationId: string) {
  return {
    contract_version: CONTRACT_VERSION,
    correlation_id: correlationId,
    ...body,
  };
}

function syncErrorResponse(
  code: "unauthorized" | "invalid" | "cursor_expired" | "rate_limited" | "server_error",
  status: number,
  correlationId: string,
  headers: Record<string, string> = {},
  retryAfterSeconds?: number,
) {
  const body: Record<string, unknown> = { error: code };
  if (retryAfterSeconds !== undefined) body.retry_after_seconds = retryAfterSeconds;
  return jsonResponse(responseBody(body, correlationId), status, headers);
}

function bearerToken(request: Request) {
  const header = request.headers.get("authorization")?.trim() ?? "";
  const match = header.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function integerField(body: Record<string, unknown>, name: string, fallback: number, min: number, max: number) {
  if (body[name] === undefined) return fallback;
  if (typeof body[name] !== "number" || !Number.isSafeInteger(body[name])) return null;
  return body[name] >= min && body[name] <= max ? body[name] : null;
}

function validPushCommand(command: Record<string, unknown>) {
  const operationId = typeof command.operation_id === "string" ? command.operation_id : "";
  const entity = typeof command.entity === "string" ? command.entity : "";
  const entityId = typeof command.entity_id === "string" ? command.entity_id : "";
  const kind = typeof command.kind === "string" ? command.kind : "";
  if (!OPERATION_ID_PATTERN.test(operationId)
    || !ENTITY_PATTERN.test(entity)
    || entityId.length < 1 || entityId.length > 180
    || !["upsert", "delete"].includes(kind)) return false;
  if (typeof command.base_revision !== "number"
    || !Number.isSafeInteger(command.base_revision)
    || command.base_revision < 0) return false;
  if (kind === "upsert" && (!Object.prototype.hasOwnProperty.call(command, "payload") || !isRecord(command.payload))) {
    return false;
  }
  if (kind === "delete" && Object.prototype.hasOwnProperty.call(command, "payload")) return false;
  return new TextEncoder().encode(JSON.stringify(command.payload ?? {})).byteLength <= 512 * 1024;
}

function consumeRateLimit(key: string, now: number) {
  if (rateWindows.size >= 1_000 && !rateWindows.has(key)) {
    rateWindows.forEach((window, candidate) => {
      if (window.resetAt <= now) rateWindows.delete(candidate);
    });
    if (rateWindows.size >= 1_000) {
      const oldest = rateWindows.keys().next().value as string | undefined;
      if (oldest) rateWindows.delete(oldest);
    }
  }
  const current = rateWindows.get(key);
  const window = !current || current.resetAt <= now
    ? { count: 0, resetAt: now + RATE_WINDOW_MS }
    : current;
  window.count += 1;
  rateWindows.set(key, window);
  return {
    allowed: window.count <= RATE_LIMIT,
    remaining: Math.max(0, RATE_LIMIT - window.count),
    retryAfter: Math.max(1, Math.ceil((window.resetAt - now) / 1_000)),
  };
}

export function resetMobileSyncRateLimitForTests() {
  rateWindows.clear();
}

function clientKey(request: Request, userId: string, deviceId: string) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = request.headers.get("cf-connecting-ip")?.trim()
    || forwarded
    || request.headers.get("x-real-ip")?.trim()
    || "unknown";
  return `${userId}:${deviceId}:${ip}`;
}

export async function authorizeMobileSyncRequest(
  request: Request,
  signal: AbortSignal,
): Promise<MobileSyncAuthorization> {
  if (!bearerToken(request)) {
    return { ok: false, response: errorResponse("Authentication is required", 401) };
  }
  const supabaseUrl = runtimeEnv("SUPABASE_URL");
  const publishableKey = runtimeEnv("SUPABASE_PUBLISHABLE_KEY")
    || runtimeEnv("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !publishableKey) {
    return { ok: false, response: errorResponse("Sync service is not configured", 503) };
  }
  try {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/user`, {
      headers: {
        accept: "application/json",
        apikey: publishableKey,
        authorization: request.headers.get("authorization") ?? "",
      },
      signal,
    });
    if (!response.ok) {
      return { ok: false, response: errorResponse("Invalid or expired access token", 401) };
    }
    const payload = await response.json() as { id?: unknown };
    if (typeof payload.id !== "string" || payload.id.length === 0) {
      return { ok: false, response: errorResponse("Invalid authentication response", 502) };
    }
    return { ok: true, userId: payload.id };
  } catch {
    if (signal.aborted) throw new MobileSyncTimeoutError();
    return { ok: false, response: errorResponse("Authentication service is unavailable", 503) };
  }
}

async function invokeMobileSyncRpc(
  request: Request,
  name: string,
  args: Record<string, unknown>,
  signal: AbortSignal,
) {
  const supabaseUrl = runtimeEnv("SUPABASE_URL");
  const publishableKey = runtimeEnv("SUPABASE_PUBLISHABLE_KEY")
    || runtimeEnv("SUPABASE_ANON_KEY");
  const token = bearerToken(request);
  if (!supabaseUrl || !publishableKey || !token) throw new MobileSyncRpcError(503);

  let response: Response;
  try {
    response = await fetch(
      `${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/${encodeURIComponent(name)}`,
      {
        method: "POST",
        headers: {
          accept: "application/json",
          apikey: publishableKey,
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(args),
        signal,
      },
    );
  } catch {
    if (signal.aborted) throw new MobileSyncTimeoutError();
    throw new MobileSyncRpcError(503);
  }
  if (!response.ok) throw new MobileSyncRpcError(response.status);
  try {
    return await response.json() as unknown;
  } catch {
    throw new MobileSyncRpcError(502);
  }
}

function actionBody(body: Record<string, unknown>) {
  const actionValue = typeof body.action === "string" ? body.action.trim().toLowerCase() : "";
  const action = actionValue as SyncAction;
  if (!["bootstrap", "pull", "push", "register_device"].includes(actionValue)) return null;
  const deviceId = typeof body.device_id === "string" ? body.device_id : "";
  if (!DEVICE_ID_PATTERN.test(deviceId)) return null;

  if (action === "bootstrap") return { action, deviceId } as const;
  if (action === "pull") {
    if (!Object.prototype.hasOwnProperty.call(body, "cursor")) return null;
    const cursor = body.cursor === null ? 0 : integerField(body, "cursor", 0, 0, Number.MAX_SAFE_INTEGER);
    const limit = integerField(body, "limit", MAX_PULL_LIMIT, 1, MAX_PULL_LIMIT);
    if (cursor === null || limit === null) return null;
    return { action, deviceId, cursor, limit } as const;
  }
  if (action === "push") {
    if (!Array.isArray(body.commands) || body.commands.length < 1 || body.commands.length > MAX_BATCH) return null;
    if (body.commands.some((command) => !isRecord(command) || !validPushCommand(command))) return null;
    return { action, deviceId, commands: body.commands } as const;
  }

  const platform = typeof body.platform === "string" ? body.platform : "";
  const appVersion = typeof body.app_version === "string" ? body.app_version : "";
  const environment = typeof body.environment === "string" ? body.environment : "";
  const hasApnsEnvironment = Object.prototype.hasOwnProperty.call(body, "apns_environment");
  const hasPushToken = Object.prototype.hasOwnProperty.call(body, "push_token");
  if (hasApnsEnvironment !== hasPushToken) return null;
  const apnsEnvironment = hasApnsEnvironment
    && typeof body.apns_environment === "string" ? body.apns_environment : null;
  const pushToken = hasPushToken && typeof body.push_token === "string" ? body.push_token : null;
  if (platform !== "ios" || appVersion.length < 1 || appVersion.length > 40
    || !["development", "staging", "production"].includes(environment)
    || (hasApnsEnvironment && (!apnsEnvironment || !["sandbox", "production"].includes(apnsEnvironment)))
    || (hasPushToken && (!pushToken || pushToken.length < 1 || pushToken.length > 512))) return null;
  return {
    action,
    deviceId,
    platform,
    appVersion,
    environment,
    apnsEnvironment,
    pushToken,
  } as const;
}

function rpcErrorStatus(error: unknown) {
  if (!(error instanceof MobileSyncRpcError)) return 502;
  if (error.status === 401) return 401;
  if (error.status === 403) return 403;
  if (error.status === 408) return 408;
  if (error.status === 429) return 429;
  if (error.status >= 500) return 502;
  return 400;
}

function nonNegativeInteger(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

function normalizeChange(value: unknown) {
  if (!isRecord(value)) return null;
  const cursor = nonNegativeInteger(value.cursor, 0);
  const entity = typeof value.entity === "string" ? value.entity : "";
  const entityId = typeof value.entity_id === "string" ? value.entity_id : "";
  const operation = value.operation === "delete" ? "delete" : value.operation === "upsert" ? "upsert" : null;
  if (cursor < 1 || !ENTITY_PATTERN.test(entity) || entityId.length < 1 || entityId.length > 180 || !operation) {
    return null;
  }
  let record = value.record;
  if (operation === "delete" && isRecord(record)) {
    const deletedAt = typeof value.deleted_at === "string" ? value.deleted_at : undefined;
    if (deletedAt && record.deleted_at === undefined) record = { ...record, deleted_at: deletedAt };
  }
  return { cursor, entity, entity_id: entityId, operation, record };
}

function normalizeChanges(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeChange).filter((change): change is NonNullable<typeof change> => change !== null).slice(0, MAX_PULL_LIMIT);
}

function normalizeServerRecord(
  value: unknown,
  fallbackEntity: string,
  fallbackEntityId: string,
  fallbackRevision: number,
) {
  if (value === null || !isRecord(value)) return null;
  const entity = typeof value.entity === "string" && ENTITY_PATTERN.test(value.entity)
    ? value.entity
    : fallbackEntity;
  const entityId = typeof value.entity_id === "string"
    && value.entity_id.length >= 1 && value.entity_id.length <= 180
    ? value.entity_id
    : fallbackEntityId;
  const normalized: Record<string, unknown> = {
    entity,
    entity_id: entityId,
    revision: nonNegativeInteger(value.revision, fallbackRevision),
    record: value.record === undefined ? null : value.record,
  };
  if (value.deleted_at === null || typeof value.deleted_at === "string") {
    normalized.deleted_at = value.deleted_at;
  }
  if (value.updated_at === null || typeof value.updated_at === "string") {
    normalized.updated_at = value.updated_at;
  }
  return normalized;
}

function normalizePushResults(value: unknown, commands: Record<string, unknown>[]) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_BATCH).map((item, index) => {
    const result = isRecord(item) ? item : {};
    const command = commands[index] ?? {};
    const operationId = typeof result.operation_id === "string"
      ? result.operation_id
      : typeof command.operation_id === "string" ? command.operation_id : "invalid";
    const entity = typeof result.entity === "string"
      ? result.entity
      : typeof command.entity === "string" ? command.entity : "invalid";
    const entityId = typeof result.entity_id === "string"
      ? result.entity_id
      : typeof command.entity_id === "string" ? command.entity_id : "invalid";
    const status = ["applied", "already_applied", "conflict", "invalid"].includes(String(result.status))
      ? result.status as "applied" | "already_applied" | "conflict" | "invalid"
      : "invalid";
    const normalized: Record<string, unknown> = {
      operation_id: operationId,
      status,
      entity,
      entity_id: entityId,
    };
    if (status === "applied" && typeof result.revision === "number" && Number.isSafeInteger(result.revision)) {
      normalized.revision = result.revision;
    }
    if (status === "conflict" && typeof result.server_revision === "number"
      && Number.isSafeInteger(result.server_revision)) {
      normalized.server_revision = result.server_revision;
    }
    if (status === "conflict") {
      normalized.server_record = normalizeServerRecord(
        result.server_record,
        entity,
        entityId,
        nonNegativeInteger(result.server_revision, 0),
      );
    }
    return normalized;
  });
}

function normalizeSuccess(
  action: "bootstrap" | "pull" | "push" | "register_device",
  data: Record<string, unknown>,
  parsed: ReturnType<typeof actionBody> & Record<string, unknown>,
  correlationId: string,
) {
  if (action === "bootstrap") {
    const serverCursor = nonNegativeInteger(data.server_cursor ?? data.cursor, 0);
    return responseBody({
      server_cursor: serverCursor,
      next_cursor: nonNegativeInteger(data.next_cursor, serverCursor),
      has_more: data.has_more === true,
      changes: normalizeChanges(data.changes),
    }, correlationId);
  }
  if (action === "pull") {
    const fromCursor = nonNegativeInteger(data.from_cursor, 0);
    return responseBody({
      from_cursor: fromCursor,
      next_cursor: nonNegativeInteger(data.next_cursor, fromCursor),
      has_more: data.has_more === true,
      changes: normalizeChanges(data.changes),
    }, correlationId);
  }
  if (action === "push") {
    const serverCursor = nonNegativeInteger(data.server_cursor, 0);
    return responseBody({
      server_cursor: serverCursor,
      results: normalizePushResults(data.results, parsed.commands as Record<string, unknown>[]),
    }, correlationId);
  }
  return responseBody({
    device_id: parsed.deviceId,
    environment: parsed.environment,
    registered_at: typeof data.registered_at === "string" ? data.registered_at : new Date().toISOString(),
  }, correlationId);
}

function responseErrorCode(data: Record<string, unknown>) {
  const code = typeof data.error_code === "string" ? data.error_code : data.error;
  return code === "unauthorized" || code === "cursor_expired" || code === "rate_limited"
    || code === "invalid" || code === "server_error" ? code : null;
}

function rpcErrorCode(status: number): "unauthorized" | "invalid" | "rate_limited" | "server_error" {
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 429) return "rate_limited";
  if (status >= 500 || status === 408) return "server_error";
  return "invalid";
}

export async function handleMobileSync(
  request: Request,
  options: MobileSyncHandlerOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return syncErrorResponse("invalid", 405, generatedCorrelationId(), { allow: "POST" });
  }

  const contentLength = Number.parseInt(request.headers.get("content-length") ?? "", 10);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return syncErrorResponse("invalid", 413, generatedCorrelationId());
  }

  let body: unknown;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return syncErrorResponse("invalid", 413, generatedCorrelationId());
    }
    body = JSON.parse(rawBody) as unknown;
  } catch {
    return syncErrorResponse("invalid", 400, generatedCorrelationId());
  }
  if (!isRecord(body)) return syncErrorResponse("invalid", 400, generatedCorrelationId());
  const correlationId = validCorrelationId(body.correlation_id) ? body.correlation_id : generatedCorrelationId();
  if (!validCorrelationId(body.correlation_id)) {
    return syncErrorResponse("invalid", 400, correlationId);
  }
  const parsed = actionBody(body);
  if (!parsed) return syncErrorResponse("invalid", 400, correlationId);

  const configuredTimeoutMs = Number.parseInt(runtimeEnv("MOBILE_SYNC_TIMEOUT_MS") ?? "", 10);
  const timeoutMs = Number.isSafeInteger(options.timeoutMs) && (options.timeoutMs ?? 0) > 0
    ? options.timeoutMs as number
    : (Number.isSafeInteger(configuredTimeoutMs) && configuredTimeoutMs > 0
      ? configuredTimeoutMs
      : DEFAULT_TIMEOUT_MS);
  const controller = new AbortController();
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      controller.abort();
      reject(new MobileSyncTimeoutError());
    }, timeoutMs);
  });

  try {
    const authorization = await Promise.race([
      (options.authorize ?? authorizeMobileSyncRequest)(request, controller.signal),
      timeoutPromise,
    ]);
    if (!authorization.ok) {
      const authStatus = authorization.response.status;
      const authCode = authStatus === 401 ? "unauthorized" : "server_error";
      return syncErrorResponse(authCode, authStatus >= 500 ? 503 : 401, correlationId);
    }

    const key = options.clientKey?.(request, authorization.userId, parsed.deviceId)
      ?? clientKey(request, authorization.userId, parsed.deviceId);
    const rateLimit = consumeRateLimit(key, options.now?.() ?? Date.now());
    if (!rateLimit.allowed) {
      return syncErrorResponse("rate_limited", 429, correlationId, {
        "retry-after": String(rateLimit.retryAfter),
        "x-ratelimit-limit": String(RATE_LIMIT),
        "x-ratelimit-remaining": "0",
      }, rateLimit.retryAfter);
    }

    let rpcName = "";
    let args: Record<string, unknown> = {};
    switch (parsed.action) {
      case "bootstrap":
        rpcName = "rootine_sync_bootstrap";
        args = { p_device_id: parsed.deviceId };
        break;
      case "pull":
        rpcName = "rootine_sync_pull";
        args = {
          p_cursor: parsed.cursor,
          p_limit: parsed.limit,
          p_device_id: parsed.deviceId,
        };
        break;
      case "push":
        rpcName = "rootine_sync_push";
        args = { p_device_id: parsed.deviceId, p_commands: parsed.commands };
        break;
      case "register_device":
        rpcName = "rootine_register_device";
        args = {
          p_device_id: parsed.deviceId,
          p_platform: parsed.platform,
          p_app_version: parsed.appVersion,
          p_apns_environment: parsed.apnsEnvironment,
          p_push_token: parsed.pushToken,
        };
        break;
    }

    const invokeRpc = options.invokeRpc
      ?? ((name: string, rpcArgs: Record<string, unknown>, signal: AbortSignal) =>
        invokeMobileSyncRpc(request, name, rpcArgs, signal));
    const data = await Promise.race([
      invokeRpc(rpcName, args, controller.signal),
      timeoutPromise,
    ]);
    if (!isRecord(data)) return syncErrorResponse("server_error", 502, correlationId);

    const errorCode = responseErrorCode(data);
    if (errorCode === "unauthorized") return syncErrorResponse("unauthorized", 403, correlationId);
    if (errorCode === "cursor_expired") return syncErrorResponse("cursor_expired", 409, correlationId);
    if (errorCode === "rate_limited") return syncErrorResponse("rate_limited", 429, correlationId);
    if (errorCode === "invalid") return syncErrorResponse("invalid", 400, correlationId);
    if (errorCode === "server_error") return syncErrorResponse("server_error", 502, correlationId);

    return jsonResponse(normalizeSuccess(parsed.action, data, parsed, correlationId), 200, {
      "x-ratelimit-limit": String(RATE_LIMIT),
      "x-ratelimit-remaining": String(rateLimit.remaining),
    });
  } catch (error) {
    if (error instanceof MobileSyncTimeoutError || controller.signal.aborted) {
      return syncErrorResponse("server_error", 408, correlationId);
    }
    const status = rpcErrorStatus(error);
    const code = rpcErrorCode(status);
    return syncErrorResponse(code, status, correlationId, status === 429 ? { "retry-after": "60" } : {});
  } finally {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
  }
}

const runtime = globalThis as Runtime;
if (runtime.Deno?.serve) {
  runtime.Deno.serve((request) => handleMobileSync(request));
}

export default handleMobileSync;
