import { useCallback, useEffect, useState } from "react";
import type { DiscordBotSecretsPublic } from "@teamflow/core";
import { client } from "../api";

type DiscordBotSecretsSectionProps = {
  teamId: string;
  canManage: boolean;
  onMessage: (message: string | null) => void;
};

export function DiscordBotSecretsSection({
  teamId,
  canManage,
  onMessage,
}: DiscordBotSecretsSectionProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [secrets, setSecrets] = useState<DiscordBotSecretsPublic | null>(null);
  const [clientId, setClientId] = useState("");
  const [botToken, setBotToken] = useState("");
  const [pat, setPat] = useState("");
  const [teamflowUrl, setTeamflowUrl] = useState("http://localhost:3000");
  const [publicUrl, setPublicUrl] = useState("http://localhost:5173");
  const [messageContentIntent, setMessageContentIntent] = useState(true);

  const applySecrets = useCallback((next: DiscordBotSecretsPublic) => {
    setSecrets(next);
    setClientId(next.clientId ?? "");
    setTeamflowUrl(next.teamflowUrl);
    setPublicUrl(next.publicUrl);
    setMessageContentIntent(next.messageContentIntent);
    setBotToken("");
    setPat("");
  }, []);

  const loadSecrets = useCallback(async () => {
    setLoading(true);
    try {
      const { secrets: next } = await client.getDiscordBotSecrets(teamId);
      applySecrets(next);
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "Failed to load Discord secrets");
    } finally {
      setLoading(false);
    }
  }, [applySecrets, onMessage, teamId]);

  useEffect(() => {
    void loadSecrets();
  }, [loadSecrets]);

  async function saveSecrets() {
    if (!canManage) return;
    setSaving(true);
    onMessage(null);
    try {
      const payload: {
        clientId?: string;
        botToken?: string;
        pat?: string;
        teamflowUrl?: string;
        publicUrl?: string;
        messageContentIntent?: boolean;
      } = {
        clientId: clientId.trim(),
        teamflowUrl: teamflowUrl.trim(),
        publicUrl: publicUrl.trim(),
        messageContentIntent,
      };
      if (botToken.trim()) payload.botToken = botToken.trim();
      if (pat.trim()) payload.pat = pat.trim();

      const { secrets: next } = await client.updateDiscordBotSecrets(teamId, payload);
      applySecrets(next);
      onMessage(
        next.configured
          ? "Discord bot secrets saved. Restart the bot to pick them up."
          : "Saved partial secrets — add bot token and PAT to finish setup.",
      );
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "Failed to save Discord secrets");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="settings-section">
      <h3>Bot credentials</h3>
      <p className="settings-copy">
        Stored encrypted on the Teamflow server. Applies to the whole instance — one Discord bot
        serves all teams. Leave token fields blank to keep existing values.
      </p>

      {loading ? <p className="settings-hint">Loading bot credentials…</p> : null}

      {!loading && secrets ? (
        <>
          {secrets.configured ? (
            <p className="settings-hint">
              Credentials are configured
              {secrets.updatedAt
                ? ` (updated ${new Date(secrets.updatedAt).toLocaleString()})`
                : ""}
              .
            </p>
          ) : (
            <p className="settings-hint settings-hint--warn">
              Bot credentials are incomplete — save bot token, client ID, and PAT below.
            </p>
          )}

          {!secrets.botConfigKeyConfigured ? (
            <p className="settings-hint settings-hint--warn">
              Add the same random key to <code>TEAMFLOW_BOT_CONFIG_KEY</code> in the Teamflow{" "}
              <code>.env</code> and <code>apps/discord-bot/.env</code>, then restart both the API
              and bot so the bot can fetch these secrets.
            </p>
          ) : (
            <p className="settings-hint">
              Bot config key is set on the server. The bot reads secrets via{" "}
              <code>TEAMFLOW_BOT_CONFIG_KEY</code>.
            </p>
          )}

          <label>
            Discord client ID
            <input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="Application ID from Developer Portal"
              disabled={!canManage}
            />
          </label>

          <label>
            Bot token
            <input
              type="password"
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              placeholder={secrets.hasBotToken ? "Saved — enter to replace" : "Bot token"}
              disabled={!canManage}
              autoComplete="off"
            />
          </label>

          <label>
            Teamflow PAT
            <input
              type="password"
              value={pat}
              onChange={(e) => setPat(e.target.value)}
              placeholder={secrets.hasPat ? "Saved — enter to replace" : "pat_…"}
              disabled={!canManage}
              autoComplete="off"
            />
          </label>
          <p className="settings-hint">
            Create under Settings → API tokens. The PAT user must belong to every team linked to
            Discord.
          </p>

          <label>
            Teamflow API URL
            <input
              value={teamflowUrl}
              onChange={(e) => setTeamflowUrl(e.target.value)}
              disabled={!canManage}
            />
          </label>

          <label>
            Public web URL (issue links)
            <input
              value={publicUrl}
              onChange={(e) => setPublicUrl(e.target.value)}
              disabled={!canManage}
            />
          </label>

          <label className="settings-checkbox">
            <input
              type="checkbox"
              checked={messageContentIntent}
              onChange={(e) => setMessageContentIntent(e.target.checked)}
              disabled={!canManage}
            />
            Message Content Intent (required for thread transcripts on <code>/create</code>)
          </label>

          {canManage ? (
            <div className="row settings-actions">
              <button type="button" disabled={saving} onClick={() => void saveSecrets()}>
                {saving ? "Saving…" : "Save bot credentials"}
              </button>
            </div>
          ) : (
            <p className="settings-hint">You need secrets permission to edit bot credentials.</p>
          )}
        </>
      ) : null}
    </section>
  );
}
