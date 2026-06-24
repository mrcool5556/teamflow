import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useFloatingPanelStyle } from "../hooks/useFloatingPanelStyle";

type RowEditMenuProps = {
  children: ReactNode;
};

export function RowEditMenu({ children }: RowEditMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelStyle = useFloatingPanelStyle(open, triggerRef, "bottom", "right", 224);
  const panelPositioned = Boolean(panelStyle.position);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }

    window.addEventListener("mousedown", handlePointerDown, true);
    return () => window.removeEventListener("mousedown", handlePointerDown, true);
  }, [open]);

  const panel = open ? (
    <div
      ref={panelRef}
      className={`row-edit-menu-panel row-edit-menu-panel--floating ${panelPositioned ? "row-edit-menu-panel--positioned" : ""}`}
      style={panelStyle}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </div>
  ) : null;

  return (
    <div
      ref={rootRef}
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
      {panelPositioned && panel ? createPortal(panel, document.body) : null}
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
