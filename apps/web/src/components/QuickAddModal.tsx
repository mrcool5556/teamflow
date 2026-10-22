import { useRef } from "react";
import { useBackdropDismiss } from "../hooks/useBackdropDismiss";
import { useLayer } from "../ui/layerStack";

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
  const formRef = useRef<HTMLFormElement>(null);
  useLayer({
    open,
    onEscape: onClose,
    modal: true,
    containerRef: formRef,
    initialFocusRef: inputRef,
  });

  const { markContentPointerDown, backdropProps } = useBackdropDismiss(onClose);

  if (!open) return null;

  return (
    <div className="quick-add-backdrop" {...backdropProps}>
      <form
        ref={formRef}
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
