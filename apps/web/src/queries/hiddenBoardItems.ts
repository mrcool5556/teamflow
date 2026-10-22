import { useSyncExternalStore } from "react";
import type { BoardData } from "./board";

/**
 * Board items with a delete waiting in the undo window. The board query filters them out, so
 * a background refetch cannot bring back a row whose server delete has not been sent yet.
 */
export type HiddenBoardItems = {
  rowIds: ReadonlySet<string>;
  statusIds: ReadonlySet<string>;
  issueIds: ReadonlySet<string>;
};

type HideRequest = { rowIds?: string[]; statusIds?: string[]; issueIds?: string[] };

const EMPTY: HiddenBoardItems = { rowIds: new Set(), statusIds: new Set(), issueIds: new Set() };

let entries: HideRequest[] = [];
let snapshot: HiddenBoardItems = EMPTY;
const listeners = new Set<() => void>();

function rebuild() {
  snapshot =
    entries.length === 0
      ? EMPTY
      : {
          rowIds: new Set(entries.flatMap((entry) => entry.rowIds ?? [])),
          statusIds: new Set(entries.flatMap((entry) => entry.statusIds ?? [])),
          issueIds: new Set(entries.flatMap((entry) => entry.issueIds ?? [])),
        };
  for (const listener of listeners) listener();
}

/** Hide items until the returned function is called (safe to call more than once). */
export function hideBoardItems(request: HideRequest): () => void {
  entries = [...entries, request];
  rebuild();
  let shown = false;
  return () => {
    if (shown) return;
    shown = true;
    entries = entries.filter((entry) => entry !== request);
    rebuild();
  };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useHiddenBoardItems() {
  return useSyncExternalStore(subscribe, () => snapshot);
}

export function withoutHidden(board: BoardData, hidden: HiddenBoardItems): BoardData {
  if (hidden === EMPTY) return board;
  return {
    rows: board.rows.filter((row) => !hidden.rowIds.has(row.id)),
    statuses: board.statuses.filter(
      (status) => !hidden.statusIds.has(status.id) && !hidden.rowIds.has(status.rowId),
    ),
    issues: board.issues.filter((issue) => !hidden.issueIds.has(issue.id)),
  };
}
