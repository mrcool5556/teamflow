import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { installFakeApi, seedDb, signIn } from "./fakeApi";
import { renderApp } from "./renderApp";

async function openBoardAs(role: "owner" | "viewer") {
  const db = seedDb(role);
  const api = installFakeApi(db);
  signIn(db);
  const app = renderApp("/t/ENG");
  await screen.findByText("ENG issue 1");
  // Controls follow the permission set once it has loaded.
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "+ Add row" })).toHaveProperty(
      "disabled",
      role === "viewer",
    ),
  );
  return { db, api, app };
}

describe("board permissions", () => {
  it("lets a viewer read but not drag, rename, delete, assign or bulk-edit", async () => {
    const { api } = await openBoardAs("viewer");

    expect(screen.queryByRole("button", { name: "Delete ENG-1" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ENG row 1" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Drag row ENG row 1" })).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Todo" })[0]).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "+ Add issue" })[0]).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "+ Column" })[0]).toBeDisabled();
    for (const trigger of document.querySelectorAll(
      ".priority-picker-trigger, .color-picker-trigger",
    )) {
      expect(trigger).toBeDisabled();
    }

    fireEvent.contextMenu(screen.getByRole("button", { name: "ENG row 2" }));
    expect(
      await screen.findByRole("menuitem", { name: "Copy shareable link" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Remove row" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Add column" })).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    const user = userEvent.setup();
    await user.keyboard("{Control>}");
    await user.click(screen.getByText("ENG issue 1"));
    await user.click(screen.getByText("ENG issue 2"));
    await user.keyboard("{/Control}");
    expect(screen.queryByRole("toolbar", { name: "Bulk issue actions" })).not.toBeInTheDocument();

    // Reading still works: a plain click opens the issue.
    await user.click(screen.getByText("ENG issue 3"));
    expect(await screen.findByLabelText("Issue title")).toHaveValue("ENG issue 3");
    expect(
      api.calls.filter((call) => call.method !== "GET" && call.path !== "/auth/profile"),
    ).toEqual([]);
  });

  it("keeps every control for an owner", async () => {
    await openBoardAs("owner");
    expect(screen.getByRole("button", { name: "Delete ENG-1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ENG row 1" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Drag row ENG row 1" })).toBeEnabled();

    const user = userEvent.setup();
    await user.keyboard("{Control>}");
    await user.click(screen.getByText("ENG issue 1"));
    await user.click(screen.getByText("ENG issue 2"));
    await user.keyboard("{/Control}");
    expect(screen.getByRole("toolbar", { name: "Bulk issue actions" })).toBeInTheDocument();
  });
});

describe("issue drawer permissions", () => {
  async function openIssueAs(role: "owner" | "viewer") {
    const db = seedDb(role);
    const api = installFakeApi(db);
    signIn(db);
    db.comments.push({
      id: "c1",
      issueId: db.issues[0]!.id,
      authorId: db.user.id,
      authorName: db.user.name,
      body: "First!",
      createdAt: new Date().toISOString(),
    });
    renderApp(`/t/ENG/issue/${db.issues[0]!.identifier}`);
    const drawer = await screen.findByRole("dialog", { name: /ENG-1/ });
    await within(drawer).findByText("First!");
    return { api, drawer };
  }

  it("renders every write control disabled for a viewer", async () => {
    const { api, drawer } = await openIssueAs("viewer");
    const d = within(drawer);
    await waitFor(() => expect(d.getByRole("button", { name: "Mark done" })).toBeDisabled());

    expect(d.getByLabelText("Issue title")).toHaveAttribute("readonly");
    for (const select of drawer.querySelectorAll("select")) expect(select).toBeDisabled();
    for (const trigger of drawer.querySelectorAll(
      ".due-picker-trigger, .color-picker-trigger, .assignee-picker-trigger",
    )) {
      expect(trigger).toBeDisabled();
    }
    expect(d.queryByRole("button", { name: /description/i })).not.toBeInTheDocument();
    expect(d.getByPlaceholderText(/Leave a comment/)).toBeDisabled();
    expect(d.getByRole("button", { name: "Post comment" })).toBeDisabled();
    expect(d.getByRole("button", { name: "Delete comment" })).toBeDisabled();
    expect(d.getByRole("button", { name: "Choose file" })).toBeDisabled();
    expect(d.getByRole("button", { name: "Delete" })).toBeDisabled();

    // Reading still works: the drawer closes normally.
    await userEvent.click(d.getByRole("button", { name: "Close" }));
    expect(
      api.calls.filter((call) => call.method !== "GET" && call.path !== "/auth/profile"),
    ).toEqual([]);
  });

  it("keeps the drawer editable for an owner", async () => {
    const { drawer } = await openIssueAs("owner");
    const d = within(drawer);
    await waitFor(() => expect(d.getByRole("button", { name: "Mark done" })).toBeEnabled());
    expect(d.getByLabelText("Issue title")).not.toHaveAttribute("readonly");
    expect(d.getByPlaceholderText(/Leave a comment/)).toBeEnabled();
    expect(d.getByRole("button", { name: "Choose file" })).toBeEnabled();
    expect(d.getByRole("button", { name: /description/i })).toBeInTheDocument();
  });
});
