import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthScreen } from "./AuthScreen";

const testState = vi.hoisted(() => ({
  auth: {
    configured: true,
    configurationIssue: null as string | null,
    loading: false,
    session: null,
    user: null,
    passwordRecovery: false,
    authError: null as string | null,
    clearAuthError: vi.fn(),
    signIn: vi.fn(async () => ({ error: null })),
    signInWithGoogle: vi.fn(async () => ({ error: null })),
    signUp: vi.fn(async () => ({ error: null })),
    requestPasswordReset: vi.fn(async () => ({ error: null })),
    updatePassword: vi.fn(async () => ({ error: null })),
    signOut: vi.fn(async () => ({ error: null })),
  },
  session: {
    isTestAccount: false,
    isLocalAccount: false,
    authenticationBypassed: false,
    enterTestAccount: vi.fn(),
    enterLocalAccount: vi.fn(),
    goToToday: vi.fn(),
    exitTestAccount: vi.fn(),
    exitToAuthScreen: vi.fn(),
  },
}));

vi.mock("../../infrastructure/supabase/auth", () => ({
  useSupabaseAuth: () => testState.auth,
}));

vi.mock("./AppSession", () => ({
  useAppSession: () => testState.session,
}));

describe("AuthScreen", () => {
  beforeEach(() => {
    testState.auth.configured = true;
    testState.auth.configurationIssue = null;
    testState.auth.passwordRecovery = false;
    testState.auth.authError = null;
    testState.auth.clearAuthError.mockClear();
    testState.auth.signIn.mockClear();
    testState.auth.signInWithGoogle.mockClear();
    testState.auth.signUp.mockClear();
    testState.auth.requestPasswordReset.mockClear();
    testState.auth.updatePassword.mockClear();
    testState.session.enterTestAccount.mockClear();
    testState.session.enterLocalAccount.mockClear();
    testState.session.goToToday.mockClear();
  });

  afterEach(cleanup);

  it("shows the product areas in the left context panel", () => {
    render(<AuthScreen />);

    expect(screen.getByRole("heading", { name: "Codzienność nie mieści się w jednej liście." })).toBeInTheDocument();
    expect(screen.getByText("Rootine łączy zadania, cele, rutyny i ważne sprawy w jeden osobisty system.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ułóż codzienność po swojemu." })).toBeInTheDocument();
    expect(screen.getByText("Finanse i podróże")).toBeInTheDocument();
    expect(screen.getByText("Notatki i rzeczy do zapamiętania")).toBeInTheDocument();
    expect(screen.queryByText("Twoje dane pozostają dostępne lokalnie, a konto włącza synchronizację między sesjami.")).not.toBeInTheDocument();
  });

  it("exposes password, Google, local and test-account entry paths", async () => {
    const user = userEvent.setup();
    render(<AuthScreen />);

    expect(screen.getByRole("heading", { name: "Dobrze Cię widzieć" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kontynuuj z Google" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Nie pamiętasz hasła?" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Wejdź do danych lokalnych" }));
    expect(testState.session.enterLocalAccount).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "Wejdź do konta testowego" }));
    expect(testState.session.enterTestAccount).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "Kontynuuj z Google" }));
    expect(testState.auth.signInWithGoogle).toHaveBeenCalledOnce();
  });

  it("sends a password reset only after a valid email is entered", async () => {
    const user = userEvent.setup();
    render(<AuthScreen />);

    await user.click(screen.getByRole("button", { name: "Nie pamiętasz hasła?" }));
    expect(screen.getByText("Wpisz poprawny adres e-mail, na który wyślemy link do zmiany hasła.")).toBeInTheDocument();
    expect(testState.auth.requestPasswordReset).not.toHaveBeenCalled();

    await user.type(screen.getByRole("textbox", { name: "Adres e-mail" }), "ola@example.com");
    await user.click(screen.getByRole("button", { name: "Nie pamiętasz hasła?" }));

    expect(testState.auth.requestPasswordReset).toHaveBeenCalledWith("ola@example.com");
    expect(await screen.findByText(/Jeśli konto z tym adresem istnieje/)).toBeInTheDocument();
  });

  it("submits regular credentials and supports account creation", async () => {
    const user = userEvent.setup();
    render(<AuthScreen />);

    await user.type(screen.getByRole("textbox", { name: "Adres e-mail" }), "ola@example.com");
    await user.type(screen.getByLabelText("Hasło"), "sekret");
    await user.click(screen.getByRole("button", { name: "Zaloguj się" }));
    expect(testState.auth.signIn).toHaveBeenCalledWith("ola@example.com", "sekret");
    expect(testState.session.goToToday).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "Utwórz konto" }));
    expect(screen.getByRole("heading", { name: "Utwórz konto" })).toBeInTheDocument();
  });

  it("requires matching passwords during recovery", async () => {
    const user = userEvent.setup();
    testState.auth.passwordRecovery = true;
    render(<AuthScreen />);

    await user.type(screen.getByLabelText("Nowe hasło"), "nowe-haslo");
    await user.type(screen.getByLabelText("Powtórz nowe hasło"), "inne-haslo");
    await user.click(screen.getByRole("button", { name: "Zapisz nowe hasło" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Hasła nie są takie same");
    expect(testState.auth.updatePassword).not.toHaveBeenCalled();
  });

  it("shows an OAuth callback error and clears it before retrying", async () => {
    const user = userEvent.setup();
    testState.auth.authError = "Logowanie przez Google zostało anulowane. Możesz spróbować ponownie.";
    render(<AuthScreen />);

    expect(screen.getByRole("alert")).toHaveTextContent("Logowanie przez Google zostało anulowane");

    await user.click(screen.getByRole("button", { name: "Kontynuuj z Google" }));
    expect(testState.auth.clearAuthError).toHaveBeenCalledOnce();
    expect(testState.auth.signInWithGoogle).toHaveBeenCalledOnce();
  });
});
