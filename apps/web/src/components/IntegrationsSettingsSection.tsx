import { DiscordBotSecretsSection } from "./DiscordBotSecretsSection";
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
        />
      ) : null}

      <DiscordBotSettingsSection
        teamId={teamId}
        teamKey={teamKey}
        canManage={canManageDiscord}
        onMessage={onMessage}
      />
    </div>
  );
}
