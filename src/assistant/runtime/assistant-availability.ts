import { z } from "zod";

const assistantAvailabilityResponseSchema = z.object({
  enabled: z.boolean(),
  configured: z.boolean(),
  available: z.boolean().optional(),
  requiresAccessToken: z.boolean().default(false),
  model: z.string().max(100).optional(),
  voice: z.string().max(80).optional(),
  limits: z.object({
    maxSessionMinutes: z.number().int().positive().optional(),
    idleTimeoutSeconds: z.number().int().positive().optional(),
  }).optional(),
}).passthrough();

export type AssistantAvailability =
  | { status: "checking"; message: string }
  | {
    status: "available";
    message: string;
    requiresAccessToken: boolean;
    model?: string;
    voice?: string;
    maxSessionMinutes?: number;
    idleTimeoutSeconds?: number;
  }
  | { status: "disabled" | "misconfigured" | "unreachable"; message: string; requiresAccessToken?: boolean };

export async function checkAssistantAvailability(
  signal?: AbortSignal,
  endpoint = "/api/assistant/realtime-session",
): Promise<AssistantAvailability> {
  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal,
    });
    if (!response.ok) {
      return {
        status: response.status === 404 ? "unreachable" : "misconfigured",
        message: response.status === 404
          ? "Backend asystenta nie jest dostępny w tym środowisku."
          : "Backend asystenta nie potwierdził gotowości.",
      };
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return { status: "unreachable", message: "Środowisko nie udostępnia endpointu asystenta." };
    }
    const parsed = assistantAvailabilityResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      return { status: "misconfigured", message: "Backend asystenta zwrócił nieprawidłowy status." };
    }
    if (!parsed.data.enabled) {
      return {
        status: "disabled",
        message: "Asystent jest wyłączony po stronie serwera.",
        requiresAccessToken: parsed.data.requiresAccessToken,
      };
    }
    if (!parsed.data.configured) {
      return {
        status: "misconfigured",
        message: "Brakuje bezpiecznej konfiguracji OpenAI po stronie serwera.",
        requiresAccessToken: parsed.data.requiresAccessToken,
      };
    }
    return {
      status: "available",
      message: parsed.data.requiresAccessToken
        ? "Backend jest gotowy; sesja wymaga prywatnego kodu dostępu."
        : "Backend asystenta jest gotowy.",
      requiresAccessToken: parsed.data.requiresAccessToken,
      model: parsed.data.model,
      voice: parsed.data.voice,
      maxSessionMinutes: parsed.data.limits?.maxSessionMinutes,
      idleTimeoutSeconds: parsed.data.limits?.idleTimeoutSeconds,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return { status: "unreachable", message: "Nie można połączyć się z backendem asystenta." };
  }
}
