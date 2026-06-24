import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { TeamMemberPublic } from "@teamflow/core";
import { useFloatingPanelStyle } from "../hooks/useFloatingPanelStyle";
import { initials } from "../lib/timer";

type MultiAssigneePickerProps = {
  members: TeamMemberPublic[];
  assigneeIds: string[];
  onChange: (userIds: string[]) => void;
  label?: string;
  compact?: boolean;
  panelPlacement?: "bottom" | "top" | "auto";
  floatingPanel?: boolean;
  disabled?: boolean;
};

export function MultiAssigneePicker({
  members,
  assigneeIds,
  onChange,
  label = "Assign",
  compact = false,
  panelPlacement = "bottom",
  floatingPanel = false,
  disabled = false,
}: MultiAssigneePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelStyle = useFloatingPanelStyle(
    open && floatingPanel,
    triggerRef,
    panelPlacement === "top" ? "top" : panelPlacement === "bottom" ? "bottom" : "auto",
  );
  const panelPositioned = Boolean(panelStyle.position);

  const closePanel = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  const selected = members.filter((member) => assigneeIds.includes(member.userId));
  const selectedLabel =
    selected.length === 0
      ? null
      : selected.length === 1
        ? selected[0]!.name
        : `${selected[0]!.name} +${selected.length - 1}`;

  useEffect(() => {
    if (!open) return;

    function handleClick(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (floatingPanel && panelRef.current?.contains(target)) return;
      closePanel();
    }

    window.addEventListener("click", handleClick, true);
    return () => window.removeEventListener("click", handleClick, true);
  }, [open, floatingPanel, closePanel]);

  const filtered = members.filter((member) => {
    const hay = `${member.name} ${member.email}`.toLowerCase();
    return hay.includes(query.trim().toLowerCase());
  });

  function toggleMember(userId: string) {
    if (assigneeIds.includes(userId)) {
      onChange(assigneeIds.filter((id) => id !== userId));
      return;
    }
    onChange([...assigneeIds, userId]);
  }

  const panel = open ? (
    <div
      ref={panelRef}
      className={`assignee-picker-panel ${floatingPanel ? "assignee-picker-panel--floating" : ""} ${panelPositioned ? "assignee-picker-panel--positioned" : ""}`}
      style={floatingPanel ? panelStyle : undefined}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="assignee-picker-head">
        <strong>Assign people</strong>
        <button type="button" className="ghost assignee-picker-close" onClick={closePanel}>
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
          className={`assignee-option ${assigneeIds.length === 0 ? "active" : ""}`}
          onClick={() => onChange([])}
        >
          <span className="assignee-avatar">—</span>
          <span>
            <span className="assignee-option-name">Unassigned</span>
            <span className="assignee-option-meta">Clear all assignments</span>
          </span>
        </button>
        {filtered.map((member) => {
          const active = assigneeIds.includes(member.userId);
          return (
            <button
              key={member.userId}
              type="button"
              className={`assignee-option ${active ? "active" : ""}`}
              onClick={() => toggleMember(member.userId)}
            >
              <span className="assignee-avatar filled">{initials(member.name)}</span>
              <span>
                <span className="assignee-option-name">{member.name}</span>
                <span className="assignee-option-meta">{member.email}</span>
              </span>
              <span className="assignee-option-check">{active ? "✓" : ""}</span>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <p className="assignee-picker-empty">No matching members.</p>
        )}
      </div>
    </div>
  ) : null;

  return (
    <div
      ref={rootRef}
      className={`assignee-picker multi ${open ? "open" : ""} ${panelPlacement === "top" ? "assignee-picker--panel-top" : ""}`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        ref={triggerRef}
        type="button"
        className={`assignee-picker-trigger ${compact ? "compact" : ""}`}
        disabled={disabled}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          if (disabled) return;
          setOpen((value) => !value);
        }}
        title={
          selected.length > 0
            ? `Assigned: ${selected.map((m) => m.name).join(", ")}`
            : "Assign people"
        }
      >
        <span className="assignee-avatar-stack">
          {selected.length === 0 ? (
            <span className="assignee-avatar">+</span>
          ) : (
            selected.slice(0, 3).map((member) => (
              <span key={member.userId} className="assignee-avatar filled stacked">
                {initials(member.name)}
              </span>
            ))
          )}
        </span>
        {!compact && (
          <>
            <span className="assignee-picker-label">{selectedLabel ?? label}</span>
            <span className="assignee-picker-caret">{open ? "▴" : "▾"}</span>
          </>
        )}
      </button>

      {floatingPanel && panel && panelPositioned
        ? createPortal(panel, document.body)
        : !floatingPanel
          ? panel
          : null}
    </div>
  );
}

type ToolbarUsersReadonlyProps = {
  members: TeamMemberPublic[];
  userIds: string[];
  label?: string;
  title?: string;
};

export function ToolbarUsersReadonly({
  members,
  userIds,
  label = "Users",
  title,
}: ToolbarUsersReadonlyProps) {
  const selected = members.filter((member) => userIds.includes(member.userId));

  return (
    <div className="toolbar-users toolbar-users--readonly" title={title}>
      <span className="toolbar-users-label">{label}</span>
      <span className="assignee-avatar-stack" aria-hidden>
        {selected.length === 0 ? (
          <span className="assignee-avatar">—</span>
        ) : (
          selected.slice(0, 3).map((member) => (
            <span key={member.userId} className="assignee-avatar filled stacked">
              {initials(member.name)}
            </span>
          ))
        )}
      </span>
    </div>
  );
}
