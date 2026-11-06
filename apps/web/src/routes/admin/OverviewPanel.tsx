import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import {
  formatStorageBytes,
  type InstanceOverviewPublic,
  type PublicUrlCheckPublic,
} from "@teamflow/core";
import { client } from "../../api";
import { adminPath, type AdminSection } from "../../lib/appRoute";
import { formatTimestamp } from "../../lib/format";
import { useInstanceOverviewQuery } from "../../queries/instance";
import { useShell } from "../board/shellContext";
import { FIX_HEALTH, type Health } from "./adminHealth";
import { howToForFix } from "./howTos";

export function StatusDot({ health }: { health: Health }) {
  return <span className={`admin-dot admin-dot--${health}`} aria-hidden="true" />;
}

function Tile({
  title,
  health,
  pill,
  wide,
  children,
  actions,
}: {
  title: string;
  health?: Health;
  pill?: string;
  wide?: boolean;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className={`admin-tile${wide ? " admin-tile--wide" : ""}`} aria-label={title}>
      <header className="admin-tile-head">
        {health ? <StatusDot health={health} /> : null}
        <h3>{title}</h3>
        {pill ? <span className={`admin-pill admin-pill--${health ?? "off"}`}>{pill}</span> : null}
      </header>
      {children}
      {actions ? <div className="admin-tile-actions">{actions}</div> : null}
    </section>
  );
}

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="admin-facts">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function formatUptime(seconds: number) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days} d ${hours} h`;
  if (hours > 0) return `${hours} h ${minutes} min`;
  return `${minutes} min`;
}

const SUPERVISOR_LABEL: Record<InstanceOverviewPublic["server"]["supervisor"], string> = {
  systemd: "systemd",
  "windows-service": "Windows service",
  docker: "Docker",
  none: "not a service",
  unknown: "not detectable",
};

function ServerTile({ server }: { server: InstanceOverviewPublic["server"] }) {
  const [check, setCheck] = useState<PublicUrlCheckPublic | null>(null);
  const [checking, setChecking] = useState(false);
  const runCheck = async () => {
    setChecking(true);
    try {
      setCheck((await client.checkPublicUrl()).check);
    } catch (err) {
      setCheck({
        url: `${server.publicUrl}/health`,
        ok: false,
        status: null,
        error: err instanceof Error ? err.message : "Check failed",
        ms: 0,
      });
    } finally {
      setChecking(false);
    }
  };
  const service = server.serviceName ?? SUPERVISOR_LABEL[server.supervisor] ?? server.supervisor;
  return (
    <Tile
      title="Server"
      health={check && !check.ok ? "warn" : "ok"}
      pill="running"
      actions={
        <button type="button" className="ghost" disabled={checking} onClick={() => void runCheck()}>
          {checking ? "Checking…" : "Check public URL"}
        </button>
      }
    >
      <Facts
        rows={[
          ["Service", service],
          ["Listening", `${server.listen.host}:${server.listen.port}`],
          [
            "Public URL",
            check ? (
              <span className={check.ok ? "admin-ok" : "admin-bad"}>
                {server.publicUrl}{" "}
                {check.ok ? `✓ ${check.ms} ms` : `✗ ${check.error ?? check.status}`}
              </span>
            ) : (
              server.publicUrl
            ),
          ],
          ["Node", `${server.node} · ${server.platform}`],
          ["Up", formatUptime(server.uptimeSec)],
        ]}
      />
    </Tile>
  );
}

function botHealth(bot: InstanceOverviewPublic["bot"]): { health: Health; pill: string } {
  if (!bot.credentialsConfigured) return { health: "off", pill: "not set up" };
  switch (bot.state) {
    case "running":
      return { health: "ok", pill: "running" };
    case "failed":
      return { health: "bad", pill: "failed" };
    case "stopped":
      return { health: bot.unitEnabled ? "warn" : "off", pill: "stopped" };
    case "not_installed":
      return { health: "off", pill: "not installed" };
    default:
      return { health: "off", pill: "unknown" };
  }
}

function DiskTile({ overview }: { overview: InstanceOverviewPublic }) {
  const { disk } = overview;
  const total = disk.totalBytes;
  const used = total !== null && disk.freeBytes !== null ? total - disk.freeBytes : null;
  const parts =
    total && used !== null
      ? [
          { key: "uploads", label: "Uploads", bytes: disk.uploadsBytes },
          { key: "database", label: "Database", bytes: disk.databaseBytes ?? 0 },
          { key: "backups", label: "Backups", bytes: disk.backupsBytes ?? 0 },
        ]
      : [];
  const known = parts.reduce((sum, part) => sum + part.bytes, 0);
  const other = used !== null ? Math.max(0, used - known) : 0;
  const pct = (bytes: number) => (total ? `${Math.min(100, (bytes / total) * 100)}%` : "0%");
  const health: Health = disk.diskLow ? "bad" : disk.freeBytes === null ? "warn" : "ok";
  return (
    <Tile
      title="Disk"
      wide
      health={health}
      pill={
        disk.freeBytes !== null && total !== null
          ? `${formatStorageBytes(disk.freeBytes)} free of ${formatStorageBytes(total)}`
          : "not readable"
      }
    >
      {total ? (
        <>
          <div
            className="admin-bar admin-bar--tall"
            role="img"
            aria-label={`Disk: ${formatStorageBytes(used ?? 0)} used of ${formatStorageBytes(total)}`}
          >
            {parts.map((part) => (
              <i
                key={part.key}
                className={`admin-bar-${part.key}`}
                style={{ width: pct(part.bytes) }}
              />
            ))}
            <i className="admin-bar-other" style={{ width: pct(other) }} />
          </div>
          <ul className="admin-legend">
            {parts.map((part) => (
              <li key={part.key} className={`admin-legend-${part.key}`}>
                {part.label} {formatStorageBytes(part.bytes)}
                {part.key === "backups" && disk.backupsBytes === null ? " (not visible)" : ""}
              </li>
            ))}
            <li className="admin-legend-other">Everything else {formatStorageBytes(other)}</li>
          </ul>
        </>
      ) : (
        <p className="settings-hint">
          The server could not read free space for {disk.uploadDir}. The free-disk floor is not
          enforced until it can.
        </p>
      )}
      <p className="admin-tile-note">
        Caps allocated: <strong>{formatStorageBytes(disk.allocatedCapBytes)}</strong> across{" "}
        {disk.cappedSpaces} capped space{disk.cappedSpaces === 1 ? "" : "s"} · {disk.uncappedSpaces}{" "}
        with no limit ·{" "}
        {disk.floorBytes > 0 ? (
          <>
            uploads stop for everyone below <strong>{formatStorageBytes(disk.floorBytes)}</strong>{" "}
            free
          </>
        ) : (
          "no free-disk floor"
        )}
      </p>
    </Tile>
  );
}

export function OverviewPanel() {
  const navigate = useNavigate();
  const { teamKey } = useShell();
  const query = useInstanceOverviewQuery();
  const go = (section: AdminSection) => navigate(adminPath(teamKey, section));

  if (query.isError) {
    return (
      <div className="settings-panel">
        <header className="settings-panel-header">
          <h2>Overview</h2>
        </header>
        <p className="settings-hint settings-hint--warn" role="alert">
          {query.error instanceof Error ? query.error.message : "Could not load the overview."}
        </p>
      </div>
    );
  }
  const overview = query.data;
  if (!overview) {
    return (
      <div className="settings-panel">
        <header className="settings-panel-header">
          <h2>Overview</h2>
        </header>
        <p className="settings-hint">Checking the server…</p>
      </div>
    );
  }

  const { maintenance, bot, spaces } = overview;
  const version = maintenance.version;
  const botStatus = botHealth(bot);
  const latestBackup = [...maintenance.backups].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  )[0];
  const fullBackup = maintenance.backups.find((backup) => backup.kind === "uploads");

  return (
    <div className="settings-panel">
      <header className="settings-panel-header">
        <h2>Overview</h2>
        <p className="settings-copy settings-lead">
          Checked {formatTimestamp(overview.checkedAt)} ·{" "}
          <button
            type="button"
            className="admin-link"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            {query.isFetching ? "Checking…" : "Check again"}
          </button>
        </p>
      </header>

      <div className="admin-grid">
        <ServerTile server={overview.server} />

        <Tile
          title="Discord bot"
          health={botStatus.health}
          pill={botStatus.pill}
          actions={
            <button type="button" className="ghost" onClick={() => go("bot")}>
              Manage bot
            </button>
          }
        >
          <Facts
            rows={[
              [
                "Service",
                bot.unitInstalled
                  ? `teamflow-discord · ${bot.unitEnabled ? "enabled" : "disabled"}`
                  : bot.managementAvailable
                    ? "not installed"
                    : "not available on this host",
              ],
              ["Credentials", bot.credentialsConfigured ? "saved" : "not saved"],
              ["Talks to", bot.teamflowUrl ?? "—"],
            ]}
          />
        </Tile>

        <Tile
          title="Updates"
          health={!maintenance.enabled ? "off" : version.updateAvailable ? "warn" : "ok"}
          pill={
            !maintenance.enabled
              ? "off"
              : version.updateAvailable
                ? version.commitsBehind
                  ? `${version.commitsBehind} behind`
                  : "update available"
                : "up to date"
          }
          actions={
            <button type="button" className="ghost" onClick={() => go("updates")}>
              Updates & backups
            </button>
          }
        >
          <Facts
            rows={[
              [
                "Running",
                `${version.version}${version.commitShort ? ` · ${version.commitShort}` : ""}${version.branch ? ` · ${version.branch}` : ""}`,
              ],
              ["Latest", version.latestCommitShort ?? (version.gitError ? "unknown" : "—")],
              [
                "Scripts",
                maintenance.enabled
                  ? `update ${maintenance.updateScriptReady ? "✓" : "✗"} · sudo ${maintenance.sudoReady ? "✓" : "✗"}`
                  : (maintenance.reason ?? "off"),
              ],
            ]}
          />
        </Tile>

        <Tile
          title="Backups"
          health={!maintenance.enabled ? "off" : !latestBackup || !fullBackup ? "warn" : "ok"}
          pill={
            !maintenance.enabled
              ? "off"
              : latestBackup
                ? formatTimestamp(latestBackup.createdAt)
                : "none"
          }
          actions={
            <button type="button" className="ghost" onClick={() => go("updates")}>
              Back up…
            </button>
          }
        >
          <Facts
            rows={[
              [
                "Last",
                latestBackup
                  ? `${formatTimestamp(latestBackup.createdAt)} · ${latestBackup.kind === "uploads" ? "uploads" : "database"}`
                  : "none",
              ],
              ["With uploads", fullBackup ? formatTimestamp(fullBackup.createdAt) : "never"],
              ["Folder", maintenance.backupDir ?? "—"],
            ]}
          />
        </Tile>

        <DiskTile overview={overview} />

        <Tile title="Spaces" health={spaces.full > 0 ? "warn" : "ok"} pill={`${spaces.count}`}>
          <Facts
            rows={[
              ["Admin", String(spaces.admin)],
              ["Free", String(spaces.free)],
              ["Near limit", String(spaces.nearLimit)],
              ["Full", String(spaces.full)],
            ]}
          />
        </Tile>

        <section className="admin-tile admin-tile--full" aria-label="Common fixes">
          <header className="admin-tile-head">
            <h3>Common fixes</h3>
            <span className="admin-pill admin-pill--off">from these checks</span>
          </header>
          {overview.fixes.length === 0 ? (
            <p className="settings-hint">Nothing to fix right now.</p>
          ) : (
            <ul className="admin-fixes">
              {overview.fixes.map((fix) => (
                <li key={fix.id} className={`admin-fix admin-fix--${fix.severity}`}>
                  <StatusDot health={FIX_HEALTH[fix.severity]} />
                  <div>
                    <strong>{fix.title}</strong>
                    <p>
                      {fix.detail}{" "}
                      {howToForFix(fix.id) ? (
                        <button
                          type="button"
                          className="admin-link"
                          onClick={() =>
                            navigate(
                              `${adminPath(teamKey, "help")}#howto-${howToForFix(fix.id)!.id}`,
                            )
                          }
                        >
                          How-to
                        </button>
                      ) : null}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
