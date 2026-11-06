import { useState } from "react";
import { useNavigate } from "react-router";
import { formatStorageBytes, type InstanceSpaceDetailPublic, type SpaceType } from "@teamflow/core";
import { PanelStatus } from "../../components/PanelStatus";
import { adminPath, boardPath, useAppRoute } from "../../lib/appRoute";
import { formatTimestamp } from "../../lib/format";
import { usePanelStatus, type PanelMessage } from "../../lib/panelStatus";
import {
  useCancelSpaceUploadsMutation,
  useEmptySpaceTrashMutation,
  useSpaceQuery,
  useSpaceSettingsQuery,
  useUpdateSpaceMutation,
} from "../../queries/instance";
import { useTeams } from "../../session/session";
import { useConfirm } from "../../ui/confirmContext";
import { useShell } from "../board/shellContext";
import { CapField } from "./CapField";
import { capDraftFrom, capFromDraft, capText, type CapDraft } from "./capBytes";
import { SpaceTypeBadge } from "./SpaceUsage";

const EVENT_LABEL: Record<string, string> = {
  created: "Created",
  cap_changed: "Cap changed",
  type_changed: "Type changed",
  trash_emptied: "Trash emptied",
  uploads_cancelled: "Uploads cancelled",
};

function StorageTile({
  space,
  onMessage,
}: {
  space: InstanceSpaceDetailPublic;
  onMessage: PanelMessage;
}) {
  const confirm = useConfirm();
  const emptyTrash = useEmptySpaceTrashMutation(space.id);
  const cancelUploads = useCancelSpaceUploadsMutation(space.id);
  const { breakdown } = space;
  const scale = Math.max(space.capBytes ?? 0, space.usedBytes, 1);
  const parts = [
    { key: "issues", label: "Issue files", bytes: breakdown.issueFilesBytes },
    { key: "rows", label: "Row files", bytes: breakdown.rowFilesBytes },
    { key: "trash", label: "Trash", bytes: breakdown.trashBytes },
    { key: "uploading", label: "Uploading", bytes: breakdown.uploadingBytes },
  ];
  const usageText =
    space.capBytes === null
      ? `${formatStorageBytes(space.usedBytes)} · no limit`
      : `${formatStorageBytes(space.usedBytes)} of ${formatStorageBytes(space.capBytes)}${space.state === "full" ? " · full" : ` · ${Math.round((space.usedBytes / Math.max(space.capBytes, 1)) * 100)}%`}`;

  const runEmptyTrash = async () => {
    const ok = await confirm({
      title: `Empty the trash of ${space.name}?`,
      message: `${formatStorageBytes(breakdown.trashBytes)} of files are deleted for good now instead of after 7 days.`,
      confirmLabel: "Empty trash",
      danger: true,
    });
    if (!ok) return;
    try {
      const result = await emptyTrash.mutateAsync();
      onMessage(
        `${result.deletedFiles} file(s) deleted, ${formatStorageBytes(result.freedBytes)} freed.`,
      );
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "Could not empty the trash", "error");
    }
  };

  const runCancelUploads = async () => {
    const ok = await confirm({
      title: "Cancel uploads in progress?",
      message: "Their partial files are deleted; the people uploading will have to start again.",
      confirmLabel: "Cancel uploads",
      danger: true,
    });
    if (!ok) return;
    try {
      const result = await cancelUploads.mutateAsync();
      onMessage(`${result.cancelledUploads} upload(s) cancelled.`);
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "Could not cancel uploads", "error");
    }
  };

  return (
    <section className="admin-tile admin-tile--wide" aria-label="Storage">
      <header className="admin-tile-head">
        <h3>Storage</h3>
        <span
          className={`admin-pill admin-pill--${space.state === "ok" ? "off" : space.state === "warn" ? "warn" : "bad"}`}
        >
          {usageText}
        </span>
      </header>
      <div className="admin-bar admin-bar--tall" role="img" aria-label={`Storage: ${usageText}`}>
        {parts.map((part) => (
          <i
            key={part.key}
            className={`admin-bar-${part.key}`}
            style={{ width: `${Math.min(100, (part.bytes / scale) * 100)}%` }}
          />
        ))}
      </div>
      <ul className="admin-legend">
        {parts.map((part) => (
          <li key={part.key} className={`admin-legend-${part.key}`}>
            {part.label} {formatStorageBytes(part.bytes)}
            {part.key === "trash" && space.nextTrashPurgeAt
              ? ` · purges ${formatTimestamp(space.nextTrashPurgeAt)}`
              : ""}
          </li>
        ))}
      </ul>
      <div className="admin-tile-actions">
        <button
          type="button"
          className="ghost danger"
          disabled={breakdown.trashBytes === 0 || emptyTrash.isPending}
          onClick={() => void runEmptyTrash()}
        >
          Empty trash now
        </button>
        <button
          type="button"
          className="ghost"
          disabled={breakdown.uploadingBytes === 0 || cancelUploads.isPending}
          onClick={() => void runCancelUploads()}
        >
          Cancel uploads in progress
        </button>
      </div>
      <h4 className="admin-subhead">Largest files</h4>
      {space.largestFiles.length === 0 ? (
        <p className="settings-hint">No files yet.</p>
      ) : (
        <ul className="admin-files">
          {space.largestFiles.map((file) => (
            <li key={file.fileId}>
              <span className="admin-file-name">
                {file.filename}
                <small>
                  {file.deletedAt ? "In trash" : (file.usedBy ?? "Not linked")} ·{" "}
                  {file.uploaderName} · {formatTimestamp(file.createdAt)}
                </small>
              </span>
              <span>{formatStorageBytes(file.sizeBytes)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CapTile({
  space,
  onMessage,
}: {
  space: InstanceSpaceDetailPublic;
  onMessage: PanelMessage;
}) {
  const update = useUpdateSpaceMutation(space.id);
  const settings = useSpaceSettingsQuery().data;
  const initialCap = capDraftFrom(space.capBytes);
  const [cap, setCap] = useState<CapDraft>(initialCap);
  const [type, setType] = useState<SpaceType>(space.spaceType);
  const capBytes = capFromDraft(cap);
  // Compare the text, not bytes: GB text rounds, so re-parsing it would look like a change.
  const capChanged =
    capBytes !== "invalid" &&
    (cap.noLimit !== initialCap.noLimit || (!cap.noLimit && cap.gbText !== initialCap.gbText));
  const typeChanged = type !== space.spaceType;
  const dirty = capChanged || typeChanged;
  const underUse = typeof capBytes === "number" && capBytes < space.usedBytes;

  const save = async () => {
    if (!dirty || capBytes === "invalid") return;
    try {
      await update.mutateAsync({
        ...(typeChanged ? { spaceType: type } : {}),
        ...(capChanged ? { capBytes } : {}),
      });
      onMessage(`Saved: ${type === "free" ? "free" : "admin"} space, cap ${capText(capBytes)}.`);
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "Could not save", "error");
    }
  };

  const ownerName = space.owner?.name ?? "the owner";
  return (
    <section className="admin-tile" aria-label="Upload cap">
      <header className="admin-tile-head">
        <h3>Upload cap</h3>
      </header>
      <CapField label="Cap" value={cap} onChange={setCap} />
      {underUse ? (
        <p className="settings-hint settings-hint--warn">
          Under the {formatStorageBytes(space.usedBytes)} already used: new uploads stop until files
          are removed. Nothing is deleted.
        </p>
      ) : null}
      <fieldset className="admin-seg-field">
        <legend className="settings-field-label">Type</legend>
        <span className="admin-seg">
          {(["admin", "free"] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={type === option ? "active" : undefined}
              aria-pressed={type === option}
              onClick={() => setType(option)}
            >
              {option === "admin" ? "Admin" : "Free"}
            </button>
          ))}
        </span>
      </fieldset>
      <p className="settings-field-hint">
        {type === "admin"
          ? `Admin: does not count toward ${ownerName}'s free spaces.`
          : `Free: counts toward ${ownerName}'s free spaces${space.ownerFreeSpaces !== null && settings ? ` (${space.ownerFreeSpaces} of ${settings.freeSpacesPerUser} now)` : ""}.`}
        {settings && type === "free" && space.spaceType !== "free" && cap.noLimit
          ? ` With no cap set it gets the free-space default, ${formatStorageBytes(settings.freeSpaceCapBytes)}.`
          : ""}
      </p>
      <div className="admin-tile-actions">
        <button
          type="button"
          disabled={!dirty || capBytes === "invalid" || update.isPending}
          onClick={() => void save()}
        >
          {update.isPending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          className="ghost"
          disabled={!dirty}
          onClick={() => {
            setCap(initialCap);
            setType(space.spaceType);
          }}
        >
          Reset
        </button>
      </div>
    </section>
  );
}

/** One space: usage breakdown, largest files, cap and type editing, history. */
export function SpaceDetailPanel() {
  const navigate = useNavigate();
  const { adminSpaceId } = useAppRoute();
  const { teamKey } = useShell();
  const { teams } = useTeams();
  const query = useSpaceQuery(adminSpaceId);
  const { status, onMessage } = usePanelStatus();
  const space = query.data;
  const memberTeam = space ? teams.find((team) => team.id === space.id) : undefined;

  const back = (
    <button
      type="button"
      className="admin-link"
      onClick={() => navigate(adminPath(teamKey, "spaces"))}
    >
      ← Spaces
    </button>
  );

  if (query.isError || (!space && !query.isLoading)) {
    return (
      <div className="settings-panel">
        {back}
        <p className="settings-hint settings-hint--warn" role="alert">
          {query.error instanceof Error ? query.error.message : "Space not found."}
        </p>
      </div>
    );
  }
  if (!space) {
    return (
      <div className="settings-panel">
        {back}
        <p className="settings-hint">Loading…</p>
      </div>
    );
  }

  return (
    <div className="settings-panel">
      <header className="settings-panel-header">
        {back}
        <div className="settings-panel-title-row">
          <h2>{space.name}</h2>
          <SpaceTypeBadge type={space.spaceType} />
          <span className="admin-pill admin-pill--off">{space.key}</span>
          {memberTeam ? (
            <button
              type="button"
              className="ghost"
              onClick={() => navigate(boardPath(memberTeam.key))}
            >
              Open board
            </button>
          ) : null}
        </div>
        <p className="settings-copy settings-lead">
          Owner {space.owner?.name ?? "unknown"} · {space.memberCount} member
          {space.memberCount === 1 ? "" : "s"} · {space.issueCount} issue
          {space.issueCount === 1 ? "" : "s"} · created {formatTimestamp(space.createdAt)}
        </p>
      </header>
      <PanelStatus status={status} />
      <div className="admin-grid">
        <StorageTile space={space} onMessage={onMessage} />
        <CapTile key={`${space.capBytes}-${space.spaceType}`} space={space} onMessage={onMessage} />
        <section className="admin-tile admin-tile--full" aria-label="History">
          <header className="admin-tile-head">
            <h3>History</h3>
          </header>
          {space.events.length === 0 ? (
            <p className="settings-hint">No changes yet.</p>
          ) : (
            <dl className="admin-facts">
              {space.events.map((event) => (
                <div key={event.id}>
                  <dt>{formatTimestamp(event.createdAt)}</dt>
                  <dd>
                    {EVENT_LABEL[event.kind] ?? event.kind}
                    {event.detail ? `: ${event.detail}` : ""}
                    {event.actorName ? ` · by ${event.actorName}` : ""}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      </div>
    </div>
  );
}
