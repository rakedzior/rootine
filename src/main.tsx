import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App";
import { initializeAppTheme } from "./app/theme/appTheme";
import "./styles/app.css";

initializeAppTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
