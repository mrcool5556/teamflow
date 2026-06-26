import { useCallback, useEffect, useState } from "react";
import type { MaintenanceJobPublic, MaintenanceStatusPublic } from "@teamflow/core";
import { client } from "../api";

type ServerMaintenanceSettingsSectionProps = {
  teamId: string;
  canRun: boolean;
  onMessage: (message: string | null) => void;
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatWhen(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

function jobLabel(job: MaintenanceJobPublic) {
  if (job.type === "backup") {
    return job.options.full ? "Full backup" : "Database backup";
  }
  if (job.options.backupFull) return "Update (with full backup)";
  if (job.options.skipBackup) return "Update (no backup)";
  return "Update";
}

export function ServerMaintenanceSettingsSection({
  teamId,
  canRun,
  onMessage,
}: ServerMaintenanceSettingsSectionProps) {
  const [status, setStatus] = useState<MaintenanceStatusPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [updateBranch, setUpdateBranch] = useState("");

  const loadStatus = useCallback(async () => {
    try {
      const { status: next } = await client.getServerMaintenanceStatus(teamId);
      setStatus(next);
      return next;
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "Failed to load maintenance status");
      return null;
    } finally {
      setLoading(false);
    }
  }, [onMessage, teamId]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (status?.job?.status !== "running") return;
    const timer = window.setInterval(() => {
      void loadStatus();
    }, 2000);
    return () => window.clearInterval(timer);
  }, [loadStatus, status?.job?.status]);

  async function runAction(
    label: string,
    action: () => Promise<{ job: MaintenanceJobPublic }>,
  ) {
    if (!canRun) return;
    const confirmed = window.confirm(
      `${label} will run on the server host. The app may restart during an update. Continue?`,
    );
    if (!confirmed) return;

    setRunningAction(label);
    onMessage(null);
    try {
      const { job } = await action();
      setStatus((current) =>
        current
          ? {
              ...current,
              job,
            }
          : current,
      );
      onMessage(`${label} started.`);
      void loadStatus();
    } catch (err) {
      onMessage(err instanceof Error ? err.message : `Failed to start ${label.toLowerCase()}`);
    } finally {
      setRunningAction(null);
    }
  }

  const jobRunning = status?.job?.status === "running";
  const actionsDisabled = !canRun || !status?.enabled || jobRunning || Boolean(runningAction);

  return (
    <div className="settings-panel">
      <header className="settings-panel-header">
        <h2>Updates & backups</h2>
        <p className="settings-copy settings-lead">
          Run the same maintenance commands as <code>sudo teamflow-backup</code> and{" "}
          <code>sudo update</code> from the UI — no SSH required.
        </p>
      </header>

      {loading ? <p className="settings-hint">Loading server status…</p> : null}

      {!loading && status ? (
        <>
          <section className="settings-section">
            <h3>Host status</h3>
            {status.enabled ? (
              <p className="settings-copy">
                Maintenance is enabled on this host.
                {!status.backupScriptReady || !status.updateScriptReady ? (
                  <>
                    {" "}
                    Scripts: backup {status.backupScriptReady ? "ok" : "missing"}, update{" "}
                    {status.updateScriptReady ? "ok" : "missing"}.
                  </>
                ) : null}
              </p>
            ) : (
              <p className="settings-copy settings-hint">{status.reason}</p>
            )}
            {status.backupDir ? (
              <p className="settings-copy muted">
                Backup folder: <code>{status.backupDir}</code>
              </p>
            ) : null}
          </section>

          {canRun && status.enabled ? (
            <section className="settings-section">
              <h3>Actions</h3>
              <p className="settings-copy">
                Database-only backups are fast and run before updates by default. Full backups include
                uploaded files. On the server, run{" "}
                <code>sudo bash deploy/proxmox-lxc/setup-maintenance-sudo.sh</code> once so updates work
                without a password prompt.
              </p>
              <div className="maintenance-actions row">
                <button
                  type="button"
                  disabled={actionsDisabled || !status.backupScriptReady}
                  onClick={() =>
                    void runAction("Database backup", () =>
                      client.runServerMaintenanceBackup(teamId, { full: false }),
                    )
                  }
                >
                  {runningAction === "Database backup" ? "Starting…" : "Backup database"}
                </button>
                <button
                  type="button"
                  disabled={actionsDisabled || !status.backupScriptReady}
                  onClick={() =>
                    void runAction("Full backup", () =>
                      client.runServerMaintenanceBackup(teamId, { full: true }),
                    )
                  }
                >
                  {runningAction === "Full backup" ? "Starting…" : "Full backup"}
                </button>
              </div>
              <div className="maintenance-actions row">
                <button
                  type="button"
                  disabled={actionsDisabled || !status.updateScriptReady}
                  onClick={() =>
                    void runAction("Update", () => client.runServerMaintenanceUpdate(teamId, {}))
                  }
                >
                  {runningAction === "Update" ? "Starting…" : "Update app"}
                </button>
                <button
                  type="button"
                  disabled={actionsDisabled || !status.updateScriptReady}
                  onClick={() =>
                    void runAction("Update (with full backup)", () =>
                      client.runServerMaintenanceUpdate(teamId, { backupFull: true }),
                    )
                  }
                >
                  {runningAction === "Update (with full backup)"
                    ? "Starting…"
                    : "Update + full backup"}
                </button>
              </div>
              <label>
                Optional git branch
                <input
                  value={updateBranch}
                  onChange={(e) => setUpdateBranch(e.target.value)}
                  placeholder="main"
                  disabled={actionsDisabled}
                />
              </label>
              {updateBranch.trim() ? (
                <button
                  type="button"
                  className="ghost"
                  disabled={actionsDisabled || !status.updateScriptReady}
                  onClick={() =>
                    void runAction(`Update branch ${updateBranch.trim()}`, () =>
                      client.runServerMaintenanceUpdate(teamId, {
                        branch: updateBranch.trim(),
                      }),
                    )
                  }
                >
                  Update from branch
                </button>
              ) : null}
            </section>
          ) : null}

          {status.job ? (
            <section className="settings-section">
              <h3>Current job</h3>
              <p className="settings-copy">
                <strong>{jobLabel(status.job)}</strong> — {status.job.status}
                {status.job.finishedAt
                  ? ` · finished ${formatWhen(status.job.finishedAt)}`
                  : ` · started ${formatWhen(status.job.startedAt)}`}
              </p>
              {status.job.logTail ? (
                <pre className="maintenance-log">{status.job.logTail}</pre>
              ) : (
                <p className="settings-hint">Waiting for log output…</p>
              )}
            </section>
          ) : null}

          <section className="settings-section">
            <h3>Backups on disk</h3>
            {status.backups.length === 0 ? (
              <p className="settings-hint">No backups found yet.</p>
            ) : (
              <table className="maintenance-backup-table">
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Type</th>
                    <th>Size</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {status.backups.map((backup) => (
                    <tr key={backup.name}>
                      <td>
                        <code>{backup.name}</code>
                      </td>
                      <td>{backup.kind === "uploads" ? "Uploads" : "Database"}</td>
                      <td>{formatBytes(backup.sizeBytes)}</td>
                      <td>{formatWhen(backup.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <button type="button" className="ghost" onClick={() => void loadStatus()}>
              Refresh list
            </button>
          </section>
        </>
      ) : null}
    </div>
  );
}
