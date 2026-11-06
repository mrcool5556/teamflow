import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { queryKeys } from "../src/queries/keys";
import { installFakeApi, seedDb, signIn } from "./fakeApi";
import { renderApp } from "./renderApp";

/** Longer than the drawer's 500 ms autosave pause, so a save lands mid-typing. */
const pastDebounce = () => new Promise((resolve) => setTimeout(resolve, 800));

function patches(calls: { method: string; body: unknown }[], field: "title" | "description") {
  return calls
    .filter((c) => c.method === "PATCH" && c.body && field in (c.body as object))
    .map((c) => (c.body as Record<string, string>)[field]);
}

describe("typing in the issue drawer", () => {
  it("keeps a trailing space in the title across an autosave", async () => {
    const db = seedDb();
    const { calls } = installFakeApi(db);
    signIn(db);
    renderApp("/t/ENG/issue/ENG-1");
    const title = await screen.findByLabelText("Issue title");

    await userEvent.clear(title);
    await userEvent.type(title, "hello ");
    await pastDebounce();
    await waitFor(() => expect(patches(calls, "title")).toContain("hello"));
    expect(title).toHaveValue("hello ");

    await userEvent.type(title, "world");
    expect(title).toHaveValue("hello world");
    await pastDebounce();
    await waitFor(() => expect(patches(calls, "title")).toContain("hello world"));
    expect(title).toHaveValue("hello world");
  }, 10_000);

  it("keeps a trailing space in the description across an autosave", async () => {
    const db = seedDb();
    const { calls } = installFakeApi(db);
    signIn(db);
    renderApp("/t/ENG/issue/ENG-1");
    await userEvent.click(await screen.findByRole("button", { name: "Add description" }));
    const description = await screen.findByPlaceholderText(/Add a description/);
    expect(description).toHaveFocus();

    await userEvent.type(description, "hello ");
    await pastDebounce();
    await waitFor(() => expect(patches(calls, "description")).toContain("hello"));
    expect(description).toHaveValue("hello ");

    await userEvent.type(description, "world");
    expect(description).toHaveValue("hello world");
    await pastDebounce();
    await waitFor(() => expect(patches(calls, "description")).toContain("hello world"));
    expect(description).toHaveValue("hello world");
  }, 10_000);

  it("does not let a server change overwrite a title being edited, but adopts it once idle", async () => {
    const db = seedDb();
    installFakeApi(db);
    signIn(db);
    const { queryClient } = renderApp("/t/ENG/issue/ENG-1");
    const title = await screen.findByLabelText("Issue title");
    const refetch = () =>
      act(() => queryClient.invalidateQueries({ queryKey: queryKeys.board(db.teams[0]!.id) }));

    await userEvent.click(title);
    db.issues[0] = { ...db.issues[0]!, title: "Renamed by Grace" };
    await refetch();
    expect(title).toHaveValue("ENG issue 1");

    // Leaving without changing anything does not save, so the next server value is adopted.
    title.blur();
    db.issues[0] = { ...db.issues[0]!, title: "Renamed again" };
    await refetch();
    await waitFor(() => expect(title).toHaveValue("Renamed again"));
  });

  it("trims the saved value once the field is left", async () => {
    const db = seedDb();
    const { calls } = installFakeApi(db);
    signIn(db);
    renderApp("/t/ENG/issue/ENG-1");
    const title = await screen.findByLabelText("Issue title");

    await userEvent.clear(title);
    await userEvent.type(title, "  spaced  ");
    await userEvent.tab();
    await waitFor(() => expect(patches(calls, "title")).toContain("spaced"));
    expect(title).toHaveValue("spaced");
  });
});
