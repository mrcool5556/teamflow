import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type {
  MaintenanceBackupPublic,
  MaintenanceJobPublic,
  MaintenanceStatusPublic,
  MaintenanceUpdateStep,
} from "@teamflow/core";
import { MAINTENANCE_RELEASE_STEPS } from "@teamflow/core";
import { client } from "../api";
import { useConfirm } from "../ui/confirmContext";
import { queryKeys } from "../queries/keys";
import { useMaintenanceStatusQuery } from "../queries/maintenance";
import { errorMessage } from "../lib/errorSink";
import type { PanelMessage } from "../lib/panelStatus";
import { formatFileSize } from "../lib/format";

/**
 * Settings → Updates (and Server admin → Updates & backups). One card answers "am I up to date?"
 * in one of five states, with one button. Backups, host details, the release channel and the
 * log live under a collapsed Advanced section. Design: docs/mockups/simple-update-v1.html.
 */

type Props = {
  /** Unused: updates and backups are server-wide. Kept so existing callers need no change. */
  teamId?: string;
  canRun: boolean;
  onMessage: PanelMessage;
  /**
   * The backups list under Advanced. The server admin page turns it off and shows its own
   * backup list (components/BackupListSection.tsx) to people with the Backups power.
   */
  showBackups?: boolean;
};

const LINUX_INSTALL =
  "curl -fsSL https://github.com/mrcool5556/teamflow/releases/latest/download/install.sh | sudo bash";
const WINDOWS_INSTALL =
  "irm https://github.com/mrcool5556/teamflow/releases/latest/download/install.ps1 | iex";

/** How far along the bar is when each step starts. */
const STEP_PROGRESS: Record<MaintenanceUpdateStep, number> = {
  download: 8,
  backup: 30,
  install: 50,
  restart: 72,
  check: 88,
};

/** Give up waiting quietly after this long and show how to check the server. */
const RECONNECT_HELP_AFTER_MS = 3 * 60 * 1000;

function formatWhen(iso: string | null | undefined) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function formatDay(iso: string | null | undefined) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function sinceText(iso: string | null) {
  if (!iso) return "not checked yet";
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "checked just now";
  if (minutes < 60) return `checked ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `checked ${hours} h ago`;
  return `checked ${formatDay(iso)}`;
}

/** Release notes: "- item" lines become a list; other lines become short paragraphs. */
function ReleaseNotes({ notes, limit = 8 }: { notes: string; limit?: number }) {
  const lines = notes
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !/^full changelog/i.test(line));
  const items = lines
    .filter((line) => /^[-*] /.test(line))
    .map((line) => line.replace(/^[-*] /, "").replace(/\*\*/g, ""));
  if (items.length > 0) {
    const shown = items.slice(0, limit);
    return (
      <ul>
        {shown.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
        {items.length > shown.length ? <li>…and {items.length - shown.length} more</li> : null}
      </ul>
    );
  }
  return lines.length ? <p>{lines.slice(0, 3).join(" ")}</p> : null;
}

/** The last few lines a person would read (without the STEP/FAIL/DONE machine lines). */
function humanLogTail(log: string, count: number) {
  return log
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(
      (line) =>
        line.trim() && !/^(STEP|FAIL|DONE|BACKUP|RESTORED) /.test(line) && !line.startsWith("> "),
    )
    .slice(-count)
    .join("\n");
}

function backupFromLog(log: string) {
  const match = /^BACKUP database (.+)$/m.exec(log);
  if (!match) return null;
  return match[1].split(/[\\/]/).pop() ?? null;
}

function jobLabel(job: MaintenanceJobPublic) {
  if (job.type === "backup") return job.options.full ? "Full backup" : "Database backup";
  if (job.type === "restore") return `Restore ${job.options.file ?? "backup"}`;
  return job.options.version ? `Update to v${job.options.version}` : "Update";
}

function Dot({ tone }: { tone: "ok" | "new" | "run" | "bad" | "off" }) {
  return <span className={`update-dot update-dot--${tone}`} aria-hidden />;
}

/** Shown while the server is restarting; reloads the page once the new version answers. */
function BackInAMoment({ targetVersion }: { targetVersion: string | null }) {
  const [waitedMs, setWaitedMs] = useState(0);
  useEffect(() => {
    const started = Date.now();
    let stopped = false;
    const controller = new AbortController();
    const tick = async () => {
      if (stopped) return;
      setWaitedMs(Date.now() - started);
      try {
        const health = await client.getHealth(controller.signal);
        if (health.ok && (!targetVersion || health.version === targetVersion)) {
          // A hard reload so the browser fetches the new web app too.
          window.location.reload();
          return;
        }
      } catch {
        // still restarting
      }
      if (!stopped) window.setTimeout(() => void tick(), 2000);
    };
    void tick();
    return () => {
      stopped = true;
      controller.abort();
    };
  }, [targetVersion]);

  const seconds = Math.round(waitedMs / 1000);
  const stuck = waitedMs > RECONNECT_HELP_AFTER_MS;
  return (
    <div className="update-overlay" role="status" aria-live="polite">
      <div className="update-overlay-box">
        {stuck ? (
          <>
            <h3>Still not back</h3>
            <p className="settings-copy">
              Teamflow hasn&apos;t answered for {Math.round(seconds / 60)} minutes. On the server,
              check it with:
            </p>
            <pre className="update-command">
              systemctl status teamflow{"\n"}journalctl -u teamflow -n 50
            </pre>
            <p className="settings-hint">This page keeps trying and reloads by itself.</p>
          </>
        ) : (
          <>
            <span className="update-spinner" aria-hidden />
            <h3>Back in a moment</h3>
            <p className="settings-copy">
              Teamflow is restarting{targetVersion ? ` on v${targetVersion}` : ""}.
              <br />
              This page reloads by itself when it&apos;s ready.
            </p>
            <p className="update-meta">waiting {seconds} s</p>
          </>
        )}
      </div>
    </div>
  );
}

function Steps({ current, failed }: { current: MaintenanceUpdateStep | null; failed: boolean }) {
  const index = current ? MAINTENANCE_RELEASE_STEPS.findIndex((step) => step.id === current) : -1;
  return (
    <ol className="update-steps" aria-label="Update progress">
      {MAINTENANCE_RELEASE_STEPS.map((step, i) => {
        const state = i < index ? "done" : i === index ? (failed ? "fail" : "now") : "todo";
        return (
          <li key={step.id} className={`update-step update-step--${state}`}>
            {state === "done" ? "✓ " : state === "fail" ? "! " : ""}
            {step.label}
          </li>
        );
      })}
    </ol>
  );
}

export function ServerMaintenanceSettingsSection({ canRun, onMessage, showBackups = true }: Props) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const statusQuery = useMaintenanceStatusQuery();
  const status = statusQuery.data ?? null;
  const [busy, setBusy] = useState<string | null>(null);
  const [backupFiles, setBackupFiles] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const job = status?.job ?? null;
  const stopsServer =
    job?.status === "running" && (job.type === "update" || job.type === "restore");
  // While an update or restore runs the app restarts; failed polls then mean "restarting".
  const restarting = statusQuery.isError && stopsServer;

  const setStatus = useCallback(
    (next: MaintenanceStatusPublic) =>
      queryClient.setQueryData<MaintenanceStatusPublic>(queryKeys.maintenance, next),
    [queryClient],
  );

  // The page was loaded by one version; when the server reports another, load the new web app.
  const loadedVersion = useRef<string | null>(null);
  const currentVersion = status?.release.current.version ?? null;
  useEffect(() => {
    if (!currentVersion) return;
    if (loadedVersion.current === null) loadedVersion.current = currentVersion;
    else if (loadedVersion.current !== currentVersion) window.location.reload();
  }, [currentVersion]);

  useEffect(() => {
    if (statusQuery.error && !restarting) {
      onMessage(errorMessage(statusQuery.error, "Failed to load the update status"), "error");
    }
  }, [statusQuery.error, restarting, onMessage]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.maintenance });

  async function run<T>(label: string, action: () => Promise<T>, after?: (result: T) => void) {
    if (!canRun || busy) return;
    setBusy(label);
    onMessage(null);
    try {
      const result = await action();
      after?.(result);
      await refresh();
    } catch (err) {
      onMessage(errorMessage(err, `${label} failed`), "error");
    } finally {
      setBusy(null);
    }
  }

  const checkNow = () =>
    run(
      "Check",
      () => client.checkServerMaintenance(),
      ({ status: next }) => setStatus(next),
    );

  async function startUpdate(version: string, notes: string) {
    if (/breaking/i.test(notes)) {
      const ok = await confirm({
        title: `Update to v${version}?`,
        message:
          "The release notes mention a breaking change. Read them first; the database is backed up before updating.",
        confirmLabel: "Update",
      });
      if (!ok) return;
    }
    await run("Update", () =>
      client.runServerMaintenanceUpdate({ version, backupFull: backupFiles }),
    );
  }

  const dismiss = () => run("Dismiss", () => client.dismissServerMaintenanceJob());

  async function restore(backup: MaintenanceBackupPublic) {
    const ok = await confirm({
      title: `Restore ${backup.name}?`,
      message: `Teamflow restarts and the database goes back to ${formatWhen(backup.createdAt)}. Everything changed since then is replaced. The current database is backed up first, so you can undo this the same way.`,
      confirmLabel: "Restore",
      danger: true,
    });
    if (!ok) return;
    await run("Restore", () => client.runServerMaintenanceRestore({ file: backup.name }));
  }

  function showLog() {
    setAdvancedOpen(true);
    window.setTimeout(() => logRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  if (statusQuery.isPending) return <p className="settings-hint">Loading update status…</p>;
  if (!status) return null;

  const { release, state, lastRun } = status;
  const current = release.current;
  const latest = release.latest;
  const installLine = status.platform === "win32" ? WINDOWS_INSTALL : LINUX_INSTALL;
  const lastUpdateOk =
    job?.type === "update" && job.status === "success" && lastRun?.done === current.version;

  let card: ReactNode;
  if (stopsServer && job) {
    const step = lastRun?.step ?? null;
    const progress = step ? STEP_PROGRESS[step] : 3;
    card = (
      <>
        <div className="update-headline">
          <Dot tone="run" />
          <h3>
            {job.type === "restore"
              ? "Restoring a backup…"
              : `Updating to v${job.options.version ?? latest?.version ?? "the newest version"}…`}
          </h3>
        </div>
        <p className="update-meta">
          Started {formatWhen(job.startedAt)} · closing this tab is fine
        </p>
        <div className="update-bar" aria-hidden>
          <i style={{ width: `${progress}%` }} />
        </div>
        {job.type === "update" ? <Steps current={step} failed={false} /> : null}
        <pre className="update-log-tail">{humanLogTail(job.logTail, 3) || "Starting…"}</pre>
      </>
    );
  } else if (state === "failed" && job) {
    const failure = lastRun?.failure;
    const changed = failure && ["migrate", "health"].includes(failure.code);
    card = (
      <>
        <div className="update-headline">
          <Dot tone="bad" />
          <h3>
            {job.options.version
              ? `Update to v${job.options.version} didn't finish`
              : "The update didn't finish"}
          </h3>
        </div>
        <p className="update-meta">
          {changed
            ? `You're still on v${current.version}: it was rolled back automatically. Nothing was lost.`
            : `Nothing was changed. You're still on v${current.version}.`}
        </p>
        <Steps current={lastRun?.step ?? null} failed />
        <div className="update-callout update-callout--bad">
          {failure
            ? failure.message
            : "The update stopped without saying why. The log has the details."}
        </div>
        <div className="update-actions">
          {canRun && latest ? (
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void startUpdate(latest.version, "")}
            >
              {busy === "Update" ? "Starting…" : "Try again"}
            </button>
          ) : null}
          <button type="button" className="ghost" onClick={showLog}>
            Show log
          </button>
          {canRun ? (
            <button
              type="button"
              className="ghost"
              disabled={Boolean(busy)}
              onClick={() => void dismiss()}
            >
              Dismiss
            </button>
          ) : null}
        </div>
      </>
    );
  } else if (state === "not-set-up") {
    card = (
      <>
        <div className="update-headline">
          <Dot tone="off" />
          <h3>One-click updates aren&apos;t set up on this server</h3>
        </div>
        <p className="update-meta">
          v{current.version}
          {latest && latest.version !== current.version ? ` · v${latest.version} is available` : ""}
        </p>
        <div className="update-callout update-callout--info">
          <p>{status.notSetUpReason}</p>
          {status.enabled || !current.releaseInstall ? (
            <>
              <p>
                Run this once on the server
                {status.platform === "win32" ? " in PowerShell" : " as root"}, then press Check now:
              </p>
              <pre className="update-command">{installLine}</pre>
              <p>
                It&apos;s safe to re-run: it keeps your data and settings and only adds what&apos;s
                missing.
              </p>
            </>
          ) : null}
        </div>
        <div className="update-actions">
          <button
            type="button"
            className="ghost"
            disabled={Boolean(busy)}
            onClick={() => void checkNow()}
          >
            {busy === "Check" ? "Checking…" : "Check now"}
          </button>
        </div>
      </>
    );
  } else if (state === "available" && latest) {
    const released = formatDay(latest.publishedAt);
    card = (
      <>
        <div className="update-headline">
          <Dot tone="new" />
          <h3>v{latest.version} is available</h3>
        </div>
        <p className="update-meta">
          You have v{current.version}
          {released ? ` · released ${released}` : ""}
          {latest.sizeBytes ? ` · ${formatFileSize(latest.sizeBytes)} download` : ""}
        </p>
        <div className="update-notes">
          <strong>What&apos;s new</strong>
          <ReleaseNotes notes={latest.notes} />
          <a href={latest.url} target="_blank" rel="noreferrer">
            Full release notes ↗
          </a>
        </div>
        {canRun ? (
          <div className="update-actions">
            <button
              type="button"
              className="update-primary"
              disabled={Boolean(busy)}
              onClick={() => void startUpdate(latest.version, latest.notes)}
            >
              {busy === "Update" ? "Starting…" : `Update to v${latest.version}`}
            </button>
            <span className="settings-hint">
              Backs up the database first. Teamflow is offline for about 30 seconds.
            </span>
          </div>
        ) : (
          <p className="settings-hint">Only an instance admin can update.</p>
        )}
      </>
    );
  } else {
    const backup = lastUpdateOk && job ? backupFromLog(job.logTail) : null;
    card = (
      <>
        <div className="update-headline">
          <Dot tone="ok" />
          <h3>{lastUpdateOk ? `Updated to v${current.version}` : "You're up to date"}</h3>
        </div>
        <p className="update-meta">
          v{current.version}
          {current.builtAt ? ` · built ${formatDay(current.builtAt)}` : ""} ·{" "}
          {sinceText(release.checkedAt)}
          {" · "}
          <button
            type="button"
            className="admin-link"
            disabled={Boolean(busy)}
            onClick={() => void checkNow()}
          >
            {busy === "Check" ? "Checking…" : "Check now"}
          </button>
        </p>
        {release.checkError ? <p className="settings-hint">{release.checkError}</p> : null}
        {!release.checkEnabled ? (
          <p className="settings-hint">
            The update check is turned off (TEAMFLOW_UPDATE_CHECK=false).
          </p>
        ) : null}
        {lastUpdateOk ? (
          <div className="update-callout update-callout--ok">
            Everything&apos;s running. Members pick up the new version next time they load a page.
            {backup ? ` The database was backed up to ${backup}.` : ""}
            {canRun ? (
              <>
                {" "}
                <button type="button" className="admin-link" onClick={() => void dismiss()}>
                  OK
                </button>
              </>
            ) : null}
          </div>
        ) : latest && latest.version === current.version && latest.notes ? (
          <div className="update-notes">
            <strong>What came in v{current.version}</strong>
            <ReleaseNotes notes={latest.notes} limit={4} />
            <a href={latest.url} target="_blank" rel="noreferrer">
              All release notes ↗
            </a>
          </div>
        ) : null}
      </>
    );
  }

  const otherJob = job && !stopsServer && job.type !== "update" ? job : null;

  return (
    <div className="update-page">
      <section
        className="update-card"
        aria-label="Update status"
        data-state={stopsServer ? "updating" : state}
      >
        {card}
        {restarting ? (
          <BackInAMoment
            targetVersion={job?.type === "update" ? (job.options.version ?? null) : null}
          />
        ) : null}
      </section>

      {otherJob && otherJob.status === "running" ? (
        <p className="settings-hint">{jobLabel(otherJob)} is running…</p>
      ) : null}

      <details
        className="update-advanced"
        open={advancedOpen}
        onToggle={(event) => setAdvancedOpen((event.target as HTMLDetailsElement).open)}
      >
        <summary>Advanced</summary>
        <div className="update-advanced-body">
          {canRun && status.enabled ? (
            <>
              <h4>Update options</h4>
              <label className="update-check">
                <input
                  type="checkbox"
                  checked={backupFiles}
                  onChange={(event) => setBackupFiles(event.target.checked)}
                />
                Also back up uploaded files before updating (slow with many files)
              </label>
              <label className="update-field">
                <span>Release channel</span>
                <select
                  value={release.channel}
                  disabled={Boolean(busy)}
                  onChange={(event) =>
                    void run(
                      "Channel",
                      () =>
                        client.setServerMaintenanceSettings({
                          channel: event.target.value as "stable" | "prerelease",
                        }),
                      ({ status: next }) => setStatus(next),
                    )
                  }
                >
                  <option value="stable">Stable</option>
                  <option value="prerelease">Pre-release</option>
                </select>
              </label>
            </>
          ) : null}

          {showBackups ? (
            <>
              <h4>Backups</h4>
              {canRun && status.enabled ? (
                <div className="update-actions">
                  <button
                    type="button"
                    className="ghost"
                    disabled={
                      Boolean(busy) || job?.status === "running" || !status.backupScriptReady
                    }
                    onClick={() =>
                      void run("Backup", () => client.runServerMaintenanceBackup({ full: false }))
                    }
                  >
                    Back up database now
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    disabled={
                      Boolean(busy) || job?.status === "running" || !status.backupScriptReady
                    }
                    onClick={() =>
                      void run("Backup", () => client.runServerMaintenanceBackup({ full: true }))
                    }
                  >
                    Full backup (with files)
                  </button>
                </div>
              ) : null}
              {status.backups.length === 0 ? (
                <p className="settings-hint">No backups yet.</p>
              ) : (
                <table className="maintenance-backup-table">
                  <thead>
                    <tr>
                      <th>File</th>
                      <th>Type</th>
                      <th>Size</th>
                      <th>Created</th>
                      {canRun ? <th aria-label="Actions" /> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {status.backups.map((backup) => (
                      <tr key={backup.name}>
                        <td>
                          <code>{backup.name}</code>
                        </td>
                        <td>
                          {backup.kind === "uploads"
                            ? "Files"
                            : backup.kind === "checkpoint"
                              ? "Checkpoint"
                              : "Database"}
                        </td>
                        <td>{formatFileSize(backup.sizeBytes, 2)}</td>
                        <td>{formatWhen(backup.createdAt)}</td>
                        {canRun ? (
                          <td>
                            {backup.restorable && status.enabled ? (
                              <button
                                type="button"
                                className="admin-link"
                                disabled={Boolean(busy) || job?.status === "running"}
                                onClick={() => void restore(backup)}
                              >
                                Restore…
                              </button>
                            ) : null}
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {status.backupDir ? (
                <p className="settings-hint">
                  Folder: <code>{status.backupDir}</code> · keeps the newest 10 database backups
                </p>
              ) : null}
            </>
          ) : null}

          <h4>Host</h4>
          <dl className="update-facts">
            <dt>Install type</dt>
            <dd>
              {current.releaseInstall
                ? `Prebuilt release${current.platform ? ` (${current.platform})` : ""}`
                : "Git checkout (development)"}
            </dd>
            <dt>Version</dt>
            <dd>
              v{current.version}
              {current.commit ? (
                <>
                  {" · "}
                  <code>{current.commit.slice(0, 7)}</code>
                </>
              ) : null}
              {current.builtAt ? ` · built ${formatWhen(current.builtAt)}` : ""}
            </dd>
            <dt>Maintenance</dt>
            <dd>{status.enabled ? "On" : (status.reason ?? "Off")}</dd>
            {status.enabled ? (
              <>
                <dt>Maintenance sudo</dt>
                <dd>
                  {status.sudoPending
                    ? "Update in progress"
                    : status.sudoReady
                      ? "Ready"
                      : (status.sudoDetail ?? "Missing")}
                </dd>
                <dt>Update script</dt>
                <dd>
                  <code>{status.updateScript ?? "—"}</code>
                  {status.updateScriptReady ? "" : " (missing)"}
                </dd>
              </>
            ) : null}
            <dt>Update check</dt>
            <dd>
              {release.checkEnabled
                ? `${release.channel === "prerelease" ? "Pre-release" : "Stable"} channel · ${sinceText(release.checkedAt)}`
                : "Off (TEAMFLOW_UPDATE_CHECK=false)"}
            </dd>
          </dl>

          <h4>Logs</h4>
          <div ref={logRef}>
            {job ? (
              <>
                <p className="settings-copy">
                  <strong>{jobLabel(job)}</strong> · {job.status}
                  {job.finishedAt
                    ? ` · finished ${formatWhen(job.finishedAt)}`
                    : ` · started ${formatWhen(job.startedAt)}`}
                </p>
                <pre className="maintenance-log">{job.logTail || "Waiting for log output…"}</pre>
              </>
            ) : (
              <p className="settings-hint">No recent update or backup.</p>
            )}
            <p className="settings-hint">
              On the server:{" "}
              <code>
                {status.platform === "win32"
                  ? "teamflow-update.ps1 -Help"
                  : "sudo teamflow-update --help"}
              </code>
            </p>
          </div>
        </div>
      </details>
    </div>
  );
}
