import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  formatStorageBytes,
  SPACE_ERROR_CODES,
  type SpaceAllowancePublic,
  type TeamInvitePreview,
} from "@teamflow/core";
import { TeamflowApiError } from "@teamflow/api-client";
import { client } from "../../api";
import { boardPath } from "../../lib/appRoute";
import { errorMessage } from "../../lib/errorSink";
import { normaliseFlowKey, suggestFlowKey } from "../../lib/flowKey";
import { extractInviteToken } from "../../lib/inviteLinks";
import { useAuthConfigQuery } from "../../queries/auth";
import { queryKeys } from "../../queries/keys";
import { refreshTeams, useSpaceAllowanceQuery } from "../../queries/teams";
import { useSession, useTeams } from "../../session/session";

/**
 * After sign-up (and whenever someone has no Flow): "You just created your account", then
 * Create a Flow (/welcome/create) or Join a Flow (/welcome/join). People who arrived with an
 * invite link never see it: registration joins them and the invite opens that board.
 */
export function WelcomeRoute() {
  const { mode } = useParams();
  const location = useLocation();
  const { user, sessionReady } = useSession();
  const { teams, teamsLoaded } = useTeams();

  if (!user) {
    const from = { pathname: location.pathname, search: location.search, state: null };
    return <Navigate to="/login" replace state={{ from }} />;
  }
  if (!sessionReady || !teamsLoaded) {
    return <WelcomeShell>{null}</WelcomeShell>;
  }

  const hasFlows = teams.length > 0;
  return (
    <WelcomeShell>
      {mode === "create" ? (
        <CreateFlow />
      ) : mode === "join" ? (
        <JoinFlow />
      ) : mode ? (
        <Navigate to="/welcome" replace />
      ) : (
        <Choices firstName={user.name.split(/\s+/)[0] ?? user.name} hasFlows={hasFlows} />
      )}
    </WelcomeShell>
  );
}

function WelcomeShell({ children }: { children: ReactNode }) {
  const config = useAuthConfigQuery();
  const { user, logout } = useSession();
  const siteName = config.data?.siteName ?? "Teamflow";
  useEffect(() => {
    document.title = siteName;
  }, [siteName]);
  return (
    <div className="welcome-shell">
      <header className="welcome-top">
        <span className="eyebrow">{siteName}</span>
        <span className="welcome-top-user">
          {user?.name}
          <button type="button" className="ghost" onClick={logout}>
            Log out
          </button>
        </span>
      </header>
      <main className="welcome-main">{children}</main>
    </div>
  );
}

function Choices({ firstName, hasFlows }: { firstName: string; hasFlows: boolean }) {
  const allowance = useSpaceAllowanceQuery();
  return (
    <div className="welcome-intro">
      <p className="eyebrow">Welcome, {firstName}</p>
      <h1>{hasFlows ? "Start or join another Flow" : "You just created your account."}</h1>
      <p className="welcome-lead">
        A Flow is a shared board: issues, files and the people working on them. Start your own, or
        join one someone invited you to.
      </p>
      <div className="welcome-choices">
        <Link className="welcome-choice welcome-choice--main" to="/welcome/create">
          <span className="welcome-choice-icon" aria-hidden="true">
            +
          </span>
          <strong>Create a Flow</strong>
          <span>Start a new board. Invite people whenever you're ready.</span>
          <small>{allowanceLine(allowance.data)}</small>
        </Link>
        <Link className="welcome-choice" to="/welcome/join">
          <span className="welcome-choice-icon" aria-hidden="true">
            ⇢
          </span>
          <strong>Join a Flow</strong>
          <span>Paste the invite link or code someone sent you.</span>
          <small>Links look like {window.location.host}/invite/…</small>
        </Link>
      </div>
      <p className="welcome-skip">
        Not now?{" "}
        <Link to={hasFlows ? "/" : "/settings/general"}>
          {hasFlows ? "Back to your board" : "Open settings"}
        </Link>
      </p>
    </div>
  );
}

/** "1 GB" rather than "1.00 GB" for round caps. */
function capText(bytes: number) {
  return formatStorageBytes(bytes).replace(/\.0+ /, " ");
}

function allowanceLine(allowance: SpaceAllowancePublic | undefined) {
  if (!allowance) return "";
  if (allowance.unlimited) return "Admin Flow · no upload limit";
  return `Free Flow · uploads up to ${capText(allowance.capBytes)} · you can own ${allowance.limit}`;
}

/* ---------- Create a Flow ---------- */

function CreateFlow() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const allowance = useSpaceAllowanceQuery();
  const nameId = useId();
  const keyId = useId();
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [atLimit, setAtLimit] = useState(false);
  const [busy, setBusy] = useState(false);

  const data = allowance.data;
  const blocked = atLimit || (data ? !data.canCreate : false);
  const keyValue = normaliseFlowKey(key);
  const valid = name.trim().length > 0 && keyValue.length >= 2;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid || busy || blocked) return;
    setBusy(true);
    setError(null);
    try {
      const { team } = await client.createTeam({ name: name.trim(), key: keyValue });
      await refreshTeams(queryClient);
      void queryClient.invalidateQueries({ queryKey: queryKeys.spaceAllowance });
      navigate(boardPath(team.key), {
        state: { notice: `Created the Flow ${team.key}. Invite people from Settings → Flow.` },
      });
    } catch (err) {
      if (err instanceof TeamflowApiError && err.code === SPACE_ERROR_CODES.freeSpaceLimit) {
        setAtLimit(true);
        void queryClient.invalidateQueries({ queryKey: queryKeys.spaceAllowance });
      }
      setError(errorMessage(err, "Could not create the Flow"));
      setBusy(false);
    }
  }

  return (
    <form className="welcome-panel" noValidate onSubmit={(e) => void submit(e)}>
      <Link className="welcome-back" to="/welcome">
        ← Back
      </Link>
      <h1>Create a Flow</h1>
      <p className="welcome-lead">You'll be its owner. You can rename it or invite people later.</p>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor={nameId}>
          Flow name
        </label>
        <input
          id={nameId}
          value={name}
          maxLength={120}
          placeholder="Design crew"
          autoFocus
          onChange={(e) => {
            setName(e.target.value);
            if (!keyTouched) setKey(suggestFlowKey(e.target.value));
          }}
        />
      </div>
      <div className="settings-field welcome-key">
        <label className="settings-field-label" htmlFor={keyId}>
          Key
        </label>
        <input
          id={keyId}
          value={key}
          maxLength={8}
          spellCheck={false}
          placeholder="DSG"
          onChange={(e) => {
            setKeyTouched(true);
            setKey(normaliseFlowKey(e.target.value));
          }}
        />
        <span className="settings-field-hint">
          Issue IDs will look like <code>{keyValue || "KEY"}-1</code>. 2–8 letters or numbers.
        </span>
      </div>
      {data && !data.unlimited ? <FlowSlots allowance={data} /> : null}
      {blocked && data ? (
        <div className="banner error" role="alert">
          <strong>
            You already own {data.owned} free Flow{data.owned === 1 ? "" : "s"}, the most allowed.
          </strong>{" "}
          Delete one you no longer need, or ask a server admin to make one for you.
        </div>
      ) : error ? (
        <p className="banner error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="setup-actions">
        {blocked ? (
          <Link className="setup-link-button setup-link-button--quiet" to="/settings/team">
            Manage my Flows
          </Link>
        ) : (
          <button type="submit" disabled={!valid || busy}>
            {busy ? "Creating…" : "Create Flow →"}
          </button>
        )}
      </div>
    </form>
  );
}

function FlowSlots({ allowance }: { allowance: SpaceAllowancePublic }) {
  const slots = Math.max(allowance.limit, allowance.owned + (allowance.owned === 0 ? 1 : 0));
  const next = allowance.canCreate ? allowance.owned + 1 : null;
  return (
    <div className="settings-field">
      <span className="settings-field-label">Your free Flows</span>
      <span className="welcome-slots">
        {Array.from({ length: Math.min(slots, 10) }, (_, i) => (
          <i
            key={i}
            className={
              i < allowance.owned
                ? "used"
                : next !== null && i === allowance.owned
                  ? "new"
                  : undefined
            }
          />
        ))}
        <span>
          {next !== null
            ? `this will be ${next} of ${Math.max(allowance.limit, next)} · uploads up to ${capText(allowance.capBytes)}`
            : `${allowance.owned} of ${allowance.limit} used`}
        </span>
      </span>
    </div>
  );
}

/* ---------- Join a Flow ---------- */

function JoinFlow() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const inputId = useId();
  const [raw, setRaw] = useState("");
  /** The last lookup, kept with the code it was for so an older answer never shows. */
  const [lookup, setLookup] = useState<{
    token: string;
    preview: TeamInvitePreview | null;
    problem: string | null;
  } | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const token = extractInviteToken(raw);
  const lookable = Boolean(token && token.length >= 6);
  const current = lookup && lookup.token === token ? lookup : null;
  const preview = current?.preview ?? null;
  const problem = joinError ?? current?.problem ?? null;
  const checking = lookable && !current;

  // Look the invite up as soon as something that could be one is pasted.
  useEffect(() => {
    if (!token || token.length < 6) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      client
        .previewInvite(token)
        .then(({ preview: next }) => {
          if (cancelled) return;
          const why = inviteProblem(next);
          setLookup({ token, preview: why ? null : next, problem: why });
        })
        .catch(() => {
          if (cancelled) return;
          setLookup({
            token,
            preview: null,
            problem: "That invite link or code was not found. Check it, or ask for a new link.",
          });
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [token]);

  async function join(event: FormEvent) {
    event.preventDefault();
    if (!token || !preview || busy) return;
    setBusy(true);
    try {
      const { team, alreadyMember } = await client.acceptInvite(token);
      await refreshTeams(queryClient);
      navigate(boardPath(team.key), {
        replace: true,
        state: {
          notice: alreadyMember
            ? `You're already in the Flow ${team.key} — ${team.name}`
            : `You joined the Flow ${team.key} — ${team.name}`,
        },
      });
    } catch (err) {
      setJoinError(errorMessage(err, "Could not join"));
      setBusy(false);
    }
  }

  return (
    <form className="welcome-panel" noValidate onSubmit={(e) => void join(e)}>
      <Link className="welcome-back" to="/welcome">
        ← Back
      </Link>
      <h1>Join a Flow</h1>
      <p className="welcome-lead">Paste the invite link or code someone sent you.</p>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor={inputId}>
          Invite link or code
        </label>
        <input
          id={inputId}
          value={raw}
          autoFocus
          spellCheck={false}
          placeholder={`${window.location.origin}/invite/…`}
          aria-invalid={Boolean(problem) || undefined}
          onChange={(e) => {
            setRaw(e.target.value);
            setJoinError(null);
          }}
        />
        {problem ? (
          <span className="settings-field-hint admin-bad" role="alert">
            {problem}
          </span>
        ) : checking ? (
          <span className="settings-field-hint">Looking it up…</span>
        ) : null}
      </div>
      {preview ? (
        <div className="welcome-preview">
          <span className="welcome-preview-key">{preview.team.key}</span>
          <span>
            <strong>{preview.team.name}</strong>
            <small>
              {preview.alreadyMember
                ? "You're already in this Flow"
                : `You'll join as ${preview.roleName}`}
            </small>
          </span>
        </div>
      ) : null}
      <div className="setup-actions">
        {problem ? (
          <Link className="welcome-alt" to="/welcome/create">
            Create a Flow instead
          </Link>
        ) : null}
        <button type="submit" disabled={!preview || busy}>
          {busy ? "Joining…" : preview ? `Join ${preview.team.key} →` : "Join"}
        </button>
      </div>
    </form>
  );
}

function inviteProblem(preview: TeamInvitePreview) {
  if (preview.revoked) return "This invite was cancelled. Ask whoever sent it for a new link.";
  if (preview.expired || preview.exhausted) {
    return "This invite has expired or was used up. Ask whoever sent it for a new link.";
  }
  return null;
}
