import { useId, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { normaliseSetupCode, SETUP_CODE_PATTERN } from "@teamflow/core";
import { client } from "../../api";
import { errorMessage } from "../../lib/errorSink";
import { queryKeys } from "../../queries/keys";
import { useSession } from "../../session/session";

/**
 * Step 1: the admin account. Needs the setup code the installer printed (also in the server log
 * and `<data dir>/setup-code`); the link carries it as ?code=.
 */
export function SetupAdminStep() {
  const [params] = useSearchParams();
  const queryClient = useQueryClient();
  const { adoptSession } = useSession();
  const ids = { name: useId(), email: useId(), password: useId(), again: useId(), code: useId() };
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [code, setCode] = useState(() => params.get("code") ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const codeOk = SETUP_CODE_PATTERN.test(normaliseSetupCode(code));
  const fromLink = Boolean(params.get("code")) && code === params.get("code");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    if (!name.trim() || !email.trim()) return setError("Enter your name and email.");
    if (password.length < 8) return setError("The password needs at least 8 characters.");
    if (password !== again) return setError("The two passwords are not the same.");
    if (!codeOk) return setError("Enter the setup code, like K7QM-2PXD.");
    setBusy(true);
    try {
      const result = await client.createSetupAdmin({
        code: normaliseSetupCode(code),
        name: name.trim(),
        email: email.trim(),
        password,
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.authConfig });
      // Signing in re-renders /setup as the admin, which moves on to step 2.
      await adoptSession(result);
    } catch (err) {
      setError(errorMessage(err, "Could not create the account"));
      setBusy(false);
    }
  }

  return (
    <form className="settings-section setup-admin-form" noValidate onSubmit={(e) => void submit(e)}>
      <header className="setup-header">
        <p className="eyebrow">Step 1 of 5</p>
        <h1>Create the admin account</h1>
        <p className="setup-lead">
          This is the account that runs the server. You can make more admins later on the admin
          page.
        </p>
      </header>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor={ids.name}>
          Your name
        </label>
        <input
          id={ids.name}
          value={name}
          autoComplete="name"
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor={ids.email}>
          Email
        </label>
        <input
          id={ids.email}
          type="email"
          value={email}
          autoComplete="email"
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="mail-form-row">
        <div className="settings-field">
          <label className="settings-field-label" htmlFor={ids.password}>
            Password
          </label>
          <input
            id={ids.password}
            type="password"
            value={password}
            autoComplete="new-password"
            onChange={(e) => setPassword(e.target.value)}
          />
          <span className="settings-field-hint">At least 8 characters.</span>
        </div>
        <div className="settings-field">
          <label className="settings-field-label" htmlFor={ids.again}>
            Password again
          </label>
          <input
            id={ids.again}
            type="password"
            value={again}
            autoComplete="new-password"
            onChange={(e) => setAgain(e.target.value)}
          />
        </div>
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor={ids.code}>
          Setup code {fromLink ? <span className="setting-from-tag">from the link</span> : null}
        </label>
        <input
          id={ids.code}
          value={code}
          spellCheck={false}
          autoCapitalize="characters"
          placeholder="K7QM-2PXD"
          onChange={(e) => setCode(e.target.value)}
        />
        <span className="settings-field-hint">
          Printed by the installer, in the server log, and in <code>data/setup-code</code> on the
          server. It stops a stranger who finds the new server first.
        </span>
      </div>
      {error ? (
        <p className="banner error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="setup-actions">
        <button type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create admin account →"}
        </button>
      </div>
    </form>
  );
}
