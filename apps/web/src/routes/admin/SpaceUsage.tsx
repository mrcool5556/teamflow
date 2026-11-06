import { formatStorageBytes, type SpaceStorageState, type SpaceType } from "@teamflow/core";

export function SpaceTypeBadge({ type }: { type: SpaceType }) {
  return (
    <span className={`admin-type admin-type--${type}`}>{type === "free" ? "Free" : "Admin"}</span>
  );
}

/**
 * Usage against the cap: accent under 80%, amber from 80%, red at the cap. A space with no limit
 * shows bytes used as a grey bar against `scaleBytes` (free disk, or the largest space).
 */
export function SpaceUsageBar({
  usedBytes,
  capBytes,
  state,
  scaleBytes,
}: {
  usedBytes: number;
  capBytes: number | null;
  state: SpaceStorageState;
  scaleBytes?: number;
}) {
  const used = formatStorageBytes(usedBytes);
  if (capBytes === null) {
    const pct = scaleBytes && scaleBytes > 0 ? Math.min(100, (usedBytes / scaleBytes) * 100) : 0;
    return (
      <div className="admin-usage">
        <div className="admin-usage-label">
          <span>{used}</span>
          <span>no limit</span>
        </div>
        <div className="admin-bar" role="img" aria-label={`${used} used, no limit`}>
          <i
            className="admin-bar-nolimit"
            style={{ width: `${Math.max(pct, usedBytes > 0 ? 1 : 0)}%` }}
          />
        </div>
      </div>
    );
  }
  const pct = capBytes > 0 ? Math.min(100, (usedBytes / capBytes) * 100) : 100;
  const label = state === "full" ? "full" : `${Math.round(pct)}%`;
  return (
    <div className="admin-usage">
      <div className="admin-usage-label">
        <span>{used}</span>
        <span className={state === "ok" ? undefined : `admin-usage--${state}`}>{label}</span>
      </div>
      <div
        className="admin-bar"
        role="img"
        aria-label={`${used} of ${formatStorageBytes(capBytes)} (${label})`}
      >
        <i
          className={state === "ok" ? undefined : `admin-bar--${state}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
