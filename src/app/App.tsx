import { RouterProvider } from "react-router";
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
import { FlaskConical } from "lucide-react";
import { useSupabaseAuth } from "../infrastructure/supabase/auth";

function TestAccountNotice() {
  const session = useAppSession();
  if (!session.isTestAccount) return null;
  return (
    <aside className="test-account-notice" aria-label="Konto testowe">
      <FlaskConical size={14} aria-hidden="true" />
      <span><strong>Konto testowe</strong><small>Zmiany znikną po twardym odświeżeniu.</small></span>
      <Button variant="ghost" size="xs" onClick={session.exitTestAccount}>Zakończ demo</Button>
    </aside>
  );
}

function WorkspaceApplication() {
  return (
    <RemotePersistenceProvider>
      <AppExperienceProviders>
        <ActivityLogProvider>
          <GoalsProvider>
            <RouterProvider router={router} />
            <AffairsReminderCenter />
            <TestAccountNotice />
          </GoalsProvider>
        </ActivityLogProvider>
      </AppExperienceProviders>
    </RemotePersistenceProvider>
  );
}

function SessionGate() {
  const auth = useSupabaseAuth();
  const appSession = useAppSession();
  if (auth.loading) return <AuthLoadingScreen />;
  if (auth.passwordRecovery) return <AuthScreen />;
  if (!auth.user && !appSession.isTestAccount && !appSession.authenticationBypassed) return <AuthScreen />;
  return <WorkspaceApplication />;
}

export default function App() {
  return (
    <SupabaseAuthProvider>
      <AppSessionProvider>
        <SessionGate />
      </AppSessionProvider>
    </SupabaseAuthProvider>
  );
}
