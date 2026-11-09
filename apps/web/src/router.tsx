import { createBrowserRouter, Navigate, type RouteObject } from "react-router";
import { RoadmapPanel } from "./components/RoadmapPanel";
import { RouteMarker } from "./components/RouteMarker";
import { RootLayout } from "./routes/RootLayout";
import { AdminLayout } from "./routes/admin/AdminLayout";
import { DefaultsPanel } from "./routes/admin/DefaultsPanel";
import { HelpPanel } from "./routes/admin/HelpPanel";
import { OverviewPanel } from "./routes/admin/OverviewPanel";
import { PeoplePanel } from "./routes/admin/PeoplePanel";
import { SitePanel } from "./routes/admin/SitePanel";
import { SpaceDetailPanel } from "./routes/admin/SpaceDetailPanel";
import { SpacesPanel } from "./routes/admin/SpacesPanel";
import { AdminBotPanel, AdminUpdatesPanel } from "./routes/admin/ServerSections";
import { AuthRoute } from "./routes/auth/AuthRoute";
import { InviteRoute } from "./routes/auth/InviteRoute";
import { SetupRoute } from "./routes/setup/SetupRoute";
import { WelcomeRoute } from "./routes/welcome/WelcomeRoute";
import { BoardShell } from "./routes/board/BoardShell";
import { AppearancePanel } from "./routes/settings/AppearancePanel";
import { DesignPanel } from "./routes/settings/DesignPanel";
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
    { path: "appearance/design", element: <DesignPanel /> },
    { path: "team", element: <TeamPanel /> },
    { path: "roles", element: <RolesPanel /> },
    { path: "integrations", element: <IntegrationsPanel /> },
    { path: "updates", element: <UpdatesPanel /> },
    { path: "tokens", element: <TokensPanel /> },
    { path: "*", element: <Navigate to="../general" replace /> },
  ],
};

/** Server admin page (instance admins only), mounted like settings under a team and teamless. */
const adminRoute: RouteObject = {
  path: "admin",
  element: <AdminLayout />,
  children: [
    { index: true, element: <Navigate to="overview" replace /> },
    { path: "overview", element: <OverviewPanel /> },
    { path: "spaces", element: <SpacesPanel /> },
    { path: "spaces/:spaceId", element: <SpaceDetailPanel /> },
    { path: "people", element: <PeoplePanel /> },
    { path: "site", element: <SitePanel /> },
    { path: "updates", element: <AdminUpdatesPanel /> },
    { path: "bot", element: <AdminBotPanel /> },
    { path: "help", element: <HelpPanel /> },
    { path: "defaults", element: <DefaultsPanel /> },
    { path: "*", element: <Navigate to="../overview" replace /> },
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
      // First-time setup; closed once the server has an account (docs/SETUP.md).
      { path: "setup/:step?", element: <SetupRoute /> },
      // After sign-up, or with no Flow: Create a Flow / Join a Flow.
      { path: "welcome/:mode?", element: <WelcomeRoute /> },
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
              adminRoute,
              { path: "plan", element: <RoadmapPanel /> },
            ],
          },
          // Without any team the shell still offers settings (create a team) and the plan.
          settingsRoute,
          adminRoute,
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
