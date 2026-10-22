import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import { createDefaultUserProfile } from "@teamflow/core";
import { applyUserProfile } from "./profile";
import { createAppRouter } from "./router";
import "./styles.css";

applyUserProfile(createDefaultUserProfile());

const router = createAppRouter();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
