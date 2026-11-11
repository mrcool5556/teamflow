import type { ReactNode } from "react";
import { DiscordBotServiceSection } from "../../components/DiscordBotServiceSection";
import { PanelStatus } from "../../components/PanelStatus";
import { ServerMaintenanceSettingsSection } from "../../components/ServerMaintenanceSettingsSection";
import { BackupListSection } from "../../components/BackupListSection";
import { usePanelStatus } from "../../lib/panelStatus";
import { hasServerPower } from "../../lib/serverAccess";
import { useMaintenanceStatusQuery } from "../../queries/maintenance";
import { useSession } from "../../session/session";

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
  const { user } = useSession();
  const canUpdate = hasServerPower(user, "updates");
  const canBackup = hasServerPower(user, "backups");
  const { status, onMessage } = usePanelStatus();
  const maintenance = useMaintenanceStatusQuery();
  return (
    <ServerSection
      title="Updates & backups"
      lead={
        <>
          {canUpdate
            ? "Teamflow checks for new releases on its own. Updating backs up the database first and takes about 30 seconds."
            : "Backups of the database and of uploaded files."}
        </>
      }
    >
      <PanelStatus status={status} />
      {canUpdate ? (
        <ServerMaintenanceSettingsSection canRun onMessage={onMessage} showBackups={false} />
      ) : null}
      {canBackup ? (
        <BackupListSection
          maintenanceEnabled={maintenance.data?.enabled ?? false}
          backupReady={maintenance.data?.backupScriptReady ?? false}
          busy={maintenance.data?.job?.status === "running"}
          onMessage={onMessage}
        />
      ) : null}
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
