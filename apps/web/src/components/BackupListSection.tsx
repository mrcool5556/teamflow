import { useEffect, useId, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BACKUP_KEEP_MAX,
  BACKUP_KEEP_MIN,
  type BackupRetention,
  type MaintenanceBackupKind,
  type MaintenanceBackupListPublic,
  type MaintenanceBackupPublic,
} from "@teamflow/core";
import { client } from "../api";
import { errorMessage } from "../lib/errorSink";
import { formatFileSize } from "../lib/format";
import type { PanelMessage } from "../lib/panelStatus";
import { queryKeys } from "../queries/keys";
import { useConfirm } from "../ui/confirmContext";

const KIND_LABEL: Record<MaintenanceBackupKind, string> = {
  database: "database",
  uploads: "uploads",
  checkpoint: "checkpoint",
};

function formatWhen(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Server admin → Updates & backups, for the Backups power: every backup with its date, type and
 * size, Delete (never the newest database backup), the total used, and how many to keep.
 * Design: docs/mockups/server-owner-v1.html.
 */
export function BackupListSection({
  maintenanceEnabled,
  backupReady,
  busy,
  onMessage,
}: {
  maintenanceEnabled: boolean;
  /** The backup script can run (sudo rule installed). */
  backupReady: boolean;
  /** A maintenance job is running: hold off on starting another. */
  busy: boolean;
  onMessage: PanelMessage;
}) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [working, setWorking] = useState<string | null>(null);
  const list = useQuery({
    queryKey: queryKeys.backupList,
    queryFn: ({ signal }) => client.withSignal(signal).listServerBackups(),
    retry: false,
  });

  const setList = (next: MaintenanceBackupListPublic) =>
    queryClient.setQueryData(queryKeys.backupList, next);
  const afterJob = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.maintenance });
    void queryClient.invalidateQueries({ queryKey: queryKeys.backupList });
  };

  const startBackup = async (full: boolean) => {
    setWorking(full ? "full" : "db");
    try {
      await client.runServerMaintenanceBackup({ full });
      onMessage(full ? "Full backup started." : "Database backup started.");
      afterJob();
    } catch (err) {
      onMessage(errorMessage(err, "Could not start the backup"), "error");
    } finally {
      setWorking(null);
    }
  };

  const restore = async (backup: MaintenanceBackupPublic) => {
    const ok = await confirm({
      title: `Restore ${backup.name}?`,
      message: `Teamflow restarts and the database goes back to ${formatWhen(backup.createdAt)}. Everything changed since then is replaced. The current database is backed up first, so you can undo this the same way.`,
      confirmLabel: "Restore",
      danger: true,
    });
    if (!ok) return;
    setWorking(backup.name);
    try {
      await client.runServerMaintenanceRestore({ file: backup.name });
      onMessage(`Restoring ${backup.name}…`);
      afterJob();
    } catch (err) {
      onMessage(errorMessage(err, "Could not restore"), "error");
    } finally {
      setWorking(null);
    }
  };

  const remove = async (backup: MaintenanceBackupPublic) => {
    const ok = await confirm({
      title: `Delete ${backup.name} for good?`,
      message: `This can't be undone. It frees ${formatFileSize(backup.sizeBytes, 2)}.${
        backup.kind === "database" ? " The newest database backup stays." : ""
      }`,
      confirmLabel: "Delete backup",
      danger: true,
    });
    if (!ok) return;
    setWorking(backup.name);
    try {
      setList(await client.deleteServerBackup(backup.name));
      onMessage(`Deleted ${backup.name}.`);
    } catch (err) {
      onMessage(errorMessage(err, "Could not delete the backup"), "error");
    } finally {
      setWorking(null);
    }
  };

  const data = list.data;
  const disabled = busy || Boolean(working);

  return (
    <section className="settings-section backup-list" aria-label="Backups">
      <h3>Backups</h3>
      {list.isError ? (
        <p className="settings-hint settings-hint--warn" role="alert">
          {errorMessage(list.error, "Could not list the backups.")}
        </p>
      ) : !data ? (
        <p className="settings-hint">Loading…</p>
      ) : (
        <>
          <div className="backup-list-head">
            <span>
              <strong className="backup-list-total">{formatFileSize(data.totalBytes, 2)}</strong>{" "}
              used by {data.backups.length} backup{data.backups.length === 1 ? "" : "s"}
            </span>
            {data.backupDir ? <code className="muted">{data.backupDir}</code> : null}
            {maintenanceEnabled ? (
              <span className="backup-list-actions">
                <button
                  type="button"
                  className="ghost"
                  disabled={disabled || !backupReady}
                  onClick={() => void startBackup(false)}
                >
                  Back up database
                </button>
                <button
                  type="button"
                  disabled={disabled || !backupReady}
                  onClick={() => void startBackup(true)}
                >
                  Full backup (with files)
                </button>
              </span>
            ) : null}
          </div>
          {data.backups.length === 0 ? (
            <p className="settings-hint">No backups yet.</p>
          ) : (
            <table className="maintenance-backup-table backup-list-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th className="backup-list-name">Name</th>
                  <th>Size</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {data.backups.map((backup) => (
                  <tr key={backup.name}>
                    <td>{formatWhen(backup.createdAt)}</td>
                    <td>
                      <span className={`backup-kind backup-kind--${backup.kind}`}>
                        {KIND_LABEL[backup.kind]}
                      </span>
                    </td>
                    <td className="backup-list-name">
                      <code>{backup.name}</code>
                    </td>
                    <td>{formatFileSize(backup.sizeBytes, 2)}</td>
                    <td className="backup-list-row-actions">
                      {backup.restorable && maintenanceEnabled ? (
                        <button
                          type="button"
                          className="ghost"
                          disabled={disabled}
                          onClick={() => void restore(backup)}
                        >
                          Restore
                        </button>
                      ) : null}
                      {backup.deletable ? (
                        <button
                          type="button"
                          className="ghost danger"
                          disabled={disabled}
                          aria-label={`Delete ${backup.name}`}
                          onClick={() => void remove(backup)}
                        >
                          Delete
                        </button>
                      ) : (
                        <span className="muted backup-list-kept">newest, kept</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <KeepFields retention={data.retention} onMessage={onMessage} />
        </>
      )}
    </section>
  );
}

function KeepFields({
  retention,
  onMessage,
}: {
  retention: BackupRetention;
  onMessage: PanelMessage;
}) {
  const queryClient = useQueryClient();
  const dbId = useId();
  const upId = useId();
  const [db, setDb] = useState(String(retention.keepDatabaseBackups));
  const [up, setUp] = useState(String(retention.keepUploadArchives));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 2500);
    return () => clearTimeout(timer);
  }, [saved]);

  const valid = (text: string) => {
    const n = Number(text);
    return Number.isInteger(n) && n >= BACKUP_KEEP_MIN && n <= BACKUP_KEEP_MAX;
  };
  const changed =
    Number(db) !== retention.keepDatabaseBackups || Number(up) !== retention.keepUploadArchives;

  const save = async () => {
    if (!valid(db) || !valid(up) || !changed) return;
    setSaving(true);
    try {
      const { retention: next } = await client.setServerBackupRetention({
        keepDatabaseBackups: Number(db),
        keepUploadArchives: Number(up),
      });
      queryClient.setQueryData<MaintenanceBackupListPublic>(queryKeys.backupList, (old) =>
        old ? { ...old, retention: next } : old,
      );
      setSaved(true);
    } catch (err) {
      onMessage(errorMessage(err, "Could not save"), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="backup-keep"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="settings-field">
        <label className="settings-field-label" htmlFor={dbId}>
          Keep database backups
        </label>
        <input
          id={dbId}
          inputMode="numeric"
          value={db}
          aria-invalid={!valid(db) || undefined}
          onChange={(e) => setDb(e.target.value)}
          onBlur={() => void save()}
        />
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor={upId}>
          Keep upload archives
        </label>
        <input
          id={upId}
          inputMode="numeric"
          value={up}
          aria-invalid={!valid(up) || undefined}
          onChange={(e) => setUp(e.target.value)}
          onBlur={() => void save()}
        />
      </div>
      <button
        type="submit"
        className="ghost"
        disabled={!changed || saving || !valid(db) || !valid(up)}
      >
        {saving ? "Saving…" : "Save"}
      </button>
      <span className="settings-field-hint" role="status">
        {saved
          ? "Saved."
          : !valid(db) || !valid(up)
            ? `Enter a number from ${BACKUP_KEEP_MIN} to ${BACKUP_KEEP_MAX}.`
            : "Older automatic backups are deleted after each backup. Checkpoints are never deleted automatically."}
      </span>
    </form>
  );
}
