import { useMemo, useState } from "react";
import type {
  BoardRowPublic,
  IssuePublic,
  IssueStatusPublic,
  Priority,
  TeamMemberPublic,
} from "@teamflow/core";
import { PRIORITIES, PRIORITY_LABELS } from "@teamflow/core";
import { MultiAssigneePicker } from "./MultiAssigneePicker";
import { Docked } from "../ui/BottomDock";

type BulkActionBarProps = {
  selectedIssues: IssuePublic[];
  rows: BoardRowPublic[];
  statuses: IssueStatusPublic[];
  members: TeamMemberPublic[];
  onMove: (issueIds: string[], rowId: string, statusId: string) => void;
  onAssign: (issueIds: string[], assigneeIds: string[]) => void;
  onPriority: (issueIds: string[], priority: Priority) => void;
  onDelete: (issues: IssuePublic[]) => void;
  onClear: () => void;
};

export function BulkActionBar({
  selectedIssues,
  rows,
  statuses,
  members,
  onMove,
  onAssign,
  onPriority,
  onDelete,
  onClear,
}: BulkActionBarProps) {
  const [moveRowId, setMoveRowId] = useState(rows[0]?.id ?? "");
  const issueIds = useMemo(() => selectedIssues.map((issue) => issue.id), [selectedIssues]);

  const rowStatuses = useMemo(
    () =>
      statuses
        .filter((status) => status.rowId === moveRowId)
        .sort((a, b) => a.position - b.position),
    [statuses, moveRowId],
  );

  const [moveStatusId, setMoveStatusId] = useState(rowStatuses[0]?.id ?? "");
  const [priority, setPriority] = useState<Priority>("medium");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);

  const effectiveMoveRowId = moveRowId || rows[0]?.id || "";
  const effectiveMoveStatusId = rowStatuses.some((status) => status.id === moveStatusId)
    ? moveStatusId
    : (rowStatuses[0]?.id ?? "");

  if (selectedIssues.length < 2) return null;

  return (
    <Docked slot="bar">
      <div className="bulk-action-bar" role="toolbar" aria-label="Bulk issue actions">
        <div className="bulk-action-bar-header">
          <span className="bulk-action-count">{selectedIssues.length} selected</span>
          <div className="bulk-action-bar-header-actions">
            <button type="button" className="ghost bulk-action-clear" onClick={onClear}>
              Clear
            </button>
            <button
              type="button"
              className="bulk-action-delete"
              onClick={() => onDelete(selectedIssues)}
            >
              Delete
            </button>
          </div>
        </div>

        <div className="bulk-action-bar-body">
          <div className="bulk-action-groups">
            <div className="bulk-action-side bulk-action-side--left">
              <div className="bulk-action-field bulk-action-field--move">
                <span className="bulk-action-label">Move</span>
                <div className="bulk-action-controls bulk-action-controls--move">
                  <select
                    value={effectiveMoveRowId}
                    onChange={(e) => {
                      setMoveRowId(e.target.value);
                      const nextStatuses = statuses
                        .filter((status) => status.rowId === e.target.value)
                        .sort((a, b) => a.position - b.position);
                      setMoveStatusId(nextStatuses[0]?.id ?? "");
                    }}
                    aria-label="Move to row"
                  >
                    {rows.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={effectiveMoveStatusId}
                    onChange={(e) => setMoveStatusId(e.target.value)}
                    aria-label="Move to column"
                  >
                    {rowStatuses.map((status) => (
                      <option key={status.id} value={status.id}>
                        {status.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!effectiveMoveRowId || !effectiveMoveStatusId}
                    onClick={() => onMove(issueIds, effectiveMoveRowId, effectiveMoveStatusId)}
                  >
                    Move
                  </button>
                </div>
              </div>

              <div className="bulk-action-field bulk-action-field--priority">
                <span className="bulk-action-label">Priority</span>
                <div className="bulk-action-controls bulk-action-controls--priority">
                  <select
                    value={priority}
                    aria-label="Set priority"
                    onChange={(e) => setPriority(e.target.value as Priority)}
                  >
                    {PRIORITIES.map((item) => (
                      <option key={item} value={item}>
                        {PRIORITY_LABELS[item]}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={() => onPriority(issueIds, priority)}>
                    Set
                  </button>
                </div>
              </div>
            </div>

            <div className="bulk-action-side bulk-action-side--right">
              <div className="bulk-action-field bulk-action-field--assign">
                <span className="bulk-action-label">Assign</span>
                <div className="bulk-action-controls bulk-action-controls--assign">
                  <MultiAssigneePicker
                    members={members}
                    assigneeIds={assigneeIds}
                    compact
                    label="Assignees"
                    panelPlacement="top"
                    floatingPanel
                    onChange={setAssigneeIds}
                  />
                  <button type="button" onClick={() => onAssign(issueIds, assigneeIds)}>
                    Set
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Docked>
  );
}
