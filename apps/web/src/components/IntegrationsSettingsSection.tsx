import { useState } from "react";
import { DiscordBotSecretsSection } from "./DiscordBotSecretsSection";
import { DiscordBotServiceSection } from "./DiscordBotServiceSection";
import { DiscordBotSettingsSection } from "./DiscordBotSettingsSection";
import type { PanelMessage } from "../lib/panelStatus";

type IntegrationsSettingsSectionProps = {
  teamId: string;
  teamKey: string;
  canManageDiscord: boolean;
  canManageSecrets: boolean;
  onMessage: PanelMessage;
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
    <>

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
    </>
  );
}
