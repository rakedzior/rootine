import { RouterProvider } from "react-router";
import { useEffect, useState } from "react";
import { router } from "./routes";
import { GoalsProvider } from "./goals/goalsStore";
import { ActivityLogProvider } from "./experience/activityLog";
import { AppExperienceProviders } from "./experience/preferences";
import { SupabaseAuthProvider } from "../infrastructure/supabase/auth";
import { RemotePersistenceProvider } from "../infrastructure/supabase/RemotePersistenceProvider";
import { AffairsReminderCenter } from "./affairs/AffairsReminderCenter";
import { AuthLoadingScreen, AuthScreen } from "./auth/AuthScreen";
import { AppSessionProvider, useAppSession } from "./auth/AppSession";
import { Button } from "./ui";
import { useSupabaseAuth } from "../infrastructure/supabase/auth";
import { LegalPage, type LegalDocument } from "./pages/LegalPage";
import {
  accountDataScope,
  getRootineDataScope,
  type RootineDataScope,
} from "./data/accountStorage";
import {
  prepareWorkspaceScopeForAccount,
  switchWorkspaceScope,
} from "./data/localRepository";

function publicLegalDocument(): LegalDocument | null {
  if (typeof window === "undefined") return null;
  const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
  if (pathname === "/terms") return "terms";
  if (pathname === "/privacy") return "privacy";
  return null;
}

function WorkspaceApplication() {
  return (
    <RemotePersistenceProvider>
      <AppExperienceProviders>
        <ActivityLogProvider>
          <GoalsProvider>
            <RouterProvider router={router} />
            <AffairsReminderCenter />
          </GoalsProvider>
        </ActivityLogProvider>
      </AppExperienceProviders>
    </RemotePersistenceProvider>
  );
}

function SessionGate() {
  const auth = useSupabaseAuth();
  const appSession = useAppSession();
  const desiredScope: RootineDataScope = auth.user && !appSession.isTestAccount
    ? accountDataScope(auth.user.id)
    : "local";
  const [preparedScope, setPreparedScope] = useState<RootineDataScope>(getRootineDataScope);
  const [scopeError, setScopeError] = useState<string | null>(null);

  useEffect(() => {
    if (auth.loading) return undefined;
    let active = true;
    setScopeError(null);
    const prepare = desiredScope === "local"
      ? switchWorkspaceScope("local")
      : prepareWorkspaceScopeForAccount(auth.user!.id);
    void prepare
      .then(() => {
        if (!active) return;
        setPreparedScope(getRootineDataScope());
      })
      .catch((error: unknown) => {
        if (!active) return;
        setScopeError(error instanceof Error ? error.message : "Nie udało się przygotować prywatnego magazynu danych.");
      });
    return () => {
      active = false;
    };
  }, [auth.loading, auth.user, desiredScope]);

  if (auth.loading) return <AuthLoadingScreen />;
  if (scopeError) {
    return (
      <main className="auth-shell auth-shell--loading">
        <div className="auth-loading" role="alert">
          <p>{scopeError}</p>
          <Button type="button" onClick={() => window.location.reload()}>Spróbuj ponownie</Button>
        </div>
      </main>
    );
  }
  if (preparedScope !== desiredScope) return <AuthLoadingScreen />;
  if (auth.passwordRecovery) return <AuthScreen />;
  if (!auth.user && !appSession.isTestAccount && !appSession.isLocalAccount && !appSession.authenticationBypassed) return <AuthScreen />;
  return <WorkspaceApplication />;
}

export default function App() {
  const legalDocument = publicLegalDocument();
  if (legalDocument) return <LegalPage document={legalDocument} />;

  return (
    <SupabaseAuthProvider>
      <AppSessionProvider>
        <SessionGate />
      </AppSessionProvider>
    </SupabaseAuthProvider>
  );
}
