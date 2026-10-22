import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { DiscordBotServiceStatusPublic } from "@teamflow/core";
import { client } from "../api";
import { queryKeys } from "../queries/keys";
import { useDiscordServiceQuery } from "../queries/integrations";
import { errorMessage } from "../lib/errorSink";
import type { PanelMessage } from "../lib/panelStatus";

type DiscordBotServiceSectionProps = {
  teamId: string;
  canManage: boolean;
  onMessage: PanelMessage;
  onSecretsRefresh?: () => void;
};

function stateLabel(state: DiscordBotServiceStatusPublic["state"]) {
  switch (state) {
    case "running":
      return "Running";
    case "stopped":
      return "Stopped";
    case "not_installed":
      return "Not installed";
    case "failed":
      return "Failed";
    default:
      return "Unknown";
  }
}

export function DiscordBotServiceSection({
  teamId,
  canManage,
  onMessage,
  onSecretsRefresh,
}: DiscordBotServiceSectionProps) {
  const queryClient = useQueryClient();
  const statusQuery = useDiscordServiceQuery(teamId);
  const status = statusQuery.data ?? null;
  const loading = statusQuery.isFetching;
  const [busy, setBusy] = useState(false);

  function setStatus(next: DiscordBotServiceStatusPublic) {
    queryClient.setQueryData(queryKeys.discordService(teamId), next);
  }

  function loadStatus() {
    return statusQuery.refetch();
  }

  useEffect(() => {
    if (statusQuery.error) {
      onMessage(errorMessage(statusQuery.error, "Failed to load Discord bot service status"), "error");
    }
  }, [statusQuery.error, onMessage]);

  async function runAction(
    action: "enable" | "restart" | "stop",
    fn: () => Promise<{ status: DiscordBotServiceStatusPublic }>,
  ) {
    if (!canManage) return;
    setBusy(true);
    onMessage(null);
    try {
      const { status: next } = await fn();
      setStatus(next);
      onSecretsRefresh?.();
      if (action === "enable") {
        onMessage(
          next.state === "running"
            ? "Discord bot is running on this server."
            : "Discord bot service enabled. Check status below if it is not running yet.",
        );
      } else if (action === "restart") {
        onMessage("Discord bot restarted.");
      } else {
        onMessage("Discord bot stopped.");
      }
    } catch (err) {
      onMessage(errorMessage(err, `Failed to ${action} Discord bot`), "error");
    } finally {
      setBusy(false);
    }
  }

  if (loading && !status) {
    return (
      <section className="settings-section">
        <h3>Discord bot on this server</h3>
        <p className="settings-hint">Loading service status…</p>
      </section>
    );
  }

  if (!status) return null;

  const isWindowsDev = status.platform === "win32";
  const canUseService = status.managementAvailable;
  const credentialsConfigured = status.credentialsConfigured;
  const showActions = canManage && canUseService && credentialsConfigured;

  return (
    <section className="settings-section discord-bot-service">
      <h3>Discord bot on this server</h3>
      <p className="settings-copy">
        On Linux installs, Teamflow can install and run the Discord bot on the same host. Save bot
        credentials above, then enable the service here — no SSH or manual <code>.env</code> edits.
      </p>

      {isWindowsDev ? (
        <p className="settings-hint">
          Local Windows dev: run <code>pnpm dev:discord</code> in the Teamflow repo after saving
          credentials.
        </p>
      ) : null}

      {!isWindowsDev && !canUseService && status.managementReason ? (
        <p className="settings-hint settings-hint--warn">{status.managementReason}</p>
      ) : null}

      <div className="maintenance-status-pills">
        <span
          className={`maintenance-pill maintenance-pill--${
            status.state === "running" ? "ok" : status.state === "failed" ? "warn" : "warn"
          }`}
        >
          {stateLabel(status.state)}
        </span>
        {status.unitInstalled ? (
          <span className="maintenance-pill maintenance-pill--ok">Service installed</span>
        ) : (
          <span className="maintenance-pill maintenance-pill--warn">Service not installed</span>
        )}
        {status.botConfigKeyConfigured ? (
          <span className="maintenance-pill maintenance-pill--ok">Config key ready</span>
        ) : (
          <span className="maintenance-pill maintenance-pill--warn">Config key pending</span>
        )}
        {status.credentialsConfigured ? (
          <span className="maintenance-pill maintenance-pill--ok">Credentials saved</span>
        ) : (
          <span className="maintenance-pill maintenance-pill--warn">Credentials incomplete</span>
        )}
      </div>

      {!credentialsConfigured ? (
        <p className="settings-hint settings-hint--warn">
          Save bot token, client ID, and PAT above before enabling the bot service.
        </p>
      ) : null}

      {showActions ? (
        <div className="row settings-actions maintenance-actions">
          {status.state === "not_installed" ||
          status.state === "stopped" ||
          status.state === "failed" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void runAction("enable", () => client.enableDiscordBotService(teamId))}
            >
              {busy ? "Working…" : "Enable Discord bot"}
            </button>
          ) : null}
          {status.unitInstalled && status.state === "running" ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void runAction("restart", () => client.restartDiscordBotService(teamId))
                }
              >
                {busy ? "Working…" : "Restart bot"}
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={busy}
                onClick={() => void runAction("stop", () => client.stopDiscordBotService(teamId))}
              >
                Stop bot
              </button>
            </>
          ) : null}
          <button
            type="button"
            className="button-secondary"
            disabled={busy}
            onClick={() => void loadStatus()}
          >
            Refresh status
          </button>
        </div>
      ) : null}

      {status.lastLogTail ? (
        <details className="settings-advanced">
          <summary>Service log</summary>
          <pre className="maintenance-log">{status.lastLogTail}</pre>
        </details>
      ) : null}
    </section>
  );
}
