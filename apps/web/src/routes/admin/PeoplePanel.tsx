import { useRef, useState } from "react";
import {
  SERVER_POWERS,
  SERVER_POWER_HINTS,
  SERVER_POWER_LABELS,
  type InstanceUserPublic,
  type PasswordResetIssuedPublic,
  type ServerAdminPublic,
  type ServerPower,
} from "@teamflow/core";
import { PanelStatus } from "../../components/PanelStatus";
import { copyTextToClipboard } from "../../lib/clipboard";
import { errorMessage } from "../../lib/errorSink";
import { formatTimestamp } from "../../lib/format";
import { usePanelStatus } from "../../lib/panelStatus";
import { hasServerPower, isServerOwner } from "../../lib/serverAccess";
import {
  useInstanceUsersQuery,
  useIssueResetLinkMutation,
  useRemoveServerAdminMutation,
  useServerAdminsQuery,
  useSetServerAdminMutation,
  useTransferOwnershipMutation,
} from "../../queries/instance";
import { useSession } from "../../session/session";
import { Dialog } from "../../ui/Dialog";
import { DialogTitle } from "../../ui/DialogTitle";
import { useConfirm } from "../../ui/confirmContext";

type OnMessage = ReturnType<typeof usePanelStatus>["onMessage"];

/**
 * Who runs the server, and everyone with an account. The Server Owner sees the trusted admin list
 * (tick each power), Transfer ownership, and everyone; a trusted admin with the People power sees
 * everyone and can send reset links.
 */
export function PeoplePanel() {
  const { user } = useSession();
  const owner = isServerOwner(user);
  const canSeePeople = hasServerPower(user, "people");
  const { status, onMessage } = usePanelStatus();
  return (
    <div className="settings-panel">
      <header className="settings-panel-header">
        <h2>People</h2>
        <p className="settings-copy settings-lead">
          {owner
            ? "Who runs this server, and everyone with an account."
            : "Everyone with an account on this server."}
        </p>
      </header>
      <PanelStatus status={status} />
      {owner ? <ServerAdmins onMessage={onMessage} /> : null}
      {canSeePeople ? <Everyone onMessage={onMessage} /> : null}
    </div>
  );
}

/* ---------- Server Owner and trusted admins (Owner only) ---------- */

function ServerAdmins({ onMessage }: { onMessage: OnMessage }) {
  const admins = useServerAdminsQuery();
  const [transferOpen, setTransferOpen] = useState(false);
  const list = admins.data ?? [];
  const owner = list.find((admin) => admin.role === "owner");
  const trusted = list.filter((admin) => admin.role === "admin");

  return (
    <>
      <section className="settings-section admin-owner" aria-label="Server Owner">
        <h3>Server Owner</h3>
        {owner ? (
          <div className="admin-person">
            <div className="admin-person-main">
              <strong>
                {owner.name} <span className="admin-pill admin-pill--owner">Owner</span>
              </strong>
              <span className="muted">{owner.email}</span>
              <span className="settings-field-hint">
                Every power. Only the Owner adds trusted admins, changes their powers, transfers
                ownership and deletes Flows for good.
              </span>
            </div>
            <div className="admin-person-actions">
              <button
                type="button"
                className="ghost"
                disabled={list.length < 2}
                title={list.length < 2 ? "Add a trusted admin first" : undefined}
                onClick={() => setTransferOpen(true)}
              >
                Transfer ownership…
              </button>
            </div>
          </div>
        ) : (
          <p className="settings-hint">Loading…</p>
        )}
      </section>

      <section className="settings-section" aria-label="Trusted admins">
        <h3>Trusted admins</h3>
        <p className="settings-copy">
          Tick what each person may do. With nothing ticked they have no Server admin access.
        </p>
        {trusted.length === 0 ? (
          <p className="settings-hint">No trusted admins yet.</p>
        ) : (
          <ul className="admin-people" aria-label="Trusted admins">
            {trusted.map((admin) => (
              <TrustedAdminRow key={admin.id} admin={admin} onMessage={onMessage} />
            ))}
          </ul>
        )}
        <AddTrustedAdmin admins={list} onMessage={onMessage} />
      </section>

      {transferOpen && owner ? (
        <TransferDialog
          candidates={trusted}
          onClose={() => setTransferOpen(false)}
          onMessage={onMessage}
        />
      ) : null}
    </>
  );
}

function TrustedAdminRow({ admin, onMessage }: { admin: ServerAdminPublic; onMessage: OnMessage }) {
  const confirm = useConfirm();
  const setPowers = useSetServerAdminMutation();
  const remove = useRemoveServerAdminMutation();
  const locked = admin.fromEnv;

  const toggle = async (power: ServerPower, on: boolean) => {
    const next = on ? [...admin.powers, power] : admin.powers.filter((p) => p !== power);
    try {
      await setPowers.mutateAsync({ userId: admin.id, powers: next });
      onMessage(
        `${admin.name} ${on ? "can now use" : "can no longer use"} ${SERVER_POWER_LABELS[power]}.`,
      );
    } catch (err) {
      onMessage(errorMessage(err, "Could not change that"), "error");
    }
  };

  const removeAdmin = async () => {
    const ok = await confirm({
      title: `Remove ${admin.name} as a trusted admin?`,
      message: "They lose all Server admin access. Their Flows and memberships stay as they are.",
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(admin.id);
      onMessage(`${admin.name} is no longer a trusted admin.`);
    } catch (err) {
      onMessage(errorMessage(err, "Could not remove"), "error");
    }
  };

  return (
    <li className="admin-person admin-trusted">
      <div className="admin-person-main">
        <strong>
          {admin.name}{" "}
          {locked ? (
            <span className="setting-env-badge" title="Listed in TEAMFLOW_INSTANCE_ADMINS">
              Set in .env
            </span>
          ) : null}
        </strong>
        <span className="muted">{admin.email}</span>
        <fieldset className="admin-powers" disabled={locked || setPowers.isPending}>
          <legend className="sr-only">Powers for {admin.name}</legend>
          {SERVER_POWERS.map((power) => (
            <label key={power} className="settings-checkbox" title={SERVER_POWER_HINTS[power]}>
              <input
                type="checkbox"
                checked={admin.powers.includes(power)}
                onChange={(e) => void toggle(power, e.target.checked)}
              />
              {SERVER_POWER_LABELS[power]}
            </label>
          ))}
        </fieldset>
      </div>
      <div className="admin-person-actions">
        {locked ? null : (
          <button
            type="button"
            className="ghost danger"
            disabled={remove.isPending}
            onClick={() => void removeAdmin()}
          >
            Remove
          </button>
        )}
      </div>
    </li>
  );
}

function AddTrustedAdmin({
  admins,
  onMessage,
}: {
  admins: ServerAdminPublic[];
  onMessage: OnMessage;
}) {
  const [search, setSearch] = useState("");
  const users = useInstanceUsersQuery(search.trim(), search.trim().length > 0, 20);
  const add = useSetServerAdminMutation();
  const listed = new Set(admins.map((admin) => admin.id));
  const candidates = (users.data ?? []).filter((person) => !listed.has(person.id)).slice(0, 6);

  const addPerson = async (person: InstanceUserPublic) => {
    try {
      await add.mutateAsync({ userId: person.id, powers: [] });
      setSearch("");
      onMessage(`${person.name} is a trusted admin. Tick what they may do.`);
    } catch (err) {
      onMessage(errorMessage(err, "Could not add"), "error");
    }
  };

  return (
    <div className="admin-add-trusted">
      <label className="settings-field">
        <span className="settings-field-label">Add a trusted admin</span>
        <input
          type="search"
          value={search}
          placeholder="Name or email"
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      {candidates.length > 0 ? (
        <ul className="admin-add-candidates" aria-label="Matching accounts">
          {candidates.map((person) => (
            <li key={person.id}>
              <span>
                {person.name} <span className="muted">{person.email}</span>
              </span>
              <button
                type="button"
                className="ghost"
                disabled={add.isPending}
                onClick={() => void addPerson(person)}
              >
                Add
              </button>
            </li>
          ))}
        </ul>
      ) : search.trim() && users.isSuccess ? (
        <p className="settings-hint">Nobody else matches.</p>
      ) : null}
    </div>
  );
}

function TransferDialog({
  candidates,
  onClose,
  onMessage,
}: {
  candidates: ServerAdminPublic[];
  onClose: () => void;
  onMessage: OnMessage;
}) {
  const transfer = useTransferOwnershipMutation();
  const { refreshSession } = useSession();
  const selectRef = useRef<HTMLSelectElement>(null);
  const [userId, setUserId] = useState(candidates[0]?.id ?? "");
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const target = candidates.find((admin) => admin.id === userId);
  const matches = Boolean(target) && typed.trim().toLowerCase() === target!.email.toLowerCase();

  const submit = async () => {
    if (!target || !matches) return;
    setError(null);
    try {
      await transfer.mutateAsync({ userId: target.id, confirmEmail: typed.trim() });
      onMessage(
        `${target.name} is now the Server Owner. You stay a trusted admin with every power.`,
      );
      onClose();
      // This session's role changed: re-read it so the Owner-only parts go away.
      await refreshSession();
    } catch (err) {
      setError(errorMessage(err, "Could not transfer ownership"));
    }
  };

  return (
    <Dialog
      onClose={onClose}
      backdropClassName="quick-add-backdrop"
      className="quick-add-modal admin-dialog"
      as="form"
      initialFocusRef={selectRef}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <DialogTitle>Transfer ownership</DialogTitle>
      <label className="settings-field">
        <span className="settings-field-label">New Server Owner</span>
        <select
          ref={selectRef}
          value={userId}
          onChange={(e) => {
            setUserId(e.target.value);
            setTyped("");
          }}
        >
          {candidates.map((admin) => (
            <option key={admin.id} value={admin.id}>
              {admin.name} ({admin.email})
            </option>
          ))}
        </select>
      </label>
      {target ? (
        <>
          <p className="settings-copy">
            {target.name} becomes the Server Owner with every power. You stay a trusted admin with
            all seven powers, but you can no longer add or remove admins, transfer ownership or
            delete Flows for good. Only {target.name} can give ownership back.
          </p>
          <label className="settings-field">
            <span className="settings-field-label">Type {target.email} to confirm</span>
            <input
              value={typed}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setTyped(e.target.value)}
            />
          </label>
        </>
      ) : null}
      {error ? (
        <p className="settings-hint settings-hint--warn" role="alert">
          {error}
        </p>
      ) : null}
      <div className="quick-add-actions">
        <button type="button" className="ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="danger" disabled={!matches || transfer.isPending}>
          {transfer.isPending ? "Transferring…" : "Transfer ownership"}
        </button>
      </div>
    </Dialog>
  );
}

/* ---------- Everyone (People power) ---------- */

function Everyone({ onMessage }: { onMessage: OnMessage }) {
  const [search, setSearch] = useState("");
  const query = useInstanceUsersQuery(search.trim(), true, 500);
  const people = query.data ?? [];
  return (
    <section className="settings-section" aria-label="Everyone">
      <h3>Everyone</h3>
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
    </section>
  );
}

function PersonRow({ person, onMessage }: { person: InstanceUserPublic; onMessage: OnMessage }) {
  const { user } = useSession();
  const resetLink = useIssueResetLinkMutation();
  const [issued, setIssued] = useState<PasswordResetIssuedPublic | null>(null);
  const isMe = person.id === user?.id;

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
          {person.serverRole === "owner" ? (
            <span className="admin-pill admin-pill--owner">Server Owner</span>
          ) : person.serverRole === "admin" ? (
            <span className="admin-pill admin-pill--ok">Trusted admin</span>
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
          disabled={resetLink.isPending}
          onClick={() => void sendReset()}
        >
          Send reset link
        </button>
      </div>
    </li>
  );
}
