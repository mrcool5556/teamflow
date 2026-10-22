import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { installFakeApi, seedDb, signIn, type FakeDb } from "./fakeApi";
import { renderApp } from "./renderApp";

let db: FakeDb;

beforeEach(() => {
  db = seedDb();
  installFakeApi(db);
});

describe("routing", () => {
  it("sends / to the last used team's board", async () => {
    signIn(db);
    const { path } = renderApp("/");
    await waitFor(() => expect(path()).toBe("/t/ENG"));
    expect(await screen.findByText("ENG issue 1")).toBeInTheDocument();
  });

  it("opens the drawer from the issue URL and closes it with browser Back", async () => {
    signIn(db);
    const { router, path } = renderApp("/t/ENG");
    await userEvent.click(await screen.findByText("ENG issue 2"));
    await waitFor(() => expect(path()).toBe("/t/ENG/issue/ENG-2"));
    expect(await screen.findByLabelText("Issue title")).toHaveValue("ENG issue 2");

    await act(() => router.navigate(-1));
    expect(path()).toBe("/t/ENG");
    await waitFor(() => expect(screen.queryByLabelText("Issue title")).not.toBeInTheDocument());
  });

  it("restores an open issue on reload", async () => {
    signIn(db);
    renderApp("/t/ENG/issue/ENG-3");
    expect(await screen.findByLabelText("Issue title")).toHaveValue("ENG issue 3");
  });

  it("redirects legacy ?ref= issue links to the issue route", async () => {
    signIn(db);
    const { path } = renderApp("/?ref=ENG-1");
    await waitFor(() => expect(path()).toBe("/t/ENG/issue/ENG-1"));
    expect(await screen.findByLabelText("Issue title")).toHaveValue("ENG issue 1");
  });

  it("keeps the settings panel on reload", async () => {
    signIn(db);
    const { path } = renderApp("/t/ENG/settings/tokens");
    expect(await screen.findByText("Personal access tokens")).toBeInTheDocument();
    await screen.findByText("ENG issue 1");
    expect(path()).toBe("/t/ENG/settings/tokens");
  });

  it("switches team through the URL", async () => {
    signIn(db);
    const { path } = renderApp("/t/ENG");
    await screen.findByText("ENG issue 1");
    await userEvent.selectOptions(screen.getByLabelText("Workspace"), db.teams[1]!.id);
    await waitFor(() => expect(path()).toBe("/t/OPS"));
    expect(await screen.findByText("OPS issue 1")).toBeInTheDocument();
    expect(screen.queryByText("ENG issue 1")).not.toBeInTheDocument();
  });

  it("asks for login and returns to the requested page", async () => {
    const { path } = renderApp("/t/ENG/plan");
    await waitFor(() => expect(path()).toBe("/login"));
    await userEvent.type(screen.getByLabelText("Email"), "ada@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "correct-horse");
    // The tab and the submit button share the label; submit is last.
    await userEvent.click(screen.getAllByRole("button", { name: "Log in" }).at(-1)!);
    await waitFor(() => expect(path()).toBe("/t/ENG/plan"));
  });

  it("turns ?reset= into the reset route", async () => {
    const { path } = renderApp("/?reset=abc123");
    await waitFor(() => expect(path()).toBe("/reset?token=abc123"));
    expect(screen.getByRole("heading", { name: "Set new password" })).toBeInTheDocument();
  });

  it("keeps an invite across the login page", async () => {
    const { path } = renderApp("/?invite=tok-1");
    await waitFor(() => expect(path()).toBe("/login"));
    expect(screen.getByText(/You have a team invite/)).toBeInTheDocument();
    expect(sessionStorage.getItem("teamflow_pending_invite")).toBe("tok-1");
  });
});
