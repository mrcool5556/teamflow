import { useCallback, useEffect, useState } from "react";
import type { TeamDiscordSettingsPublic } from "@teamflow/core";
import { client } from "../api";

type DiscordBotSettingsSectionProps = {
  teamId: string;
  isAdmin: boolean;
  onMessage: (message: string | null) => void;
};

function parseIdList(raw: string) {
  return [
    ...new Set(
      raw
        .split(/[\s,]+/)
        .map((part) => part.trim())
        .filter((part) => /^\d{17,20}$/.test(part)),
    ),
  ];
}

function formatIdList(ids: string[]) {
  return ids.join("\n");
}

export function DiscordBotSettingsSection({
  teamId,
  isAdmin,
  onMessage,
}: DiscordBotSettingsSectionProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [guildId, setGuildId] = useState("");
  const [allowedRolesText, setAllowedRolesText] = useState("");
  const [ticketChannelsText, setTicketChannelsText] = useState("");
  const [allowDiscordAdministrators, setAllowDiscordAdministrators] = useState(false);

  const applySettings = useCallback((settings: TeamDiscordSettingsPublic) => {
    setGuildId(settings.guildId ?? "");
    setAllowedRolesText(formatIdList(settings.allowedRoleIds));
    setTicketChannelsText(formatIdList(settings.ticketChannelIds));
    setAllowDiscordAdministrators(settings.allowDiscordAdministrators);
  }, []);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const { settings } = await client.getTeamDiscordSettings(teamId);
      applySettings(settings);
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "Failed to load Discord settings");
    } finally {
      setLoading(false);
    }
  }, [applySettings, onMessage, teamId]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  async function saveSettings() {
    if (!isAdmin) return;
    setSaving(true);
    onMessage(null);
    try {
      const trimmedGuildId = guildId.trim();
      const { settings } = await client.updateTeamDiscordSettings(teamId, {
        guildId: trimmedGuildId ? trimmedGuildId : null,
        allowedRoleIds: parseIdList(allowedRolesText),
        ticketChannelIds: parseIdList(ticketChannelsText),
        allowDiscordAdministrators,
      });
      applySettings(settings);
      onMessage("Discord bot settings saved.");
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "Failed to save Discord settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="settings-section">
      <h3>Discord bot</h3>
      <p className="settings-copy">
        Link a Discord server to this team and choose which roles can run slash commands. Bot
        token and PAT stay in the server <code>.env</code> — this panel controls board binding and
        access rules.
      </p>

      {loading ? <p className="settings-hint">Loading Discord settings…</p> : null}

      {!loading ? (
        <>
          <label>
            Discord server ID
            <input
              value={guildId}
              onChange={(e) => setGuildId(e.target.value)}
              placeholder="1510734935382687956"
              disabled={!isAdmin}
            />
          </label>
          <p className="settings-hint">
            Enable Developer Mode in Discord → right-click your server → Copy Server ID.
          </p>

          <label>
            Allowed role IDs (one per line)
            <textarea
              value={allowedRolesText}
              onChange={(e) => setAllowedRolesText(e.target.value)}
              placeholder="123456789012345678"
              rows={4}
              disabled={!isAdmin}
            />
          </label>
          <p className="settings-hint">
            Only members with one of these <strong>Discord roles</strong> can use slash commands.
            Copy a <strong>role</strong> ID (right-click the role under Server Settings → Roles —
            not the server ID). If this list is empty, nobody can run commands.
          </p>
          <label className="settings-checkbox">
            <input
              type="checkbox"
              checked={allowDiscordAdministrators}
              onChange={(e) => setAllowDiscordAdministrators(e.target.checked)}
              disabled={!isAdmin}
            />
            Also allow Discord server administrators (Administrator permission)
          </label>
          {!guildId.trim() ? (
            <p className="settings-hint settings-hint--warn">
              Save your Discord server ID above or the bot cannot load these rules from Teamflow.
            </p>
          ) : null}

          <label>
            Ticket channel IDs (one per line)
            <textarea
              value={ticketChannelsText}
              onChange={(e) => setTicketChannelsText(e.target.value)}
              placeholder="987654321098765432"
              rows={3}
              disabled={!isAdmin}
            />
          </label>
          <p className="settings-hint">
            New threads in these channels auto-create Teamflow issues.
          </p>

          {isAdmin ? (
            <div className="row settings-actions">
              <button type="button" disabled={saving} onClick={() => void saveSettings()}>
                {saving ? "Saving…" : "Save Discord settings"}
              </button>
            </div>
          ) : (
            <p className="settings-hint">Only team admins can edit Discord bot settings.</p>
          )}
        </>
      ) : null}
    </section>
  );
}
