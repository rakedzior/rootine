import { useState } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SupabaseAuthProvider, useSupabaseAuth } from "./auth";

const testState = vi.hoisted(() => ({
  initialize: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  unsubscribe: vi.fn(),
  signInWithOAuth: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  providerEnabled: vi.fn(),
}));

vi.mock("./client", () => ({
  isSupabaseConfigured: true,
  supabaseConfigurationIssue: null,
  isSupabaseAuthProviderEnabled: testState.providerEnabled,
  supabase: {
    auth: {
      initialize: testState.initialize,
      getSession: testState.getSession,
      onAuthStateChange: testState.onAuthStateChange,
      signInWithOAuth: testState.signInWithOAuth,
      signInWithPassword: testState.signInWithPassword,
      signUp: testState.signUp,
      resetPasswordForEmail: testState.resetPasswordForEmail,
      updateUser: testState.updateUser,
      signOut: testState.signOut,
    },
  },
}));

function AuthProbe() {
  const auth = useSupabaseAuth();
  const [result, setResult] = useState("");

  return (
    <>
      <output data-testid="loading">{String(auth.loading)}</output>
      {auth.authError && <p role="alert">{auth.authError}</p>}
      <button
        type="button"
        onClick={() => {
          void auth.signInWithGoogle().then(({ error }) => setResult(error ?? "ok"));
        }}
      >
        Google
      </button>
      <button
        type="button"
        onClick={() => {
          void auth.signInWithApple().then(({ error }) => setResult(error ?? "apple-ok"));
        }}
      >
        Apple
      </button>
      <button type="button" onClick={() => { void auth.signIn("  Ola@Example.COM ", "haslo").then(({ error }) => setResult(error ?? "email-ok")); }}>
        E-mail
      </button>
      <button type="button" onClick={() => { void auth.signUp("  Nowa@Example.COM ", "haslo").then(({ error, needsEmailConfirmation }) => setResult(error ?? (needsEmailConfirmation ? "confirmation" : "signup-ok"))); }}>
        Rejestracja
      </button>
      <button type="button" onClick={() => { void auth.requestPasswordReset("  Reset@Example.COM ").then(({ error }) => setResult(error ?? "reset-ok")); }}>
        Reset
      </button>
      <output data-testid="result">{result}</output>
    </>
  );
}

describe("SupabaseAuthProvider Google OAuth", () => {
  beforeEach(() => {
    window.history.replaceState(window.history.state, "", "/");
    testState.initialize.mockReset().mockResolvedValue({ error: null });
    testState.getSession.mockReset().mockResolvedValue({ data: { session: null }, error: null });
    testState.unsubscribe.mockReset();
    testState.onAuthStateChange.mockReset().mockReturnValue({
      data: { subscription: { unsubscribe: testState.unsubscribe } },
    });
    testState.signInWithOAuth.mockReset().mockResolvedValue({ data: { provider: "google" }, error: null });
    testState.signInWithPassword.mockReset().mockResolvedValue({ data: { session: { user: { id: "user-123" } } }, error: null });
    testState.signUp.mockReset().mockResolvedValue({ data: { session: null }, error: null });
    testState.resetPasswordForEmail.mockReset().mockResolvedValue({ error: null });
    testState.providerEnabled.mockReset().mockResolvedValue(true);
  });

  afterEach(cleanup);

  it("stops before navigation when Google is disabled in Supabase", async () => {
    const user = userEvent.setup();
    testState.providerEnabled.mockResolvedValue(false);
    render(<SupabaseAuthProvider><AuthProbe /></SupabaseAuthProvider>);

    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
    await user.click(screen.getByRole("button", { name: "Google" }));

    expect(await screen.findByTestId("result")).toHaveTextContent("Logowanie kontem Google nie jest jeszcze włączone");
    expect(testState.providerEnabled).toHaveBeenCalledWith("google");
    expect(testState.signInWithOAuth).not.toHaveBeenCalled();
  });

  it("starts Google OAuth with the allowlisted post-login route", async () => {
    const user = userEvent.setup();
    render(<SupabaseAuthProvider><AuthProbe /></SupabaseAuthProvider>);

    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
    await user.click(screen.getByRole("button", { name: "Google" }));

    await waitFor(() => expect(screen.getByTestId("result")).toHaveTextContent("ok"));
    expect(testState.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: new URL("/dzisiaj", window.location.origin).toString() },
    });
  });

  it("starts Apple OAuth with the allowlisted post-login route", async () => {
    const user = userEvent.setup();
    render(<SupabaseAuthProvider><AuthProbe /></SupabaseAuthProvider>);

    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
    await user.click(screen.getByRole("button", { name: "Apple" }));

    await waitFor(() => expect(screen.getByTestId("result")).toHaveTextContent("apple-ok"));
    expect(testState.providerEnabled).toHaveBeenCalledWith("apple");
    expect(testState.signInWithOAuth).toHaveBeenCalledWith({
      provider: "apple",
      options: { redirectTo: new URL("/dzisiaj", window.location.origin).toString() },
    });
  });

  it("hands mobile Google OAuth to the installed native app", async () => {
    const originalUserAgent = navigator.userAgent;
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
    });
    try {
      const user = userEvent.setup();
      render(<SupabaseAuthProvider><AuthProbe /></SupabaseAuthProvider>);
      await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
      await user.click(screen.getByRole("button", { name: "Google" }));
      await waitFor(() => expect(screen.getByTestId("result")).toHaveTextContent("ok"));
      expect(testState.signInWithOAuth).toHaveBeenCalledWith({
        provider: "google",
        options: { redirectTo: "rootine://auth-callback" },
      });
    } finally {
      Object.defineProperty(navigator, "userAgent", { configurable: true, value: originalUserAgent });
    }
  });

  it("normalizes e-mail credentials and sends the configured confirmation redirect", async () => {
    const user = userEvent.setup();
    render(<SupabaseAuthProvider><AuthProbe /></SupabaseAuthProvider>);

    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
    await user.click(screen.getByRole("button", { name: "E-mail" }));
    await waitFor(() => expect(screen.getByTestId("result")).toHaveTextContent("email-ok"));
    expect(testState.signInWithPassword).toHaveBeenCalledWith({ email: "ola@example.com", password: "haslo" });

    await user.click(screen.getByRole("button", { name: "Rejestracja" }));
    await waitFor(() => expect(screen.getByTestId("result")).toHaveTextContent("confirmation"));
    expect(testState.signUp).toHaveBeenCalledWith({
      email: "nowa@example.com",
      password: "haslo",
      options: { emailRedirectTo: new URL("/dzisiaj", window.location.origin).toString() },
    });
  });

  it("sends password recovery back to the application route", async () => {
    const user = userEvent.setup();
    render(<SupabaseAuthProvider><AuthProbe /></SupabaseAuthProvider>);

    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
    await user.click(screen.getByRole("button", { name: "Reset" }));
    await waitFor(() => expect(screen.getByTestId("result")).toHaveTextContent("reset-ok"));
    expect(testState.resetPasswordForEmail).toHaveBeenCalledWith(
      "reset@example.com",
      { redirectTo: new URL("/dzisiaj", window.location.origin).toString() },
    );
  });

  it("surfaces an OAuth callback error and removes it from the URL", async () => {
    const callbackError = Object.assign(new Error("User denied access"), { code: "access_denied" });
    testState.initialize.mockResolvedValue({ error: callbackError });
    window.history.replaceState(
      window.history.state,
      "",
      "/dzisiaj#error=access_denied&error_code=access_denied&error_description=User+denied+access",
    );

    render(<SupabaseAuthProvider><AuthProbe /></SupabaseAuthProvider>);

    expect(await screen.findByRole("alert")).toHaveTextContent("Logowanie przez Google zostało anulowane");
    expect(window.location.pathname).toBe("/dzisiaj");
    expect(window.location.hash).toBe("");
  });
});
