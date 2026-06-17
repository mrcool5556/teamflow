import { useEffect, useRef, useState } from "react";
import type { TeamMemberPublic } from "@teamflow/core";
import { initials } from "../lib/timer";

type AssigneePickerProps = {
  members: TeamMemberPublic[];
  assigneeId: string | null;
  assigneeName: string | null;
  onSelect: (userId: string | null) => void;
  label?: string;
  compact?: boolean;
};

export function AssigneePicker({
  members,
  assigneeId,
  assigneeName,
  onSelect,
  label = "Assign",
  compact = false,
}: AssigneePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  const filtered = members.filter((member) => {
    const hay = `${member.name} ${member.email}`.toLowerCase();
    return hay.includes(query.trim().toLowerCase());
  });

  return (
    <div
      ref={rootRef}
      className={`assignee-picker ${open ? "open" : ""}`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className={`assignee-picker-trigger ${compact ? "compact" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((value) => !value);
        }}
        title={assigneeName ? `Assigned: ${assigneeName}` : "Assign someone"}
      >
        <span className={`assignee-avatar ${assigneeName ? "filled" : ""}`}>
          {assigneeName ? initials(assigneeName) : "+"}
        </span>
        {!compact && (
          <>
            <span className="assignee-picker-label">
              {assigneeName ?? label}
            </span>
            <span className="assignee-picker-caret">{open ? "▴" : "▾"}</span>
          </>
        )}
      </button>

      {open && (
        <div className="assignee-picker-panel">
          <div className="assignee-picker-head">
            <strong>Team members</strong>
            <button
              type="button"
              className="ghost assignee-picker-close"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>
          <input
            className="assignee-picker-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people…"
          />
          <div className="assignee-picker-list">
            <button
              type="button"
              className={`assignee-option ${assigneeId === null ? "active" : ""}`}
              onClick={() => {
                onSelect(null);
                setOpen(false);
              }}
            >
              <span className="assignee-avatar">—</span>
              <span>
                <span className="assignee-option-name">Unassigned</span>
                <span className="assignee-option-meta">Clear assignment</span>
              </span>
            </button>
            {filtered.map((member) => (
              <button
                key={member.userId}
                type="button"
                className={`assignee-option ${assigneeId === member.userId ? "active" : ""}`}
                onClick={() => {
                  onSelect(member.userId);
                  setOpen(false);
                }}
              >
                <span className="assignee-avatar filled">{initials(member.name)}</span>
                <span>
                  <span className="assignee-option-name">{member.name}</span>
                  <span className="assignee-option-meta">{member.email}</span>
                </span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="assignee-picker-empty">No matching members.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
