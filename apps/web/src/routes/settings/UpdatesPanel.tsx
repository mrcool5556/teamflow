import { PanelStatus } from "../../components/PanelStatus";
import { ServerMaintenanceSettingsSection } from "../../components/ServerMaintenanceSettingsSection";
import { usePanelStatus } from "../../lib/panelStatus";
import { useShell } from "../board/shellContext";
import { RequirePanel } from "./RequirePanel";

export function UpdatesPanel() {
  const shell = useShell();
  const { status, onMessage } = usePanelStatus();
  return (
    <RequirePanel access="showMaintenance">
      {(team) => (
        <div className="settings-panel">
          <header className="settings-panel-header">
            <h2>Updates & backups</h2>
            <p className="settings-copy settings-lead">
              Run the same maintenance commands as <code>sudo teamflow-backup</code> and{" "}
              <code>sudo update</code> from the UI — no SSH required.
            </p>
          </header>
          <PanelStatus status={status} />

          <ServerMaintenanceSettingsSection
            teamId={team.id}
            canRun={shell.access.canRunMaintenance}
            onMessage={onMessage}
          />
        </div>
      )}
    </RequirePanel>
  );
}
