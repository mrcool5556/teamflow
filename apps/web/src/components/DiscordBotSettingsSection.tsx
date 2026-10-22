import { useCallback, useEffect, useRef, useState } from "react";
import type { TeamDiscordSettingsPublic } from "@teamflow/core";
import { client } from "../api";
import { useDiscordSettingsQuery } from "../queries/integrations";
import { errorMessage } from "../lib/errorSink";
import type { PanelMessage } from "../lib/panelStatus";

type DiscordBotSettingsSectionProps = {
  teamId: string;
  teamKey: string;
  canManage: boolean;
  onMessage: PanelMessage;
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

const ENV_TEMPLATE = `# Local dev only — production uses Settings → Enable Discord bot
TEAMFLOW_URL=http://localhost:3000

# Legacy: full .env without Settings
# DISCORD_BOT_TOKEN=
# DISCORD_CLIENT_ID=
# TEAMFLOW_TOKEN=pat_your_token_here
# TEAMFLOW_PUBLIC_URL=http://localhost:5173
# DISCORD_MESSAGE_CONTENT_INTENT=true
`;

export function DiscordBotSettingsSection({
  teamId,
  teamKey,
  canManage,
  onMessage,
}: DiscordBotSettingsSectionProps) {
  const settingsQuery = useDiscordSettingsQuery(teamId);
  const loading = settingsQuery.isPending;
  const [saving, setSaving] = useState(false);
  const [guildId, setGuildId] = useState("");
  const [allowedRolesText, setAllowedRolesText] = useState("");
  const [ticketChannelsText, setTicketChannelsText] = useState("");
  const [allowDiscordAdministrators, setAllowDiscordAdministrators] = useState(false);
  const [commandsReady, setCommandsReady] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copyTimeoutRef = useRef<number | null>(null);

  const applySettings = useCallback((settings: TeamDiscordSettingsPublic) => {
    setGuildId(settings.guildId ?? "");
    setAllowedRolesText(formatIdList(settings.allowedRoleIds));
    setTicketChannelsText(formatIdList(settings.ticketChannelIds));
    setAllowDiscordAdministrators(settings.allowDiscordAdministrators);
    setCommandsReady(settings.commandsReady);
  }, []);

  // Copy the loaded settings into the form whenever the server copy changes.
  useEffect(() => {
    if (settingsQuery.data) applySettings(settingsQuery.data);
  }, [settingsQuery.data, applySettings]);

  useEffect(() => {
    if (settingsQuery.error) {
      onMessage(errorMessage(settingsQuery.error, "Failed to load Discord settings"), "error");
    }
  }, [settingsQuery.error, onMessage]);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) window.clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  async function copyText(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      if (copyTimeoutRef.current) window.clearTimeout(copyTimeoutRef.current);
      setCopiedKey(key);
      copyTimeoutRef.current = window.setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      onMessage("Could not copy — select and copy manually.", "error");
    }
  }

  async function saveSettings() {
    if (!canManage) return;
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
      onMessage("Discord bot settings saved. Bot picks up changes within ~10 seconds.");
    } catch (err) {
      onMessage(errorMessage(err, "Failed to save Discord settings"), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="settings-section">
      <h3>Discord bot</h3>
      <p className="settings-copy">
        One bot can serve every Teamflow team. Configure this team&apos;s Discord server, roles, and
        tickets below. Bot token and PAT are saved above under Bot credentials (admin only).
      </p>

      {!loading && commandsReady ? (
        <p className="settings-hint">
          <strong>{teamKey}</strong> Discord commands are configured for this team.
        </p>
      ) : null}
      {!loading && !commandsReady ? (
        <p className="settings-hint settings-hint--warn">
          Save a server ID and at least one allowed role ID below to enable slash commands for{" "}
          <strong>{teamKey}</strong>.
        </p>
      ) : null}

      <details className="settings-advanced discord-setup-guide">
        <summary className="settings-advanced-toggle">Server setup (one-time)</summary>
        <ol className="settings-copy discord-setup-steps">
          <li>
            Create a bot in the{" "}
            <a href="https://discord.com/developers/applications" target="_blank" rel="noreferrer">
              Discord Developer Portal
            </a>{" "}
            — enable <strong>Message Content Intent</strong>.
          </li>
          <li>
            Invite the bot to your server (scopes: <code>bot</code>,{" "}
            <code>applications.commands</code>).
          </li>
          <li>
            Save bot token, client ID, and PAT under <strong>Bot credentials</strong> above.
          </li>
          <li>
            On a Linux server, click <strong>Enable Discord bot</strong> above. For local dev, run{" "}
            <code>pnpm dev:discord</code>.
          </li>
          <li>Link this team below — the bot registers slash commands for saved server IDs.</li>
        </ol>
        <div className="row settings-actions">
          <button
            type="button"
            className={`ghost copy-feedback-btn ${copiedKey === "env" ? "copied" : ""}`}
            onClick={() => void copyText(ENV_TEMPLATE, "env")}
          >
            {copiedKey === "env" ? "Copied!" : "Copy local dev .env template"}
          </button>
        </div>
      </details>

      {loading ? <p className="settings-hint">Loading Discord settings…</p> : null}

      {!loading ? (
        <>
          <label>
            Discord server ID
            <input
              value={guildId}
              onChange={(e) => setGuildId(e.target.value)}
              placeholder="1448216378925649962"
              disabled={!canManage}
            />
          </label>
          <p className="settings-hint">
            Developer Mode → right-click your server → Copy Server ID. Each team links one server.
          </p>

          <label>
            Allowed role IDs (one per line)
            <textarea
              value={allowedRolesText}
              onChange={(e) => setAllowedRolesText(e.target.value)}
              placeholder="123456789012345678"
              rows={4}
              disabled={!canManage}
            />
          </label>
          <p className="settings-hint">
            Only members with one of these roles can use <code>/create</code>, <code>/issue</code>,
            and <code>/link</code>. Copy role IDs from Server Settings → Roles — not the server ID.
          </p>
          <label className="settings-checkbox">
            <input
              type="checkbox"
              checked={allowDiscordAdministrators}
              onChange={(e) => setAllowDiscordAdministrators(e.target.checked)}
              disabled={!canManage}
            />
            Also allow Discord server administrators (Administrator permission)
          </label>

          <label>
            Ticket channel IDs (one per line)
            <textarea
              value={ticketChannelsText}
              onChange={(e) => setTicketChannelsText(e.target.value)}
              placeholder="987654321098765432"
              rows={3}
              disabled={!canManage}
            />
          </label>
          <p className="settings-hint">
            Optional auto-create when a thread opens. Leave empty and run <code>/create</code> in
            the thread when the ticket is ready — thread messages are copied into the issue (title
            defaults to the thread name).
          </p>

          {canManage ? (
            <div className="row settings-actions">
              <button type="button" disabled={saving} onClick={() => void saveSettings()}>
                {saving ? "Saving…" : "Save Discord settings"}
              </button>
            </div>
          ) : (
            <p className="settings-hint">
              You can view Discord settings but need manage permission to edit them.
            </p>
          )}
        </>
      ) : null}
    </section>
  );
}
