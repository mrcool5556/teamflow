import { useState } from "react";
import { DiscordBotSecretsSection } from "./DiscordBotSecretsSection";
import { DiscordBotServiceSection } from "./DiscordBotServiceSection";
import { DiscordBotSettingsSection } from "./DiscordBotSettingsSection";

type IntegrationsSettingsSectionProps = {
  teamId: string;
  teamKey: string;
  canManageDiscord: boolean;
  canManageSecrets: boolean;
  onMessage: (message: string | null) => void;
};

export function IntegrationsSettingsSection({
  teamId,
  teamKey,
  canManageDiscord,
  canManageSecrets,
  onMessage,
}: IntegrationsSettingsSectionProps) {
  const [serviceRefreshKey, setServiceRefreshKey] = useState(0);

  return (
    <div className="settings-panel">
      <header className="settings-panel-header">
        <h2>Integrations</h2>
        <p className="settings-copy settings-lead">
          Connect Teamflow to Discord. Bot credentials are instance-wide; guild, roles, and tickets
          are configured per team below.
        </p>
      </header>

      {canManageSecrets ? (
        <DiscordBotSecretsSection
          teamId={teamId}
          canManage={canManageSecrets}
          onMessage={onMessage}
          onSaved={() => setServiceRefreshKey((value) => value + 1)}
        />
      ) : null}

      <DiscordBotServiceSection
        key={serviceRefreshKey}
        teamId={teamId}
        canManage={canManageSecrets}
        onMessage={onMessage}
        onSecretsRefresh={() => setServiceRefreshKey((value) => value + 1)}
      />

      <DiscordBotSettingsSection
        teamId={teamId}
        teamKey={teamKey}
        canManage={canManageDiscord}
        onMessage={onMessage}
      />
    </div>
  );
}
