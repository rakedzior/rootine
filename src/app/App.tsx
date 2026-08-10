import { RouterProvider } from "react-router";
import { router } from "./routes";
import { GoalsProvider } from "./goals/goalsStore";
import { ActivityLogProvider } from "./experience/activityLog";
import { AppExperienceProviders } from "./experience/preferences";
import { SupabaseAuthProvider } from "../infrastructure/supabase/auth";
import { RemotePersistenceProvider } from "../infrastructure/supabase/RemotePersistenceProvider";
import { AffairsReminderCenter } from "./affairs/AffairsReminderCenter";

export default function App() {
  return (
    <SupabaseAuthProvider>
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
    </SupabaseAuthProvider>
  );
}
