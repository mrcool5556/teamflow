import { IntegrationsSettingsSection } from "../../components/IntegrationsSettingsSection";
import { PanelStatus } from "../../components/PanelStatus";
import { usePanelStatus } from "../../lib/panelStatus";
import { useShell } from "../board/shellContext";
import { RequirePanel } from "./RequirePanel";

export function IntegrationsPanel() {
  const shell = useShell();
  const { status, onMessage } = usePanelStatus();
  return (
    <RequirePanel access="showIntegrations">
      {(team) => (
        <div className="settings-panel">
          <header className="settings-panel-header">
            <h2>Integrations</h2>
            <p className="settings-copy settings-lead">
              Connect Teamflow to Discord. Bot credentials are instance-wide; guild, roles, and
              tickets are configured per team below.
            </p>
          </header>
          <PanelStatus status={status} />

          <IntegrationsSettingsSection
            teamId={team.id}
            teamKey={team.key}
            canManageDiscord={shell.access.canManageDiscord}
            canManageSecrets={shell.access.canManageDiscordSecrets}
            onMessage={onMessage}
          />
        </div>
      )}
    </RequirePanel>
  );
}
