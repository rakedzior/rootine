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
import { isSupabaseConfigured, supabase, supabaseConfigurationIssue } from "./client";

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

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    const message = error.message.trim();
    const normalized = message.toLocaleLowerCase("en-US");
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

export function SupabaseAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return undefined;
    }

    let active = true;
    void supabase.auth.getSession()
      .then(({ data, error }) => {
        if (!active) return;
        setSession(error ? null : data.session);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setSession(null);
        setLoading(false);
      });

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = useCallback(async (): Promise<AuthActionResult> => {
    if (!supabase) return { error: "Logowanie kontem Google nie jest dostępne w tym środowisku." };
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: new URL("/", window.location.origin).toString() },
    });
    return { error: error ? errorMessage(error) : null };
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<AuthActionResult> => {
    if (!supabase) return { error: "Supabase nie jest skonfigurowane." };
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizeEmail(email),
      password,
    });
    if (error) return { error: errorMessage(error) };
    setSession(data.session);
    return { error: null };
  }, []);

  const signUp = useCallback(async (email: string, password: string): Promise<AuthActionResult> => {
    if (!supabase) return { error: "Supabase nie jest skonfigurowane." };
    const { data, error } = await supabase.auth.signUp({
      email: normalizeEmail(email),
      password,
    });
    if (error) return { error: errorMessage(error) };
    setSession(data.session);
    return { error: null, needsEmailConfirmation: !data.session };
  }, []);

  const requestPasswordReset = useCallback(async (email: string): Promise<AuthActionResult> => {
    if (!supabase) return { error: "Odzyskiwanie hasła nie jest dostępne w tym środowisku." };
    const { error } = await supabase.auth.resetPasswordForEmail(normalizeEmail(email), {
      redirectTo: new URL("/", window.location.origin).toString(),
    });
    return { error: error ? errorMessage(error) : null };
  }, []);

  const updatePassword = useCallback(async (password: string): Promise<AuthActionResult> => {
    if (!supabase) return { error: "Zmiana hasła nie jest dostępna w tym środowisku." };
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { error: errorMessage(error) };
    setPasswordRecovery(false);
    return { error: null };
  }, []);

  const signOut = useCallback(async (): Promise<AuthActionResult> => {
    if (!supabase) return { error: null };
    const { error } = await supabase.auth.signOut();
    if (error) return { error: errorMessage(error) };
    setSession(null);
    setPasswordRecovery(false);
    return { error: null };
  }, []);

  const value = useMemo<SupabaseAuthContextValue>(() => ({
    configured: isSupabaseConfigured,
    configurationIssue: supabaseConfigurationIssue,
    loading,
    session,
    user: session?.user ?? null,
    passwordRecovery,
    signIn,
    signInWithGoogle,
    signUp,
    requestPasswordReset,
    updatePassword,
    signOut,
  }), [
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
