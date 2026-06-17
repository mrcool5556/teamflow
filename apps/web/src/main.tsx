import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createDefaultUserProfile } from "@teamflow/core";
import { App } from "./App";
import { applyUserProfile } from "./profile";
import "./styles.css";

applyUserProfile(createDefaultUserProfile());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
