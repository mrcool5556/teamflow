import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type {
  BoardRowPublic,
  IssuePublic,
  IssueStatusPublic,
  Priority,
  TeamMemberPublic,
} from "@teamflow/core";
import { client } from "../../api";
import type { UndoPayload } from "../../hooks/useChangeHistory";
import { useErrorSink } from "../../lib/errorSink";
import type { IssueTimerPatch } from "../../lib/timer";
import { updateBoard, type BoardData } from "../../queries/board";
import {
  createColumn as createColumnChange,
  createIssue as createIssueChange,
  createRow as createRowChange,
  insertIssueSorted,
  patchColumn,
  patchIssue,
  patchIssues,
  patchRow,
  reorderColumns as reorderColumnsChange,
  reorderRows as reorderRowsChange,
  useBoardMutation,
} from "../../queries/boardMutations";
import { hideBoardItems } from "../../queries/hiddenBoardItems";
import { queryKeys } from "../../queries/keys";

export type QuickAddTarget =
  | { kind: "row" }
  | { kind: "column"; rowId: string }
  | { kind: "issue"; rowId: string; statusId: string };

type BoardActionsInput = {
  teamId: string | null;
  board: BoardData;
  members: TeamMemberPublic[];
  defaultRowId: string | null;
  selectedIssue: IssuePublic | null;
  openIssue: (issue: Pick<IssuePublic, "identifier">) => void;
  closeIssue: () => void;
  scheduleUndo: (payload: UndoPayload) => void;
};

/**
 * Every board edit the shell offers: optimistic mutations, undoable deletes and the quick-add
 * dialog. Each handler writes to the team it was created for.
 */
export function useBoardActions({
  teamId,
  board,
  members,
  defaultRowId,
  selectedIssue,
  openIssue,
  closeIssue,
  scheduleUndo,
}: BoardActionsInput) {
  const queryClient = useQueryClient();
  const { report, clear: clearError } = useErrorSink();
  const mutateBoard = useBoardMutation(teamId);
  const { rows, statuses, issues } = board;
  const [quickAdd, setQuickAdd] = useState<QuickAddTarget | null>(null);
  const [quickAddValue, setQuickAddValue] = useState("");

  function reorderRows(activeRowId: string, overRowId: string) {
    const change = reorderRowsChange(board, activeRowId, overRowId);
    if (change) void mutateBoard(change);
  }

  function reorderColumns(rowId: string, activeStatusId: string, overStatusId: string) {
    const change = reorderColumnsChange(board, rowId, activeStatusId, overStatusId);
    if (change) void mutateBoard(change);
  }

  function reorderIssuesInCell(rowId: string, statusId: string, orderedIssueIds: string[]) {
    void mutateBoard(
      patchIssues(
        board,
        members,
        orderedIssueIds.map((id, boardSort) => ({ id, patch: { rowId, statusId, boardSort } })),
        "Failed to reorder issue",
      ),
    );
  }

  function assignIssue(issue: IssuePublic, assigneeIds: string[]) {
    void mutateBoard(
      patchIssue(board, members, issue.id, { assigneeIds }, "Failed to assign issue"),
    );
  }

  /** Column assign and bulk assign: one change, parallel requests, one rollback. */
  function assignIssues(issueIds: string[], assigneeIds: string[]) {
    if (issueIds.length === 0) return;
    void mutateBoard(
      patchIssues(
        board,
        members,
        issueIds.map((id) => ({ id, patch: { assigneeIds } })),
        "Failed to assign issues",
      ),
    );
  }

  function assignRow(row: BoardRowPublic, assigneeIds: string[]) {
    const assignees = members
      .filter((member) => assigneeIds.includes(member.userId))
      .map((member) => ({ userId: member.userId, name: member.name }));
    void mutateBoard(
      patchRow(row, { assigneeIds }, "Failed to assign row", {
        assignees,
        assigneeId: assigneeIds[0] ?? null,
        assigneeName: assignees[0]?.name ?? null,
      }),
    );
  }

  function bulkMoveIssues(issueIds: string[], rowId: string, statusId: string) {
    if (issueIds.length === 0) return;
    const baseSort = issues.filter((issue) => {
      const issueRow = issue.rowId ?? defaultRowId;
      return issueRow === rowId && issue.statusId === statusId && !issueIds.includes(issue.id);
    }).length;
    void mutateBoard(
      patchIssues(
        board,
        members,
        issueIds.map((id, index) => ({
          id,
          patch: { rowId, statusId, boardSort: baseSort + index },
        })),
        "Failed to move issues",
      ),
    );
  }

  function bulkSetPriority(issueIds: string[], priority: Priority) {
    if (issueIds.length === 0) return;
    void mutateBoard(
      patchIssues(
        board,
        members,
        issueIds.map((id) => ({ id, patch: { priority } })),
        "Failed to update issues",
      ),
    );
  }

  function bulkTimerIssues(issueIds: string[], action: "pause" | "reset") {
    const now = Date.now();
    const patches = issues
      .filter((issue) => issueIds.includes(issue.id))
      .map((issue) => ({
        id: issue.id,
        patch:
          action === "reset"
            ? { timerActiveAt: null, timerElapsedSec: 0, timerTargetSec: null }
            : {
                timerActiveAt: null,
                timerElapsedSec: issue.timerActiveAt
                  ? issue.timerElapsedSec +
                    Math.max(0, Math.floor((now - Date.parse(issue.timerActiveAt)) / 1000))
                  : issue.timerElapsedSec,
                timerTargetSec: issue.timerTargetSec,
              },
      }));
    if (patches.length === 0) return;
    void mutateBoard(patchIssues(board, members, patches, "Failed to update timers"));
  }

  /**
   * Issues go to the server trash at once. Undo (and Restore in the history) calls the restore
   * route for every one of them, so an undone delete survives the next refetch.
   */
  function trashIssues(issuesToDelete: IssuePublic[], label: string) {
    if (!teamId || issuesToDelete.length === 0) return;
    const forTeamId = teamId;
    const ids = issuesToDelete.map((issue) => issue.id);
    const idSet = new Set(ids);
    const reopen = selectedIssue && idSet.has(selectedIssue.id) ? selectedIssue : null;
    const show = hideBoardItems({ issueIds: ids });
    if (reopen) closeIssue();

    scheduleUndo({
      label,
      issueId: ids.length === 1 ? ids[0] : undefined,
      timing: "now",
      restore: () => {
        show();
        if (reopen) openIssue(reopen);
      },
      commit: async () => {
        try {
          await Promise.all(ids.map((id) => client.deleteIssue(id)));
        } catch (err) {
          report(err, ids.length === 1 ? "Failed to delete issue" : "Failed to delete issues");
          void queryClient.invalidateQueries({ queryKey: queryKeys.board(forTeamId) });
          throw err;
        }
        updateBoard(queryClient, forTeamId, (current) => ({
          ...current,
          issues: current.issues.filter((issue) => !idSet.has(issue.id)),
        }));
        show();
      },
      restoreFromTrash: async () => {
        const restored = await Promise.all(ids.map((id) => client.restoreIssue(id)));
        updateBoard(queryClient, forTeamId, (current) => ({
          ...current,
          issues: restored.map(({ issue }) => issue).reduce(insertIssueSorted, current.issues),
        }));
      },
    });
  }

  function bulkDeleteIssues(issuesToDelete: IssuePublic[]) {
    trashIssues(
      issuesToDelete,
      issuesToDelete.length === 1
        ? `Deleted ${issuesToDelete[0]!.identifier}`
        : `Deleted ${issuesToDelete.length} issues`,
    );
  }

  function updateRowColor(row: BoardRowPublic, color: string | null) {
    void mutateBoard(patchRow(row, { color }, "Failed to update row color"));
  }

  function updateStatusColor(status: IssueStatusPublic, color: string | null) {
    void mutateBoard(patchColumn(status, { color }, "Failed to update column color"));
  }

  function updateIssueColor(issue: IssuePublic, color: string | null) {
    void mutateBoard(
      patchIssue(board, members, issue.id, { color }, "Failed to update card color"),
    );
  }

  function updateIssuePriority(issue: IssuePublic, priority: Priority) {
    if (issue.priority === priority) return;
    void mutateBoard(
      patchIssue(board, members, issue.id, { priority }, "Failed to update priority"),
    );
  }

  function updateIssueTimer(issue: IssuePublic, patch: IssueTimerPatch) {
    void mutateBoard(patchIssue(board, members, issue.id, patch, "Failed to update timer"));
  }

  function renameStatus(status: IssueStatusPublic, name: string) {
    const trimmed = name.trim();
    if (!trimmed || trimmed === status.name) return;
    void mutateBoard(patchColumn(status, { name: trimmed }, "Failed to rename column"));
  }

  /**
   * Rows and columns have no restore route, so their delete is only sent when the undo window
   * closes. Until then the board query hides them and a refetch cannot bring them back.
   */
  function scheduleStructureDelete(options: {
    label: string;
    hide: { rowIds?: string[]; statusIds?: string[] };
    send: () => Promise<unknown>;
    drop: (board: BoardData) => BoardData;
    errorMessage: string;
  }) {
    if (!teamId) return;
    const forTeamId = teamId;
    const show = hideBoardItems(options.hide);
    scheduleUndo({
      label: options.label,
      timing: "deferred",
      restore: show,
      commit: async () => {
        try {
          await options.send();
        } catch (err) {
          report(err, options.errorMessage);
          throw err;
        }
        updateBoard(queryClient, forTeamId, options.drop);
        show();
      },
    });
  }

  function removeRow(row: BoardRowPublic) {
    scheduleStructureDelete({
      label: `Removed row "${row.name}"`,
      hide: {
        rowIds: [row.id],
        statusIds: statuses.filter((status) => status.rowId === row.id).map((status) => status.id),
      },
      send: () => client.deleteRow(row.id),
      drop: (current) => ({
        ...current,
        rows: current.rows.filter((item) => item.id !== row.id),
        statuses: current.statuses.filter((status) => status.rowId !== row.id),
      }),
      errorMessage: "Failed to remove row",
    });
  }

  function removeColumn(status: IssueStatusPublic) {
    scheduleStructureDelete({
      label: `Removed column "${status.name}"`,
      hide: { statusIds: [status.id] },
      send: () => client.deleteStatus(status.id),
      drop: (current) => ({
        ...current,
        statuses: current.statuses.filter((item) => item.id !== status.id),
      }),
      errorMessage: "Failed to remove column",
    });
  }

  function deleteIssue(issue: IssuePublic) {
    trashIssues([issue], `Deleted ${issue.identifier}`);
  }

  function openQuickAdd(target: QuickAddTarget, initialValue = "") {
    setQuickAdd(target);
    setQuickAddValue(initialValue);
    clearError();
  }

  function closeQuickAdd() {
    setQuickAdd(null);
    setQuickAddValue("");
  }

  function submitQuickAdd() {
    if (!quickAdd || !teamId) return;
    const value = quickAddValue.trim();
    if (!value) return;

    if (quickAdd.kind === "column") {
      void mutateBoard(createColumnChange(board, teamId, quickAdd.rowId, value));
    } else if (quickAdd.kind === "row") {
      void mutateBoard(createRowChange(board, value, teamId));
    } else {
      void mutateBoard(
        createIssueChange(board, {
          teamId,
          rowId: quickAdd.rowId,
          statusId: quickAdd.statusId,
          title: value,
        }),
      );
    }
    closeQuickAdd();
  }

  function addColumn(rowId: string) {
    if (!teamId) return;
    openQuickAdd({ kind: "column", rowId });
  }

  function addRow() {
    if (!teamId) return;
    openQuickAdd({ kind: "row" }, `Row ${rows.length + 1}`);
  }

  function addIssue(rowId: string, statusId: string) {
    if (!teamId) return;
    openQuickAdd({ kind: "issue", rowId, statusId });
  }

  function renameRow(row: BoardRowPublic, name: string) {
    const trimmed = name.trim();
    if (!trimmed || trimmed === row.name) return;
    void mutateBoard(patchRow(row, { name: trimmed }, "Failed to rename row"));
  }

  return {
    mutateBoard,
    quickAdd,
    quickAddValue,
    setQuickAddValue,
    reorderRows,
    reorderColumns,
    reorderIssuesInCell,
    assignIssue,
    assignIssues,
    assignRow,
    bulkMoveIssues,
    bulkSetPriority,
    bulkTimerIssues,
    bulkDeleteIssues,
    updateRowColor,
    updateStatusColor,
    updateIssueColor,
    updateIssuePriority,
    updateIssueTimer,
    renameStatus,
    removeRow,
    removeColumn,
    deleteIssue,
    closeQuickAdd,
    submitQuickAdd,
    addColumn,
    addRow,
    addIssue,
    renameRow,
  };
}
