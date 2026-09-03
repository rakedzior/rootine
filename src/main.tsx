import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App";
import { initializeAppTheme } from "./app/theme/appTheme";
import { rootineObservability } from "./app/observability";
import "./styles/app.css";

window.addEventListener("error", (event) => {
  rootineObservability.recordCrash(event.error instanceof Error ? event.error.message : "window_error");
});
window.addEventListener("unhandledrejection", (event) => {
  rootineObservability.recordCrash(event.reason instanceof Error ? event.reason.message : "unhandled_rejection");
});

initializeAppTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
