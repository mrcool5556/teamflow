import { createBrowserRouter, type RouteObject } from "react-router";
import { App } from "./App";
import { ErrorSinkProvider } from "./components/ErrorSinkProvider";
import { RouteMarker } from "./components/RouteMarker";

/**
 * URL map. App renders every screen and reads the matched route; the child routes only declare
 * which URLs exist so reload and browser Back land on the same screen.
 *
 * Legacy links (`/?ref=`, `/?invite=`, `/?reset=`) are redirected by App at `/`.
 */
export const routes: RouteObject[] = [
  {
    path: "/",
    element: (
      <ErrorSinkProvider>
        <App />
      </ErrorSinkProvider>
    ),
    children: [
      { index: true, Component: RouteMarker },
      { path: "login", Component: RouteMarker },
      { path: "register", Component: RouteMarker },
      { path: "reset", Component: RouteMarker },
      { path: "invite/:token", Component: RouteMarker },
      { path: "t/:teamKey", Component: RouteMarker },
      { path: "t/:teamKey/issue/:issueRef", Component: RouteMarker },
      { path: "t/:teamKey/settings/:panel", Component: RouteMarker },
      { path: "t/:teamKey/plan", Component: RouteMarker },
      // Without any team the shell still needs settings (create team) and the plan.
      { path: "settings/:panel", Component: RouteMarker },
      { path: "plan", Component: RouteMarker },
      { path: "*", Component: RouteMarker },
    ],
  },
];

export function createAppRouter() {
  return createBrowserRouter(routes);
}
