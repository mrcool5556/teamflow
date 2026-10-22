import { Outlet } from "react-router";
import { ErrorSinkProvider } from "../components/ErrorSinkProvider";
import { SessionProvider } from "../session/SessionProvider";
import { BottomDockProvider } from "../ui/BottomDock";
import { ConfirmProvider } from "../ui/ConfirmDialog";

/** App-wide providers that need the router (session navigates on logout). */
export function RootLayout() {
  return (
    <ErrorSinkProvider>
      <BottomDockProvider>
        <ConfirmProvider>
          <SessionProvider>
            <Outlet />
          </SessionProvider>
        </ConfirmProvider>
      </BottomDockProvider>
    </ErrorSinkProvider>
  );
}
