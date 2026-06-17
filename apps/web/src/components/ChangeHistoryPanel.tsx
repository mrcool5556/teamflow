import type { ChangeHistoryEntry } from "../hooks/useChangeHistory";

function formatRelativeTime(timestamp: number) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(timestamp).toLocaleString();
}

function formatRestoreDeadline(timestamp: number) {
  const days = Math.ceil((timestamp - Date.now()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "expired";
  if (days === 1) return "1 day left";
  return `${days} days left`;
}

const STATUS_LABEL: Record<ChangeHistoryEntry["status"], string> = {
  pending: "Undo available",
  committed: "Saved",
  undone: "Undone",
  failed: "Failed",
  restored: "Restored",
};

type ChangeHistoryPanelProps = {
  entries: ChangeHistoryEntry[];
  pendingId: string | null;
  open: boolean;
  onClose: () => void;
  onUndo: (id: string) => void;
  onRestore: (id: string) => void;
};

export function ChangeHistoryPanel({
  entries,
  pendingId,
  open,
  onClose,
  onUndo,
  onRestore,
}: ChangeHistoryPanelProps) {
  if (!open || entries.length === 0) return null;

  return (
    <div className="change-history-backdrop" onClick={onClose}>
      <section
        className="change-history-panel"
        role="dialog"
        aria-label="Recent edits"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="change-history-header">
          <div>
            <p className="eyebrow">Recent edits</p>
            <h2>Change history</h2>
          </div>
          <button type="button" className="ghost" onClick={onClose}>
            Close
          </button>
        </header>

        <ul className="change-history-list">
          {entries.map((entry) => {
            const isPending = entry.status === "pending";
            const isActive = entry.id === pendingId;
            const canRestore =
              entry.status === "committed" &&
              entry.restorableUntil != null &&
              entry.restorableUntil > Date.now();
            return (
              <li
                key={entry.id}
                className={`change-history-item change-history-item--${entry.status}${
                  isActive && isPending ? " change-history-item--active" : ""
                }`}
              >
                <div className="change-history-item-main">
                  <span className="change-history-label">{entry.label}</span>
                  <span className="change-history-time">
                    {formatRelativeTime(entry.createdAt)}
                  </span>
                </div>
                <div className="change-history-item-meta">
                  <span
                    className={`change-history-status change-history-status--${entry.status}`}
                  >
                    {canRestore && entry.restorableUntil
                      ? `Restore · ${formatRestoreDeadline(entry.restorableUntil)}`
                      : STATUS_LABEL[entry.status]}
                  </span>
                  {isPending && (
                    <button
                      type="button"
                      className="change-history-undo"
                      onClick={() => onUndo(entry.id)}
                    >
                      Undo
                    </button>
                  )}
                  {canRestore && (
                    <button
                      type="button"
                      className="change-history-restore"
                      onClick={() => onRestore(entry.id)}
                    >
                      Restore
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
