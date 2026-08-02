// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  handleRealtimeSession,
  resetRealtimeSessionRateLimitForTests,
  type AssistantRuntimeEnv,
  type RealtimeSessionHandlerOptions,
} from "../_shared/realtime-session";

const ORIGIN = "https://rootine.example";
const SDP_OFFER = [
  "v=0",
  "o=- 46117327 2 IN IP4 127.0.0.1",
  "s=-",
  "t=0 0",
  "m=audio 9 UDP/TLS/RTP/SAVPF 111",
].join("\r\n");
const SDP_ANSWER = "v=0\r\ns=OpenAI Realtime\r\nt=0 0";

const enabledEnv: AssistantRuntimeEnv = {
  OPENAI_API_KEY: "server-only-openai-key",
  OPENAI_REALTIME_MODEL: "gpt-realtime-2.1-mini",
  OPENAI_REALTIME_VOICE: "marin",
  ROOTINE_ASSISTANT_ENABLED: "true",
  ROOTINE_ASSISTANT_ALLOWED_ORIGINS: ORIGIN,
  ROOTINE_ASSISTANT_MAX_SESSION_MINUTES: "10",
  ROOTINE_ASSISTANT_IDLE_TIMEOUT_SECONDS: "120",
};

interface RequestOptions {
  body?: BodyInit | null;
  contentType?: string | null;
  headers?: HeadersInit;
  method?: string;
  origin?: string | null;
}

function assistantRequest({
  body = SDP_OFFER,
  contentType = "application/sdp",
  headers: additionalHeaders,
  method = "POST",
  origin = ORIGIN,
}: RequestOptions = {}) {
  const headers = new Headers(additionalHeaders);
  headers.set("x-forwarded-for", "203.0.113.24");
  if (origin) headers.set("origin", origin);
  if (contentType) headers.set("content-type", contentType);

  const mayHaveBody = method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
  return new Request("https://rootine.example/api/assistant/realtime-session", {
    method,
    headers,
    body: mayHaveBody ? body : undefined,
  });
}

function options(
  overrides: Partial<RealtimeSessionHandlerOptions> = {},
): RealtimeSessionHandlerOptions {
  return {
    env: enabledEnv,
    requestId: () => "req_test_123",
    ...overrides,
  };
}

describe("Realtime session endpoint", () => {
  beforeEach(() => {
    resetRealtimeSessionRateLimitForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns a non-cacheable status without exposing secrets", async () => {
    const response = await handleRealtimeSession(
      assistantRequest({ method: "GET", body: null, contentType: null }),
      options({
        env: {
          ...enabledEnv,
          ROOTINE_ASSISTANT_ACCESS_TOKEN: "private-browser-token",
        },
      }),
    );

    const text = await response.text();
    const body = JSON.parse(text) as Record<string, unknown>;
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-request-id")).toBe("req_test_123");
    expect(body).toMatchObject({
      status: "ok",
      enabled: true,
      configured: true,
      requiresAccessToken: true,
      model: "gpt-realtime-2.1-mini",
      voice: "marin",
      rateLimitScope: "instance",
      limits: {
        idleTimeoutSeconds: 120,
        maxRequestBytes: 65_536,
        maxSessionMinutes: 10,
      },
    });
    expect(text).not.toContain("server-only-openai-key");
    expect(text).not.toContain("private-browser-token");
  });

  it("is fail-closed when the feature flag is absent or false", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const response = await handleRealtimeSession(
      assistantRequest(),
      options({
        env: { ...enabledEnv, ROOTINE_ASSISTANT_ENABLED: "false" },
        fetch: fetchMock,
      }),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: "assistant_disabled" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects unsupported methods", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const response = await handleRealtimeSession(
      assistantRequest({ method: "PUT" }),
      options({ fetch: fetchMock }),
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, POST, OPTIONS");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects requests without application/sdp", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const response = await handleRealtimeSession(
      assistantRequest({ contentType: "text/plain" }),
      options({ fetch: fetchMock }),
    );

    expect(response.status).toBe(415);
    expect(await response.json()).toMatchObject({ error: "unsupported_media_type" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["empty", "", 400, "invalid_sdp"],
    ["oversized", "v".repeat(65_537), 413, "payload_too_large"],
  ])("rejects a %s SDP body", async (_label, body, status, error) => {
    const fetchMock = vi.fn<typeof fetch>();
    const response = await handleRealtimeSession(
      assistantRequest({ body }),
      options({ fetch: fetchMock }),
    );

    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ error });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", null],
    ["not allowlisted", "https://attacker.example"],
  ])("rejects a %s origin", async (_label, origin) => {
    const fetchMock = vi.fn<typeof fetch>();
    const response = await handleRealtimeSession(
      assistantRequest({ origin }),
      options({ fetch: fetchMock }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "origin_denied" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([undefined, "Bearer wrong-token"])(
    "rejects a missing or invalid access token: %s",
    async (authorization) => {
      const fetchMock = vi.fn<typeof fetch>();
      const headers = authorization ? { authorization } : undefined;
      const response = await handleRealtimeSession(
        assistantRequest({ headers }),
        options({
          env: { ...enabledEnv, ROOTINE_ASSISTANT_ACCESS_TOKEN: "expected-token" },
          fetch: fetchMock,
        }),
      );

      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toBe("Bearer");
      expect(await response.json()).toMatchObject({ error: "unauthorized" });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("answers an allowlisted CORS preflight without requiring the access token", async () => {
    const response = await handleRealtimeSession(
      assistantRequest({
        method: "OPTIONS",
        body: null,
        contentType: null,
        headers: {
          "access-control-request-method": "POST",
          "access-control-request-headers": "authorization,content-type",
        },
      }),
      options({
        env: { ...enabledEnv, ROOTINE_ASSISTANT_ACCESS_TOKEN: "expected-token" },
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(response.headers.get("access-control-allow-headers")).toBe("Authorization, Content-Type");
  });

  it("creates a unified WebRTC call and returns only the SDP answer", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(SDP_ANSWER, {
      status: 200,
      headers: { "content-type": "application/sdp" },
    }));

    const response = await handleRealtimeSession(
      assistantRequest({ headers: { authorization: "Bearer expected-token" } }),
      options({
        env: { ...enabledEnv, ROOTINE_ASSISTANT_ACCESS_TOKEN: "expected-token" },
        fetch: fetchMock,
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/sdp");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(await response.text()).toBe(SDP_ANSWER);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.openai.com/v1/realtime/calls");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer server-only-openai-key");
    expect(init?.body).toBeInstanceOf(FormData);

    const form = init?.body as FormData;
    expect(form.get("sdp")).toBe(SDP_OFFER);
    const session = JSON.parse(String(form.get("session"))) as Record<string, unknown>;
    expect(session).toMatchObject({
      type: "realtime",
      model: "gpt-realtime-2.1-mini",
      output_modalities: ["audio"],
      audio: {
        input: {
          format: { type: "audio/pcm", rate: 24_000 },
          noise_reduction: { type: "near_field" },
          transcription: { model: "gpt-4o-mini-transcribe", language: "pl" },
          turn_detection: {
            type: "semantic_vad",
            eagerness: "auto",
            create_response: true,
            interrupt_response: true,
          },
        },
        output: { format: { type: "audio/pcm" }, voice: "marin" },
      },
    });
  });

  it("redacts upstream failures instead of forwarding provider details", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify({ error: { message: "invalid server-only-openai-key" } }),
      { status: 401, headers: { "content-type": "application/json" } },
    ));
    const response = await handleRealtimeSession(
      assistantRequest(),
      options({ fetch: fetchMock }),
    );

    const text = await response.text();
    expect(response.status).toBe(502);
    expect(JSON.parse(text)).toMatchObject({ error: "upstream_error" });
    expect(text).not.toContain("invalid server-only-openai-key");
  });

  it("aborts and returns a safe error when the provider times out", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise(
      (_resolve, reject) => init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("aborted", "AbortError"));
      }, { once: true }),
    ));

    const pendingResponse = handleRealtimeSession(
      assistantRequest(),
      options({ fetch: fetchMock, upstreamTimeoutMs: 25 }),
    );
    await vi.advanceTimersByTimeAsync(25);
    const response = await pendingResponse;

    expect(response.status).toBe(504);
    expect(await response.json()).toMatchObject({ error: "upstream_timeout" });
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it("applies the documented instance-local rate limit before upstream calls", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(SDP_ANSWER));
    const limitedOptions = options({
      env: { ...enabledEnv, ROOTINE_ASSISTANT_RATE_LIMIT: "1" },
      fetch: fetchMock,
      now: () => 1_000,
    });

    const first = await handleRealtimeSession(assistantRequest(), limitedOptions);
    const second = await handleRealtimeSession(assistantRequest(), limitedOptions);

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(second.headers.get("retry-after")).toBe("60");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
