import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router/dom";
import { createDefaultUserProfile } from "@teamflow/core";
import { applyUserProfile } from "./profile";
import { createQueryClient } from "./queries/keys";
import { createAppRouter } from "./router";
import "./styles.css";

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
