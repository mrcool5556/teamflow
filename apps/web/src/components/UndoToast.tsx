import { UNDO_DELAY_MS } from "../hooks/useChangeHistory";

type UndoToastProps = {
  label: string;
  historyCount: number;
  historyOpen: boolean;
  onUndo: () => void;
  onToggleHistory: () => void;
};

export function UndoToast({
  label,
  historyCount,
  historyOpen,
  onUndo,
  onToggleHistory,
}: UndoToastProps) {
  return (
    <div className="undo-toast" role="status" aria-live="polite">
      <div
        className="undo-toast-progress"
        style={{ animationDuration: `${UNDO_DELAY_MS}ms` }}
      />
      <span className="undo-toast-label">{label}</span>
      <button
        type="button"
        className={`undo-toast-history ${historyOpen ? "active" : ""}`}
        onClick={onToggleHistory}
      >
        History{historyCount > 0 ? ` (${historyCount})` : ""}
      </button>
      <button type="button" className="undo-toast-btn" onClick={onUndo}>
        Undo
      </button>
    </div>
  );
}
