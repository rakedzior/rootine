import { RouterProvider } from "react-router";
import { router } from "./routes";
import { GoalsProvider } from "./goals/goalsStore";
import { ActiveAreaProvider } from "./experience/activeArea";
import { ActivityLogProvider } from "./experience/activityLog";
import { AppExperienceProviders } from "./experience/preferences";
import { AssistantSettingsProvider } from "../assistant/config/AssistantSettingsProvider";
import { AssistantProvider } from "../assistant/runtime/AssistantProvider";
import { SupabaseAuthProvider } from "../infrastructure/supabase/auth";
import { RemotePersistenceProvider } from "../infrastructure/supabase/RemotePersistenceProvider";
import { AffairsReminderCenter } from "./affairs/AffairsReminderCenter";

export default function App() {
  return (
    <SupabaseAuthProvider>
      <RemotePersistenceProvider>
        <AssistantSettingsProvider>
          <AssistantProvider navigate={(path) => { void router.navigate(path); }}>
            <AppExperienceProviders>
              <ActiveAreaProvider>
                <ActivityLogProvider>
                  <GoalsProvider>
                    <RouterProvider router={router} />
                    <AffairsReminderCenter />
                  </GoalsProvider>
                </ActivityLogProvider>
              </ActiveAreaProvider>
            </AppExperienceProviders>
          </AssistantProvider>
        </AssistantSettingsProvider>
      </RemotePersistenceProvider>
    </SupabaseAuthProvider>
  );
}
