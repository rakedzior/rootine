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
  signIn: (email: string, password: string) => Promise<AuthActionResult>;
  signUp: (email: string, password: string) => Promise<AuthActionResult>;
  signOut: () => Promise<AuthActionResult>;
};

const SupabaseAuthContext = createContext<SupabaseAuthContextValue | null>(null);

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Operacja konta nie powiodła się. Spróbuj ponownie.";
}

export function SupabaseAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

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

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) setSession(nextSession);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
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

  const signOut = useCallback(async (): Promise<AuthActionResult> => {
    if (!supabase) return { error: null };
    const { error } = await supabase.auth.signOut();
    if (error) return { error: errorMessage(error) };
    setSession(null);
    return { error: null };
  }, []);

  const value = useMemo<SupabaseAuthContextValue>(() => ({
    configured: isSupabaseConfigured,
    configurationIssue: supabaseConfigurationIssue,
    loading,
    session,
    user: session?.user ?? null,
    signIn,
    signUp,
    signOut,
  }), [loading, session, signIn, signOut, signUp]);

  return <SupabaseAuthContext.Provider value={value}>{children}</SupabaseAuthContext.Provider>;
}

export function useSupabaseAuth() {
  const value = useContext(SupabaseAuthContext);
  if (!value) throw new Error("useSupabaseAuth must be used inside SupabaseAuthProvider");
  return value;
}
