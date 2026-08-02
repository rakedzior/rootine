const OPENAI_REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";
const DEFAULT_MODEL = "gpt-realtime-2.1-mini";
const DEFAULT_VOICE = "marin";
const DEFAULT_TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";
const MAX_SDP_BYTES = 64 * 1024;
const DEFAULT_UPSTREAM_TIMEOUT_MS = 12_000;
const DEFAULT_RATE_LIMIT = 5;
const DEFAULT_RATE_WINDOW_SECONDS = 60;
const MAX_RATE_LIMIT_KEYS = 1_000;

export interface AssistantRuntimeEnv {
  OPENAI_API_KEY?: string;
  OPENAI_REALTIME_MODEL?: string;
  OPENAI_REALTIME_VOICE?: string;
  ROOTINE_ASSISTANT_ENABLED?: string;
  ROOTINE_ASSISTANT_ALLOWED_ORIGINS?: string;
  ROOTINE_ASSISTANT_ACCESS_TOKEN?: string;
  ROOTINE_ASSISTANT_MAX_SESSION_MINUTES?: string;
  ROOTINE_ASSISTANT_IDLE_TIMEOUT_SECONDS?: string;
  ROOTINE_ASSISTANT_UPSTREAM_TIMEOUT_MS?: string;
  ROOTINE_ASSISTANT_RATE_LIMIT?: string;
  ROOTINE_ASSISTANT_RATE_WINDOW_SECONDS?: string;
}

export interface RealtimeSessionHandlerOptions {
  env?: AssistantRuntimeEnv;
  clientIp?: string;
  fetch?: typeof fetch;
  now?: () => number;
  requestId?: () => string;
  upstreamTimeoutMs?: number;
}

interface ResolvedConfig {
  accessToken?: string;
  allowedOrigins: Set<string>;
  apiKey?: string;
  enabled: boolean;
  idleTimeoutSeconds: number;
  maxSessionMinutes: number;
  model: string;
  rateLimit: number;
  rateWindowSeconds: number;
  upstreamTimeoutMs: number;
  voice: string;
}

interface RateWindow {
  count: number;
  resetAt: number;
}

// This limiter is intentionally instance-local. Production deployments still need
// a durable platform/WAF limit because isolates do not share this map.
const rateWindows = new Map<string, RateWindow>();

function clean(value: string | undefined) {
  return value?.trim() || undefined;
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed)
    ? Math.max(minimum, Math.min(maximum, parsed))
    : fallback;
}

function processEnv(): AssistantRuntimeEnv {
  const runtime = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  const env = runtime.process?.env;
  if (!env) return {};

  return {
    OPENAI_API_KEY: env.OPENAI_API_KEY,
    OPENAI_REALTIME_MODEL: env.OPENAI_REALTIME_MODEL,
    OPENAI_REALTIME_VOICE: env.OPENAI_REALTIME_VOICE,
    ROOTINE_ASSISTANT_ENABLED: env.ROOTINE_ASSISTANT_ENABLED,
    ROOTINE_ASSISTANT_ALLOWED_ORIGINS: env.ROOTINE_ASSISTANT_ALLOWED_ORIGINS,
    ROOTINE_ASSISTANT_ACCESS_TOKEN: env.ROOTINE_ASSISTANT_ACCESS_TOKEN,
    ROOTINE_ASSISTANT_MAX_SESSION_MINUTES: env.ROOTINE_ASSISTANT_MAX_SESSION_MINUTES,
    ROOTINE_ASSISTANT_IDLE_TIMEOUT_SECONDS: env.ROOTINE_ASSISTANT_IDLE_TIMEOUT_SECONDS,
    ROOTINE_ASSISTANT_UPSTREAM_TIMEOUT_MS: env.ROOTINE_ASSISTANT_UPSTREAM_TIMEOUT_MS,
    ROOTINE_ASSISTANT_RATE_LIMIT: env.ROOTINE_ASSISTANT_RATE_LIMIT,
    ROOTINE_ASSISTANT_RATE_WINDOW_SECONDS: env.ROOTINE_ASSISTANT_RATE_WINDOW_SECONDS,
  };
}

function normalizeOrigin(value: string) {
  try {
    const url = new URL(value);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
      return undefined;
    }
    return url.origin;
  } catch {
    return undefined;
  }
}

function allowedOrigins(value: string | undefined) {
  const origins = new Set<string>();
  for (const candidate of value?.split(",") ?? []) {
    const normalized = normalizeOrigin(candidate.trim());
    if (normalized) origins.add(normalized);
  }
  return origins;
}

function resolveConfig(env: AssistantRuntimeEnv): ResolvedConfig {
  return {
    accessToken: clean(env.ROOTINE_ASSISTANT_ACCESS_TOKEN),
    allowedOrigins: allowedOrigins(env.ROOTINE_ASSISTANT_ALLOWED_ORIGINS),
    apiKey: clean(env.OPENAI_API_KEY),
    enabled: env.ROOTINE_ASSISTANT_ENABLED?.trim().toLowerCase() === "true",
    idleTimeoutSeconds: boundedInteger(
      env.ROOTINE_ASSISTANT_IDLE_TIMEOUT_SECONDS,
      120,
      15,
      3_600,
    ),
    maxSessionMinutes: boundedInteger(
      env.ROOTINE_ASSISTANT_MAX_SESSION_MINUTES,
      10,
      1,
      60,
    ),
    model: clean(env.OPENAI_REALTIME_MODEL) ?? DEFAULT_MODEL,
    rateLimit: boundedInteger(env.ROOTINE_ASSISTANT_RATE_LIMIT, DEFAULT_RATE_LIMIT, 1, 100),
    rateWindowSeconds: boundedInteger(
      env.ROOTINE_ASSISTANT_RATE_WINDOW_SECONDS,
      DEFAULT_RATE_WINDOW_SECONDS,
      10,
      3_600,
    ),
    upstreamTimeoutMs: boundedInteger(
      env.ROOTINE_ASSISTANT_UPSTREAM_TIMEOUT_MS,
      DEFAULT_UPSTREAM_TIMEOUT_MS,
      1_000,
      30_000,
    ),
    voice: clean(env.OPENAI_REALTIME_VOICE) ?? DEFAULT_VOICE,
  };
}

function generateRequestId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

function corsHeaders(origin: string | null, config: ResolvedConfig): Record<string, string> {
  if (!origin) return {};
  const normalized = normalizeOrigin(origin);
  if (!normalized || !config.allowedOrigins.has(normalized)) return {};

  return {
    "access-control-allow-origin": normalized,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "Authorization, Content-Type",
    "access-control-expose-headers": "X-Request-ID, X-RateLimit-Limit, X-RateLimit-Remaining",
    "access-control-max-age": "600",
    vary: "Origin",
  };
}

function responseHeaders(
  requestId: string,
  origin: string | null,
  config: ResolvedConfig,
  extra: Record<string, string> = {},
): Record<string, string> {
  return {
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-request-id": requestId,
    ...corsHeaders(origin, config),
    ...extra,
  };
}

function jsonResponse(
  requestId: string,
  origin: string | null,
  config: ResolvedConfig,
  body: Record<string, unknown>,
  status: number,
  headers: Record<string, string> = {},
) {
  return Response.json(body, {
    status,
    headers: responseHeaders(requestId, origin, config, {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    }),
  });
}

function errorResponse(
  requestId: string,
  origin: string | null,
  config: ResolvedConfig,
  status: number,
  code: string,
  message: string,
  headers: Record<string, string> = {},
) {
  return jsonResponse(requestId, origin, config, { error: code, message, requestId }, status, headers);
}

function requestOriginAllowed(origin: string | null, config: ResolvedConfig) {
  if (!origin) return false;
  const normalized = normalizeOrigin(origin);
  return Boolean(normalized && config.allowedOrigins.has(normalized));
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization")?.trim();
  if (!authorization) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  return clean(match?.[1]);
}

function constantTimeEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

function requestIp(request: Request, override?: string) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return clean(override)
    ?? clean(request.headers.get("cf-connecting-ip") ?? undefined)
    ?? clean(forwarded)
    ?? clean(request.headers.get("x-real-ip") ?? undefined)
    ?? "unknown";
}

function consumeRateLimit(
  request: Request,
  config: ResolvedConfig,
  clientIp: string | undefined,
  now: number,
) {
  const key = requestIp(request, clientIp);
  if (rateWindows.size >= MAX_RATE_LIMIT_KEYS && !rateWindows.has(key)) {
    for (const [candidate, window] of rateWindows) {
      if (window.resetAt <= now) rateWindows.delete(candidate);
    }
    if (rateWindows.size >= MAX_RATE_LIMIT_KEYS) {
      const oldest = rateWindows.keys().next().value as string | undefined;
      if (oldest) rateWindows.delete(oldest);
    }
  }

  const current = rateWindows.get(key);
  const window = !current || current.resetAt <= now
    ? { count: 0, resetAt: now + config.rateWindowSeconds * 1_000 }
    : current;
  window.count += 1;
  rateWindows.set(key, window);

  return {
    allowed: window.count <= config.rateLimit,
    remaining: Math.max(0, config.rateLimit - window.count),
    retryAfter: Math.max(1, Math.ceil((window.resetAt - now) / 1_000)),
  };
}

async function readSdp(request: Request) {
  const declaredLength = Number.parseInt(request.headers.get("content-length") ?? "", 10);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_SDP_BYTES) {
    return { error: "too_large" as const };
  }
  if (!request.body) return { error: "empty" as const };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > MAX_SDP_BYTES) {
        await reader.cancel();
        return { error: "too_large" as const };
      }
      chunks.push(value);
    }
  } catch {
    return { error: "invalid" as const };
  }

  if (byteLength === 0) return { error: "empty" as const };
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const sdp = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return sdp.trim() ? { sdp } : { error: "empty" as const };
  } catch {
    return { error: "invalid" as const };
  }
}

function realtimeSessionConfig(config: ResolvedConfig) {
  return {
    type: "realtime",
    model: config.model,
    output_modalities: ["audio"],
    instructions: [
      "You are Rootine Assistant. Respond in Polish unless the user asks for another language.",
      "Use only the tools supplied in the session for application data or actions.",
      "Never claim an action succeeded until its tool result confirms success.",
      "Ask for clarification or confirmation whenever the client policy requires it.",
    ].join(" "),
    audio: {
      input: {
        format: {
          type: "audio/pcm",
          rate: 24_000,
        },
        noise_reduction: { type: "near_field" },
        transcription: {
          model: DEFAULT_TRANSCRIPTION_MODEL,
          language: "pl",
        },
        turn_detection: {
          type: "semantic_vad",
          eagerness: "auto",
          create_response: true,
          interrupt_response: true,
        },
      },
      output: {
        format: { type: "audio/pcm" },
        voice: config.voice,
      },
    },
  };
}

export function resetRealtimeSessionRateLimitForTests() {
  rateWindows.clear();
}

export async function handleRealtimeSession(
  request: Request,
  options: RealtimeSessionHandlerOptions = {},
): Promise<Response> {
  const config = resolveConfig(options.env ?? processEnv());
  const requestId = options.requestId?.() ?? generateRequestId();
  const origin = request.headers.get("origin");

  if (request.method === "GET") {
    if (origin && !requestOriginAllowed(origin, config)) {
      return errorResponse(requestId, origin, config, 403, "origin_denied", "Origin is not allowed.");
    }
    const configured = Boolean(config.apiKey && config.allowedOrigins.size > 0);
    return jsonResponse(requestId, origin, config, {
      status: "ok",
      enabled: config.enabled,
      configured,
      requiresAccessToken: Boolean(config.accessToken),
      model: config.model,
      voice: config.voice,
      limits: {
        idleTimeoutSeconds: config.idleTimeoutSeconds,
        maxRequestBytes: MAX_SDP_BYTES,
        maxSessionMinutes: config.maxSessionMinutes,
        rateLimit: config.rateLimit,
        rateWindowSeconds: config.rateWindowSeconds,
      },
      rateLimitScope: "instance",
    }, 200);
  }

  if (request.method === "OPTIONS") {
    if (!requestOriginAllowed(origin, config)) {
      return errorResponse(requestId, origin, config, 403, "origin_denied", "Origin is not allowed.");
    }
    return new Response(null, {
      status: 204,
      headers: responseHeaders(requestId, origin, config),
    });
  }

  if (request.method !== "POST") {
    return errorResponse(
      requestId,
      origin,
      config,
      405,
      "method_not_allowed",
      "Method not allowed.",
      { allow: "GET, POST, OPTIONS" },
    );
  }

  if (!config.enabled) {
    return errorResponse(
      requestId,
      origin,
      config,
      503,
      "assistant_disabled",
      "Assistant sessions are disabled.",
    );
  }

  if (!config.apiKey || config.allowedOrigins.size === 0) {
    return errorResponse(
      requestId,
      origin,
      config,
      503,
      "assistant_misconfigured",
      "Assistant sessions are unavailable.",
    );
  }

  if (!requestOriginAllowed(origin, config)) {
    return errorResponse(requestId, origin, config, 403, "origin_denied", "Origin is not allowed.");
  }

  if (config.accessToken) {
    const suppliedToken = bearerToken(request);
    if (!suppliedToken || !constantTimeEqual(suppliedToken, config.accessToken)) {
      return errorResponse(
        requestId,
        origin,
        config,
        401,
        "unauthorized",
        "A valid assistant access token is required.",
        { "www-authenticate": "Bearer" },
      );
    }
  }

  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/sdp") {
    return errorResponse(
      requestId,
      origin,
      config,
      415,
      "unsupported_media_type",
      "Content-Type must be application/sdp.",
      { accept: "application/sdp" },
    );
  }

  const rateLimit = consumeRateLimit(
    request,
    config,
    options.clientIp,
    options.now?.() ?? Date.now(),
  );
  const rateHeaders = {
    "x-ratelimit-limit": String(config.rateLimit),
    "x-ratelimit-remaining": String(rateLimit.remaining),
  };
  if (!rateLimit.allowed) {
    return errorResponse(
      requestId,
      origin,
      config,
      429,
      "rate_limited",
      "Too many assistant session requests. Try again later.",
      { ...rateHeaders, "retry-after": String(rateLimit.retryAfter) },
    );
  }

  const parsedBody = await readSdp(request);
  if ("error" in parsedBody) {
    if (parsedBody.error === "too_large") {
      return errorResponse(
        requestId,
        origin,
        config,
        413,
        "payload_too_large",
        `SDP offer must not exceed ${MAX_SDP_BYTES} bytes.`,
        rateHeaders,
      );
    }
    return errorResponse(
      requestId,
      origin,
      config,
      400,
      "invalid_sdp",
      "A non-empty UTF-8 SDP offer is required.",
      rateHeaders,
    );
  }

  const form = new FormData();
  form.set("sdp", parsedBody.sdp);
  form.set("session", JSON.stringify(realtimeSessionConfig(config)));

  const abortController = new AbortController();
  let timedOut = false;
  const timeoutMs = options.upstreamTimeoutMs ?? config.upstreamTimeoutMs;
  const timeout = setTimeout(() => {
    timedOut = true;
    abortController.abort();
  }, timeoutMs);

  try {
    const upstream = await (options.fetch ?? fetch)(OPENAI_REALTIME_CALLS_URL, {
      method: "POST",
      headers: {
        accept: "application/sdp",
        authorization: `Bearer ${config.apiKey}`,
      },
      body: form,
      signal: abortController.signal,
    });

    if (!upstream.ok) {
      return errorResponse(
        requestId,
        origin,
        config,
        502,
        "upstream_error",
        "Could not start an assistant session.",
        rateHeaders,
      );
    }

    const answer = await upstream.text();
    if (!answer.trim()) {
      return errorResponse(
        requestId,
        origin,
        config,
        502,
        "invalid_upstream_response",
        "Could not start an assistant session.",
        rateHeaders,
      );
    }

    return new Response(answer, {
      status: 200,
      headers: responseHeaders(requestId, origin, config, {
        "content-type": "application/sdp",
        ...rateHeaders,
      }),
    });
  } catch {
    if (timedOut) {
      return errorResponse(
        requestId,
        origin,
        config,
        504,
        "upstream_timeout",
        "The assistant session provider timed out.",
        rateHeaders,
      );
    }
    return errorResponse(
      requestId,
      origin,
      config,
      502,
      "upstream_unavailable",
      "Could not reach the assistant session provider.",
      rateHeaders,
    );
  } finally {
    clearTimeout(timeout);
  }
}
