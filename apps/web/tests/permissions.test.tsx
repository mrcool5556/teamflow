import { fireEvent, screen, waitFor } from "@testing-library/react";
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
      ".priority-picker-trigger, .color-picker-trigger, .issue-timer-trigger",
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
