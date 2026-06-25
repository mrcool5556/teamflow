import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  closestCorners,
  closestCenter,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type Over,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useCallback, useEffect, useMemo, useRef, useState, Fragment, type CSSProperties, type ReactNode } from "react";
import type {
  BoardRowPublic,
  IssuePublic,
  IssueStatusPublic,
  TeamMemberPublic,
} from "@teamflow/core";
import { mapStatusToRow } from "@teamflow/core";
import { BoardSearchInput } from "./components/BoardSearchInput";
import { MultiAssigneePicker } from "./components/MultiAssigneePicker";
import { RefCopyButton } from "./components/RefCopyButton";
import { RowEditMenu, RowEditMenuItem, RowEditMenuSection } from "./components/RowEditMenu";
import { IssueTimer } from "./components/IssueTimer";
import { RowColorPicker } from "./components/RowColorPicker";
import { BulkActionBar } from "./components/BulkActionBar";
import { BoardColorPicker } from "./components/BoardColorPicker";
import { PriorityPicker } from "./components/PriorityPicker";
import { issueMatchesBoardSearch } from "./lib/refLinks";
import type { Priority } from "@teamflow/core";

export const issueDndId = (issueId: string) => `issue:${issueId}`;
export const rowDndId = (rowId: string) => `row:${rowId}`;
export const columnDndId = (rowId: string, statusId: string) =>
  `column:${rowId}:${statusId}`;
export const cellDndId = (rowId: string, statusId: string) =>
  `cell:${rowId}:${statusId}`;
export const cellTailDndId = (rowId: string, statusId: string) =>
  `cell-tail:${rowId}:${statusId}`;

type ParsedDndId =
  | { kind: "issue"; issueId: string }
  | { kind: "row"; rowId: string }
  | { kind: "column"; rowId: string; statusId: string }
  | { kind: "cell"; rowId: string; statusId: string }
  | { kind: "cell-tail"; rowId: string; statusId: string }
  | { kind: "unknown" };

function parseDndId(id: string): ParsedDndId {
  const [kind, ...rest] = id.split(":");
  if (kind === "issue") return { kind, issueId: rest.join(":") };
  if (kind === "row") return { kind, rowId: rest.join(":") };
  if (kind === "column" && rest[0] && rest[1]) {
    return { kind, rowId: rest[0], statusId: rest[1] };
  }
  if (kind === "cell" && rest[0] && rest[1]) {
    return { kind, rowId: rest[0], statusId: rest[1] };
  }
  if (kind === "cell-tail" && rest[0] && rest[1]) {
    return { kind, rowId: rest[0], statusId: rest[1] };
  }
  return { kind: "unknown" };
}

type IssueInsertHint = {
  rowId: string;
  statusId: string;
  anchorIssueId: string | null;
  insertAfter: boolean;
};

function shouldInsertAfter(
  active: DragEndEvent["active"],
  over: Over,
): boolean {
  const activeRect = active.rect.current.translated;
  const overRect = over.rect;
  if (!activeRect || !overRect) return false;

  const activeMidY = activeRect.top + activeRect.height / 2;
  const overMidY = overRect.top + overRect.height / 2;
  return activeMidY > overMidY;
}

function resolveIssueInsertHint(
  active: DragEndEvent["active"],
  over: Over | null,
  issues: IssuePublic[],
  defaultRowId: string | null,
): IssueInsertHint | null {
  if (!over) return null;

  const activeParsed = parseDndId(String(active.id));
  if (activeParsed.kind !== "issue") return null;

  const overParsed = parseDndId(String(over.id));

  if (overParsed.kind === "cell" || overParsed.kind === "cell-tail") {
    return {
      rowId: overParsed.rowId,
      statusId: overParsed.statusId,
      anchorIssueId: null,
      insertAfter: true,
    };
  }

  if (overParsed.kind === "issue") {
    const overIssue = issues.find((item) => item.id === overParsed.issueId);
    if (!overIssue) return null;

    const rowId = overIssue.rowId ?? defaultRowId;
    if (!rowId) return null;

    return {
      rowId,
      statusId: overIssue.statusId,
      anchorIssueId: overIssue.id,
      insertAfter: shouldInsertAfter(active, over),
    };
  }

  return null;
}

function reorderMultipleIssueIds(
  orderedIds: string[],
  draggedIds: string[],
  overId: string | null,
  insertAfter: boolean,
): string[] {
  const dragSet = new Set(draggedIds);
  const next = orderedIds.filter((id) => !dragSet.has(id));
  const block = draggedIds;

  if (!overId) return [...next, ...block];

  let insertIndex = next.indexOf(overId);
  if (insertIndex < 0) return [...next, ...block];
  if (insertAfter) insertIndex += 1;
  next.splice(insertIndex, 0, ...block);
  return next;
}

function sortIssueIdsByBoardOrder(
  ids: string[],
  issues: IssuePublic[],
  defaultRowId: string | null,
): string[] {
  const byId = new Map(issues.map((issue) => [issue.id, issue]));
  return [...ids].sort((a, b) => {
    const issueA = byId.get(a);
    const issueB = byId.get(b);
    if (!issueA || !issueB) return 0;

    const rowA = issueA.rowId ?? defaultRowId ?? "";
    const rowB = issueB.rowId ?? defaultRowId ?? "";
    if (rowA !== rowB) return rowA.localeCompare(rowB);
    if (issueA.statusId !== issueB.statusId) {
      return issueA.statusId.localeCompare(issueB.statusId);
    }
    return (issueA.boardSort ?? 0) - (issueB.boardSort ?? 0);
  });
}

function draggingIssueIds(
  activeIssueId: string,
  selectedIssueIds: Set<string>,
  issues: IssuePublic[],
  defaultRowId: string | null,
): string[] {
  if (selectedIssueIds.has(activeIssueId) && selectedIssueIds.size > 1) {
    return sortIssueIdsByBoardOrder(Array.from(selectedIssueIds), issues, defaultRowId);
  }
  return [activeIssueId];
}

const issueCollisionDetection: CollisionDetection = (args) => {
  const activeParsed = parseDndId(String(args.active.id));
  if (activeParsed.kind === "issue") {
    const pointerHits = pointerWithin(args);
    if (pointerHits.length > 0) return pointerHits;
    return closestCorners(args);
  }
  if (activeParsed.kind === "column") {
    const columnContainers = args.droppableContainers.filter((container) => {
      const parsed = parseDndId(String(container.id));
      return parsed.kind === "column";
    });
    if (columnContainers.length === 0) return [];

    const columnArgs = { ...args, droppableContainers: columnContainers };
    const pointerHits = pointerWithin(columnArgs);
    if (pointerHits.length > 0) return pointerHits;
    return closestCenter(columnArgs);
  }
  return closestCorners(args);
};

function resolveColumnDropTarget(
  overParsed: ParsedDndId,
  issues: IssuePublic[],
  defaultRowId: string | null,
): { rowId: string; statusId: string } | null {
  if (overParsed.kind === "column") {
    return { rowId: overParsed.rowId, statusId: overParsed.statusId };
  }
  if (overParsed.kind === "cell" || overParsed.kind === "cell-tail") {
    return { rowId: overParsed.rowId, statusId: overParsed.statusId };
  }
  if (overParsed.kind === "issue") {
    const overIssue = issues.find((item) => item.id === overParsed.issueId);
    if (!overIssue) return null;
    const rowId = overIssue.rowId ?? defaultRowId;
    if (!rowId) return null;
    return { rowId, statusId: overIssue.statusId };
  }
  return null;
}

type KanbanBoardProps = {
  previewMode?: boolean;
  rows: BoardRowPublic[];
  statuses: IssueStatusPublic[];
  issues: IssuePublic[];
  defaultRowId: string | null;
  isRowHeadersVisible: (rowId: string) => boolean;
  toggleRowHeaders: (rowId: string) => void;
  issuesForCell: (rowId: string, statusId: string) => IssuePublic[];
  onSelectIssue: (issue: IssuePublic) => void;
  onDeleteIssue: (issue: IssuePublic) => void;
  onRenameRow: (row: BoardRowPublic, name: string) => void;
  onRenameStatus: (status: IssueStatusPublic, name: string) => void;
  onUpdateStatusColor: (status: IssueStatusPublic, color: string | null) => void;
  onRemoveRow: (row: BoardRowPublic) => void;
  onRemoveColumn: (status: IssueStatusPublic) => void;
  onAddColumn: (rowId: string) => void;
  onAddIssue: (rowId: string, statusId: string) => void;
  onReorderRows: (activeRowId: string, overRowId: string) => void;
  onReorderColumns: (
    rowId: string,
    activeStatusId: string,
    overStatusId: string,
  ) => void;
  onReorderIssuesInCell: (
    rowId: string,
    statusId: string,
    orderedIssueIds: string[],
    movedIssuePatch?: Pick<IssuePublic, "rowId" | "statusId">,
  ) => void;
  members: TeamMemberPublic[];
  onAssignIssue: (issue: IssuePublic, assigneeIds: string[]) => void;
  onUpdateIssueColor: (issue: IssuePublic, color: string | null) => void;
  onUpdateIssuePriority: (issue: IssuePublic, priority: Priority) => void;
  onAssignRow: (row: BoardRowPublic, assigneeIds: string[]) => void;
  onUpdateRowColor: (row: BoardRowPublic, color: string | null) => void;
  onUpdateIssueTimer: (
    issue: IssuePublic,
    patch: {
      timerActiveAt: string | null;
      timerElapsedSec: number;
      timerTargetSec: number | null;
    },
  ) => void;
  highlightedIssueId?: string | null;
  highlightedColumnKey?: string | null;
  onGoToRef?: (ref: string) => void;
  onBulkMove?: (issueIds: string[], rowId: string, statusId: string) => void;
  onBulkAssign?: (issueIds: string[], assigneeIds: string[]) => void;
  onBulkPriority?: (issueIds: string[], priority: Priority) => void;
  onBulkTimer?: (issueIds: string[], action: "pause" | "reset") => void;
  onBulkDelete?: (issues: IssuePublic[]) => void;
  onOpenRowFiles?: (row: BoardRowPublic) => void;
};

export function KanbanBoard({
  previewMode = false,
  rows,
  statuses,
  issues,
  defaultRowId,
  isRowHeadersVisible,
  toggleRowHeaders,
  issuesForCell,
  onSelectIssue,
  onDeleteIssue,
  onRenameRow,
  onRenameStatus,
  onUpdateStatusColor,
  onRemoveRow,
  onRemoveColumn,
  onAddColumn,
  onAddIssue,
  onReorderRows,
  onReorderColumns,
  onReorderIssuesInCell,
  members,
  onAssignIssue,
  onUpdateIssueColor,
  onUpdateIssuePriority,
  onAssignRow,
  onUpdateRowColor,
  onUpdateIssueTimer,
  highlightedIssueId = null,
  highlightedColumnKey = null,
  onGoToRef,
  onBulkMove,
  onBulkAssign,
  onBulkPriority,
  onBulkTimer,
  onBulkDelete,
  onOpenRowFiles,
}: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [issueInsertHint, setIssueInsertHint] = useState<IssueInsertHint | null>(
    null,
  );
  const [rowSearchQueries, setRowSearchQueries] = useState<Record<string, string>>({});
  const [columnSearchQueries, setColumnSearchQueries] = useState<Record<string, string>>({});
  const [selectedIssueIds, setSelectedIssueIds] = useState<Set<string>>(() => new Set());
  const lastSelectedIssueIdRef = useRef<string | null>(null);
  const suppressClickRef = useRef<string | null>(null);

  const selectedIssues = useMemo(
    () => issues.filter((issue) => selectedIssueIds.has(issue.id)),
    [issues, selectedIssueIds],
  );

  const clearIssueSelection = useCallback(() => {
    setSelectedIssueIds(new Set());
    lastSelectedIssueIdRef.current = null;
  }, []);

  const handleIssueCardClick = useCallback(
    (issue: IssuePublic, event: React.MouseEvent, cellIssues: IssuePublic[]) => {
      if (previewMode) return;
      if (suppressClickRef.current === issueDndId(issue.id)) return;

      const meta = event.ctrlKey || event.metaKey;
      const shift = event.shiftKey;

      if (shift) {
        event.preventDefault();
        event.stopPropagation();

        let anchorId = lastSelectedIssueIdRef.current;
        if (!anchorId && selectedIssueIds.size > 0) {
          anchorId = selectedIssueIds.values().next().value ?? null;
        }

        if (!anchorId) {
          setSelectedIssueIds((prev) => {
            const next = new Set(prev);
            next.add(issue.id);
            return next;
          });
          lastSelectedIssueIdRef.current = issue.id;
          return;
        }

        const ids = cellIssues.map((item) => item.id);
        const anchorIdx = ids.indexOf(anchorId);
        const clickIdx = ids.indexOf(issue.id);
        setSelectedIssueIds((prev) => {
          const next = new Set(prev);
          if (anchorIdx >= 0 && clickIdx >= 0) {
            const [start, end] =
              anchorIdx < clickIdx ? [anchorIdx, clickIdx] : [clickIdx, anchorIdx];
            for (let i = start; i <= end; i += 1) next.add(ids[i]!);
          } else {
            next.add(issue.id);
          }
          return next;
        });
        return;
      }

      if (meta) {
        event.preventDefault();
        event.stopPropagation();
        setSelectedIssueIds((prev) => {
          const next = new Set(prev);
          if (next.has(issue.id)) next.delete(issue.id);
          else next.add(issue.id);
          return next;
        });
        lastSelectedIssueIdRef.current = issue.id;
        return;
      }

      if (selectedIssueIds.size > 0) {
        clearIssueSelection();
      }
      lastSelectedIssueIdRef.current = issue.id;
      onSelectIssue(issue);
    },
    [previewMode, selectedIssueIds.size, clearIssueSelection, onSelectIssue],
  );

  useEffect(() => {
    if (previewMode) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        clearIssueSelection();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewMode, clearIssueSelection]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const activeIssue = useMemo(() => {
    if (!activeId?.startsWith("issue:")) return null;
    const issueId = activeId.slice("issue:".length);
    return issues.find((issue) => issue.id === issueId) ?? null;
  }, [activeId, issues]);

  const activeDragIssueIds = useMemo(() => {
    if (!activeIssue) return new Set<string>();
    return new Set(
      draggingIssueIds(activeIssue.id, selectedIssueIds, issues, defaultRowId),
    );
  }, [activeIssue, selectedIssueIds, issues, defaultRowId]);

  const activeDragCount = activeDragIssueIds.size;

  const activeRow = useMemo(() => {
    if (!activeId?.startsWith("row:")) return null;
    const rowId = activeId.slice("row:".length);
    return rows.find((row) => row.id === rowId) ?? null;
  }, [activeId, rows]);

  const activeColumn = useMemo(() => {
    if (!activeId?.startsWith("column:")) return null;
    const parsed = parseDndId(activeId);
    if (parsed.kind !== "column") return null;
    const status = statuses.find((item) => item.id === parsed.statusId) ?? null;
    const row = rows.find((item) => item.id === parsed.rowId) ?? null;
    return status && row ? { status, row } : null;
  }, [activeId, rows, statuses]);

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
    setIssueInsertHint(null);
    suppressClickRef.current = String(event.active.id);
  }

  function handleDragOver(event: DragOverEvent) {
    setIssueInsertHint(
      resolveIssueInsertHint(event.active, event.over, issues, defaultRowId),
    );
  }

  function handleDragCancel() {
    setActiveId(null);
    setIssueInsertHint(null);
    suppressClickRef.current = null;
  }

  const statusesForRow = useCallback(
    (rowId: string) =>
      statuses
        .filter((status) => status.rowId === rowId)
        .sort((a, b) => a.position - b.position),
    [statuses],
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    setIssueInsertHint(null);

    window.setTimeout(() => {
      suppressClickRef.current = null;
    }, 0);

    if (!over) return;

    const activeParsed = parseDndId(String(active.id));
    const overParsed = parseDndId(String(over.id));

    if (activeParsed.kind === "row" && overParsed.kind === "row") {
      if (activeParsed.rowId !== overParsed.rowId) {
        onReorderRows(activeParsed.rowId, overParsed.rowId);
      }
      return;
    }

    if (activeParsed.kind === "column") {
      const target = resolveColumnDropTarget(overParsed, issues, defaultRowId);
      if (!target) return;
      if (activeParsed.rowId !== target.rowId) return;
      if (activeParsed.statusId !== target.statusId) {
        onReorderColumns(
          activeParsed.rowId,
          activeParsed.statusId,
          target.statusId,
        );
      }
      return;
    }

    if (activeParsed.kind !== "issue") return;

    const issue = issues.find((item) => item.id === activeParsed.issueId);
    if (!issue) return;

    const movingIds = draggingIssueIds(
      issue.id,
      selectedIssueIds,
      issues,
      defaultRowId,
    );

    const dropTarget = resolveIssueInsertHint(active, over, issues, defaultRowId);
    if (!dropTarget) return;

    const sourceRowId = issue.rowId ?? defaultRowId;
    const sourceStatusId = issue.statusId;
    if (!sourceRowId) return;

    let targetRowId = dropTarget.rowId;
    let targetStatusId = dropTarget.statusId;
    const overIssueId = dropTarget.anchorIssueId;
    const insertAfter = dropTarget.insertAfter;

    if (targetRowId !== sourceRowId) {
      const mappedStatusId = mapStatusToRow(statuses, targetStatusId, targetRowId);
      if (!mappedStatusId) return;
      targetStatusId = mappedStatusId;
    }

    const sameCell =
      sourceRowId === targetRowId && sourceStatusId === targetStatusId;

    if (sameCell) {
      const sourceCell = issuesForCell(sourceRowId, sourceStatusId).map((item) => item.id);
      const nextCell = reorderMultipleIssueIds(
        sourceCell,
        movingIds,
        overIssueId,
        insertAfter,
      );
      if (nextCell.join("|") === sourceCell.join("|")) return;
      onReorderIssuesInCell(targetRowId, targetStatusId, nextCell);
      return;
    }

    const targetCell = issuesForCell(targetRowId, targetStatusId)
      .filter((item) => !movingIds.includes(item.id))
      .map((item) => item.id);

    const nextTargetCell = reorderMultipleIssueIds(
      targetCell,
      movingIds,
      overIssueId,
      insertAfter,
    );

    onReorderIssuesInCell(targetRowId, targetStatusId, nextTargetCell, {
      rowId: targetRowId,
      statusId: targetStatusId,
    });

    const sourceCells = new Map<string, { rowId: string; statusId: string }>();
    for (const id of movingIds) {
      const movingIssue = issues.find((item) => item.id === id);
      if (!movingIssue) continue;
      const rowId = movingIssue.rowId ?? defaultRowId;
      if (!rowId) continue;
      const key = `${rowId}:${movingIssue.statusId}`;
      sourceCells.set(key, { rowId, statusId: movingIssue.statusId });
    }

    for (const { rowId, statusId } of sourceCells.values()) {
      if (rowId === targetRowId && statusId === targetStatusId) continue;
      const nextSourceCell = issuesForCell(rowId, statusId)
        .filter((item) => !movingIds.includes(item.id))
        .map((item) => item.id);
      onReorderIssuesInCell(rowId, statusId, nextSourceCell);
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={issueCollisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragCancel={handleDragCancel}
      onDragEnd={handleDragEnd}
    >
      <div
        className={`board-stack ${previewMode ? "board-stack--preview" : ""} ${selectedIssueIds.size > 0 ? "board-stack--selecting" : ""}`}
        onPointerDown={(event) => {
          if (previewMode || selectedIssueIds.size === 0) return;
          const target = event.target as HTMLElement;
          if (target.closest(".issue-card")) return;
          if (target.closest(".bulk-action-bar")) return;
          // Ignore clicks inside portaled panels (assignee/timer) so selection
          // doesn't clear while picking members/timer values.
          if (target.closest(".assignee-picker-panel")) return;
          if (target.closest(".issue-timer-panel")) return;
          clearIssueSelection();
        }}
      >
        <SortableContext
          items={rows.map((row) => rowDndId(row.id))}
          strategy={verticalListSortingStrategy}
        >
          {rows.map((row) => {
            const rowIssueCount = issues.filter(
              (issue) => (issue.rowId ?? defaultRowId) === row.id,
            ).length;

            return (
            <SortableBoardRow
              key={row.id}
              row={row}
              statuses={statusesForRow(row.id)}
              canRemoveRow={rows.length > 1 && rowIssueCount === 0}
              headersVisible={isRowHeadersVisible(row.id)}
              onToggleHeaders={() => toggleRowHeaders(row.id)}
              onRenameRow={onRenameRow}
              onRenameStatus={onRenameStatus}
              onUpdateStatusColor={onUpdateStatusColor}
              onRemoveRow={onRemoveRow}
              onRemoveColumn={onRemoveColumn}
              onAddColumn={onAddColumn}
              issuesForCell={issuesForCell}
              onSelectIssue={onSelectIssue}
              onDeleteIssue={onDeleteIssue}
              onAddIssue={onAddIssue}
              suppressClickRef={suppressClickRef}
              isDraggingRow={activeId === rowDndId(row.id)}
              members={members}
              onAssignRow={onAssignRow}
              onUpdateRowColor={onUpdateRowColor}
              onAssignIssue={onAssignIssue}
              onUpdateIssueColor={onUpdateIssueColor}
              onUpdateIssuePriority={onUpdateIssuePriority}
              onUpdateIssueTimer={onUpdateIssueTimer}
              highlightedIssueId={highlightedIssueId}
              highlightedColumnKey={highlightedColumnKey}
              rowSearch={rowSearchQueries[row.id] ?? ""}
              onRowSearchChange={(value) =>
                setRowSearchQueries((prev) => ({ ...prev, [row.id]: value }))
              }
              columnSearchQueries={columnSearchQueries}
              onColumnSearchChange={(statusId, value) =>
                setColumnSearchQueries((prev) => ({ ...prev, [statusId]: value }))
              }
              onGoToRef={onGoToRef}
              selectedIssueIds={selectedIssueIds}
              onIssueCardClick={handleIssueCardClick}
              activeDragIssueIds={activeDragIssueIds}
              activeId={activeId}
              previewMode={previewMode}
              issueInsertHint={issueInsertHint}
              onOpenRowFiles={onOpenRowFiles}
            />
            );
          })}
        </SortableContext>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeIssue ? (
          <div
            className={`issue-card-overlay-stack${activeDragCount > 1 ? " issue-card-overlay-stack--multi" : ""}`}
          >
            {activeDragCount > 1 ? (
              <>
                <div className="issue-card-stack-ghost issue-card-stack-ghost--far" aria-hidden />
                <div className="issue-card-stack-ghost issue-card-stack-ghost--near" aria-hidden />
              </>
            ) : null}
            <article className="issue-card issue-card-overlay">
              {activeDragCount > 1 ? (
                <span className="issue-card-drag-count issue-card-drag-count--large" aria-hidden>
                  {activeDragCount}
                </span>
              ) : null}
              <div className="issue-card-header">
                <span className="issue-id">{activeIssue.identifier}</span>
              </div>
              <h3 className="issue-card-title">{activeIssue.title}</h3>
            </article>
          </div>
        ) : null}
        {activeRow ? (
          <div className="row-separator-bar row-separator-overlay">
            <span className="row-drag-label">{activeRow.name}</span>
          </div>
        ) : null}
        {activeColumn ? (
          <div
            className={`column-label column-label-row column-label--${activeColumn.status.type} column-label-overlay`}
          >
            <span>{activeColumn.status.name}</span>
          </div>
        ) : null}
      </DragOverlay>

      {!previewMode && onBulkMove && onBulkAssign && onBulkPriority && onBulkTimer && onBulkDelete ? (
        <BulkActionBar
          selectedIssues={selectedIssues}
          rows={rows}
          statuses={statuses}
          members={members}
          onMove={(issueIds, rowId, statusId) => {
            onBulkMove(issueIds, rowId, statusId);
            clearIssueSelection();
          }}
          onAssign={(issueIds, assigneeIds) => {
            onBulkAssign(issueIds, assigneeIds);
            clearIssueSelection();
          }}
          onPriority={(issueIds, priority) => {
            onBulkPriority(issueIds, priority);
            clearIssueSelection();
          }}
          onTimerAction={(issueIds, action) => {
            onBulkTimer(issueIds, action);
          }}
          onDelete={(items) => {
            onBulkDelete(items);
            clearIssueSelection();
          }}
          onClear={clearIssueSelection}
        />
      ) : null}
    </DndContext>
  );
}

function assigneeIdsFromEntity(entity: {
  assignees?: { userId: string }[];
  assigneeId: string | null;
}) {
  if (entity.assignees && entity.assignees.length > 0) {
    return entity.assignees.map((assignee) => assignee.userId);
  }
  return entity.assigneeId ? [entity.assigneeId] : [];
}

function uniqueAssigneeIdsFromIssues(issues: IssuePublic[]) {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const issue of issues) {
    const issueIds = assigneeIdsFromEntity(issue);
    for (const userId of issueIds) {
      if (seen.has(userId)) continue;
      seen.add(userId);
      ids.push(userId);
    }
  }
  return ids;
}

function RowSeparatorBar({
  row,
  rowSearch,
  onRowSearchChange,
  onGoToRef,
  onRenameRow,
  setActivatorNodeRef,
  listeners,
  members,
  onAssignRow,
  onUpdateRowColor,
  headersVisible,
  onToggleHeaders,
  onAddColumn,
  canRemoveRow,
  onRemoveRow,
  onOpenRowFiles,
  previewMode = false,
}: {
  row: BoardRowPublic;
  rowSearch: string;
  onRowSearchChange?: (value: string) => void;
  onGoToRef?: (ref: string) => void;
  onRenameRow: (row: BoardRowPublic, name: string) => void;
  setActivatorNodeRef: (element: HTMLButtonElement | null) => void;
  listeners?: ReturnType<typeof useSortable>["listeners"];
  members: TeamMemberPublic[];
  onAssignRow: (row: BoardRowPublic, assigneeIds: string[]) => void;
  onUpdateRowColor: (row: BoardRowPublic, color: string | null) => void;
  headersVisible: boolean;
  onToggleHeaders: () => void;
  onAddColumn: (rowId: string) => void;
  canRemoveRow: boolean;
  onRemoveRow: (row: BoardRowPublic) => void;
  onOpenRowFiles?: (row: BoardRowPublic) => void;
  previewMode?: boolean;
}) {
  return (
    <div className="row-separator-bar">
      <div className="row-separator-main">
        <div className="row-separator-title">
          <button
            type="button"
            ref={setActivatorNodeRef}
            className="row-drag-handle"
            aria-label={`Drag row ${row.name}`}
            title="Hold to drag row"
            disabled={previewMode}
            {...listeners}
          >
            ⋮⋮
          </button>
          <span className="row-separator-name-wrap">
            <EditableLabel
              label={row.name}
              className="row-separator-name"
              onSave={(name) => onRenameRow(row, name)}
            />
          </span>
          <RefCopyButton
            value={row.key}
            display="icon"
            share
            compact
            title={`Row ${row.name}`}
            onGo={onGoToRef ? () => onGoToRef(row.key) : undefined}
          />
        </div>
        <div className="row-separator-tools">
          <div className="toolbar-users">
            <span className="toolbar-users-label">Users</span>
            <MultiAssigneePicker
              members={members}
              assigneeIds={assigneeIdsFromEntity(row)}
              label="Row owners"
              compact
              floatingPanel
              disabled={previewMode}
              onChange={(assigneeIds) => onAssignRow(row, assigneeIds)}
            />
          </div>
          {onOpenRowFiles ? (
            <button
              type="button"
              className="row-bar-action"
              onClick={() => onOpenRowFiles(row)}
            >
              Files
            </button>
          ) : null}
          <button
            type="button"
            className="row-bar-action"
            disabled={previewMode}
            onClick={() => onAddColumn(row.id)}
          >
            + Column
          </button>
          <RowEditMenu>
            <RowEditMenuSection title="Row color">
              <RowColorPicker color={row.color} onSelect={(color) => onUpdateRowColor(row, color)} />
            </RowEditMenuSection>
            <RowEditMenuItem onClick={onToggleHeaders}>
              {headersVisible ? "Hide column headers" : "Show column headers"}
            </RowEditMenuItem>
            {canRemoveRow ? (
              <RowEditMenuItem danger onClick={() => onRemoveRow(row)}>
                Remove row
              </RowEditMenuItem>
            ) : null}
          </RowEditMenu>
        </div>
      </div>
      <div className="row-separator-search-span">
        <BoardSearchInput
          value={rowSearch}
          onChange={(value) => onRowSearchChange?.(value)}
          placeholder="Filter row…"
          aria-label={`Filter issues in row ${row.name}`}
        />
      </div>
    </div>
  );
}

function SortableBoardRow({
  row,
  statuses,
  canRemoveRow,
  headersVisible,
  onToggleHeaders,
  onRenameRow,
  onRenameStatus,
  onUpdateStatusColor,
  onRemoveRow,
  onRemoveColumn,
  onAddColumn,
  issuesForCell,
  onDeleteIssue,
  onAddIssue,
  suppressClickRef,
  isDraggingRow,
  members,
  onAssignRow,
  onUpdateRowColor,
  onAssignIssue,
  onUpdateIssueColor,
  onUpdateIssuePriority,
  onUpdateIssueTimer,
  highlightedIssueId = null,
  highlightedColumnKey = null,
  rowSearch = "",
  onRowSearchChange,
  columnSearchQueries = {},
  onColumnSearchChange,
  onGoToRef,
  selectedIssueIds = new Set(),
  onIssueCardClick,
  activeDragIssueIds = new Set(),
  activeId = null,
  previewMode = false,
  issueInsertHint = null,
  onOpenRowFiles,
}: {
  row: BoardRowPublic;
  statuses: IssueStatusPublic[];
  canRemoveRow: boolean;
  headersVisible: boolean;
  onToggleHeaders: () => void;
  onRenameRow: (row: BoardRowPublic, name: string) => void;
  onRenameStatus: (status: IssueStatusPublic, name: string) => void;
  onUpdateStatusColor: (status: IssueStatusPublic, color: string | null) => void;
  onRemoveRow: (row: BoardRowPublic) => void;
  onRemoveColumn: (status: IssueStatusPublic) => void;
  onAddColumn: (rowId: string) => void;
  issuesForCell: (rowId: string, statusId: string) => IssuePublic[];
  onSelectIssue: (issue: IssuePublic) => void;
  onDeleteIssue: (issue: IssuePublic) => void;
  onAddIssue: (rowId: string, statusId: string) => void;
  suppressClickRef: React.MutableRefObject<string | null>;
  isDraggingRow: boolean;
  members: TeamMemberPublic[];
  onAssignRow: (row: BoardRowPublic, assigneeIds: string[]) => void;
  onUpdateRowColor: (row: BoardRowPublic, color: string | null) => void;
  onAssignIssue: (issue: IssuePublic, assigneeIds: string[]) => void;
  onUpdateIssueColor: (issue: IssuePublic, color: string | null) => void;
  onUpdateIssuePriority: (issue: IssuePublic, priority: Priority) => void;
  onUpdateIssueTimer: (
    issue: IssuePublic,
    patch: {
      timerActiveAt: string | null;
      timerElapsedSec: number;
      timerTargetSec: number | null;
    },
  ) => void;
  highlightedIssueId?: string | null;
  highlightedColumnKey?: string | null;
  rowSearch?: string;
  onRowSearchChange?: (value: string) => void;
  columnSearchQueries?: Record<string, string>;
  onColumnSearchChange?: (statusId: string, value: string) => void;
  onGoToRef?: (ref: string) => void;
  selectedIssueIds?: Set<string>;
  onIssueCardClick?: (
    issue: IssuePublic,
    event: React.MouseEvent,
    cellIssues: IssuePublic[],
  ) => void;
  activeDragIssueIds?: Set<string>;
  activeId?: string | null;
  previewMode?: boolean;
  issueInsertHint?: IssueInsertHint | null;
  onOpenRowFiles?: (row: BoardRowPublic) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: rowDndId(row.id) });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
  };

  const rowStyle = row.color
    ? ({ "--row-accent": row.color } as CSSProperties)
    : undefined;

  const rowQuery = rowSearch.trim();
  const visibleStatuses = rowQuery
    ? statuses.filter((status) =>
        issuesForCell(row.id, status.id).some((issue) =>
          issueMatchesBoardSearch(issue, rowQuery),
        ),
      )
    : statuses;

  function filterCellIssues(statusId: string) {
    const columnQuery = (columnSearchQueries[statusId] ?? "").trim();
    return issuesForCell(row.id, statusId).filter(
      (issue) =>
        issueMatchesBoardSearch(issue, rowQuery) &&
        issueMatchesBoardSearch(issue, columnQuery),
    );
  }

  if (rowQuery && visibleStatuses.length === 0) {
    return (
      <div
        ref={setNodeRef}
        style={{ ...style, ...rowStyle }}
        className={`board-row board-row--search-empty ${isDraggingRow ? "board-row-dragging" : ""} ${row.color ? "has-row-color" : ""}`}
        data-row-id={row.id}
        {...attributes}
      >
        <div className="row-separator-wrap">
          <RowSeparatorBar
            row={row}
            rowSearch={rowSearch}
            onRowSearchChange={onRowSearchChange}
            onGoToRef={onGoToRef}
            onRenameRow={onRenameRow}
            setActivatorNodeRef={setActivatorNodeRef}
            listeners={listeners}
            members={members}
            onAssignRow={onAssignRow}
            onUpdateRowColor={onUpdateRowColor}
            headersVisible={headersVisible}
            onToggleHeaders={onToggleHeaders}
            onAddColumn={onAddColumn}
            canRemoveRow={canRemoveRow}
            onRemoveRow={onRemoveRow}
            onOpenRowFiles={onOpenRowFiles}
            previewMode={previewMode}
          />
        </div>
        <p className="board-row-empty-search muted">No matching issues in this row.</p>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, ...rowStyle }}
      className={`board-row ${isDraggingRow ? "board-row-dragging" : ""} ${row.color ? "has-row-color" : ""}`}
      data-row-id={row.id}
      {...attributes}
    >
      <div className="row-separator-wrap">
        <RowSeparatorBar
          row={row}
          rowSearch={rowSearch}
          onRowSearchChange={onRowSearchChange}
          onGoToRef={onGoToRef}
          onRenameRow={onRenameRow}
          setActivatorNodeRef={setActivatorNodeRef}
          listeners={listeners}
          members={members}
          onAssignRow={onAssignRow}
          onUpdateRowColor={onUpdateRowColor}
          headersVisible={headersVisible}
          onToggleHeaders={onToggleHeaders}
          onAddColumn={onAddColumn}
          canRemoveRow={canRemoveRow}
          onRemoveRow={onRemoveRow}
          onOpenRowFiles={onOpenRowFiles}
          previewMode={previewMode}
        />
      </div>

      <SortableContext
        items={visibleStatuses.map((status) => columnDndId(row.id, status.id))}
        strategy={horizontalListSortingStrategy}
      >
        <div className="board-row-scroll">
          <div className="board-row-columns">
          {visibleStatuses.map((status) => {
            const cellIssues = filterCellIssues(status.id);
            const issueIds = cellIssues.map((issue) => issueDndId(issue.id));
            const columnSortable = headersVisible && !previewMode;
            const columnHint =
              issueInsertHint?.rowId === row.id &&
              issueInsertHint?.statusId === status.id
                ? issueInsertHint
                : null;

            return (
              <SortableColumn
                key={`${row.id}-${status.id}`}
                id={columnDndId(row.id, status.id)}
                disabled={!columnSortable}
              >
                {({ setActivatorNodeRef, listeners, isDragging }) => (
                  <>
                    {headersVisible ? (
                      <ColumnHeader
                        label={status.name}
                        count={cellIssues.length}
                        statusType={status.type}
                        refKey={status.key}
                        statusId={status.id}
                        highlighted={highlightedColumnKey === status.key}
                        columnSearch={columnSearchQueries[status.id] ?? ""}
                        onColumnSearchChange={(value) =>
                          onColumnSearchChange?.(status.id, value)
                        }
                        members={members}
                        columnAssigneeIds={uniqueAssigneeIdsFromIssues(cellIssues)}
                        onAssignColumn={(assigneeIds) => {
                          for (const issue of cellIssues) {
                            onAssignIssue(issue, assigneeIds);
                          }
                        }}
                        previewMode={previewMode}
                        className={`column-label column-label-row${isDragging ? " column-label--dragging" : ""}`}
                        onSave={(name) => onRenameStatus(status, name)}
                        onRemove={
                          cellIssues.length === 0
                            ? () => onRemoveColumn(status)
                            : undefined
                        }
                        onGoToRef={onGoToRef}
                        color={status.color}
                        onColorChange={(color) => onUpdateStatusColor(status, color)}
                        dragHandleRef={columnSortable ? setActivatorNodeRef : undefined}
                        dragHandleListeners={columnSortable ? listeners : undefined}
                      />
                    ) : null}
                    <BoardCell
                      rowId={row.id}
                      statusId={status.id}
                      columnKey={status.key}
                      highlighted={highlightedColumnKey === status.key}
                      issueIds={issueIds}
                      footer={
                        <button
                          type="button"
                          className="ghost add-card-btn"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            onAddIssue(row.id, status.id);
                          }}
                        >
                          + Add issue
                        </button>
                      }
                    >
                      {columnHint &&
                        columnHint.anchorIssueId === null &&
                        cellIssues.length === 0 && <IssueDropIndicator />}
                      {cellIssues.map((issue) => (
                        <Fragment key={issue.id}>
                          {columnHint?.anchorIssueId === issue.id &&
                            !columnHint.insertAfter && <IssueDropIndicator />}
                          <SortableIssueCard
                            issue={issue}
                            members={members}
                            selected={selectedIssueIds.has(issue.id)}
                            draggingCompanion={
                              activeDragIssueIds.has(issue.id) &&
                              activeDragIssueIds.size > 1 &&
                              activeId !== issueDndId(issue.id)
                            }
                            highlighted={highlightedIssueId === issue.id}
                            suppressClickRef={suppressClickRef}
                            layoutAnimationDisabled={Boolean(issueInsertHint)}
                            onCardClick={(event) =>
                              onIssueCardClick?.(issue, event, cellIssues)
                            }
                            onDelete={() => onDeleteIssue(issue)}
                            onAssignIssue={onAssignIssue}
                            onUpdateIssueColor={onUpdateIssueColor}
                            onUpdateIssuePriority={onUpdateIssuePriority}
                            onUpdateIssueTimer={onUpdateIssueTimer}
                            onGoToRef={onGoToRef}
                          />
                          {columnHint?.anchorIssueId === issue.id &&
                            columnHint.insertAfter && <IssueDropIndicator />}
                        </Fragment>
                      ))}
                      {columnHint &&
                        columnHint.anchorIssueId === null &&
                        cellIssues.length > 0 && <IssueDropIndicator />}
                    </BoardCell>
                  </>
                )}
              </SortableColumn>
            );
          })}
          </div>
        </div>
      </SortableContext>
    </div>
  );
}

function SortableColumn({
  id,
  disabled = false,
  children,
}: {
  id: string;
  disabled?: boolean;
  children: (props: {
    setActivatorNodeRef: (element: HTMLButtonElement | null) => void;
    listeners: ReturnType<typeof useSortable>["listeners"];
    isDragging: boolean;
  }) => ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`board-column-stack${isDragging ? " board-column-stack--dragging" : ""}`}
      {...attributes}
    >
      {children({ setActivatorNodeRef, listeners, isDragging })}
    </div>
  );
}

function BoardCell({
  rowId,
  statusId,
  columnKey,
  highlighted = false,
  issueIds,
  children,
  footer,
}: {
  rowId: string;
  statusId: string;
  columnKey: string;
  highlighted?: boolean;
  issueIds: string[];
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { setNodeRef } = useDroppable({
    id: cellDndId(rowId, statusId),
  });

  return (
    <section
      ref={setNodeRef}
      className={`column cell ${highlighted ? "column--highlighted" : ""}`}
      data-status-id={statusId}
      data-column-key={columnKey}
    >
      <SortableContext items={issueIds} strategy={verticalListSortingStrategy}>
        <div className="column-body">
          {children}
          <ColumnDropTail rowId={rowId} statusId={statusId} />
        </div>
      </SortableContext>
      {footer}
    </section>
  );
}

function ColumnDropTail({
  rowId,
  statusId,
}: {
  rowId: string;
  statusId: string;
}) {
  const { setNodeRef } = useDroppable({
    id: cellTailDndId(rowId, statusId),
  });

  return (
    <div ref={setNodeRef} className="column-body-drop-tail" aria-hidden />
  );
}

function IssueDropIndicator() {
  return <div className="issue-drop-indicator" role="presentation" />;
}

function SortableIssueCard({
  issue,
  members,
  selected = false,
  draggingCompanion = false,
  highlighted = false,
  suppressClickRef,
  layoutAnimationDisabled = false,
  onCardClick,
  onDelete,
  onAssignIssue,
  onUpdateIssueColor,
  onUpdateIssuePriority,
  onUpdateIssueTimer,
  onGoToRef,
}: {
  issue: IssuePublic;
  members: TeamMemberPublic[];
  selected?: boolean;
  draggingCompanion?: boolean;
  highlighted?: boolean;
  suppressClickRef: React.MutableRefObject<string | null>;
  layoutAnimationDisabled?: boolean;
  onCardClick?: (event: React.MouseEvent) => void;
  onDelete: () => void;
  onAssignIssue: (issue: IssuePublic, assigneeIds: string[]) => void;
  onUpdateIssueColor: (issue: IssuePublic, color: string | null) => void;
  onUpdateIssuePriority: (issue: IssuePublic, priority: Priority) => void;
  onUpdateIssueTimer: (
    issue: IssuePublic,
    patch: {
      timerActiveAt: string | null;
      timerElapsedSec: number;
      timerTargetSec: number | null;
    },
  ) => void;
  onGoToRef?: (ref: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: issueDndId(issue.id),
    ...(layoutAnimationDisabled
      ? { animateLayoutChanges: () => false }
      : {}),
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : draggingCompanion ? 0.5 : 1,
    ...(draggingCompanion ? { filter: "brightness(0.92)" } : {}),
    ...(issue.color ? { "--card-accent": issue.color } : {}),
  } as CSSProperties;

  return (
    <article
      ref={setNodeRef}
      style={style}
      data-issue-id={issue.id}
      className={`issue-card ${issue.color ? "has-card-color" : ""} ${isDragging ? "issue-card-dragging" : ""} ${draggingCompanion ? "issue-card-dragging-companion" : ""} ${highlighted ? "issue-card--highlighted" : ""} ${selected ? "issue-card--selected" : ""}`}
      {...attributes}
      {...listeners}
      onClick={(event) => {
        if (suppressClickRef.current === issueDndId(issue.id)) return;
        onCardClick?.(event);
      }}
      onMouseDown={(event) => {
        if (event.shiftKey || event.ctrlKey || event.metaKey) {
          event.preventDefault();
        }
      }}
    >
      {selected ? <span className="issue-card-select-chip" aria-hidden>✓</span> : null}
      <div className="issue-card-header">
        <RefCopyButton
          value={issue.identifier}
          variant="issue"
          compact
          share
          title={`Issue ${issue.identifier}`}
          onGo={onGoToRef ? () => onGoToRef(issue.identifier) : undefined}
        />
        <div className="issue-card-header-meta">
          <MultiAssigneePicker
            members={members}
            assigneeIds={assigneeIdsFromEntity(issue)}
            compact
            panelPlacement="top"
            floatingPanel
            onChange={(assigneeIds) => onAssignIssue(issue, assigneeIds)}
          />
          <IssueTimer
            issue={issue}
            compact
            floatingPanel
            onUpdate={(patch) => onUpdateIssueTimer(issue, patch)}
          />
        </div>
        <div className="issue-card-header-actions">
          <BoardColorPicker
            color={issue.color}
            onSelect={(color) => onUpdateIssueColor(issue, color)}
            compact
            title={`Card color: ${issue.identifier}`}
            className="color-picker--card"
          />
          <PriorityPicker
            priority={issue.priority}
            onSelect={(priority) => onUpdateIssuePriority(issue, priority)}
            compact
            floatingPanel
            title={`Priority: ${issue.identifier}`}
          />
          <button
            type="button"
            className="ghost issue-delete-btn"
            aria-label={`Delete ${issue.identifier}`}
            title="Delete card"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            ×
          </button>
        </div>
      </div>
      <h3 className="issue-card-title">{issue.title}</h3>
    </article>
  );
}

function ColumnHeader({
  label,
  count,
  statusType,
  refKey,
  statusId,
  highlighted = false,
  columnSearch = "",
  onColumnSearchChange,
  className = "column-label",
  color = null,
  onColorChange,
  onSave,
  onRemove,
  onGoToRef,
  dragHandleRef,
  dragHandleListeners,
  members,
  columnAssigneeIds = [],
  onAssignColumn,
  previewMode = false,
}: {
  label: string;
  count?: number;
  statusType?: string;
  refKey?: string;
  statusId?: string;
  highlighted?: boolean;
  columnSearch?: string;
  onColumnSearchChange?: (value: string) => void;
  className?: string;
  color?: string | null;
  onColorChange?: (color: string | null) => void;
  onSave: (name: string) => void;
  onRemove?: () => void;
  onGoToRef?: (ref: string) => void;
  dragHandleRef?: (element: HTMLButtonElement | null) => void;
  dragHandleListeners?: ReturnType<typeof useSortable>["listeners"];
  members?: TeamMemberPublic[];
  columnAssigneeIds?: string[];
  onAssignColumn?: (assigneeIds: string[]) => void;
  previewMode?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(label);

  useEffect(() => {
    setValue(label);
  }, [label]);

  const columnStyle = color
    ? ({ "--column-accent": color } as CSSProperties)
    : undefined;

  if (editing) {
    return (
      <div
        className={`${className}${statusType ? ` column-label--${statusType}` : ""}${color ? " has-column-color" : ""}`}
        style={columnStyle}
      >
        <input
          className="column-label-rename-input"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => {
            setEditing(false);
            onSave(value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setEditing(false);
              onSave(value);
            }
            if (e.key === "Escape") {
              setValue(label);
              setEditing(false);
            }
          }}
        />
      </div>
    );
  }

  return (
    <div
      className={`${className}${statusType ? ` column-label--${statusType}` : ""} ${highlighted ? "column-label--highlighted" : ""}${color ? " has-column-color" : ""}`}
      style={columnStyle}
      data-column-key={refKey}
      data-status-id={statusId}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="column-label-main">
        <div className="column-label-title">
          {dragHandleRef && dragHandleListeners ? (
            <button
              type="button"
              ref={dragHandleRef}
              className="column-drag-handle"
              aria-label={`Drag column ${label}`}
              title="Hold to drag column"
              disabled={previewMode}
              {...dragHandleListeners}
            >
              ⋮⋮
            </button>
          ) : null}
          {count !== undefined ? (
            <span className="column-issue-count" aria-label={`${count} issues`}>
              {count}
            </span>
          ) : null}
          <span className="column-label-name-wrap">
            <button
              type="button"
              className="column-label-name"
              onClick={() => setEditing(true)}
              title="Click to rename"
            >
              {label}
            </button>
          </span>
          {members && onAssignColumn ? (
            <MultiAssigneePicker
              members={members}
              assigneeIds={columnAssigneeIds}
              compact
              panelPlacement="top"
              floatingPanel
              disabled={previewMode}
              onChange={onAssignColumn}
            />
          ) : null}
        </div>
        <div className="column-label-actions">
          {refKey ? (
            <RefCopyButton
              value={refKey}
              display="label"
              buttonLabel="Copy"
              compact
              share
              title={`Column ${label}`}
              onGo={onGoToRef ? () => onGoToRef(refKey) : undefined}
            />
          ) : null}
          {(onColorChange || onRemove) ? (
            <RowEditMenu>
              {onColorChange ? (
                <RowEditMenuSection title="Column color">
                  <BoardColorPicker
                    color={color}
                    onSelect={onColorChange}
                    title={`Column color: ${label}`}
                  />
                </RowEditMenuSection>
              ) : null}
              {onRemove ? (
                <RowEditMenuItem danger onClick={onRemove}>
                  Remove column
                </RowEditMenuItem>
              ) : null}
            </RowEditMenu>
          ) : null}
        </div>
      </div>
      {onColumnSearchChange ? (
        <div className="column-label-search-span">
          <BoardSearchInput
            className="column-label-search"
            value={columnSearch}
            onChange={onColumnSearchChange}
            placeholder="Search column…"
            aria-label={`Search issues in column ${label}`}
          />
        </div>
      ) : null}
    </div>
  );
}

function EditableLabel({
  label,
  className = "column-label",
  onSave,
}: {
  label: string;
  className?: string;
  onSave: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(label);

  useEffect(() => {
    setValue(label);
  }, [label]);

  if (editing) {
    return (
      <input
        className="row-separator-rename-input"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          setEditing(false);
          onSave(value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            setEditing(false);
            onSave(value);
          }
          if (e.key === "Escape") {
            setValue(label);
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <button
      type="button"
      className={className}
      onClick={() => setEditing(true)}
      title="Click to rename"
    >
      {label}
    </button>
  );
}
