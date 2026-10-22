import { useCallback, useRef, useState } from "react";
import { PRIORITIES, PRIORITY_LABELS, type Priority } from "@teamflow/core";
import { Popover } from "../ui/Popover";

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
  const triggerRef = useRef<HTMLButtonElement>(null);

  const closePanel = useCallback(() => {
    setOpen(false);
  }, []);

  function stopBubble(event: React.SyntheticEvent) {
    event.stopPropagation();
  }

  function choose(next: Priority) {
    onSelect(next);
    closePanel();
  }

  const triggerLabel = priority === "none" ? "—" : priority;
  const triggerTitle =
    priority === "none" ? "Set priority" : `${PRIORITY_LABELS[priority]} priority`;

  const panel = (
    <Popover
      open={open}
      onClose={closePanel}
      anchorRef={triggerRef}
      placement="bottom-end"
      width={floatingPanel ? 200 : undefined}
      className={`priority-picker-panel ${floatingPanel ? "priority-picker-panel--floating" : ""}`.trim()}
      positionedClassName="priority-picker-panel--positioned"
      label={title}
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
    </Popover>
  );

  return (
    <div
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

      {panel}
    </div>
  );
}
