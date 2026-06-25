export type SettingsPanel =
  | "general"
  | "appearance"
  | "team"
  | "roles"
  | "integrations"
  | "tokens";

type SettingsNavProps = {
  panel: SettingsPanel;
  onPanelChange: (panel: SettingsPanel) => void;
  showTeam: boolean;
  showRoles: boolean;
  showIntegrations: boolean;
};

const NAV_ITEMS: {
  id: SettingsPanel;
  label: string;
  teamOnly?: boolean;
  roles?: boolean;
  integrations?: boolean;
}[] = [
  { id: "general", label: "General" },
  { id: "appearance", label: "Appearance" },
  { id: "team", label: "Team", teamOnly: true },
  { id: "roles", label: "Roles", teamOnly: true, roles: true },
  { id: "integrations", label: "Integrations", teamOnly: true, integrations: true },
  { id: "tokens", label: "API tokens" },
];

export function SettingsNav({
  panel,
  onPanelChange,
  showTeam,
  showRoles,
  showIntegrations,
}: SettingsNavProps) {
  const items = NAV_ITEMS.filter((item) => {
    if (item.teamOnly && !showTeam) return false;
    if (item.roles && !showRoles) return false;
    if (item.integrations && !showIntegrations) return false;
    return true;
  });

  return (
    <nav className="settings-nav" aria-label="Settings sections">
      <ul className="settings-nav-list">
        {items.map((item) => (
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
    </nav>
  );
}
