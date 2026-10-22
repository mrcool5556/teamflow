import { useRef, useState } from "react";
import { Popover } from "../ui/Popover";

/** A board tool that the topbar shows as a button on wide screens and in this menu below 768px. */
export type UserMenuTool = {
  key: string;
  icon: string;
  label: string;
  badge?: number;
  disabled?: boolean;
  onSelect: () => void;
};

type UserMenuProps = {
  name: string;
  tools?: UserMenuTool[];
  email?: string;
  onSettings: () => void;
  onAbout: () => void;
  onLogout: () => void;
};

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const letters = parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[1][0];
  return letters.toUpperCase();
}

/**
 * Avatar button in the topbar; Settings, About and Log out live in its menu. Below 768px the
 * trigger turns into a menu icon and the menu also lists the board tools (CSS decides).
 */
export function UserMenu({
  name,
  tools = [],
  email,
  onSettings,
  onAbout,
  onLogout,
}: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);

  const choose = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className="user-menu-trigger"
        aria-label={`Account menu (${name})`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="user-menu-initials">{initialsOf(name)}</span>
        <span className="user-menu-burger" aria-hidden="true">
          ☰
        </span>
      </button>
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        placement="bottom-end"
        className="user-menu"
        role="menu"
        label="Account"
      >
        <div className="user-menu-who">
          <strong>{name}</strong>
          {email ? <span>{email}</span> : null}
        </div>
        <div className="user-menu-separator" role="separator" />
        {tools.length > 0 ? (
          <div className="user-menu-tools">
            {tools.map((tool) => (
              <button
                key={tool.key}
                type="button"
                role="menuitem"
                className="user-menu-item"
                disabled={tool.disabled}
                onClick={choose(tool.onSelect)}
              >
                <span aria-hidden="true">{tool.icon}</span> {tool.label}
                {tool.badge ? <span className="topbar-btn-badge">{tool.badge}</span> : null}
              </button>
            ))}
            <div className="user-menu-separator" role="separator" />
          </div>
        ) : null}
        <button
          type="button"
          role="menuitem"
          className="user-menu-item"
          onClick={choose(onSettings)}
        >
          <span aria-hidden="true">⚙</span> Settings
        </button>
        <button type="button" role="menuitem" className="user-menu-item" onClick={choose(onAbout)}>
          <span aria-hidden="true">ⓘ</span> About Teamflow
        </button>
        <div className="user-menu-separator" role="separator" />
        <button type="button" role="menuitem" className="user-menu-item" onClick={choose(onLogout)}>
          <span aria-hidden="true">⇥</span> Log out
        </button>
      </Popover>
    </>
  );
}
