import { useRef } from "react";
import { Dialog } from "../ui/Dialog";
import { DialogTitle } from "../ui/DialogTitle";

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

  return (
    <Dialog
      open={open}
      onClose={onClose}
      backdropClassName="quick-add-backdrop"
      className="quick-add-modal"
      as="form"
      initialFocusRef={inputRef}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <DialogTitle>{title}</DialogTitle>
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
    </Dialog>
  );
}
