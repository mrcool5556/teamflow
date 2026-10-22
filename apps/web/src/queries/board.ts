import { useQuery, type QueryClient } from "@tanstack/react-query";
import type { BoardRowPublic, IssuePublic, IssueStatusPublic } from "@teamflow/core";
import { client } from "../api";
import { queryKeys } from "./keys";

export type BoardData = {
  rows: BoardRowPublic[];
  statuses: IssueStatusPublic[];
  issues: IssuePublic[];
};

/** Other users' changes show up within this many milliseconds. */
export const BOARD_REFETCH_MS = 15_000;

async function fetchBoard(teamId: string, signal: AbortSignal): Promise<BoardData> {
  const api = client.withSignal(signal);
  const [{ statuses }, { rows }, { issues }] = await Promise.all([
    api.listStatuses(teamId),
    api.listRows(teamId),
    api.listIssues({ teamId }),
  ]);
  return { rows, statuses, issues };
}

export function useBoardQuery(teamId: string | null) {
  return useQuery({
    queryKey: queryKeys.board(teamId ?? ""),
    queryFn: ({ signal }) => fetchBoard(teamId!, signal),
    enabled: Boolean(teamId),
    refetchInterval: BOARD_REFETCH_MS,
  });
}

/** Apply `update` to one team's cached board (no-op when it is not loaded). */
export function updateBoard(
  queryClient: QueryClient,
  teamId: string,
  update: (board: BoardData) => BoardData,
) {
  queryClient.setQueryData<BoardData>(queryKeys.board(teamId), (board) =>
    board ? update(board) : board,
  );
}
