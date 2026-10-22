import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { queryKeys } from "../src/queries/keys";
import { installFakeApi, seedDb, signIn } from "./fakeApi";
import { renderApp } from "./renderApp";

describe("selected issue", () => {
  it("shows server changes in the open drawer without a hand sync", async () => {
    const db = seedDb();
    installFakeApi(db);
    signIn(db);
    const { queryClient } = renderApp("/t/ENG/issue/ENG-1");
    expect(await screen.findByLabelText("Issue title")).toHaveValue("ENG issue 1");

    db.issues[0] = { ...db.issues[0]!, title: "Renamed by Grace" };
    await act(() => queryClient.invalidateQueries({ queryKey: queryKeys.board(db.teams[0]!.id) }));

    await waitFor(() =>
      expect(screen.getByLabelText("Issue title")).toHaveValue("Renamed by Grace"),
    );
    expect(screen.getByRole("heading", { name: "Renamed by Grace" })).toBeInTheDocument();
  });

  it("updates the card when the drawer saves, from the same cached issue", async () => {
    const db = seedDb();
    const { calls } = installFakeApi(db);
    signIn(db);
    renderApp("/t/ENG/issue/ENG-2");
    const title = await screen.findByLabelText("Issue title");

    await userEvent.type(title, " edited");
    await userEvent.tab();

    expect(await screen.findByRole("heading", { name: "ENG issue 2 edited" })).toBeInTheDocument();
    await waitFor(() =>
      expect(
        calls.some(
          (c) =>
            c.method === "PATCH" && (c.body as { title?: string }).title === "ENG issue 2 edited",
        ),
      ).toBe(true),
    );
  });

  it("closes the drawer when the open issue is deleted", async () => {
    const db = seedDb();
    installFakeApi(db);
    signIn(db);
    const { path } = renderApp("/t/ENG/issue/ENG-3");
    await screen.findByLabelText("Issue title");
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(path()).toBe("/t/ENG"));
    expect(screen.queryByLabelText("Issue title")).not.toBeInTheDocument();
  });
});
