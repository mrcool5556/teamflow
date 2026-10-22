import { useRef, useState, type ReactNode } from "react";
import { Popover } from "../ui/Popover";

type RowEditMenuProps = {
  children: ReactNode;
};

export function RowEditMenu({ children }: RowEditMenuProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <div
      className={`row-edit-menu ${open ? "open" : ""}`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        ref={triggerRef}
        type="button"
        className="row-edit-menu-trigger"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        Edit
        <span className="assignee-picker-caret">{open ? "▴" : "▾"}</span>
      </button>
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        placement="bottom-start"
        width={224}
        className="row-edit-menu-panel row-edit-menu-panel--floating"
        positionedClassName="row-edit-menu-panel--positioned"
        label="Edit"
      >
        {children}
      </Popover>
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

export function RowEditMenuSection({ title, children }: { title: string; children: ReactNode }) {
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
