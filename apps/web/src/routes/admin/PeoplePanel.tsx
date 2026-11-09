import { useState } from "react";
import type { InstanceUserPublic, PasswordResetIssuedPublic } from "@teamflow/core";
import { PanelStatus } from "../../components/PanelStatus";
import { copyTextToClipboard } from "../../lib/clipboard";
import { errorMessage } from "../../lib/errorSink";
import { formatTimestamp } from "../../lib/format";
import { usePanelStatus } from "../../lib/panelStatus";
import {
  useInstanceUsersQuery,
  useIssueResetLinkMutation,
  useSetInstanceAdminMutation,
} from "../../queries/instance";
import { useSession } from "../../session/session";
import { useConfirm } from "../../ui/confirmContext";

/**
 * Everyone with an account: make or remove server admins (never the last one, and not someone
 * TEAMFLOW_INSTANCE_ADMINS lists), and hand out a password reset link when email is not set up.
 */
export function PeoplePanel() {
  const [search, setSearch] = useState("");
  const query = useInstanceUsersQuery(search.trim(), true, 500);
  const { status, onMessage } = usePanelStatus();
  const people = query.data ?? [];
  return (
    <div className="settings-panel">
      <header className="settings-panel-header">
        <h2>People</h2>
        <p className="settings-copy settings-lead">
          Everyone with an account on this server. Server admins see this page and change
          server-wide settings.
        </p>
      </header>
      <PanelStatus status={status} />
      <label className="settings-field admin-people-search">
        <span className="settings-field-label">Search</span>
        <input
          type="search"
          value={search}
          placeholder="Name or email"
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      {query.isPending ? (
        <p className="settings-hint">Loading…</p>
      ) : people.length === 0 ? (
        <p className="settings-hint">Nobody matches.</p>
      ) : (
        <ul className="admin-people" aria-label="People">
          {people.map((person) => (
            <PersonRow key={person.id} person={person} onMessage={onMessage} />
          ))}
        </ul>
      )}
    </div>
  );
}

function PersonRow({
  person,
  onMessage,
}: {
  person: InstanceUserPublic;
  onMessage: ReturnType<typeof usePanelStatus>["onMessage"];
}) {
  const { user } = useSession();
  const confirm = useConfirm();
  const setAdmin = useSetInstanceAdminMutation();
  const resetLink = useIssueResetLinkMutation();
  const [issued, setIssued] = useState<PasswordResetIssuedPublic | null>(null);
  const isMe = person.id === user?.id;

  const toggleAdmin = async () => {
    const next = !person.isInstanceAdmin;
    const ok = await confirm(
      next
        ? {
            title: `Make ${person.name} a server admin?`,
            message: "They will see this page and can change every server-wide setting.",
            confirmLabel: "Make admin",
          }
        : {
            title: `Remove ${person.name} as server admin?`,
            message: isMe
              ? "You will lose access to this page straight away."
              : "Their Flows and memberships stay as they are.",
            confirmLabel: "Remove admin",
            danger: true,
          },
    );
    if (!ok) return;
    try {
      await setAdmin.mutateAsync({ userId: person.id, isInstanceAdmin: next });
      onMessage(
        next
          ? `${person.name} is now a server admin.`
          : `${person.name} is no longer a server admin.`,
      );
    } catch (err) {
      onMessage(errorMessage(err, "Could not change that"), "error");
    }
  };

  const sendReset = async () => {
    try {
      const result = await resetLink.mutateAsync(person.id);
      setIssued(result);
      onMessage(
        result.emailed
          ? `Emailed a reset link to ${person.email}. The link below works too, for one hour.`
          : `Email is not set up${result.emailError ? ` (${result.emailError})` : ""}. Send ${person.name} the link below; it works for one hour.`,
      );
    } catch (err) {
      onMessage(errorMessage(err, "Could not make a reset link"), "error");
    }
  };

  return (
    <li className="admin-person">
      <div className="admin-person-main">
        <strong>
          {person.name}
          {isMe ? <span className="muted"> (you)</span> : null}
        </strong>
        <span className="muted">{person.email}</span>
        <span className="admin-person-meta">
          {person.isInstanceAdmin ? (
            <span className="admin-pill admin-pill--ok">Server admin</span>
          ) : null}
          {person.adminFromEnv ? (
            <span className="setting-env-badge" title="Listed in TEAMFLOW_INSTANCE_ADMINS">
              Set in .env
            </span>
          ) : null}
          <span className="muted">
            {person.teamCount} Flow{person.teamCount === 1 ? "" : "s"} · owns {person.freeSpaces}{" "}
            free · joined {formatTimestamp(person.createdAt)}
          </span>
        </span>
        {issued ? (
          <span className="admin-person-reset">
            <code>{issued.url}</code>
            <button
              type="button"
              className="ghost"
              onClick={() =>
                void copyTextToClipboard(issued.url).then(() => onMessage("Link copied."))
              }
            >
              Copy
            </button>
          </span>
        ) : null}
      </div>
      <div className="admin-person-actions">
        <button
          type="button"
          className="ghost"
          disabled={setAdmin.isPending || (person.isInstanceAdmin && person.adminFromEnv)}
          title={
            person.isInstanceAdmin && person.adminFromEnv
              ? "Listed in TEAMFLOW_INSTANCE_ADMINS in .env"
              : undefined
          }
          onClick={() => void toggleAdmin()}
        >
          {person.isInstanceAdmin ? "Remove admin" : "Make admin"}
        </button>
        <button
          type="button"
          className="ghost"
          disabled={resetLink.isPending}
          onClick={() => void sendReset()}
        >
          Send reset link
        </button>
      </div>
    </li>
  );
}
