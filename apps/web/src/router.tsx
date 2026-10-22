import { createBrowserRouter, Navigate, type RouteObject } from "react-router";
import { RoadmapPanel } from "./components/RoadmapPanel";
import { RouteMarker } from "./components/RouteMarker";
import { RootLayout } from "./routes/RootLayout";
import { AuthRoute } from "./routes/auth/AuthRoute";
import { InviteRoute } from "./routes/auth/InviteRoute";
import { BoardShell } from "./routes/board/BoardShell";
import { AppearancePanel } from "./routes/settings/AppearancePanel";
import { GeneralPanel } from "./routes/settings/GeneralPanel";
import { IntegrationsPanel } from "./routes/settings/IntegrationsPanel";
import { RolesPanel } from "./routes/settings/RolesPanel";
import { SettingsLayout } from "./routes/settings/SettingsLayout";
import { TeamPanel } from "./routes/settings/TeamPanel";
import { TokensPanel } from "./routes/settings/TokensPanel";
import { UpdatesPanel } from "./routes/settings/UpdatesPanel";

/** Settings panels, mounted under both /t/:teamKey/settings and the teamless /settings. */
const settingsRoute: RouteObject = {
  path: "settings",
  element: <SettingsLayout />,
  children: [
    { index: true, element: <Navigate to="general" replace /> },
    { path: "general", element: <GeneralPanel /> },
    { path: "appearance", element: <AppearancePanel /> },
    { path: "team", element: <TeamPanel /> },
    { path: "roles", element: <RolesPanel /> },
    { path: "integrations", element: <IntegrationsPanel /> },
    { path: "updates", element: <UpdatesPanel /> },
    { path: "tokens", element: <TokensPanel /> },
    { path: "*", element: <Navigate to="../general" replace /> },
  ],
};

/**
 * URL map. Legacy links (`/?ref=`, `/?invite=`, `/?reset=`) are redirected by the board shell
 * at `/`, before it asks for a login.
 */
export const routes: RouteObject[] = [
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { path: "login", element: <AuthRoute mode="login" /> },
      { path: "register", element: <AuthRoute mode="register" /> },
      { path: "reset", element: <AuthRoute mode="reset" /> },
      {
        element: <BoardShell />,
        children: [
          { index: true, element: <RouteMarker /> },
          { path: "invite/:token", element: <InviteRoute /> },
          {
            path: "t/:teamKey",
            children: [
              { index: true, element: <RouteMarker /> },
              { path: "issue/:issueRef", element: <RouteMarker /> },
              settingsRoute,
              { path: "plan", element: <RoadmapPanel /> },
            ],
          },
          // Without any team the shell still offers settings (create a team) and the plan.
          settingsRoute,
          { path: "plan", element: <RoadmapPanel /> },
        ],
      },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
];

export function createAppRouter() {
  return createBrowserRouter(routes);
}
