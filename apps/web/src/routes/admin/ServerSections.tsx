import type { ReactNode } from "react";
import { DiscordBotServiceSection } from "../../components/DiscordBotServiceSection";
import { PanelStatus } from "../../components/PanelStatus";
import { ServerMaintenanceSettingsSection } from "../../components/ServerMaintenanceSettingsSection";
import { usePanelStatus } from "../../lib/panelStatus";

/**
 * Server-wide sections of the admin page. The page itself is for instance admins only (the shell
 * redirects everyone else), and these APIs check only that flag, so they work from any Flow and
 * with none open.
 */
function ServerSection({
  title,
  lead,
  children,
}: {
  title: string;
  lead: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="settings-panel">
      <header className="settings-panel-header">
        <h2>{title}</h2>
        <p className="settings-copy settings-lead">{lead}</p>
      </header>
      {children}
    </div>
  );
}

export function AdminUpdatesPanel() {
  const { status, onMessage } = usePanelStatus();
  return (
    <ServerSection
      title="Updates & backups"
      lead={
        <>
          Teamflow checks for new releases on its own. Updating backs up the database first and
          takes about 30 seconds.
        </>
      }
    >
      <PanelStatus status={status} />
      <ServerMaintenanceSettingsSection canRun onMessage={onMessage} />
    </ServerSection>
  );
}

export function AdminBotPanel() {
  const { status, onMessage } = usePanelStatus();
  return (
    <ServerSection
      title="Discord bot"
      lead="The teamflow-discord service on this server. Bot credentials and per-Flow guild settings live in Settings → Integrations."
    >
      <PanelStatus status={status} />
      <DiscordBotServiceSection teamId={null} canManage onMessage={onMessage} />
    </ServerSection>
  );
}
