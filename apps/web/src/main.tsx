import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router/dom";
import { createDefaultUserProfile } from "@teamflow/core";
import { applyUserProfile } from "./profile";
import { createQueryClient } from "./queries/keys";
import { createAppRouter } from "./router";
// Order matters: later files win ties in the cascade.
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/topbar.css";
import "./styles/board.css";
import "./styles/card.css";
import "./styles/drawer.css";
import "./styles/dialog.css";
import "./styles/popover.css";
import "./styles/settings.css";
import "./styles/plan.css";
import "./styles/auth.css";

applyUserProfile(createDefaultUserProfile());

const router = createAppRouter();
const queryClient = createQueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
