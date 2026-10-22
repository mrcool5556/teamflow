import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  BoardRowPublic,
  IssuePublic,
  IssueStatusPublic,
  TeamMemberPublic,
  UpdateIssueInput,
} from "@teamflow/core";
import { client } from "../api";
import { useErrorSink } from "../lib/errorSink";
import { updateBoard, type BoardData } from "./board";
import { queryKeys } from "./keys";

/**
 * One change to a team's board: the request, how the cache looks while it runs, and how the
 * server's answer is folded back in. Every board edit goes through `useBoardMutation`.
 */
export type BoardChange<R = unknown> = {
  run: () => Promise<R>;
  optimistic?: (board: BoardData) => BoardData;
  settle?: (board: BoardData, result: R) => BoardData;
  errorMessage: string;
};

type Context = { teamId: string; previous: BoardData | undefined };

const boardMutationKey = (teamId: string) => ["board-mutation", teamId] as const;

/**
 * Optimistic board mutation: apply `optimistic` at once, roll the whole board back to its
 * snapshot if the request fails (one rollback even for bulk changes), report the error to the
 * shared sink, and resync from the server once the last pending change for the team settles.
 */
export function useBoardMutation(teamId: string | null) {
  const queryClient = useQueryClient();
  const { report } = useErrorSink();

  const mutation = useMutation<unknown, unknown, BoardChange & { teamId: string }, Context>({
    mutationKey: boardMutationKey(teamId ?? ""),
    mutationFn: (change) => change.run(),
    onMutate: async (change) => {
      const key = queryKeys.board(change.teamId);
      // A refetch landing mid-change would briefly undo the optimistic state.
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<BoardData>(key);
      if (change.optimistic) updateBoard(queryClient, change.teamId, change.optimistic);
      return { teamId: change.teamId, previous };
    },
    onError: (err, change, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.board(context.teamId), context.previous);
      }
      report(err, change.errorMessage);
    },
    onSuccess: (result, change) => {
      if (change.settle) {
        const settle = change.settle;
        updateBoard(queryClient, change.teamId, (board) => settle(board, result));
      }
    },
    onSettled: (_result, _err, change) => {
      // This mutation still counts as pending here; resync after the last one.
      if (queryClient.isMutating({ mutationKey: boardMutationKey(change.teamId) }) <= 1) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.board(change.teamId) });
      }
    },
  });

  const { mutateAsync } = mutation;
  return useCallback(
    async <R>(change: BoardChange<R>): Promise<R | undefined> => {
      if (!teamId) return undefined;
      try {
        return (await mutateAsync({ ...(change as BoardChange), teamId })) as R;
      } catch {
        return undefined;
      }
    },
    [mutateAsync, teamId],
  );
}

// ---- pure board edits shared by the change builders ----

export function replaceById<T extends { id: string }>(list: T[], item: T) {
  return list.map((current) => (current.id === item.id ? item : current));
}

export function insertIssueSorted(list: IssuePublic[], issue: IssuePublic) {
  if (list.some((item) => item.id === issue.id)) return list;
  return [...list, issue].sort((a, b) => {
    const rowA = a.rowId ?? "";
    const rowB = b.rowId ?? "";
    if (rowA !== rowB) return rowA.localeCompare(rowB);
    if (a.statusId !== b.statusId) return a.statusId.localeCompare(b.statusId);
    return (a.boardSort ?? 0) - (b.boardSort ?? 0);
  });
}

/** The issue as the server will return it after `patch` (names resolved locally). */
export function applyIssuePatch(
  issue: IssuePublic,
  patch: UpdateIssueInput,
  statuses: IssueStatusPublic[],
  members: TeamMemberPublic[],
): IssuePublic {
  const { assigneeIds, ...rest } = patch;
  const nextStatus = patch.statusId
    ? statuses.find((status) => status.id === patch.statusId)
    : null;
  const next: IssuePublic = {
    ...issue,
    ...(rest as Partial<IssuePublic>),
    statusName: nextStatus?.name ?? issue.statusName,
    boardSort: patch.boardSort ?? issue.boardSort,
  };
  if (assigneeIds !== undefined) {
    const assignees = members
      .filter((member) => assigneeIds.includes(member.userId))
      .map((member) => ({ userId: member.userId, name: member.name }));
    next.assignees = assignees;
    next.assigneeId = assigneeIds[0] ?? null;
    next.assigneeName = assignees[0]?.name ?? null;
  }
  return next;
}

function moveInList<T extends { id: string; position: number }>(
  items: T[],
  activeId: string,
  overId: string,
) {
  const oldIndex = items.findIndex((item) => item.id === activeId);
  const newIndex = items.findIndex((item) => item.id === overId);
  if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return null;
  const next = [...items];
  const [moved] = next.splice(oldIndex, 1);
  next.splice(newIndex, 0, moved!);
  return { items: next.map((item, position) => ({ ...item, position })), newIndex };
}

// ---- change builders: one per kind of board edit ----

/**
 * Patch several issues in parallel as one change: one optimistic update, one rollback.
 * There is no bulk issue endpoint, so this is N PATCH requests.
 */
export function patchIssues(
  board: BoardData,
  members: TeamMemberPublic[],
  patches: { id: string; patch: UpdateIssueInput }[],
  errorMessage: string,
): BoardChange<IssuePublic[]> {
  const byId = new Map(patches.map((item) => [item.id, item.patch]));
  return {
    run: async () =>
      (await Promise.all(patches.map(({ id, patch }) => client.updateIssue(id, patch)))).map(
        ({ issue }) => issue,
      ),
    optimistic: (current) => ({
      ...current,
      issues: current.issues.map((issue) => {
        const patch = byId.get(issue.id);
        return patch ? applyIssuePatch(issue, patch, board.statuses, members) : issue;
      }),
    }),
    settle: (current, updated) => {
      const updatedById = new Map(updated.map((issue) => [issue.id, issue]));
      return {
        ...current,
        issues: current.issues.map((issue) => updatedById.get(issue.id) ?? issue),
      };
    },
    errorMessage,
  };
}

/** Mark done: the server moves the issue to the row's done column. */
export function completeIssue(issueId: string): BoardChange<IssuePublic> {
  return {
    run: async () => (await client.completeIssue(issueId)).issue,
    settle: (current, issue) => ({ ...current, issues: replaceById(current.issues, issue) }),
    errorMessage: "Failed to complete issue",
  };
}

export function patchIssue(
  board: BoardData,
  members: TeamMemberPublic[],
  issueId: string,
  patch: UpdateIssueInput,
  errorMessage: string,
) {
  return patchIssues(board, members, [{ id: issueId, patch }], errorMessage);
}

export function createIssue(
  board: BoardData,
  input: { teamId: string; rowId: string; statusId: string; title: string },
): BoardChange<IssuePublic> {
  const tempId = `pending-${crypto.randomUUID()}`;
  const status = board.statuses.find((item) => item.id === input.statusId);
  const placeholder: IssuePublic = {
    id: tempId,
    identifier: "…",
    teamId: input.teamId,
    projectId: null,
    rowId: input.rowId,
    number: 0,
    title: input.title,
    description: null,
    statusId: input.statusId,
    statusName: status?.name ?? "",
    priority: "none",
    assigneeId: null,
    assigneeName: null,
    assignees: [],
    creatorId: "",
    creatorName: "",
    dueDate: null,
    boardSort: -1,
    timerActiveAt: null,
    timerElapsedSec: 0,
    timerTargetSec: null,
    completedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    color: null,
  };
  return {
    run: async () => (await client.createIssue({ ...input, priority: "none" })).issue,
    optimistic: (current) => ({ ...current, issues: [placeholder, ...current.issues] }),
    settle: (current, issue) => ({
      ...current,
      issues: current.issues.map((item) => (item.id === tempId ? issue : item)),
    }),
    errorMessage: "Failed to create issue",
  };
}

export function patchRow(
  row: BoardRowPublic,
  patch: Parameters<typeof client.updateRow>[1],
  errorMessage: string,
  optimisticRow: Partial<BoardRowPublic> = patch as Partial<BoardRowPublic>,
): BoardChange<BoardRowPublic> {
  return {
    run: async () => (await client.updateRow(row.id, patch)).row,
    optimistic: (current) => ({
      ...current,
      rows: current.rows.map((item) => (item.id === row.id ? { ...item, ...optimisticRow } : item)),
    }),
    settle: (current, updated) => ({ ...current, rows: replaceById(current.rows, updated) }),
    errorMessage,
  };
}

export function reorderRows(
  board: BoardData,
  activeRowId: string,
  overRowId: string,
): BoardChange | null {
  const moved = moveInList(board.rows, activeRowId, overRowId);
  if (!moved) return null;
  return {
    run: () => client.updateRow(activeRowId, { position: moved.newIndex }),
    optimistic: (current) => ({ ...current, rows: moved.items }),
    errorMessage: "Failed to reorder row",
  };
}

export function createRow(
  board: BoardData,
  name: string,
  teamId: string,
): BoardChange<{ row: BoardRowPublic; statuses: IssueStatusPublic[] }> {
  const tempId = `pending-${crypto.randomUUID()}`;
  const placeholder: BoardRowPublic = {
    id: tempId,
    teamId,
    key: "",
    name,
    position: board.rows.length,
    assigneeId: null,
    assigneeName: null,
    assignees: [],
    color: null,
  };
  return {
    optimistic: (current) => ({ ...current, rows: [...current.rows, placeholder] }),
    run: async () => {
      const { row } = await client.createRow(teamId, { name });
      const { statuses } = await client.listRowStatuses(row.id);
      return { row, statuses };
    },
    settle: (current, { row, statuses }) => ({
      ...current,
      rows: current.rows.map((item) => (item.id === tempId ? row : item)),
      statuses: [
        ...current.statuses,
        ...statuses.filter((status) => !current.statuses.some((item) => item.id === status.id)),
      ],
    }),
    errorMessage: "Failed to add row",
  };
}

export function patchColumn(
  status: IssueStatusPublic,
  patch: Parameters<typeof client.updateStatus>[1],
  errorMessage: string,
): BoardChange<IssueStatusPublic> {
  const renamed = typeof patch.name === "string" ? patch.name : null;
  return {
    run: async () => (await client.updateStatus(status.id, patch)).status,
    optimistic: (current) => ({
      ...current,
      statuses: current.statuses.map((item) =>
        item.id === status.id ? { ...item, ...(patch as Partial<IssueStatusPublic>) } : item,
      ),
      issues: renamed
        ? current.issues.map((issue) =>
            issue.statusId === status.id ? { ...issue, statusName: renamed } : issue,
          )
        : current.issues,
    }),
    settle: (current, updated) => ({
      ...current,
      statuses: replaceById(current.statuses, updated),
    }),
    errorMessage,
  };
}

export function reorderColumns(
  board: BoardData,
  rowId: string,
  activeStatusId: string,
  overStatusId: string,
): BoardChange | null {
  const rowStatuses = board.statuses
    .filter((status) => status.rowId === rowId)
    .sort((a, b) => a.position - b.position);
  const moved = moveInList(rowStatuses, activeStatusId, overStatusId);
  if (!moved) return null;
  return {
    run: () => client.updateStatus(activeStatusId, { position: moved.newIndex }),
    optimistic: (current) => ({
      ...current,
      statuses: [...current.statuses.filter((status) => status.rowId !== rowId), ...moved.items],
    }),
    errorMessage: "Failed to reorder column",
  };
}

export function createColumn(
  board: BoardData,
  teamId: string,
  rowId: string,
  name: string,
): BoardChange<IssueStatusPublic> {
  const tempId = `pending-${crypto.randomUUID()}`;
  const rowStatuses = board.statuses.filter((status) => status.rowId === rowId);
  const placeholder: IssueStatusPublic = {
    id: tempId,
    teamId,
    rowId,
    key: "",
    name,
    type: "custom",
    position: rowStatuses.reduce((max, status) => Math.max(max, status.position + 1), 0),
    color: null,
  };
  return {
    run: async () => (await client.createStatus(rowId, { name })).status,
    optimistic: (current) => ({ ...current, statuses: [...current.statuses, placeholder] }),
    settle: (current, status) => ({
      ...current,
      statuses: current.statuses.map((item) => (item.id === tempId ? status : item)),
    }),
    errorMessage: "Failed to add column",
  };
}
