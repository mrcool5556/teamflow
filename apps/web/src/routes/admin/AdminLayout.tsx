import { Navigate, Outlet, useNavigate } from "react-router";
import { canOpenAdminSection } from "../../lib/serverAccess";
import { useSession } from "../../session/session";
import { adminPath, isAdminSection, useAppRoute, type AdminSection } from "../../lib/appRoute";
import { useLayer } from "../../ui/layerStack";
import { useShell } from "../board/shellContext";

/** Sections of the server admin page, in nav order, grouped like the Settings nav. */
const ADMIN_NAV: {
  id: AdminSection;
  label: string;
  group: "Server" | "Help" | "Settings";
}[] = [
  { id: "overview", label: "Overview", group: "Server" },
  { id: "spaces", label: "Flows", group: "Server" },
  { id: "people", label: "People", group: "Server" },
  { id: "site", label: "Site & email", group: "Server" },
  { id: "updates", label: "Updates & backups", group: "Server" },
  { id: "bot", label: "Discord bot", group: "Server" },
  { id: "help", label: "How-tos & fixes", group: "Help" },
  { id: "defaults", label: "Flow defaults & sign-up", group: "Settings" },
];

const GROUPS = ["Server", "Help", "Settings"] as const;

/**
 * The instance admin page (instance admins only; the shell redirects everyone else). It uses
 * the Settings page layout: grouped nav on the left, a section select on phones.
 */
export function AdminLayout() {
  const navigate = useNavigate();
  const { adminSection } = useAppRoute();
  const { teamKey, closeSettings } = useShell();
  const { user } = useSession();
  const section = isAdminSection(adminSection) ? adminSection : "overview";
  const go = (next: AdminSection) => navigate(adminPath(teamKey, next));
  // Only the sections this person holds a server power for (lib/serverAccess.ts).
  const nav = ADMIN_NAV.filter((item) => canOpenAdminSection(user, item.id));

  useLayer({ open: true, onEscape: closeSettings });

  if (!canOpenAdminSection(user, section)) {
    return <Navigate to={adminPath(teamKey, "overview")} replace />;
  }

  return (
    <div className="settings-page admin-page">
      <aside className="settings-sidebar">
        <button type="button" className="ghost settings-back-btn" onClick={closeSettings}>
          <span aria-hidden="true">←</span> Back to board
          <kbd className="settings-back-kbd" aria-hidden="true">
            Esc
          </kbd>
        </button>
        <h2 className="settings-title">Server admin</h2>
        <nav className="settings-nav" aria-label="Server admin sections">
          <label className="settings-nav-select">
            <span className="sr-only">Server admin section</span>
            <select value={section} onChange={(e) => go(e.target.value as AdminSection)}>
              {nav.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          {GROUPS.filter((group) => nav.some((item) => item.group === group)).map((group) => (
            <div key={group} className="settings-nav-group">
              <p className="settings-nav-heading" id={`admin-nav-${group}`}>
                {group}
              </p>
              <ul className="settings-nav-list" aria-labelledby={`admin-nav-${group}`}>
                {nav
                  .filter((item) => item.group === group)
                  .map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={`settings-nav-btn ${section === item.id ? "active" : ""}`}
                        aria-current={section === item.id ? "page" : undefined}
                        onClick={() => go(item.id)}
                      >
                        {item.label}
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
      <main className="settings-main">
        <div className="settings-column settings-column--wide">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
