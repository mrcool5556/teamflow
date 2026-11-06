import { useMemo, useState } from "react";
import { formatStorageBytes, type InstanceSpacePublic } from "@teamflow/core";
import { useSpaceSettingsQuery, useSpacesQuery } from "../../queries/instance";
import { capText } from "./capBytes";
import { CreateSpaceDialog } from "./CreateSpaceDialog";
import { SpaceTypeBadge, SpaceUsageBar } from "./SpaceUsage";

type Filter = "all" | "admin" | "free" | "near";

const FILTERS: { id: Filter; label: string; match: (space: InstanceSpacePublic) => boolean }[] = [
  { id: "all", label: "All", match: () => true },
  { id: "admin", label: "Admin", match: (space) => space.spaceType === "admin" },
  { id: "free", label: "Free", match: (space) => space.spaceType === "free" },
  { id: "near", label: "Near limit", match: (space) => space.state !== "ok" },
];

/** Every space with its type, cap, usage, owner, members and issues; most used first. */
export function SpacesPanel({ onOpenSpace }: { onOpenSpace?: (teamId: string) => void }) {
  const query = useSpacesQuery();
  const settings = useSpaceSettingsQuery().data;
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);

  const spaces = useMemo(() => query.data ?? [], [query.data]);
  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const match = FILTERS.find((item) => item.id === filter)!.match;
    return spaces.filter(
      (space) =>
        match(space) &&
        (!needle ||
          space.name.toLowerCase().includes(needle) ||
          space.key.toLowerCase().includes(needle) ||
          (space.owner?.name.toLowerCase().includes(needle) ?? false)),
    );
  }, [spaces, filter, search]);
  const largest = spaces.reduce((max, space) => Math.max(max, space.usedBytes), 0);
  const totalUsed = spaces.reduce((sum, space) => sum + space.usedBytes, 0);

  return (
    <div className="settings-panel">
      <header className="settings-panel-header">
        <div className="settings-panel-title-row">
          <h2>Spaces</h2>
          <button type="button" onClick={() => setCreating(true)}>
            + New space
          </button>
        </div>
        <p className="settings-copy settings-lead">
          {spaces.length} space{spaces.length === 1 ? "" : "s"} · {formatStorageBytes(totalUsed)}{" "}
          uploaded
          {settings
            ? ` · free spaces get ${formatStorageBytes(settings.freeSpaceCapBytes)}, ${settings.freeSpacesPerUser} per user`
            : ""}
        </p>
      </header>

      <div className="admin-filters">
        <span className="admin-chips" role="group" aria-label="Filter spaces">
          {FILTERS.map((item) => {
            const count = spaces.filter(item.match).length;
            return (
              <button
                key={item.id}
                type="button"
                className={filter === item.id ? "active" : undefined}
                aria-pressed={filter === item.id}
                onClick={() => setFilter(item.id)}
              >
                {item.label} {count}
              </button>
            );
          })}
        </span>
        <input
          type="search"
          className="admin-search"
          placeholder="Search spaces…"
          aria-label="Search spaces"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {query.isError ? (
        <p className="settings-hint settings-hint--warn" role="alert">
          {query.error instanceof Error ? query.error.message : "Could not load spaces."}
        </p>
      ) : !query.data ? (
        <p className="settings-hint">Loading spaces…</p>
      ) : shown.length === 0 ? (
        <p className="settings-hint">No spaces match.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Space</th>
              <th scope="col">Type</th>
              <th scope="col">Owner</th>
              <th scope="col">Members</th>
              <th scope="col">Issues</th>
              <th scope="col">Storage</th>
              <th scope="col">Cap</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((space) => (
              <tr key={space.id} className={space.state === "full" ? "admin-row--full" : undefined}>
                <td className="admin-cell-name">
                  {onOpenSpace ? (
                    <button
                      type="button"
                      className="admin-link"
                      onClick={() => onOpenSpace(space.id)}
                    >
                      {space.name}
                    </button>
                  ) : (
                    space.name
                  )}
                  <small>{space.key}</small>
                </td>
                <td data-label="Type">
                  <SpaceTypeBadge type={space.spaceType} />
                </td>
                <td data-label="Owner">{space.owner?.name ?? "—"}</td>
                <td data-label="Members">{space.memberCount}</td>
                <td data-label="Issues">{space.issueCount}</td>
                <td data-label="Storage" className="admin-cell-usage">
                  <SpaceUsageBar
                    usedBytes={space.usedBytes}
                    capBytes={space.capBytes}
                    state={space.state}
                    scaleBytes={largest}
                  />
                </td>
                <td data-label="Cap">{capText(space.capBytes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {creating ? (
        <CreateSpaceDialog
          onClose={() => setCreating(false)}
          onCreated={(space) => {
            setCreating(false);
            onOpenSpace?.(space.id);
          }}
        />
      ) : null}
    </div>
  );
}
