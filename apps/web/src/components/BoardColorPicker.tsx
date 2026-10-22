import { BOARD_COLOR_PRESETS } from "@teamflow/core";
import { useCallback, useRef, useState } from "react";
import { Popover } from "../ui/Popover";

type BoardColorPickerProps = {
  color: string | null;
  onSelect: (color: string | null) => void;
  title?: string;
  label?: string;
  hint?: string;
  compact?: boolean;
  floatingPanel?: boolean;
  className?: string;
  disabled?: boolean;
};

export function BoardColorPicker({
  color,
  onSelect,
  title = "Color",
  label = "Color",
  hint,
  compact = false,
  floatingPanel = false,
  className = "",
  disabled = false,
}: BoardColorPickerProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const useFloating = compact || floatingPanel;

  const closePanel = useCallback(() => {
    setOpen(false);
  }, []);

  function stopBubble(event: React.SyntheticEvent) {
    event.stopPropagation();
  }

  function choose(next: string | null) {
    onSelect(next);
    closePanel();
  }

  const panel = (
    <Popover
      open={open}
      onClose={closePanel}
      anchorRef={triggerRef}
      width={useFloating ? 280 : undefined}
      maxWidth={320}
      className={`color-picker-panel ${useFloating ? "color-picker-panel--floating" : ""}`.trim()}
      positionedClassName="color-picker-panel--positioned"
      label={title}
    >
      <strong>{title}</strong>
      {hint ? <p className="muted">{hint}</p> : null}
      <div className="color-picker-grid">
        {BOARD_COLOR_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            className={`color-picker-option ${color === preset ? "active" : ""}`}
            style={{ background: preset }}
            title={preset}
            onPointerDown={stopBubble}
            onClick={() => choose(preset)}
          />
        ))}
        <button
          type="button"
          className={`color-picker-option clear ${color === null ? "active" : ""}`}
          onPointerDown={stopBubble}
          onClick={() => choose(null)}
        >
          None
        </button>
      </div>
    </Popover>
  );

  return (
    <div
      className={`color-picker ${compact ? "color-picker--compact" : ""} ${open ? "open" : ""} ${className}`.trim()}
      onPointerDown={stopBubble}
      onClick={stopBubble}
    >
      <button
        ref={triggerRef}
        type="button"
        className="color-picker-trigger"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        title={title}
        aria-label={title}
        aria-expanded={open}
      >
        <span className="color-swatch" style={{ background: color ?? "var(--border)" }} />
        {!compact ? (
          <>
            <span className="color-picker-label">{label}</span>
            <span className="assignee-picker-caret">{open ? "▴" : "▾"}</span>
          </>
        ) : null}
      </button>

      {panel}
    </div>
  );
}
