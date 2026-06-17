import { ROW_COLOR_PRESETS } from "@teamflow/core";
import { useEffect, useRef, useState } from "react";

type RowColorPickerProps = {
  color: string | null;
  onSelect: (color: string | null) => void;
};

export function RowColorPicker({ color, onSelect }: RowColorPickerProps) {
  const [open, setOpen] = useState(false);
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

  return (
    <div
      ref={rootRef}
      className={`color-picker ${open ? "open" : ""}`}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="color-picker-trigger"
        onClick={() => setOpen((value) => !value)}
        title="Row color"
      >
        <span
          className="color-swatch"
          style={{ background: color ?? "var(--border)" }}
        />
        <span className="color-picker-label">Color</span>
        <span className="assignee-picker-caret">{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <div className="color-picker-panel">
          <strong>Row color</strong>
          <p className="muted">Applies to this row bar and column headers.</p>
          <div className="color-picker-grid">
            {ROW_COLOR_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className={`color-picker-option ${color === preset ? "active" : ""}`}
                style={{ background: preset }}
                title={preset}
                onClick={() => {
                  onSelect(preset);
                  setOpen(false);
                }}
              />
            ))}
            <button
              type="button"
              className={`color-picker-option clear ${color === null ? "active" : ""}`}
              onClick={() => {
                onSelect(null);
                setOpen(false);
              }}
            >
              None
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
