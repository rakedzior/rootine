import { useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarCheck2,
  FlaskConical,
  HardDrive,
  HeartPulse,
  NotebookPen,
  Plane,
  RefreshCw,
  Target,
} from "lucide-react";
import { useSupabaseAuth } from "../../infrastructure/supabase/auth";
import { Button, Input } from "../ui";
import { useAppSession } from "./AppSession";

type AuthView = "sign-in" | "sign-up";
type PendingAction = "credentials" | "google" | "reset" | "password" | null;

function GoogleMark() {
  return (
    <svg className="auth-google-mark" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3Z" />
      <path fill="currentColor" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1a5.8 5.8 0 0 1-5.5-4H3.2v2.6A10 10 0 0 0 12 22Z" />
      <path fill="currentColor" d="M6.5 14a6 6 0 0 1 0-3.9V7.5H3.2a10 10 0 0 0 0 9.1L6.5 14Z" />
      <path fill="currentColor" d="M12 6a5.4 5.4 0 0 1 3.8 1.5l2.9-2.8A9.7 9.7 0 0 0 3.2 7.5l3.3 2.6A5.8 5.8 0 0 1 12 6Z" />
    </svg>
  );
}

function AuthBrand() {
  return (
    <div className="auth-brand" aria-label="Rootine">
      <span className="auth-brand__mark" aria-hidden="true">R</span>
      <strong>Rootine</strong>
    </div>
  );
}

function AuthContextPanel() {
  return (
    <section className="auth-context" aria-label="O Rootine">
      <AuthBrand />
      <div className="auth-context__body">
        <h1>Codzienność nie mieści się w jednej liście.</h1>
        <p>Rootine łączy zadania, cele, rutyny i ważne sprawy w jeden osobisty system.</p>
        <div className="auth-context__lead">
          <h2>Ułóż codzienność po swojemu.</h2>
          <p>Zadania, plany i sprawy, które masz na głowie w jednym miejscu.</p>
        </div>
        <ul className="auth-context__areas">
          <li><CalendarCheck2 aria-hidden="true" /><span><strong>Dzień i zadania</strong><small>Zobacz, co czeka dziś, co może poczekać i jaki jest następny krok.</small></span></li>
          <li><Target aria-hidden="true" /><span><strong>Cele i postęp</strong><small>Zamień większe plany na konkretne kroki i obserwuj, jak nabierają kształtu.</small></span></li>
          <li><BriefcaseBusiness aria-hidden="true" /><span><strong>Praca i bieżące sprawy</strong><small>Miej swoje obowiązki pod ręką, bez konieczności trzymania wszystkiego w głowie.</small></span></li>
          <li><HeartPulse aria-hidden="true" /><span><strong>Zdrowie i rytm dnia</strong><small>Zapisuj treningi, posiłki i nawyki, które pomagają Ci dobrze funkcjonować.</small></span></li>
          <li><Plane aria-hidden="true" /><span><strong>Finanse i podróże</strong><small>Miej pod ręką wydatki, rezerwacje i wszystko, co trzeba przygotować.</small></span></li>
          <li><NotebookPen aria-hidden="true" /><span><strong>Notatki i rzeczy do zapamiętania</strong><small>Zachowuj myśli, pomysły i informacje, do których chcesz później wrócić.</small></span></li>
        </ul>
      </div>
    </section>
  );
}

export function AuthLoadingScreen() {
  return (
    <main className="auth-shell auth-shell--loading">
      <div className="auth-loading" role="status" aria-live="polite">
        <AuthBrand />
        <RefreshCw className="is-spinning" aria-hidden="true" />
        <p>Sprawdzam sesję konta…</p>
      </div>
    </main>
  );
}

export function AuthScreen() {
  const auth = useSupabaseAuth();
  const appSession = useAppSession();
  const emailRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<AuthView>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction>(null);

  const clearFeedback = () => {
    auth.clearAuthError();
    setError(null);
    setEmailError(null);
    setMessage(null);
  };

  const submitCredentials = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearFeedback();
    setPending("credentials");
    const result = view === "sign-in"
      ? await auth.signIn(email, password)
      : await auth.signUp(email, password);
    setPending(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.needsEmailConfirmation) {
      setMessage("Sprawdź skrzynkę i potwierdź adres e-mail. Potem wróć tutaj, aby się zalogować.");
      setPassword("");
      return;
    }
    appSession.goToToday();
  };

  const signInWithGoogle = async () => {
    clearFeedback();
    setPending("google");
    const result = await auth.signInWithGoogle();
    if (result.error) {
      setError(result.error);
      setPending(null);
    }
  };

  const requestPasswordReset = async () => {
    clearFeedback();
    if (!email.trim() || !emailRef.current?.validity.valid) {
      setEmailError("Wpisz poprawny adres e-mail, na który wyślemy link do zmiany hasła.");
      emailRef.current?.focus();
      return;
    }
    setPending("reset");
    const result = await auth.requestPasswordReset(email);
    setPending(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    setMessage("Jeśli konto z tym adresem istnieje, wyślemy na nie link do ustawienia nowego hasła.");
  };

  const updatePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearFeedback();
    if (password !== passwordConfirmation) {
      setError("Hasła nie są takie same. Wpisz je ponownie.");
      return;
    }
    setPending("password");
    const result = await auth.updatePassword(password);
    setPending(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    appSession.goToToday();
  };

  const changeView = (next: AuthView) => {
    clearFeedback();
    setPassword("");
    setView(next);
  };

  const unavailableMessage = auth.configurationIssue
    ?? "Logowanie kontem jest chwilowo niedostępne w tym środowisku. Możesz wejść do konta testowego.";

  return (
    <main className="auth-shell">
      <AuthContextPanel />
      <section className="auth-panel" aria-labelledby="auth-title">
        <div className="auth-panel__mobile-brand"><AuthBrand /></div>
        <div className="auth-card">
          {auth.passwordRecovery ? (
            <>
              <div className="auth-card__heading">
                <h2 id="auth-title">Ustaw nowe hasło</h2>
                <p>Wybierz hasło, którego nie używasz w innych serwisach.</p>
              </div>
              <form className="auth-form" onSubmit={updatePassword}>
                <Input
                  label="Nowe hasło"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  hint="Co najmniej 8 znaków."
                  required
                />
                <Input
                  label="Powtórz nowe hasło"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={passwordConfirmation}
                  onChange={(event) => setPasswordConfirmation(event.target.value)}
                  required
                />
                {(error ?? auth.authError) && <p className="auth-feedback is-error" role="alert">{error ?? auth.authError}</p>}
                <Button type="submit" variant="primary" fullWidth disabled={pending !== null}>
                  {pending === "password" ? <><RefreshCw className="is-spinning" size={13} aria-hidden="true" />Zapisuję…</> : "Zapisz nowe hasło"}
                </Button>
              </form>
            </>
          ) : (
            <>
              <div className="auth-card__heading">
                <h2 id="auth-title">{view === "sign-in" ? "Dobrze Cię widzieć" : "Utwórz konto"}</h2>
                <p>{view === "sign-in" ? "Zaloguj się, aby wrócić do swojego planu." : "Zacznij od spokojnego, lokalnego workspace’u i włącz synchronizację."}</p>
              </div>

              <Button
                className="auth-google-button"
                variant="quiet"
                fullWidth
                leadingIcon={pending === "google" ? <RefreshCw className="is-spinning" aria-hidden="true" /> : <GoogleMark />}
                disabled={!auth.configured || pending !== null}
                title={!auth.configured ? unavailableMessage : undefined}
                onClick={() => { void signInWithGoogle(); }}
              >
                Kontynuuj z Google
              </Button>

              <div className="auth-divider"><span>lub</span></div>

              <form className="auth-form" onSubmit={submitCredentials}>
                <Input
                  ref={emailRef}
                  label="Adres e-mail"
                  type="email"
                  autoComplete="email"
                  placeholder="ty@przyklad.pl"
                  value={email}
                  error={emailError ?? undefined}
                  disabled={!auth.configured}
                  onChange={(event) => { setEmail(event.target.value); setEmailError(null); }}
                  required
                />
                <div className="auth-password-row">
                  <span>Hasło</span>
                  {view === "sign-in" && (
                    <button type="button" disabled={!auth.configured || pending !== null} onClick={() => { void requestPasswordReset(); }}>
                      {pending === "reset" ? "Wysyłam…" : "Nie pamiętasz hasła?"}
                    </button>
                  )}
                </div>
                <Input
                  aria-label="Hasło"
                  type="password"
                  autoComplete={view === "sign-in" ? "current-password" : "new-password"}
                  minLength={8}
                  value={password}
                  hint={view === "sign-up" ? "Co najmniej 8 znaków." : undefined}
                  disabled={!auth.configured}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />

                {!auth.configured && <p className="auth-feedback is-warning" role="status">{unavailableMessage}</p>}
                {(error ?? auth.authError) && <p className="auth-feedback is-error" role="alert">{error ?? auth.authError}</p>}
                {message && <p className="auth-feedback is-success" role="status">{message}</p>}

                <Button type="submit" variant="primary" fullWidth disabled={!auth.configured || pending !== null}>
                  {pending === "credentials"
                    ? <><RefreshCw className="is-spinning" size={13} aria-hidden="true" />{view === "sign-in" ? "Loguję…" : "Tworzę konto…"}</>
                    : <>{view === "sign-in" ? "Zaloguj się" : "Utwórz konto"}<ArrowRight size={13} aria-hidden="true" /></>}
                </Button>
              </form>

              <p className="auth-switch">
                {view === "sign-in" ? "Nie masz jeszcze konta?" : "Masz już konto?"}
                <button type="button" onClick={() => changeView(view === "sign-in" ? "sign-up" : "sign-in")}>
                  {view === "sign-in" ? "Utwórz konto" : "Zaloguj się"}
                </button>
              </p>

              <div className="auth-entry-options" aria-label="Szybki start">
                <div className="auth-entry-option">
                  <span className="auth-entry-option__icon" aria-hidden="true"><HardDrive /></span>
                  <div>
                    <strong>Dane lokalne</strong>
                    <p>Otwórz workspace zapisany w tej przeglądarce. Bez konta i bez synchronizacji.</p>
                  </div>
                  <Button variant="quiet" fullWidth onClick={appSession.enterLocalAccount}>
                    Wejdź do danych lokalnych
                  </Button>
                </div>
                <div className="auth-entry-option">
                  <span className="auth-entry-option__icon" aria-hidden="true"><FlaskConical /></span>
                  <div>
                    <strong>Konto testowe</strong>
                    <p>Przykładowe dane do obejrzenia aplikacji. Zmiany znikną po wyjściu z trybu testowego.</p>
                  </div>
                  <Button variant="quiet" fullWidth onClick={appSession.enterTestAccount}>
                    Wejdź do konta testowego
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
