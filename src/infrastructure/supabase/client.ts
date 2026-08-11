import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  ?? import.meta.env.VITE_SUPABASE_ANON_KEY
)?.trim();
const isSecretKey = supabaseKey?.startsWith("sb_secret_") ?? false;
const usesPublishableKey = supabaseKey?.startsWith("sb_publishable_") ?? false;

type SupabaseAuthSettings = {
  external?: Record<string, boolean>;
};

const supabaseFetch: typeof fetch | undefined = usesPublishableKey
  ? (input, init) => {
    const headers = new Headers(init?.headers);
    if (headers.get("Authorization") === `Bearer ${supabaseKey}`) {
      headers.delete("Authorization");
    }
    return globalThis.fetch(input, { ...init, headers });
  }
  : undefined;

/**
 * The local data path remains the default until both browser-safe Supabase
 * environment variables are configured. This keeps local development and
 * existing data intact while the remote repository is introduced incrementally.
 */
export const supabaseConfigurationIssue = isSecretKey
  ? "Nie można używać klucza secret w przeglądarce. Ustaw VITE_SUPABASE_PUBLISHABLE_KEY."
  : null;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey && !isSecretKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseKey!, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    global: {
      fetch: supabaseFetch,
    },
  })
  : null;

export async function isSupabaseAuthProviderEnabled(provider: string): Promise<boolean> {
  if (!supabaseUrl || !supabaseKey || !isSupabaseConfigured) return false;

  const response = await globalThis.fetch(`${supabaseUrl}/auth/v1/settings`, {
    headers: { apikey: supabaseKey },
  });
  if (!response.ok) {
    throw new Error(`Supabase auth settings request failed with status ${response.status}.`);
  }

  const settings = await response.json() as SupabaseAuthSettings;
  return settings.external?.[provider] === true;
}

export function getSupabaseClient(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      supabaseConfigurationIssue
        ?? "Supabase is not configured. Set VITE_SUPABASE_URL and a publishable/anon key.",
    );
  }
  return supabase;
}
