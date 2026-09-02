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

function bearerToken(request: Request) {
  const header = request.headers.get("authorization")?.trim() ?? "";
  const match = header.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function textField(body: Record<string, unknown>, name: string, min: number, max: number) {
  const value = typeof body[name] === "string" ? body[name].trim() : "";
  return value.length >= min && value.length <= max ? value : null;
}

function integerField(body: Record<string, unknown>, name: string, fallback: number, min: number, max: number) {
  if (body[name] === undefined) return fallback;
  if (typeof body[name] !== "number" || !Number.isSafeInteger(body[name])) return null;
  return body[name] >= min && body[name] <= max ? body[name] : null;
}

function validPushCommand(command: Record<string, unknown>) {
  const operationId = typeof command.operation_id === "string" ? command.operation_id.trim() : "";
  const entity = typeof command.entity === "string" ? command.entity.trim() : "";
  const entityId = typeof command.entity_id === "string" ? command.entity_id.trim() : "";
  const kind = typeof command.kind === "string" ? command.kind.trim().toLowerCase() : "";
  if (operationId.length < 1 || operationId.length > 180
    || entity.length < 1 || entity.length > 80
    || entityId.length < 1 || entityId.length > 180
    || !["create", "update", "upsert", "delete"].includes(kind)) return false;
  if (typeof command.base_revision !== "number"
    || !Number.isSafeInteger(command.base_revision)
    || command.base_revision < 0) return false;
  if (command.payload !== undefined && !isRecord(command.payload)) return false;
  if (kind !== "delete" && !isRecord(command.payload)) return false;
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
  const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "";
  if (!["bootstrap", "pull", "push", "register_device"].includes(action)) return null;
  const deviceId = textField(body, "device_id", 1, 180);
  if (!deviceId) return null;

  if (action === "bootstrap") return { action, deviceId } as const;
  if (action === "pull") {
    const cursor = integerField(body, "cursor", 0, 0, Number.MAX_SAFE_INTEGER);
    const limit = integerField(body, "limit", MAX_PULL_LIMIT, 1, MAX_PULL_LIMIT);
    if (cursor === null || limit === null) return null;
    return { action, deviceId, cursor, limit } as const;
  }
  if (action === "push") {
    if (!Array.isArray(body.commands) || body.commands.length > MAX_BATCH) return null;
    if (body.commands.some((command) => !isRecord(command) || !validPushCommand(command))) return null;
    return { action, deviceId, commands: body.commands } as const;
  }

  const platform = textField(body, "platform", 1, 16);
  const appVersion = textField(body, "app_version", 1, 64);
  const apnsEnvironment = body.apns_environment === undefined || body.apns_environment === null
    ? null
    : textField(body, "apns_environment", 1, 16);
  const pushToken = body.push_token === undefined || body.push_token === null
    ? null
    : textField(body, "push_token", 1, 4096);
  if (!platform || !appVersion || (body.apns_environment != null && !apnsEnvironment)
    || (body.push_token != null && !pushToken)) return null;
  if (!(["ios", "web", "android", "other"] as string[]).includes(platform.toLowerCase())) return null;
  if (apnsEnvironment && !(["sandbox", "production"] as string[]).includes(apnsEnvironment.toLowerCase())) {
    return null;
  }
  return {
    action,
    deviceId,
    platform: platform.toLowerCase(),
    appVersion,
    apnsEnvironment: apnsEnvironment?.toLowerCase() ?? null,
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

function rpcErrorMessage(status: number) {
  if (status === 401) return "Invalid or expired access token";
  if (status === 403) return "Device is not authorized";
  if (status === 408) return "Sync service timed out";
  if (status === 429) return "Sync service is rate limited";
  if (status >= 500) return "Sync service is temporarily unavailable";
  return "Invalid sync request";
}

export async function handleMobileSync(
  request: Request,
  options: MobileSyncHandlerOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse("Method not allowed", 405, { allow: "POST" });
  }

  const contentLength = Number.parseInt(request.headers.get("content-length") ?? "", 10);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return errorResponse("Sync request is too large", 413);
  }

  let body: unknown;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return errorResponse("Sync request is too large", 413);
    }
    body = JSON.parse(rawBody) as unknown;
  } catch {
    return errorResponse("A JSON sync request is required", 400);
  }
  if (!isRecord(body)) return errorResponse("Invalid sync request", 400);
  const parsed = actionBody(body);
  if (!parsed) return errorResponse("Invalid sync request", 400);

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
    if (!authorization.ok) return authorization.response;

    const key = options.clientKey?.(request, authorization.userId, parsed.deviceId)
      ?? clientKey(request, authorization.userId, parsed.deviceId);
    const rateLimit = consumeRateLimit(key, options.now?.() ?? Date.now());
    if (!rateLimit.allowed) {
      return errorResponse("Too many sync requests. Try again later.", 429, {
        "retry-after": String(rateLimit.retryAfter),
        "x-ratelimit-limit": String(RATE_LIMIT),
        "x-ratelimit-remaining": "0",
      });
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
    if (!isRecord(data)) return errorResponse("Invalid sync service response", 502);

    const errorCode = typeof data.error_code === "string" ? data.error_code : "";
    if (errorCode === "unauthorized") return errorResponse("Device is not authorized", 403);
    if (errorCode === "cursor_expired") return jsonResponse(data, 409);

    return jsonResponse(data, 200, {
      "x-ratelimit-limit": String(RATE_LIMIT),
      "x-ratelimit-remaining": String(rateLimit.remaining),
    });
  } catch (error) {
    if (error instanceof MobileSyncTimeoutError || controller.signal.aborted) {
      return errorResponse("Sync service timed out", 408);
    }
    const status = rpcErrorStatus(error);
    return errorResponse(rpcErrorMessage(status), status, status === 429 ? { "retry-after": "60" } : {});
  } finally {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
  }
}

const runtime = globalThis as Runtime;
if (runtime.Deno?.serve) {
  runtime.Deno.serve((request) => handleMobileSync(request));
}

export default handleMobileSync;
