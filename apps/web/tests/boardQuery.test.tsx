import { act, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BOARD_REFETCH_MS } from "../src/queries/board";
import { installFakeApi, makeIssue, seedDb, signIn } from "./fakeApi";
import { renderApp } from "./renderApp";

afterEach(() => {
  vi.useRealTimers();
});

describe("board query", () => {
  it("never lets a slow response for the previous team replace the new team's board", async () => {
    const db = seedDb();
    const eng = db.teams[0]!;
    let releaseEng!: () => void;
    const engHeld = new Promise<void>((resolve) => (releaseEng = resolve));
    const { fetchMock } = installFakeApi(db, {
      gate: (method, path) =>
        method === "GET" && path === `/issues?teamId=${eng.id}` ? engHeld : undefined,
    });
    signIn(db);

    const { router, path } = renderApp("/t/ENG");
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes(`teamId=${eng.id}`))).toBe(
        true,
      ),
    );

    await act(() => router.navigate("/t/OPS"));
    expect(await screen.findByText("OPS issue 1")).toBeInTheDocument();

    releaseEng();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(path()).toBe("/t/OPS");
    expect(screen.getByText("OPS issue 1")).toBeInTheDocument();
    expect(screen.queryByText("ENG issue 1")).not.toBeInTheDocument();

    const engCall = fetchMock.mock.calls.find(([url]) => String(url).includes(`teamId=${eng.id}`));
    expect(engCall?.[1]?.signal?.aborted).toBe(true);
  });

  it("refetches the board in the background so other users' changes appear", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const db = seedDb();
    installFakeApi(db);
    signIn(db);
    renderApp("/t/ENG");
    await screen.findByText("ENG issue 1");

    // Someone else adds an issue on the server.
    const [eng] = db.teams;
    db.issues.push(makeIssue(eng!, 9, db.rows[0]!.id, db.statuses[0]!, { title: "From Grace" }));
    expect(screen.queryByText("From Grace")).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(BOARD_REFETCH_MS + 50);
    });
    expect(await screen.findByText("From Grace")).toBeInTheDocument();
  });
});
