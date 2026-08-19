export type RootineAuthorization =
  | { ok: true; userId: string }
  | { ok: false; response: Response };

export type RootineAuthorizer = (request: Request) => Promise<RootineAuthorization>;

export interface SupabaseAuthorizationOptions {
  supabaseUrl?: string;
  publishableKey?: string;
}

function jsonError(error: string, status: number) {
  return Response.json(
    { error },
    {
      status,
      headers: {
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
      },
    },
  );
}

function runtimeEnv(name: string) {
  const runtime = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  return runtime.process?.env?.[name]?.trim();
}

function serverConfiguration(options: SupabaseAuthorizationOptions) {
  return {
    supabaseUrl: options.supabaseUrl
      ?? runtimeEnv("SUPABASE_URL")
      ?? runtimeEnv("VITE_SUPABASE_URL"),
    publishableKey: options.publishableKey
      ?? runtimeEnv("SUPABASE_PUBLISHABLE_KEY")
      ?? runtimeEnv("SUPABASE_ANON_KEY")
      ?? runtimeEnv("VITE_SUPABASE_PUBLISHABLE_KEY")
      ?? runtimeEnv("VITE_SUPABASE_ANON_KEY"),
  };
}

export async function authorizeRootineRequest(
  request: Request,
  options: SupabaseAuthorizationOptions = {},
): Promise<RootineAuthorization> {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) {
    return { ok: false, response: jsonError("Authentication is required", 401) };
  }

  const { supabaseUrl, publishableKey } = serverConfiguration(options);
  if (!supabaseUrl || !publishableKey) {
    return { ok: false, response: jsonError("Authentication service is not configured", 503) };
  }

  try {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/user`, {
      headers: {
        accept: "application/json",
        apikey: publishableKey,
        authorization,
      },
    });
    if (!response.ok) {
      return { ok: false, response: jsonError("Invalid or expired access token", 401) };
    }
    const payload = await response.json() as { id?: unknown };
    if (typeof payload.id !== "string" || !payload.id) {
      return { ok: false, response: jsonError("Invalid authentication response", 502) };
    }
    return { ok: true, userId: payload.id };
  } catch {
    return { ok: false, response: jsonError("Authentication service is unavailable", 503) };
  }
}
