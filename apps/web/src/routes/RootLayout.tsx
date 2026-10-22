import { Outlet } from "react-router";
import { ErrorSinkProvider } from "../components/ErrorSinkProvider";
import { SessionProvider } from "../session/SessionProvider";

/** App-wide providers that need the router (session navigates on logout). */
export function RootLayout() {
  return (
    <ErrorSinkProvider>
      <SessionProvider>
        <Outlet />
      </SessionProvider>
    </ErrorSinkProvider>
  );
}
