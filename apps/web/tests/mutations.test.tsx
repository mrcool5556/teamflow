import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { ErrorSinkProvider } from "../src/components/ErrorSinkProvider";
import { useErrorSink } from "../src/lib/errorSink";
import type { BoardData } from "../src/queries/board";
import { patchIssues, useBoardMutation } from "../src/queries/boardMutations";
import { queryKeys } from "../src/queries/keys";
import { installFakeApi, seedDb, signIn } from "./fakeApi";
import { renderApp } from "./renderApp";

function setup(fail?: (method: string, path: string) => string | undefined) {
  const db = seedDb();
  const api = installFakeApi(db, { fail });
  const team = db.teams[0]!;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const board: BoardData = {
    rows: db.rows.filter((row) => row.teamId === team.id),
    statuses: db.statuses.filter((status) => status.teamId === team.id),
    issues: db.issues.filter((issue) => issue.teamId === team.id),
  };
  queryClient.setQueryData(queryKeys.board(team.id), board);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ErrorSinkProvider>{children}</ErrorSinkProvider>
    </QueryClientProvider>
  );
  const hook = renderHook(() => ({ mutate: useBoardMutation(team.id), sink: useErrorSink() }), {
    wrapper,
  });
  const cached = () => queryClient.getQueryData<BoardData>(queryKeys.board(team.id))!;
  return { db, api, team, board, hook, cached };
}

describe("board mutations", () => {
  it("applies the change before the server answers", async () => {
    const { board, hook, cached, db } = setup();
    const ids = board.issues.map((issue) => issue.id);
    let pending!: Promise<unknown>;
    act(() => {
      pending = hook.result.current.mutate(
        patchIssues(
          board,
          db.members,
          ids.map((id) => ({ id, patch: { priority: "urgent" } })),
          "x",
        ),
      );
    });
    await waitFor(() => expect(cached().issues.every((i) => i.priority === "urgent")).toBe(true));
    await act(() => pending);
    expect(db.issues.filter((i) => ids.includes(i.id)).every((i) => i.priority === "urgent")).toBe(
      true,
    );
  });

  it("assigns a column with parallel requests and one rollback when any of them fails", async () => {
    const failing = "eng-issue-2";
    const { board, hook, cached, api, db } = setup((method, path) =>
      method === "PATCH" && path === `/issues/${failing}` ? "Issue is locked" : undefined,
    );
    const ids = board.issues.map((issue) => issue.id);

    await act(() =>
      hook.result.current.mutate(
        patchIssues(
          board,
          db.members,
          ids.map((id) => ({ id, patch: { assigneeIds: ["user-2"] } })),
          "Failed to assign issues",
        ),
      ),
    );

    const patches = api.calls.filter((call) => call.method === "PATCH");
    expect(patches).toHaveLength(ids.length);
    // Every card is back to its pre-change state, not just the one that failed.
    expect(cached().issues.every((issue) => issue.assignees.length === 0)).toBe(true);
    expect(hook.result.current.sink.error).toBe("Issue is locked");
  });
});

describe("board errors", () => {
  it("rolls back a failed rename and shows the server's message as a dismissible toast", async () => {
    const db = seedDb();
    installFakeApi(db, {
      fail: (method, path) =>
        method === "PATCH" && path.startsWith("/rows/") ? "Read-only" : undefined,
    });
    signIn(db);
    renderApp("/t/ENG");
    await userEvent.click(await screen.findByRole("button", { name: "ENG row 1" }));
    const input = screen.getByDisplayValue("ENG row 1");
    await userEvent.clear(input);
    await userEvent.type(input, "Renamed{Enter}");

    const toast = await screen.findByRole("alert");
    expect(toast).toHaveTextContent("Read-only");
    expect(screen.getByRole("region", { name: "Notifications" })).toContainElement(toast);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "ENG row 1" })).toBeInTheDocument(),
    );
    expect(screen.queryByText("Renamed")).not.toBeInTheDocument();

    await userEvent.click(within(toast).getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
