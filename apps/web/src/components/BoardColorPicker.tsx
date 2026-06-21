import { BOARD_COLOR_PRESETS } from "@teamflow/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFloatingPanelStyle } from "../hooks/useFloatingPanelStyle";

type BoardColorPickerProps = {
  color: string | null;
  onSelect: (color: string | null) => void;
  title?: string;
  label?: string;
  hint?: string;
  compact?: boolean;
  floatingPanel?: boolean;
  className?: string;
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
}: BoardColorPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const useFloating = compact || floatingPanel;
  const panelStyle = useFloatingPanelStyle(open && useFloating, triggerRef, "auto");
  const panelPositioned = Boolean(panelStyle.position);

  const closePanel = useCallback(() => {
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;

    function handleClick(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (useFloating && panelRef.current?.contains(target)) return;
      closePanel();
    }

    window.addEventListener("click", handleClick, true);
    return () => window.removeEventListener("click", handleClick, true);
  }, [open, useFloating, closePanel]);

  function stopBubble(event: React.SyntheticEvent) {
    event.stopPropagation();
  }

  function choose(next: string | null) {
    onSelect(next);
    closePanel();
  }

  const panel = open ? (
    <div
      ref={panelRef}
      className={`color-picker-panel ${useFloating ? "color-picker-panel--floating" : ""} ${panelPositioned ? "color-picker-panel--positioned" : ""}`.trim()}
      style={useFloating ? panelStyle : undefined}
      onPointerDown={stopBubble}
      onClick={stopBubble}
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
    </div>
  ) : null;

  return (
    <div
      ref={rootRef}
      className={`color-picker ${compact ? "color-picker--compact" : ""} ${open ? "open" : ""} ${className}`.trim()}
      onPointerDown={stopBubble}
      onClick={stopBubble}
    >
      <button
        ref={triggerRef}
        type="button"
        className="color-picker-trigger"
        onClick={() => setOpen((value) => !value)}
        title={title}
        aria-label={title}
        aria-expanded={open}
      >
        <span
          className="color-swatch"
          style={{ background: color ?? "var(--border)" }}
        />
        {!compact ? (
          <>
            <span className="color-picker-label">{label}</span>
            <span className="assignee-picker-caret">{open ? "▴" : "▾"}</span>
          </>
        ) : null}
      </button>

      {useFloating && panel ? createPortal(panel, document.body) : panel}
    </div>
  );
}
