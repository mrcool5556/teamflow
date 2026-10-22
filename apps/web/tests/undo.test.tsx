import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UNDO_DELAY_MS } from "../src/hooks/useChangeHistory";
import { queryKeys } from "../src/queries/keys";
import { installFakeApi, seedDb, signIn } from "./fakeApi";
import { renderApp } from "./renderApp";

afterEach(() => {
  vi.useRealTimers();
});

async function openBoard() {
  const db = seedDb();
  const api = installFakeApi(db);
  signIn(db);
  const app = renderApp("/t/ENG");
  await screen.findByText("ENG issue 1");
  const refetch = () =>
    act(() => app.queryClient.invalidateQueries({ queryKey: queryKeys.board(db.teams[0]!.id) }));
  return { db, api, app, refetch };
}

async function removeRow(name: string) {
  fireEvent.contextMenu(screen.getByRole("button", { name }));
  await userEvent.click(await screen.findByRole("menuitem", { name: "Remove row" }));
}

describe("undo", () => {
  it("keeps an undone row delete on the server, even after a refetch", async () => {
    const { api, refetch } = await openBoard();
    await removeRow("ENG row 2");
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "ENG row 2" })).not.toBeInTheDocument(),
    );

    // A background refetch inside the undo window must not bring it back.
    await refetch();
    expect(screen.queryByRole("button", { name: "ENG row 2" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    await refetch();
    expect(await screen.findByRole("button", { name: "ENG row 2" })).toBeInTheDocument();
    expect(api.calls.some((call) => call.method === "DELETE")).toBe(false);
  });

  it("sends the row delete when the undo window closes", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { api, db, refetch } = await openBoard();
    const rowId = db.rows[1]!.id;
    await removeRow("ENG row 2");
    expect(api.calls.some((call) => call.method === "DELETE")).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(UNDO_DELAY_MS + 50);
    });
    expect(api.calls).toContainEqual(
      expect.objectContaining({ method: "DELETE", path: `/rows/${rowId}` }),
    );
    await refetch();
    expect(screen.queryByRole("button", { name: "ENG row 2" })).not.toBeInTheDocument();
  });

  it("restores every issue of an undone bulk delete on the server", async () => {
    const { api, refetch } = await openBoard();
    const user = userEvent.setup();
    await user.keyboard("{Control>}");
    await user.click(screen.getByText("ENG issue 1"));
    await user.click(screen.getByText("ENG issue 2"));
    await user.keyboard("{/Control}");
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByText("ENG issue 1")).not.toBeInTheDocument());
    expect(screen.queryByText("ENG issue 2")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Undo" }));
    await refetch();
    expect(await screen.findByText("ENG issue 1")).toBeInTheDocument();
    expect(screen.getByText("ENG issue 2")).toBeInTheDocument();
    const restores = api.calls.filter((call) => call.path.endsWith("/restore"));
    expect(restores.map((call) => call.path).sort()).toEqual([
      "/issues/eng-issue-1/restore",
      "/issues/eng-issue-2/restore",
    ]);
  });
});
