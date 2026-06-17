import { useEffect, useRef, useState, type ReactNode } from "react";

type RowEditMenuProps = {
  children: ReactNode;
};

export function RowEditMenu({ children }: RowEditMenuProps) {
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
      className={`row-edit-menu ${open ? "open" : ""}`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="row-edit-menu-trigger"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        Edit
        <span className="assignee-picker-caret">{open ? "▴" : "▾"}</span>
      </button>
      {open ? (
        <div className="row-edit-menu-panel">{children}</div>
      ) : null}
    </div>
  );
}

type RowEditMenuItemProps = {
  children: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
};

export function RowEditMenuItem({
  children,
  onClick,
  danger = false,
  disabled = false,
}: RowEditMenuItemProps) {
  return (
    <button
      type="button"
      className={`row-edit-menu-item ${danger ? "danger" : ""}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function RowEditMenuSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div
      className="row-edit-menu-section"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <p className="row-edit-menu-section-title">{title}</p>
      {children}
    </div>
  );
}
