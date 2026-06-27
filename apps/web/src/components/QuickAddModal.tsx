import { useEffect, useRef } from "react";
import { useBackdropDismiss } from "../hooks/useBackdropDismiss";

type QuickAddModalProps = {
  open: boolean;
  title: string;
  label: string;
  placeholder: string;
  value: string;
  submitLabel?: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
};

export function QuickAddModal({
  open,
  title,
  label,
  placeholder,
  value,
  submitLabel = "Add",
  onChange,
  onSubmit,
  onClose,
}: QuickAddModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const { markContentPointerDown, backdropProps } = useBackdropDismiss(onClose);

  if (!open) return null;

  return (
    <div className="quick-add-backdrop" {...backdropProps}>
      <form
        className="quick-add-modal"
        onPointerDown={markContentPointerDown}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <h2>{title}</h2>
        <label>
          {label}
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
          />
        </label>
        <div className="quick-add-actions">
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={!value.trim()}>
            {submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
