import { RouterProvider } from "react-router";
import { router } from "./routes";
import { GoalsProvider } from "./goals/goalsStore";
import { ActiveAreaProvider } from "./experience/activeArea";
import { ActivityLogProvider } from "./experience/activityLog";
import { AppExperienceProviders } from "./experience/preferences";
import { AssistantSettingsProvider } from "../assistant/config/AssistantSettingsProvider";
import { AssistantProvider } from "../assistant/runtime/AssistantProvider";

export default function App() {
  return (
    <AssistantSettingsProvider>
      <AssistantProvider navigate={(path) => { void router.navigate(path); }}>
        <AppExperienceProviders>
          <ActiveAreaProvider>
            <ActivityLogProvider>
              <GoalsProvider>
                <RouterProvider router={router} />
              </GoalsProvider>
            </ActivityLogProvider>
          </ActiveAreaProvider>
        </AppExperienceProviders>
      </AssistantProvider>
    </AssistantSettingsProvider>
  );
}
