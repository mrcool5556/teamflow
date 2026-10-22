import { PanelStatus } from "../../components/PanelStatus";
import { RolesSettingsSection } from "../../components/RolesSettingsSection";
import { usePanelStatus } from "../../lib/panelStatus";
import { useShell } from "../board/shellContext";
import { RequirePanel } from "./RequirePanel";

export function RolesPanel() {
  const shell = useShell();
  const { status, onMessage } = usePanelStatus();
  return (
    <RequirePanel access="showRoles">
      {(team) => (
        <div className="settings-panel">
          <header className="settings-panel-header">
            <h2>Roles & permissions</h2>
            <p className="settings-copy settings-lead">
              Each team member has one role. Roles define what they can do in Settings and
              integrations.
            </p>
          </header>
          <PanelStatus status={status} />

          <RolesSettingsSection
            teamId={team.id}
            canManage={shell.access.canManageRoles}
            onMessage={onMessage}
            onRolesChange={shell.reloadPermissions}
          />
        </div>
      )}
    </RequirePanel>
  );
}
