import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { AboutDialog } from "../../components/AboutDialog";
import type { AuthMode } from "../../lib/appRoute";
import { useErrorSink } from "../../lib/errorSink";
import type { NavState } from "../../lib/navState";
import { useAuthConfigQuery } from "../../queries/auth";
import { useSession, useTeams } from "../../session/session";
import { LoginScreen } from "./LoginScreen";

const APP_VERSION = __TEAMFLOW_VERSION__;

/** /login, /register and /reset. Signed-in users go back where they came from. */
export function AuthRoute({ mode }: { mode: AuthMode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const navState = location.state as NavState;
  const { user, sessionLoading, login, register } = useSession();
  const { teamsLoaded } = useTeams();
  const { error } = useErrorSink();
  const [aboutOpen, setAboutOpen] = useState(false);
  const authConfig = useAuthConfigQuery();
  const siteName = authConfig.data?.siteName;
  useEffect(() => {
    if (siteName) document.title = siteName;
  }, [siteName]);

  // A server with no accounts yet is set up first; /setup asks for the setup code.
  if (!user && authConfig.data?.setupNeeded) return <Navigate to="/setup" replace />;

  if (user && teamsLoaded) {
    const from = navState?.from;
    return from ? (
      <Navigate to={`${from.pathname}${from.search}`} replace state={from.state} />
    ) : (
      <Navigate to="/" replace />
    );
  }

  return (
    <>
      <LoginScreen
        mode={mode}
        resetToken={new URLSearchParams(location.search).get("token")}
        error={error}
        loading={sessionLoading}
        onModeChange={(next) =>
          navigate(`/${next}`, { replace: true, state: navState?.from ? navState : null })
        }
        onLogin={(email, password) => void login(email, password)}
        onRegister={(name, email, password) => void register(name, email, password)}
        onOpenAbout={() => setAboutOpen(true)}
      />
      <AboutDialog open={aboutOpen} version={APP_VERSION} onClose={() => setAboutOpen(false)} />
    </>
  );
}
