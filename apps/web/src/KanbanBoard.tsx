import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
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
import { issueMatchesBoardSearch } from "./lib/refLinks";
import type { Priority } from "@teamflow/core";

const HOLD_MS = 500;

export const issueDndId = (issueId: string) => `issue:${issueId}`;
export const rowDndId = (rowId: string) => `row:${rowId}`;
export const columnDndId = (rowId: string, statusId: string) =>
  `column:${rowId}:${statusId}`;
export const cellDndId = (rowId: string, statusId: string) =>
  `cell:${rowId}:${statusId}`;

type ParsedDndId =
  | { kind: "issue"; issueId: string }
  | { kind: "row"; rowId: string }
  | { kind: "column"; rowId: string; statusId: string }
  | { kind: "cell"; rowId: string; statusId: string }
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
  return { kind: "unknown" };
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
  onRemoveRow,
  onRemoveColumn,
  onAddColumn,
  onAddIssue,
  onReorderRows,
  onReorderColumns,
  onReorderIssuesInCell,
  members,
  onAssignIssue,
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
}: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
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
      activationConstraint: { delay: HOLD_MS, tolerance: 6 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: HOLD_MS, tolerance: 8 },
    }),
  );

  const activeIssue = useMemo(() => {
    if (!activeId?.startsWith("issue:")) return null;
    const issueId = activeId.slice("issue:".length);
    return issues.find((issue) => issue.id === issueId) ?? null;
  }, [activeId, issues]);

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
    suppressClickRef.current = String(event.active.id);
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

    if (activeParsed.kind === "column" && overParsed.kind === "column") {
      if (
        activeParsed.rowId === overParsed.rowId &&
        activeParsed.statusId !== overParsed.statusId
      ) {
        onReorderColumns(
          activeParsed.rowId,
          activeParsed.statusId,
          overParsed.statusId,
        );
      }
      return;
    }

    if (activeParsed.kind !== "issue") return;

    const issue = issues.find((item) => item.id === activeParsed.issueId);
    if (!issue) return;

    const sourceRowId = issue.rowId ?? defaultRowId;
    const sourceStatusId = issue.statusId;
    if (!sourceRowId) return;

    let targetRowId = sourceRowId;
    let targetStatusId = sourceStatusId;
    let overIssueId: string | null = null;

    if (overParsed.kind === "cell") {
      targetRowId = overParsed.rowId;
      targetStatusId = overParsed.statusId;
    } else if (overParsed.kind === "issue") {
      const overIssue = issues.find((item) => item.id === overParsed.issueId);
      if (!overIssue) return;
      targetRowId = overIssue.rowId ?? defaultRowId ?? targetRowId;
      targetStatusId = overIssue.statusId;
      overIssueId = overIssue.id;
    } else {
      return;
    }

    if (!targetRowId) return;

    if (targetRowId !== sourceRowId) {
      const mappedStatusId = mapStatusToRow(statuses, targetStatusId, targetRowId);
      if (!mappedStatusId) return;
      targetStatusId = mappedStatusId;
    }

    const sourceCell = issuesForCell(sourceRowId, sourceStatusId).map((item) => item.id);
    const targetCell = issuesForCell(targetRowId, targetStatusId)
      .filter((item) => item.id !== issue.id)
      .map((item) => item.id);

    const sameCell =
      sourceRowId === targetRowId && sourceStatusId === targetStatusId;

    if (sameCell && overIssueId) {
      const oldIndex = sourceCell.indexOf(issue.id);
      const newIndex = sourceCell.indexOf(overIssueId);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;
      onReorderIssuesInCell(
        targetRowId,
        targetStatusId,
        arrayMove(sourceCell, oldIndex, newIndex),
      );
      return;
    }

    let insertIndex = targetCell.length;
    if (overIssueId) {
      const overIndex = targetCell.indexOf(overIssueId);
      if (overIndex >= 0) insertIndex = overIndex;
    }

    const nextTargetCell = [...targetCell];
    nextTargetCell.splice(insertIndex, 0, issue.id);

    onReorderIssuesInCell(targetRowId, targetStatusId, nextTargetCell, {
      rowId: targetRowId,
      statusId: targetStatusId,
    });

    if (sourceRowId !== targetRowId || sourceStatusId !== targetStatusId) {
      const nextSourceCell = sourceCell.filter((id) => id !== issue.id);
      onReorderIssuesInCell(sourceRowId, sourceStatusId, nextSourceCell);
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
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
              previewMode={previewMode}
            />
            );
          })}
        </SortableContext>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeIssue ? (
          <article className="issue-card issue-card-overlay">
            <div className="issue-card-header">
              <span className="issue-id">{activeIssue.identifier}</span>
            </div>
            <h3 className="issue-card-title">{activeIssue.title}</h3>
          </article>
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

function assigneeNamesLabel(entity: {
  assignees?: { name: string }[];
  assigneeName: string | null;
}) {
  if (entity.assignees && entity.assignees.length > 0) {
    return entity.assignees.map((assignee) => assignee.name).join(", ");
  }
  return entity.assigneeName;
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
}) {
  return (
    <div className="row-separator-bar">
      <button
        type="button"
        ref={setActivatorNodeRef}
        className="row-drag-handle"
        aria-label={`Drag row ${row.name}`}
        title="Hold to drag row"
        {...listeners}
      >
        ⋮⋮
      </button>
      <div className="row-separator-primary">
        <EditableLabel
          label={row.name}
          className="row-separator-name"
          onSave={(name) => onRenameRow(row, name)}
        />
        <RefCopyButton
          value={row.key}
          display="icon"
          share
          compact
          title={`Row ${row.name}`}
          onGo={onGoToRef ? () => onGoToRef(row.key) : undefined}
        />
        <BoardSearchInput
          className="row-search"
          value={rowSearch}
          onChange={(value) => onRowSearchChange?.(value)}
          placeholder="Search row…"
          aria-label={`Search issues in row ${row.name}`}
        />
        <RowEditMenu>
          <RowEditMenuSection title="Row owners">
            <MultiAssigneePicker
              members={members}
              assigneeIds={assigneeIdsFromEntity(row)}
              label="Row owners"
              onChange={(assigneeIds) => onAssignRow(row, assigneeIds)}
            />
          </RowEditMenuSection>
          <RowEditMenuSection title="Row color">
            <RowColorPicker color={row.color} onSelect={(color) => onUpdateRowColor(row, color)} />
          </RowEditMenuSection>
          <RowEditMenuItem onClick={onToggleHeaders}>
            {headersVisible ? "Hide column headers" : "Show column headers"}
          </RowEditMenuItem>
          <RowEditMenuItem onClick={() => onAddColumn(row.id)}>Add column</RowEditMenuItem>
          {canRemoveRow ? (
            <RowEditMenuItem danger onClick={() => onRemoveRow(row)}>
              Remove row
            </RowEditMenuItem>
          ) : null}
        </RowEditMenu>
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
  previewMode = false,
}: {
  row: BoardRowPublic;
  statuses: IssueStatusPublic[];
  canRemoveRow: boolean;
  headersVisible: boolean;
  onToggleHeaders: () => void;
  onRenameRow: (row: BoardRowPublic, name: string) => void;
  onRenameStatus: (status: IssueStatusPublic, name: string) => void;
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
  previewMode?: boolean;
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
        />
      </div>

      <SortableContext
        items={visibleStatuses.map((status) => columnDndId(row.id, status.id))}
        strategy={horizontalListSortingStrategy}
      >
        <div className="board-row-columns">
          {visibleStatuses.map((status) => {
            const cellIssues = filterCellIssues(status.id);
            const issueIds = cellIssues.map((issue) => issueDndId(issue.id));
            const columnSortable = headersVisible && !previewMode;

            return (
              <SortableColumn
                key={`${row.id}-${status.id}`}
                id={columnDndId(row.id, status.id)}
                disabled={!columnSortable}
              >
                {({ setActivatorNodeRef, listeners, isDragging }) => (
                  <>
                    {headersVisible ? (
                      <EditableLabel
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
                        className={`column-label column-label-row${isDragging ? " column-label--dragging" : ""}`}
                        onSave={(name) => onRenameStatus(status, name)}
                        onRemove={
                          cellIssues.length === 0
                            ? () => onRemoveColumn(status)
                            : undefined
                        }
                        onGoToRef={onGoToRef}
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
                      {cellIssues.map((issue) => (
                        <SortableIssueCard
                          key={issue.id}
                          issue={issue}
                          members={members}
                          selected={selectedIssueIds.has(issue.id)}
                          highlighted={highlightedIssueId === issue.id}
                          suppressClickRef={suppressClickRef}
                          onCardClick={(event) =>
                            onIssueCardClick?.(issue, event, cellIssues)
                          }
                          onDelete={() => onDeleteIssue(issue)}
                          onAssignIssue={onAssignIssue}
                          onUpdateIssueTimer={onUpdateIssueTimer}
                          onGoToRef={onGoToRef}
                        />
                      ))}
                    </BoardCell>
                  </>
                )}
              </SortableColumn>
            );
          })}
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
  const { setNodeRef, isOver } = useDroppable({
    id: cellDndId(rowId, statusId),
  });

  return (
    <section
      ref={setNodeRef}
      className={`column cell ${isOver ? "cell-drop-target" : ""} ${highlighted ? "column--highlighted" : ""}`}
      data-status-id={statusId}
      data-column-key={columnKey}
    >
      <SortableContext items={issueIds} strategy={verticalListSortingStrategy}>
        <div className="column-body">{children}</div>
      </SortableContext>
      {footer}
    </section>
  );
}

function SortableIssueCard({
  issue,
  members,
  selected = false,
  highlighted = false,
  suppressClickRef,
  onCardClick,
  onDelete,
  onAssignIssue,
  onUpdateIssueTimer,
  onGoToRef,
}: {
  issue: IssuePublic;
  members: TeamMemberPublic[];
  selected?: boolean;
  highlighted?: boolean;
  suppressClickRef: React.MutableRefObject<string | null>;
  onCardClick?: (event: React.MouseEvent) => void;
  onDelete: () => void;
  onAssignIssue: (issue: IssuePublic, assigneeIds: string[]) => void;
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
  } = useSortable({ id: issueDndId(issue.id) });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      data-issue-id={issue.id}
      className={`issue-card ${isDragging ? "issue-card-dragging" : ""} ${highlighted ? "issue-card--highlighted" : ""} ${selected ? "issue-card--selected" : ""}`}
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
        <div className="issue-card-header-actions">
          {issue.priority !== "none" && (
            <span className={`priority-badge priority-${issue.priority}`}>
              {issue.priority}
            </span>
          )}
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
      {assigneeNamesLabel(issue) && (
        <p className="issue-card-assignee">{assigneeNamesLabel(issue)}</p>
      )}
      <footer
        className="issue-card-footer"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
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
      </footer>
    </article>
  );
}

function EditableLabel({
  label,
  count,
  statusType,
  refKey,
  statusId,
  highlighted = false,
  columnSearch = "",
  onColumnSearchChange,
  className = "column-label",
  onSave,
  onRemove,
  onGoToRef,
  dragHandleRef,
  dragHandleListeners,
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
  onSave: (name: string) => void;
  onRemove?: () => void;
  onGoToRef?: (ref: string) => void;
  dragHandleRef?: (element: HTMLButtonElement | null) => void;
  dragHandleListeners?: ReturnType<typeof useSortable>["listeners"];
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(label);

  useEffect(() => {
    setValue(label);
  }, [label]);

  if (editing) {
    return (
      <div
        className={`${className}${statusType ? ` column-label--${statusType}` : ""}`}
      >
        <input
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
      className={`${className}${statusType ? ` column-label--${statusType}` : ""} ${highlighted ? "column-label--highlighted" : ""}`}
      data-column-key={refKey}
      data-status-id={statusId}
    >
      <div className="column-label-head">
        {dragHandleRef && dragHandleListeners ? (
          <button
            type="button"
            ref={dragHandleRef}
            className="column-drag-handle"
            aria-label={`Drag column ${label}`}
            title="Hold to drag column"
            {...dragHandleListeners}
          >
            ⋮⋮
          </button>
        ) : null}
        <button
          type="button"
          className="label-btn"
          onClick={() => setEditing(true)}
          title="Click to rename"
        >
          <span>{label}</span>
          {count !== undefined && <span className="count">{count}</span>}
        </button>
        <button
          type="button"
          className={`ghost label-remove-btn${onRemove ? "" : " label-remove-btn--reserved"}`}
          onClick={onRemove}
          disabled={!onRemove}
          tabIndex={onRemove ? 0 : -1}
          aria-hidden={!onRemove}
          title={onRemove ? `Remove empty column "${label}"` : undefined}
          aria-label={onRemove ? `Remove column ${label}` : undefined}
        >
          ×
        </button>
        {refKey ? (
          <RefCopyButton
            value={refKey}
            display="icon"
            share
            compact
            title={`Column ${label}`}
            onGo={onGoToRef ? () => onGoToRef(refKey) : undefined}
          />
        ) : null}
      </div>
      {onColumnSearchChange ? (
        <BoardSearchInput
          className="column-search"
          value={columnSearch}
          onChange={onColumnSearchChange}
          placeholder="Search column…"
          aria-label={`Search issues in column ${label}`}
        />
      ) : null}
    </div>
  );
}
