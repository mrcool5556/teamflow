export type SettingsPanel =
  "general" | "appearance" | "team" | "roles" | "integrations" | "updates" | "tokens";

type SettingsNavProps = {
  panel: SettingsPanel;
  onPanelChange: (panel: SettingsPanel) => void;
  /** Shown in the Team group heading. */
  teamKey: string | null;
  showTeam: boolean;
  showRoles: boolean;
  showIntegrations: boolean;
  showUpdates: boolean;
};

type NavGroup = "account" | "team" | "server";

const NAV_ITEMS: {
  id: SettingsPanel;
  label: string;
  group: NavGroup;
  teamOnly?: boolean;
  roles?: boolean;
  integrations?: boolean;
  updates?: boolean;
}[] = [
  { id: "general", label: "General", group: "account" },
  { id: "appearance", label: "Appearance", group: "account" },
  { id: "tokens", label: "API tokens", group: "account" },
  { id: "team", label: "Team", group: "team", teamOnly: true },
  { id: "roles", label: "Roles", group: "team", teamOnly: true, roles: true },
  {
    id: "integrations",
    label: "Integrations",
    group: "team",
    teamOnly: true,
    integrations: true,
  },
  { id: "updates", label: "Updates", group: "server", teamOnly: true, updates: true },
];

const GROUPS: NavGroup[] = ["account", "team", "server"];

export function SettingsNav({
  panel,
  onPanelChange,
  teamKey,
  showTeam,
  showRoles,
  showIntegrations,
  showUpdates,
}: SettingsNavProps) {
  const items = NAV_ITEMS.filter((item) => {
    if (item.teamOnly && !showTeam) return false;
    if (item.roles && !showRoles) return false;
    if (item.integrations && !showIntegrations) return false;
    if (item.updates && !showUpdates) return false;
    return true;
  });

  const groupLabel = (group: NavGroup) =>
    group === "account"
      ? "Account"
      : group === "team"
        ? `Team${teamKey ? ` · ${teamKey}` : ""}`
        : "Server";

  return (
    <nav className="settings-nav" aria-label="Settings sections">
      {GROUPS.map((group) => {
        const groupItems = items.filter((item) => item.group === group);
        if (groupItems.length === 0) return null;
        return (
          <div key={group} className="settings-nav-group">
            <p className="settings-nav-heading" id={`settings-nav-${group}`}>
              {groupLabel(group)}
            </p>
            <ul className="settings-nav-list" aria-labelledby={`settings-nav-${group}`}>
              {groupItems.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`settings-nav-btn ${panel === item.id ? "active" : ""}`}
                    aria-current={panel === item.id ? "page" : undefined}
                    onClick={() => onPanelChange(item.id)}
                  >
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
