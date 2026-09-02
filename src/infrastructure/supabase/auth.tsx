/* eslint-disable react-refresh/only-export-components -- Auth provider and hook form one public boundary. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import {
  isSupabaseAuthProviderEnabled,
  isSupabaseConfigured,
  supabase,
  supabaseConfigurationIssue,
} from "./client";
import { rootineObservability } from "../../app/observability";

export type AuthActionResult = {
  error: string | null;
  needsEmailConfirmation?: boolean;
};

export type SupabaseAuthContextValue = {
  configured: boolean;
  configurationIssue: string | null;
  loading: boolean;
  session: Session | null;
  user: User | null;
  passwordRecovery: boolean;
  authError: string | null;
  clearAuthError: () => void;
  signIn: (email: string, password: string) => Promise<AuthActionResult>;
  signInWithGoogle: () => Promise<AuthActionResult>;
  signUp: (email: string, password: string) => Promise<AuthActionResult>;
  requestPasswordReset: (email: string) => Promise<AuthActionResult>;
  updatePassword: (password: string) => Promise<AuthActionResult>;
  signOut: () => Promise<AuthActionResult>;
};

const SupabaseAuthContext = createContext<SupabaseAuthContextValue | null>(null);

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function authRedirectUrl() {
  return new URL("/dzisiaj", window.location.origin).toString();
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    const message = error.message.trim();
    const code = typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "";
    const normalized = `${message} ${code}`.toLocaleLowerCase("en-US");
    if (normalized.includes("invalid login credentials")) {
      return "Nieprawidłowy e-mail lub hasło. Sprawdź dane i spróbuj ponownie.";
    }
    if (normalized.includes("email not confirmed")) {
      return "Najpierw potwierdź adres e-mail, korzystając z wiadomości od Rootine.";
    }
    if (normalized.includes("user already registered")) {
      return "Konto z tym adresem już istnieje. Zaloguj się albo odzyskaj hasło.";
    }
    if (normalized.includes("password") && normalized.includes("characters")) {
      return "Hasło jest za krótkie. Użyj co najmniej 8 znaków.";
    }
    if (normalized.includes("fetch") || normalized.includes("network")) {
      return "Nie udało się połączyć z usługą konta. Sprawdź internet i spróbuj ponownie.";
    }
    if (normalized.includes("rate limit") || normalized.includes("too many requests")) {
      return "Wykonano zbyt wiele prób. Odczekaj chwilę i spróbuj ponownie.";
    }
    if (normalized.includes("provider") && normalized.includes("enabled")) {
      return "Logowanie kontem Google nie jest jeszcze włączone dla tego środowiska.";
    }
    if (normalized.includes("access_denied") || normalized.includes("cancel") || normalized.includes("denied")) {
      return "Logowanie przez Google zostało anulowane. Możesz spróbować ponownie.";
    }
    if (normalized.includes("signup") && normalized.includes("disabled")) {
      return "Tworzenie nowych kont jest obecnie wyłączone.";
    }
    if (normalized.includes("same password")) {
      return "Nowe hasło musi różnić się od obecnego.";
    }
    return "Operacja konta nie powiodła się. Sprawdź dane i spróbuj ponownie.";
  }
  return "Operacja konta nie powiodła się. Spróbuj ponownie.";
}

const OAUTH_ERROR_PARAMETERS = ["error", "error_code", "error_description"];

function clearOAuthErrorFromUrl() {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);
  let changed = false;
  for (const parameter of OAUTH_ERROR_PARAMETERS) {
    if (!url.searchParams.has(parameter)) continue;
    url.searchParams.delete(parameter);
    changed = true;
  }

  const hashParameters = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
  for (const parameter of OAUTH_ERROR_PARAMETERS) {
    if (!hashParameters.has(parameter)) continue;
    hashParameters.delete(parameter);
    changed = true;
  }

  if (!changed) return;
  const nextHash = hashParameters.toString();
  url.hash = nextHash ? `#${nextHash}` : "";
  window.history.replaceState(window.history.state, "", url);
}

export function SupabaseAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const authClient = supabase;
    if (!authClient) {
      setLoading(false);
      return undefined;
    }

    let active = true;
    void authClient.auth.initialize()
      .then(async ({ error: initializationError }) => {
        const { data, error: sessionError } = await authClient.auth.getSession();
        if (!active) return;
        setSession(sessionError ? null : data.session);
        if (initializationError) {
          rootineObservability.recordAuthOutcome({ action: "initialize", outcome: "failure", error: initializationError });
          setAuthError(errorMessage(initializationError));
          clearOAuthErrorFromUrl();
        } else {
          rootineObservability.recordAuthOutcome({ action: "initialize", outcome: "success" });
        }
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        rootineObservability.recordAuthOutcome({ action: "initialize", outcome: "failure", error: "network" });
        setSession(null);
        setLoading(false);
      });

    const { data: listener } = authClient.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const clearAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

  const signInWithGoogle = useCallback(async (): Promise<AuthActionResult> => {
    if (!supabase) {
      rootineObservability.recordAuthOutcome({ action: "sign_in_google", outcome: "failure", error: "missing configuration" });
      return { error: "Logowanie kontem Google nie jest dostępne w tym środowisku." };
    }
    setAuthError(null);
    try {
      const googleEnabled = await isSupabaseAuthProviderEnabled("google");
      if (!googleEnabled) {
        rootineObservability.recordAuthOutcome({ action: "sign_in_google", outcome: "failure", provider: "google", error: "provider unavailable" });
        return { error: "Logowanie kontem Google nie jest jeszcze włączone dla tego środowiska." };
      }
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: authRedirectUrl() },
      });
      rootineObservability.recordAuthOutcome({ action: "sign_in_google", outcome: error ? "failure" : "success", provider: "google", error });
      return { error: error ? errorMessage(error) : null };
    } catch (error) {
      rootineObservability.recordAuthOutcome({ action: "sign_in_google", outcome: "failure", provider: "google", error });
      return { error: errorMessage(error) };
    }
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<AuthActionResult> => {
    if (!supabase) {
      rootineObservability.recordAuthOutcome({ action: "sign_in", outcome: "failure", error: "missing configuration" });
      return { error: "Supabase nie jest skonfigurowane." };
    }
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizeEmail(email),
      password,
    });
    if (error) {
      rootineObservability.recordAuthOutcome({ action: "sign_in", outcome: "failure", error });
      return { error: errorMessage(error) };
    }
    setSession(data.session);
    rootineObservability.recordAuthOutcome({ action: "sign_in", outcome: "success" });
    return { error: null };
  }, []);

  const signUp = useCallback(async (email: string, password: string): Promise<AuthActionResult> => {
    if (!supabase) {
      rootineObservability.recordAuthOutcome({ action: "sign_up", outcome: "failure", error: "missing configuration" });
      return { error: "Supabase nie jest skonfigurowane." };
    }
    try {
      const { data, error } = await supabase.auth.signUp({
        email: normalizeEmail(email),
        password,
        options: { emailRedirectTo: authRedirectUrl() },
      });
      if (error) {
        rootineObservability.recordAuthOutcome({ action: "sign_up", outcome: "failure", error });
        return { error: errorMessage(error) };
      }
      setSession(data.session);
      rootineObservability.recordAuthOutcome({ action: "sign_up", outcome: "success" });
      return { error: null, needsEmailConfirmation: !data.session };
    } catch (error) {
      rootineObservability.recordAuthOutcome({ action: "sign_up", outcome: "failure", error });
      return { error: errorMessage(error) };
    }
  }, []);

  const requestPasswordReset = useCallback(async (email: string): Promise<AuthActionResult> => {
    if (!supabase) {
      rootineObservability.recordAuthOutcome({ action: "password_reset", outcome: "failure", error: "missing configuration" });
      return { error: "Odzyskiwanie hasła nie jest dostępne w tym środowisku." };
    }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(normalizeEmail(email), {
        redirectTo: authRedirectUrl(),
      });
      rootineObservability.recordAuthOutcome({ action: "password_reset", outcome: error ? "failure" : "success", error });
      return { error: error ? errorMessage(error) : null };
    } catch (error) {
      rootineObservability.recordAuthOutcome({ action: "password_reset", outcome: "failure", error });
      return { error: errorMessage(error) };
    }
  }, []);

  const updatePassword = useCallback(async (password: string): Promise<AuthActionResult> => {
    if (!supabase) {
      rootineObservability.recordAuthOutcome({ action: "password_update", outcome: "failure", error: "missing configuration" });
      return { error: "Zmiana hasła nie jest dostępna w tym środowisku." };
    }
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        rootineObservability.recordAuthOutcome({ action: "password_update", outcome: "failure", error });
        return { error: errorMessage(error) };
      }
      setPasswordRecovery(false);
      rootineObservability.recordAuthOutcome({ action: "password_update", outcome: "success" });
      return { error: null };
    } catch (error) {
      rootineObservability.recordAuthOutcome({ action: "password_update", outcome: "failure", error });
      return { error: errorMessage(error) };
    }
  }, []);

  const signOut = useCallback(async (): Promise<AuthActionResult> => {
    if (!supabase) return { error: null };
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        rootineObservability.recordAuthOutcome({ action: "sign_out", outcome: "failure", error });
        return { error: errorMessage(error) };
      }
      setSession(null);
      setPasswordRecovery(false);
      rootineObservability.recordAuthOutcome({ action: "sign_out", outcome: "success" });
      return { error: null };
    } catch (error) {
      rootineObservability.recordAuthOutcome({ action: "sign_out", outcome: "failure", error });
      return { error: errorMessage(error) };
    }
  }, []);

  const value = useMemo<SupabaseAuthContextValue>(() => ({
    configured: isSupabaseConfigured,
    configurationIssue: supabaseConfigurationIssue,
    loading,
    session,
    user: session?.user ?? null,
    passwordRecovery,
    authError,
    clearAuthError,
    signIn,
    signInWithGoogle,
    signUp,
    requestPasswordReset,
    updatePassword,
    signOut,
  }), [
    authError,
    clearAuthError,
    loading,
    passwordRecovery,
    requestPasswordReset,
    session,
    signIn,
    signInWithGoogle,
    signOut,
    signUp,
    updatePassword,
  ]);

  return <SupabaseAuthContext.Provider value={value}>{children}</SupabaseAuthContext.Provider>;
}

export function useSupabaseAuth() {
  const value = useContext(SupabaseAuthContext);
  if (!value) throw new Error("useSupabaseAuth must be used inside SupabaseAuthProvider");
  return value;
}
