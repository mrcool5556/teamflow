import { useCallback, useEffect, useState } from "react";
import type { MaintenanceJobPublic, MaintenanceStatusPublic } from "@teamflow/core";
import {
  MAINTENANCE_UPDATE_STEPS,
  inferUpdatePhase,
  updatePhaseIndex,
} from "@teamflow/core";
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

function MaintenanceStatusCard({
  status,
  serverUnreachable,
  refreshing,
  onRefresh,
}: {
  status: MaintenanceStatusPublic;
  serverUnreachable: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const { version, job } = status;
  const jobRunning = job?.status === "running";
  const updateRunning = jobRunning && job?.type === "update";
  const phase = job ? inferUpdatePhase(job.logTail, job) : null;
  const phaseIdx = phase !== null ? updatePhaseIndex(phase) : -1;

  const deployState = serverUnreachable
    ? "restarting"
    : updateRunning
      ? "updating"
      : jobRunning
        ? "busy"
        : version.updateAvailable
          ? "update-available"
          : "online";

  const deployLabel =
    deployState === "restarting"
      ? "Restarting"
      : deployState === "updating"
        ? "Updating"
        : deployState === "busy"
          ? "Running job"
          : deployState === "update-available"
            ? "Update available"
            : "Up to date";

  return (
    <section className="maintenance-status-card">
      <div className="maintenance-status-card-top">
        <div>
          <p className="eyebrow">Deployed version</p>
          <div className="maintenance-version-line">
            <span className="maintenance-version-tag">v{version.version}</span>
            {version.branch ? (
              <span className="maintenance-version-meta">{version.branch}</span>
            ) : null}
            {version.commitShort ? (
              <code className="maintenance-version-sha">{version.commitShort}</code>
            ) : null}
          </div>
          {version.commitDate ? (
            <p className="settings-copy muted maintenance-version-deployed">
              Deployed {formatWhen(version.commitDate)}
            </p>
          ) : null}
          {version.updateAvailable && version.latestCommitShort ? (
            <p className="settings-copy maintenance-version-behind">
              Origin has <code>{version.latestCommitShort}</code>
              {version.commitsBehind && version.commitsBehind > 0
                ? ` · ${version.commitsBehind} commit${version.commitsBehind === 1 ? "" : "s"} behind`
                : null}
            </p>
          ) : !version.gitError && version.latestCommitShort && version.commitShort ? (
            <p className="settings-copy muted">Matches latest on origin.</p>
          ) : null}
          {version.gitError ? (
            <p className="settings-copy issue-link-row-files-error">{version.gitError}</p>
          ) : null}
        </div>
        <div className="maintenance-status-pills">
          <span className={`maintenance-pill maintenance-pill--${deployState}`}>{deployLabel}</span>
          {status.enabled ? (
            <span
              className={`maintenance-pill maintenance-pill--${status.sudoReady ? "ok" : "warn"}`}
            >
              {status.sudoReady ? "Sudo ready" : "Sudo missing"}
            </span>
          ) : null}
          {!status.backupScriptReady || !status.updateScriptReady ? (
            <span className="maintenance-pill maintenance-pill--warn">Scripts incomplete</span>
          ) : null}
        </div>
      </div>

      {updateRunning && phase !== null ? (
        <ol className="maintenance-stepper" aria-label="Update progress">
          {MAINTENANCE_UPDATE_STEPS.filter((step) => step.id !== "done").map((step, index) => {
            const stepIdx = updatePhaseIndex(step.id);
            const done = phaseIdx > stepIdx;
            const active = phase === step.id || (phase === "failed" && step.id === "health");
            const failed = phase === "failed" && active;
            return (
              <li
                key={step.id}
                className={[
                  "maintenance-step",
                  done ? "maintenance-step--done" : "",
                  active ? "maintenance-step--active" : "",
                  failed ? "maintenance-step--failed" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <span className="maintenance-step-marker" aria-hidden>
                  {done ? "✓" : failed ? "!" : index + 1}
                </span>
                <span className="maintenance-step-label">{step.label}</span>
              </li>
            );
          })}
        </ol>
      ) : null}

      {serverUnreachable ? (
        <p className="maintenance-restart-banner">
          Server is restarting — status polling will resume automatically. This is normal during
          updates.
        </p>
      ) : null}

      <div className="maintenance-status-card-actions">
        <button type="button" className="ghost" disabled={refreshing} onClick={onRefresh}>
          {refreshing ? "Refreshing…" : "Refresh status"}
        </button>
      </div>
    </section>
  );
}

export function ServerMaintenanceSettingsSection({
  teamId,
  canRun,
  onMessage,
}: ServerMaintenanceSettingsSectionProps) {
  const [status, setStatus] = useState<MaintenanceStatusPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [serverUnreachable, setServerUnreachable] = useState(false);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [updateBranch, setUpdateBranch] = useState("");

  const loadStatus = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) setRefreshing(true);
      try {
        const { status: next } = await client.getServerMaintenanceStatus(teamId);
        setStatus(next);
        setServerUnreachable(false);
        return next;
      } catch (err) {
        setStatus((current) => {
          if (current?.job?.status === "running") {
            setServerUnreachable(true);
            return current;
          }
          onMessage(err instanceof Error ? err.message : "Failed to load maintenance status");
          return current;
        });
        return null;
      } finally {
        setLoading(false);
        if (!options?.silent) setRefreshing(false);
      }
    },
    [onMessage, teamId],
  );

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (status?.job?.status !== "running" && !serverUnreachable) return;
    const timer = window.setInterval(() => {
      void loadStatus({ silent: true });
    }, 2000);
    return () => window.clearInterval(timer);
  }, [loadStatus, serverUnreachable, status?.job?.status]);

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
      void loadStatus({ silent: true });
    } catch (err) {
      onMessage(err instanceof Error ? err.message : `Failed to start ${label.toLowerCase()}`);
    } finally {
      setRunningAction(null);
    }
  }

  const jobRunning = status?.job?.status === "running";
  const actionsDisabled =
    !canRun || !status?.enabled || !status.sudoReady || jobRunning || Boolean(runningAction);

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
          <MaintenanceStatusCard
            status={status}
            serverUnreachable={serverUnreachable}
            refreshing={refreshing}
            onRefresh={() => void loadStatus()}
          />

          <section className="settings-section">
            <h3>Host status</h3>
            {status.enabled ? (
              <p className="settings-copy">
                Maintenance is enabled on this host.
                {status.sudoDetail ? (
                  <>
                    {" "}
                    <span className="issue-link-row-files-error">{status.sudoDetail}</span>
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
                uploaded files.
                {status.version.updateAvailable ? (
                  <>
                    {" "}
                    <strong>An update is available</strong> — use Update app below to deploy it.
                  </>
                ) : null}
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
                  className={status.version.updateAvailable ? "" : undefined}
                  disabled={actionsDisabled || !status.updateScriptReady}
                  onClick={() =>
                    void runAction("Update", () => client.runServerMaintenanceUpdate(teamId, {}))
                  }
                >
                  {runningAction === "Update"
                    ? "Starting…"
                    : status.version.updateAvailable
                      ? "Update app (new version)"
                      : "Update app"}
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
