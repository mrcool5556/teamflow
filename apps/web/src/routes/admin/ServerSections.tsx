import type { ReactNode } from "react";
import type { TeamPublic } from "@teamflow/core";
import { DiscordBotServiceSection } from "../../components/DiscordBotServiceSection";
import { PanelStatus } from "../../components/PanelStatus";
import { ServerMaintenanceSettingsSection } from "../../components/ServerMaintenanceSettingsSection";
import { usePanelStatus } from "../../lib/panelStatus";
import { useShell } from "../board/shellContext";

/**
 * The update and bot service APIs are still team-scoped (they also check a team permission),
 * so these sections run through the team the admin page was opened from.
 */
function WithServerTeam({
  title,
  lead,
  allowed,
  children,
}: {
  title: string;
  lead: ReactNode;
  allowed: boolean;
  children: (team: TeamPublic) => ReactNode;
}) {
  const { team } = useShell();
  return (
    <div className="settings-panel">
      <header className="settings-panel-header">
        <h2>{title}</h2>
        <p className="settings-copy settings-lead">{lead}</p>
      </header>
      {team && allowed ? (
        children(team)
      ) : (
        <p className="settings-hint settings-hint--warn">
          Open the server admin page from a Flow where you are the Owner to use this section. The
          Overview still shows its status.
        </p>
      )}
    </div>
  );
}

export function AdminUpdatesPanel() {
  const { access } = useShell();
  const { status, onMessage } = usePanelStatus();
  return (
    <WithServerTeam
      title="Updates & backups"
      lead={
        <>
          The same commands as <code>sudo teamflow-backup</code> and <code>sudo update</code>, from
          the browser.
        </>
      }
      allowed={access.showMaintenance}
    >
      {(team) => (
        <>
          <PanelStatus status={status} />
          <ServerMaintenanceSettingsSection
            teamId={team.id}
            canRun={access.canRunMaintenance}
            onMessage={onMessage}
          />
        </>
      )}
    </WithServerTeam>
  );
}

export function AdminBotPanel() {
  const { access } = useShell();
  const { status, onMessage } = usePanelStatus();
  return (
    <WithServerTeam
      title="Discord bot"
      lead="The teamflow-discord service on this server. Bot credentials and per-Flow guild settings live in Settings → Integrations."
      allowed={access.showIntegrations}
    >
      {(team) => (
        <>
          <PanelStatus status={status} />
          <DiscordBotServiceSection
            teamId={team.id}
            canManage={access.canManageDiscordSecrets}
            onMessage={onMessage}
          />
        </>
      )}
    </WithServerTeam>
  );
}
