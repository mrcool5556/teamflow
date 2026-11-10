import { useEffect, type ReactNode } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { useAuthConfigQuery } from "../../queries/auth";
import { useInstanceOverviewQuery, useSpaceSettingsQuery } from "../../queries/instance";
import {
  useMailSettingsQuery,
  useSignupSettingsQuery,
  useSiteSettingsQuery,
  useUpdateSetupProgressMutation,
} from "../../queries/site";
import { useSession } from "../../session/session";
import { MailForm, SiteForm, StorageSignupForm } from "../admin/siteForms";
import { SetupAdminStep } from "./SetupAdminStep";
import { SetupChecklist } from "./SetupChecklist";
import { SETUP_STEPS, setupStepPath, type SetupStepId } from "./setupSteps";

/**
 * First-time setup (/setup). Step 1 creates the admin account and is only reachable while the
 * server has no accounts; the server enforces that too. Steps 2–5 are admin settings shown as a
 * wizard to a signed-in instance admin, who can leave at any point (the admin Overview keeps the
 * checklist). docs/SETUP.md.
 */

const stepPath = setupStepPath;

export function SetupRoute() {
  const { step } = useParams();
  const { user, sessionLoading } = useSession();
  const config = useAuthConfigQuery();

  useEffect(() => {
    const name = config.data?.siteName ?? "Teamflow";
    document.title = `Set up ${name}`;
  }, [config.data?.siteName]);

  if (config.isPending || (sessionLoading && !user)) {
    return (
      <SetupShell current="admin">
        <p className="settings-hint">Loading…</p>
      </SetupShell>
    );
  }

  if (!user) {
    // Only a server with no accounts shows step 1; anything else is an ordinary login.
    if (!config.data?.setupNeeded) return <Navigate to="/login" replace />;
    return (
      <SetupShell current="admin">
        <SetupAdminStep />
      </SetupShell>
    );
  }

  if (!user.isInstanceAdmin) return <Navigate to="/" replace />;
  const current = SETUP_STEPS.find((s) => s.id === step && s.id !== "admin")?.id;
  if (!current) return <Navigate to={stepPath("site")} replace />;

  return (
    <SetupShell current={current}>
      {current === "site" ? <SiteStep /> : null}
      {current === "email" ? <EmailStep /> : null}
      {current === "storage" ? <StorageStep /> : null}
      {current === "done" ? <DoneStep /> : null}
    </SetupShell>
  );
}

/** The rail on desktop, a progress bar on a phone; the step's content beside or below it. */
function SetupShell({ current, children }: { current: SetupStepId; children: ReactNode }) {
  const config = useAuthConfigQuery();
  const index = SETUP_STEPS.findIndex((s) => s.id === current);
  const step = SETUP_STEPS[index]!;
  return (
    <div className="setup-shell">
      <aside className="setup-rail" aria-label="Setup steps">
        <p className="eyebrow setup-logo">{config.data?.siteName ?? "Teamflow"} · setup</p>
        <ol className="setup-steps">
          {SETUP_STEPS.map((s, i) => {
            const state = i < index ? "done" : i === index ? "current" : "todo";
            return (
              <li
                key={s.id}
                className={`setup-step setup-step--${state}`}
                aria-current={state === "current" ? "step" : undefined}
              >
                <span className="setup-step-mark" aria-hidden="true">
                  {state === "done" ? "✓" : i + 1}
                </span>
                <span>
                  {s.title}
                  <small>{s.sub}</small>
                </span>
              </li>
            );
          })}
        </ol>
        <p className="setup-rail-fine">
          Only shown on a brand-new server. Once the admin account exists, nobody else can open step
          1.
        </p>
      </aside>
      <div className="setup-phone-head">
        <p className="eyebrow">{config.data?.siteName ?? "Teamflow"} · setup</p>
        <strong>
          Step {index + 1} of {SETUP_STEPS.length} · {step.title}
        </strong>
        <span className="setup-progress" aria-hidden="true">
          {SETUP_STEPS.map((s, i) => (
            <i key={s.id} className={i < index ? "done" : i === index ? "current" : undefined} />
          ))}
        </span>
      </div>
      <main className="setup-main">
        <div className="setup-card">{children}</div>
      </main>
    </div>
  );
}

function StepHeader({
  n,
  title,
  lead,
  optional,
}: {
  n: number;
  title: string;
  lead: string;
  optional?: boolean;
}) {
  return (
    <header className="setup-header">
      <p className="eyebrow">
        Step {n} of {SETUP_STEPS.length}
        {optional ? " · optional" : ""}
      </p>
      <h1>{title}</h1>
      <p className="setup-lead">{lead}</p>
    </header>
  );
}

function BackLink({ to }: { to: SetupStepId }) {
  return (
    <Link className="setup-back" to={stepPath(to)}>
      ← Back
    </Link>
  );
}

function SiteStep() {
  const navigate = useNavigate();
  const site = useSiteSettingsQuery();
  return (
    <>
      <StepHeader
        n={2}
        title="Name and address"
        lead="Shown on the login page, in the browser tab and in emails."
      />
      {site.data ? (
        <SiteForm
          site={site.data}
          submitLabel="Save and continue →"
          onSaved={() => navigate(stepPath("email"))}
        />
      ) : (
        <p className="settings-hint">Loading…</p>
      )}
    </>
  );
}

function EmailStep() {
  const navigate = useNavigate();
  const mail = useMailSettingsQuery();
  const progress = useUpdateSetupProgressMutation();
  const next = () => navigate(stepPath("storage"));
  return (
    <>
      <StepHeader
        n={3}
        optional
        title="Email"
        lead="Used for password resets. Any SMTP service works. Without it, an admin resets passwords."
      />
      {mail.data ? (
        <MailForm
          mail={mail.data}
          submitLabel="Save and continue →"
          secondary={<BackLink to="site" />}
          onSaved={() => {
            progress.mutate({ emailSkipped: false });
            next();
          }}
          onSkip={() => {
            progress.mutate({ emailSkipped: true });
            next();
          }}
        />
      ) : (
        <p className="settings-hint">Loading…</p>
      )}
    </>
  );
}

function StorageStep() {
  const navigate = useNavigate();
  const settings = useSpaceSettingsQuery();
  const signup = useSignupSettingsQuery();
  const overview = useInstanceOverviewQuery();
  const progress = useUpdateSetupProgressMutation();
  return (
    <>
      <StepHeader
        n={4}
        title="Storage and sign-up"
        lead="The rules for Flows people make themselves. Your own Flows as admin have no limit."
      />
      {settings.data && signup.data ? (
        <StorageSignupForm
          settings={settings.data}
          signup={signup.data}
          disk={overview.data?.disk ?? null}
          submitLabel="Save and continue →"
          secondary={<BackLink to="email" />}
          onSaved={() => {
            progress.mutate({ storageReviewed: true });
            navigate(stepPath("done"));
          }}
        />
      ) : (
        <p className="settings-hint">Loading…</p>
      )}
    </>
  );
}

function DoneStep() {
  return (
    <>
      <StepHeader
        n={5}
        title="You're set up"
        lead="What's done and what's left. The list stays on the server admin Overview until everything is ticked."
      />
      <SetupChecklist variant="page" />
    </>
  );
}
