import { useEffect, useRef, useState } from "react";
import { Popover } from "../ui/Popover";

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

export function ContextMenu({ x, y, entries, onClose, ariaLabel = "Actions" }: ContextMenuProps) {
  const submenuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [openSubmenuId, setOpenSubmenuId] = useState<string | null>(null);

  const openSubmenu = entries.find(
    (entry): entry is Extract<ContextMenuEntry, { kind: "submenu" }> =>
      entry.kind === "submenu" && entry.id === openSubmenuId,
  );

  useEffect(() => {
    setOpenSubmenuId(null);
  }, [entries]);

  useEffect(() => {
    // A right-click anywhere else closes this menu (the board then opens a new one there).
    function onContextMenu(event: MouseEvent) {
      const target = event.target as Element | null;
      if (target?.closest?.("[data-context-menu]")) return;
      onClose();
    }
    window.addEventListener("contextmenu", onContextMenu, true);
    return () => window.removeEventListener("contextmenu", onContextMenu, true);
  }, [onClose]);

  return (
    <Popover
      open
      onClose={onClose}
      anchorPoint={{ x, y }}
      placement="bottom-start"
      gap={0}
      className="context-menu-shell"
    >
      <div
        className="context-menu"
        role="menu"
        aria-label={ariaLabel}
        data-context-menu=""
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
        <Popover
          key={openSubmenu.id}
          open
          onClose={() => setOpenSubmenuId(null)}
          anchorRef={submenuTriggerRef}
          placement="right-start"
          gap={4}
          className="context-menu context-menu--flyout"
          role="menu"
          label={openSubmenu.label}
        >
          <div data-context-menu="" onMouseEnter={() => setOpenSubmenuId(openSubmenu.id)}>
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
        </Popover>
      ) : null}
    </Popover>
  );
}
