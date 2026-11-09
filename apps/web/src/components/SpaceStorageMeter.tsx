import { formatStorageBytes } from "@teamflow/core";
import { DISK_LOW_TEXT, MAKE_ROOM_HELP, type StorageNotice } from "../lib/spaceStorage";
import { useTeamStorageQuery } from "../queries/instance";

/** Storage used by the current space against its cap, at the top of the Files drawer. */
export function SpaceStorageMeter({ teamId }: { teamId: string }) {
  const { data: storage } = useTeamStorageQuery(teamId);
  if (!storage) return null;

  const { usedBytes, capBytes, state, breakdown } = storage;
  const used = formatStorageBytes(usedBytes);
  const pct = capBytes ? Math.min(100, (usedBytes / capBytes) * 100) : 0;
  const summary =
    capBytes === null
      ? `${used} used · no limit`
      : `${used} of ${formatStorageBytes(capBytes)} · ${state === "full" ? "full" : `${Math.round(pct)}%`}`;
  const kind = storage.spaceType === "free" ? "free Flow" : "Flow";

  let sub: string;
  if (storage.diskLow) sub = DISK_LOW_TEXT;
  else if (capBytes === null) sub = `This ${kind} has no upload limit.`;
  else if (state === "full") sub = `Uploads are paused in this ${kind}. ${MAKE_ROOM_HELP}`;
  else {
    sub = `${formatStorageBytes(storage.remainingBytes ?? 0)} left in this ${kind}.`;
    if (state === "warn") {
      sub +=
        breakdown.trashBytes > 0
          ? ` The trash holds ${formatStorageBytes(breakdown.trashBytes)}, which counts until it is purged; Delete forever in the trash frees it now.`
          : " Need more? Ask a server admin.";
    }
  }

  return (
    <section
      className={`space-meter space-meter--${storage.diskLow ? "full" : state}`}
      aria-label="Storage"
    >
      <div className="space-meter-top">
        <strong>Storage</strong>
        <span>{summary}</span>
      </div>
      {capBytes !== null ? (
        <div
          className="admin-bar"
          role="meter"
          aria-label="Storage used"
          aria-valuemin={0}
          aria-valuemax={capBytes}
          aria-valuenow={Math.min(usedBytes, capBytes)}
          aria-valuetext={summary}
        >
          <i
            className={state === "ok" ? undefined : `admin-bar--${state}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}
      <p className="space-meter-sub">{sub}</p>
    </section>
  );
}

/** The note an upload zone shows when the space is nearly or completely full. */
export function SpaceStorageNotice({ notice }: { notice: StorageNotice | null }) {
  if (!notice) return null;
  return (
    <div
      className={`space-notice space-notice--${notice.tone}`}
      role={notice.blocked ? "alert" : "status"}
    >
      <p>{notice.text}</p>
      {notice.help ? <p className="space-notice-help">{notice.help}</p> : null}
    </div>
  );
}
