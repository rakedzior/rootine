import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { FlaskConical, LogIn, LogOut, RefreshCw } from "lucide-react";
import { Button, Input } from "../../app/ui";
import { useAppSession } from "../../app/auth/AppSession";
import { useSupabaseAuth } from "./auth";
import { useRemoteSync } from "./RemotePersistenceProvider";

type AuthMode = "sign-in" | "sign-up";

function elapsedLabel(elapsedMs: number) {
  if (elapsedMs < 1_000) return `${elapsedMs} ms`;
  return `${(elapsedMs / 1_000).toLocaleString("pl-PL", { maximumFractionDigits: 1 })} s`;
}

export function AccountPanel() {
  const auth = useSupabaseAuth();
  const remote = useRemoteSync();
  const appSession = useAppSession();
  const navigate = useNavigate();
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const signOut = async () => {
    const result = await auth.signOut();
    if (!result.error) appSession.exitToAuthScreen();
  };

  if (appSession.isTestAccount) {
    return (
      <div className="app-account-panel app-account-panel--test">
        <p className="app-account-panel__message">
          <FlaskConical size={14} aria-hidden="true" />
          Korzystasz z przykładowych danych. Zmiany nie trafią do Twojego konta ani urządzenia.
        </p>
        <Button
          className="app-account-panel__logout"
          variant="quiet"
          size="sm"
          fullWidth
          leadingIcon={<LogOut size={14} aria-hidden="true" />}
          onClick={appSession.exitTestAccount}
        >
          Zakończ demo
        </Button>
      </div>
    );
  }

  if (appSession.isLocalAccount) {
    return (
      <div className="app-account-panel app-account-panel--local">
        <p className="app-account-panel__message">
          Dane lokalne są zapisane w tej przeglądarce i nie są synchronizowane z kontem.
        </p>
        <Button
          className="app-account-panel__logout"
          variant="quiet"
          size="sm"
          fullWidth
          onClick={appSession.exitToAuthScreen}
        >
          Wróć do ekranu startowego
        </Button>
      </div>
    );
  }

  if (!auth.configured) {
    return null;
  }

  if (auth.loading) {
    return <p className="app-account-panel__status">Sprawdzam sesję konta…</p>;
  }

  if (auth.user) {
    return (
      <div className="app-account-panel">
        {remote.message && <p className="app-account-panel__error">{remote.message}</p>}
        {remote.initialSyncElapsedMs !== undefined && (
          <p className="app-account-panel__telemetry">
            Próba {remote.initialSyncAttempt} · {elapsedLabel(remote.initialSyncElapsedMs)}
            {remote.initialSyncTimedOut ? " · przekroczono limit czasu" : ""}
          </p>
        )}
        {(remote.status === "error" || remote.status === "schema-missing") && (
          <Button
            className="app-account-panel__retry"
            variant="quiet"
            size="sm"
            fullWidth
            leadingIcon={<RefreshCw size={14} aria-hidden="true" />}
            onClick={remote.retry}
          >
            Spróbuj ponownie
          </Button>
        )}
        <Button
          className="app-account-panel__logout"
          variant="quiet"
          size="sm"
          fullWidth
          leadingIcon={<LogOut size={14} aria-hidden="true" />}
          onClick={() => { void signOut(); }}
        >
          Wyloguj
        </Button>
      </div>
    );
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setSubmitting(true);
    const result = mode === "sign-in"
      ? await auth.signIn(email, password)
      : await auth.signUp(email, password);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.needsEmailConfirmation) {
      setMessage("Sprawdź pocztę i potwierdź adres, aby dokończyć rejestrację.");
      return;
    }
    setMessage("Konto połączone. Dane lokalne zostaną teraz zsynchronizowane.");
    navigate("/dzisiaj");
    setPassword("");
  };

  return (
    <div className="app-account-panel">
      <div className="app-account-panel__mode" role="tablist" aria-label="Tryb konta">
        <button type="button" role="tab" aria-selected={mode === "sign-in"} onClick={() => setMode("sign-in")}>
          Zaloguj
        </button>
        <button type="button" role="tab" aria-selected={mode === "sign-up"} onClick={() => setMode("sign-up")}>
          Załóż konto
        </button>
      </div>
      <form className="app-account-panel__form" onSubmit={submit}>
        <Input
          label="E-mail"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <Input
          label="Hasło"
          type="password"
          autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
          minLength={6}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        {error && <p className="app-account-panel__error" role="alert">{error}</p>}
        {message && <p className="app-account-panel__message" role="status">{message}</p>}
        <Button
          type="submit"
          variant="primary"
          size="sm"
          fullWidth
          disabled={submitting}
          leadingIcon={submitting ? <RefreshCw className="is-spinning" size={14} aria-hidden="true" /> : <LogIn size={14} aria-hidden="true" />}
        >
          {submitting ? "Przetwarzam…" : mode === "sign-in" ? "Zaloguj i synchronizuj" : "Utwórz konto"}
        </Button>
      </form>
      <small className="app-account-panel__hint">Dane pozostają chronione przez polityki RLS przypisane do Twojego konta.</small>
    </div>
  );
}
