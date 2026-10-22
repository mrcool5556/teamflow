import { useState, type FormEvent } from "react";
import { client } from "../../api";
import { errorMessage } from "../../lib/errorSink";
import { hasPendingInvite } from "../../lib/inviteLinks";
import type { AuthMode } from "../../lib/appRoute";
import { useAuthConfigQuery } from "../../queries/auth";

export function LoginScreen({
  mode: routeMode,
  resetToken: routeResetToken,
  error,
  loading,
  onModeChange,
  onLogin,
  onRegister,
  onOpenAbout,
}: {
  mode: AuthMode;
  resetToken: string | null;
  error: string | null;
  loading: boolean;
  onModeChange: (mode: AuthMode) => void;
  onLogin: (email: string, password: string) => void;
  onRegister: (name: string, email: string, password: string) => void;
  onOpenAbout: () => void;
}) {
  // "Forgot password" is a step inside /login rather than a URL of its own.
  const [forgot, setForgot] = useState(false);
  const mode = routeMode === "login" && forgot ? "forgot" : routeMode;

  function setMode(next: AuthMode | "forgot") {
    setForgot(next === "forgot");
    const target = next === "forgot" ? "login" : next;
    if (target !== routeMode) onModeChange(target);
  }
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetToken, setResetToken] = useState(routeResetToken ?? "");
  const authConfig = useAuthConfigQuery().data;
  const inviteOnly = authConfig?.inviteOnly ?? false;
  const passwordResetEmail = authConfig?.passwordResetEmail ?? false;
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const pendingInvite = hasPendingInvite();

  const registerBlocked = inviteOnly && !pendingInvite;
  const displayError = localError ?? error;

  async function handleForgotPassword() {
    setLocalError(null);
    setStatusMessage(null);
    if (!email.trim()) {
      setLocalError("Enter your email address.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await client.requestPasswordReset({ email: email.trim() });
      setStatusMessage(result.message);
    } catch (err) {
      setLocalError(errorMessage(err, "Request failed"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetPassword() {
    setLocalError(null);
    setStatusMessage(null);
    if (!resetToken.trim()) {
      setLocalError("Reset link is missing or invalid.");
      return;
    }
    if (password.length < 8) {
      setLocalError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setLocalError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      await client.resetPassword({ token: resetToken.trim(), password });
      setPassword("");
      setConfirmPassword("");
      setResetToken("");
      setMode("login");
      setStatusMessage("Password updated. Log in with your new password.");
    } catch (err) {
      setLocalError(errorMessage(err, "Reset failed"));
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || submitting) return;
    if (mode === "forgot") void handleForgotPassword();
    else if (mode === "reset") void handleResetPassword();
    else if (mode === "login") onLogin(email, password);
    else if (!registerBlocked) onRegister(name, email, password);
  }

  return (
    <div className="login-shell">
      {/* A real form, so Enter submits whichever step is showing. */}
      <form className="login-card" noValidate onSubmit={handleSubmit}>
        <p className="eyebrow">TEAMFLOW</p>
        <h1>
          {mode === "forgot"
            ? "Forgot password"
            : mode === "reset"
              ? "Set new password"
              : "Team task board"}
        </h1>
        <p className="muted">
          {mode === "forgot"
            ? "We'll send a reset link if email is configured on this server."
            : mode === "reset"
              ? "Choose a new password for your account."
              : "Self-hosted issues with MCP for AI assistants."}
        </p>

        {pendingInvite && mode !== "forgot" && mode !== "reset" ? (
          <p className="hint invite-login-hint">
            You have a team invite — log in or register to join.
          </p>
        ) : inviteOnly && mode === "register" ? (
          <p className="hint invite-login-hint">
            Registration is invite-only. Open an invite link before creating an account.
          </p>
        ) : null}

        {mode === "login" || mode === "register" ? (
          <div className="tabs">
            <button
              type="button"
              className={mode === "login" ? "active" : ""}
              onClick={() => {
                setMode("login");
                setLocalError(null);
                setStatusMessage(null);
              }}
            >
              Log in
            </button>
            <button
              type="button"
              className={mode === "register" ? "active" : ""}
              disabled={registerBlocked}
              onClick={() => {
                setMode("register");
                setLocalError(null);
                setStatusMessage(null);
              }}
            >
              Register
            </button>
          </div>
        ) : null}

        {mode === "register" && (
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        )}

        {mode !== "reset" ? (
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>
        ) : null}

        {mode === "login" || mode === "register" || mode === "reset" ? (
          <label>
            {mode === "reset" ? "New password" : "Password"}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "reset" ? "new-password" : "current-password"}
            />
          </label>
        ) : null}

        {mode === "reset" ? (
          <label>
            Confirm password
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </label>
        ) : null}

        {mode === "login" ? (
          <button
            type="button"
            className="ghost login-forgot-link"
            onClick={() => {
              setMode("forgot");
              setLocalError(null);
              setStatusMessage(null);
            }}
          >
            Forgot password?
          </button>
        ) : null}

        {displayError && <div className="banner error">{displayError}</div>}
        {statusMessage && <div className="banner">{statusMessage}</div>}

        {mode === "forgot" ? (
          <>
            {!passwordResetEmail ? (
              <p className="hint">
                Email is not configured on this server. After you submit, the reset link is written
                to the server logs for your administrator.
              </p>
            ) : null}
            <button type="submit" disabled={loading || submitting}>
              {loading || submitting ? "Working…" : "Send reset link"}
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setMode("login");
                setLocalError(null);
                setStatusMessage(null);
              }}
            >
              Back to log in
            </button>
          </>
        ) : mode === "reset" ? (
          <>
            <button type="submit" disabled={loading || submitting}>
              {loading || submitting ? "Working…" : "Update password"}
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setMode("login");
                setLocalError(null);
              }}
            >
              Back to log in
            </button>
          </>
        ) : (
          <button type="submit" disabled={loading || (mode === "register" && registerBlocked)}>
            {loading ? "Working…" : mode === "login" ? "Log in" : "Create account"}
          </button>
        )}

        {mode === "login" ? (
          <p className="hint">
            New install? Register the first account; it becomes the instance admin.
          </p>
        ) : null}

        <button type="button" className="ghost about-login-link" onClick={onOpenAbout}>
          About Teamflow
        </button>
      </form>
    </div>
  );
}
