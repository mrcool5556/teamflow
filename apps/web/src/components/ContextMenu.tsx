import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDismissOnClickOutside } from "../hooks/useDismissOnClickOutside";

export type ContextMenuSubmenuEntry = {
  kind: "item";
  id: string;
  label: string;
  onSelect: () => void;
  checked?: boolean;
};

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
  | {
      kind: "submenu";
      id: string;
      label: string;
      hint?: string;
      entries: ContextMenuSubmenuEntry[];
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
  const shellRef = useRef<HTMLDivElement>(null);
  const submenuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [position, setPosition] = useState({ left: x, top: y });
  const [openSubmenuId, setOpenSubmenuId] = useState<string | null>(null);
  const [submenuPosition, setSubmenuPosition] = useState({ left: 0, top: 0 });

  const openSubmenu = entries.find(
    (entry): entry is Extract<ContextMenuEntry, { kind: "submenu" }> =>
      entry.kind === "submenu" && entry.id === openSubmenuId,
  );

  useDismissOnClickOutside(true, [shellRef], onClose);

  useLayoutEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const rect = shell.getBoundingClientRect();
    const pad = 8;
    setPosition({
      left: Math.min(Math.max(pad, x), window.innerWidth - rect.width - pad),
      top: Math.min(Math.max(pad, y), window.innerHeight - rect.height - pad),
    });
  }, [x, y, entries, openSubmenuId]);

  useLayoutEffect(() => {
    if (!openSubmenu || !submenuTriggerRef.current || !shellRef.current) return;

    const triggerRect = submenuTriggerRef.current.getBoundingClientRect();
    const shellRect = shellRef.current.getBoundingClientRect();
    const flyoutWidth = 12 * 16;
    const pad = 8;
    let left = triggerRect.right + 4;
    let top = triggerRect.top;

    if (left + flyoutWidth > window.innerWidth - pad) {
      left = triggerRect.left - flyoutWidth - 4;
    }

    const estimatedHeight = openSubmenu.entries.length * 36 + 16;
    if (top + estimatedHeight > window.innerHeight - pad) {
      top = Math.max(pad, window.innerHeight - estimatedHeight - pad);
    }

    setSubmenuPosition({ left: left - shellRect.left, top: top - shellRect.top });
  }, [openSubmenu, openSubmenuId, position.left, position.top]);

  useEffect(() => {
    setOpenSubmenuId(null);
  }, [entries]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (openSubmenuId) {
          setOpenSubmenuId(null);
          return;
        }
        onClose();
      }
    }

    function onContextMenu(event: MouseEvent) {
      const target = event.target as Node;
      if (shellRef.current?.contains(target)) return;
      onClose();
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("contextmenu", onContextMenu, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("contextmenu", onContextMenu, true);
    };
  }, [onClose, openSubmenuId]);

  return createPortal(
    <div
      ref={shellRef}
      className="context-menu-shell"
      style={{ left: position.left, top: position.top }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="context-menu" role="menu" aria-label={ariaLabel}>
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

          if (entry.kind === "submenu") {
            const isOpen = openSubmenuId === entry.id;
            return (
              <button
                key={entry.id}
                type="button"
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={isOpen}
                className={`context-menu-item context-menu-item--submenu${isOpen ? " open" : ""}`}
                onMouseEnter={(event) => {
                  submenuTriggerRef.current = event.currentTarget;
                  setOpenSubmenuId(entry.id);
                }}
                onFocus={(event) => {
                  submenuTriggerRef.current = event.currentTarget;
                  setOpenSubmenuId(entry.id);
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  submenuTriggerRef.current = event.currentTarget;
                  setOpenSubmenuId((current) => (current === entry.id ? null : entry.id));
                }}
              >
                <span>{entry.label}</span>
                <span className="context-menu-item-trail">
                  {entry.hint ? <span className="context-menu-hint">{entry.hint}</span> : null}
                  <span className="context-menu-caret" aria-hidden>
                    ›
                  </span>
                </span>
              </button>
            );
          }

          return (
            <button
              key={entry.id}
              type="button"
              role="menuitem"
              className={`context-menu-item${entry.danger ? " danger" : ""}${entry.checked ? " checked" : ""}`}
              disabled={entry.disabled}
              onMouseEnter={() => setOpenSubmenuId(null)}
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
      </div>

      {openSubmenu ? (
        <div
          className="context-menu context-menu--flyout"
          style={{ left: submenuPosition.left, top: submenuPosition.top }}
          role="menu"
          aria-label={openSubmenu.label}
          onMouseEnter={() => setOpenSubmenuId(openSubmenu.id)}
        >
          {openSubmenu.entries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="menuitem"
              className={`context-menu-item${entry.checked ? " checked" : ""}`}
              onClick={() => {
                entry.onSelect();
                onClose();
              }}
            >
              <span>{entry.label}</span>
              {entry.checked ? <span className="context-menu-check">✓</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
