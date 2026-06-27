import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDismissOnClickOutside } from "../hooks/useDismissOnClickOutside";

export type ContextMenuEntry =
  | {
      kind: "item";
      id: string;
      label: string;
      onSelect: () => void;
      danger?: boolean;
      disabled?: boolean;
      checked?: boolean;
    }
  | { kind: "separator" }
  | { kind: "heading"; label: string };

type ContextMenuProps = {
  x: number;
  y: number;
  entries: ContextMenuEntry[];
  onClose: () => void;
  ariaLabel?: string;
};

export function ContextMenu({
  x,
  y,
  entries,
  onClose,
  ariaLabel = "Actions",
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  useDismissOnClickOutside(true, [menuRef], onClose);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    const pad = 8;
    setPosition({
      left: Math.min(Math.max(pad, x), window.innerWidth - rect.width - pad),
      top: Math.min(Math.max(pad, y), window.innerHeight - rect.height - pad),
    });
  }, [x, y, entries]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    function onContextMenu(event: MouseEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) return;
      onClose();
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("contextmenu", onContextMenu, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("contextmenu", onContextMenu, true);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={menuRef}
      className="context-menu"
      style={{ left: position.left, top: position.top }}
      role="menu"
      aria-label={ariaLabel}
      onContextMenu={(event) => event.preventDefault()}
    >
      {entries.map((entry, index) => {
        if (entry.kind === "separator") {
          return <div key={`sep-${index}`} className="context-menu-separator" role="separator" />;
        }

        if (entry.kind === "heading") {
          return (
            <p key={`heading-${entry.label}`} className="context-menu-heading">
              {entry.label}
            </p>
          );
        }

        return (
          <button
            key={entry.id}
            type="button"
            role="menuitem"
            className={`context-menu-item${entry.danger ? " danger" : ""}${entry.checked ? " checked" : ""}`}
            disabled={entry.disabled}
            onClick={() => {
              entry.onSelect();
              onClose();
            }}
          >
            <span>{entry.label}</span>
            {entry.checked ? <span className="context-menu-check">✓</span> : null}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
