import { PRIORITIES, PRIORITY_LABELS, type Priority } from "@teamflow/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFloatingPanelStyle } from "../hooks/useFloatingPanelStyle";

type PriorityPickerProps = {
  priority: Priority;
  onSelect: (priority: Priority) => void;
  title?: string;
  compact?: boolean;
  floatingPanel?: boolean;
  disabled?: boolean;
};

export function PriorityPicker({
  priority,
  onSelect,
  title = "Priority",
  compact = true,
  floatingPanel = false,
  disabled = false,
}: PriorityPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelStyle = useFloatingPanelStyle(open && floatingPanel, triggerRef, "auto", "right", 200);
  const panelPositioned = Boolean(panelStyle.position);

  const closePanel = useCallback(() => {
    setOpen(false);
  }, []);

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

  function stopBubble(event: React.SyntheticEvent) {
    event.stopPropagation();
  }

  function choose(next: Priority) {
    onSelect(next);
    closePanel();
  }

  const triggerLabel =
    priority === "none" ? "—" : priority;
  const triggerTitle =
    priority === "none"
      ? "Set priority"
      : `${PRIORITY_LABELS[priority]} priority`;

  const panel = open ? (
    <div
      ref={panelRef}
      className={`priority-picker-panel ${floatingPanel ? "priority-picker-panel--floating" : ""} ${panelPositioned ? "priority-picker-panel--positioned" : ""}`.trim()}
      style={floatingPanel ? panelStyle : undefined}
      onPointerDown={stopBubble}
      onClick={stopBubble}
    >
      <strong>{title}</strong>
      <div className="priority-picker-list">
        {PRIORITIES.map((item) => (
          <button
            key={item}
            type="button"
            className={`priority-picker-option ${priority === item ? "active" : ""}`}
            onPointerDown={stopBubble}
            onClick={() => choose(item)}
          >
            <span className={`priority-badge priority-${item}`}>
              {item === "none" ? "None" : item}
            </span>
            <span className="priority-picker-option-label">{PRIORITY_LABELS[item]}</span>
            <span className="priority-picker-option-check">{priority === item ? "✓" : ""}</span>
          </button>
        ))}
      </div>
    </div>
  ) : null;

  return (
    <div
      ref={rootRef}
      className={`priority-picker ${compact ? "priority-picker--compact" : ""} ${open ? "open" : ""}`.trim()}
      onPointerDown={stopBubble}
      onClick={stopBubble}
    >
      <button
        ref={triggerRef}
        type="button"
        className={`priority-badge priority-${priority} priority-picker-trigger ${compact ? "compact" : ""}`}
        disabled={disabled}
        title={triggerTitle}
        aria-label={triggerTitle}
        aria-expanded={open}
        onClick={() => {
          if (disabled) return;
          setOpen((value) => !value);
        }}
      >
        {triggerLabel}
      </button>

      {floatingPanel && panel && panelPositioned
        ? createPortal(panel, document.body)
        : !floatingPanel
          ? panel
          : null}
    </div>
  );
}
