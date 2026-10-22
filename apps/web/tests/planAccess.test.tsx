import { configure, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { installFakeApi, seedDb, signIn } from "./fakeApi";
import { renderApp } from "./renderApp";

// Whole-app renders: allow for a slow first paint when the full suite runs in parallel.
configure({ asyncUtilTimeout: 3000 });

async function openAccountMenu(user: ReturnType<typeof userEvent.setup>) {
  const topbar = await screen.findByRole("banner");
  await user.click(within(topbar).getByRole("button", { name: /Account menu/ }));
  return screen.findByRole("menu", { name: "Account" });
}

describe("plan page access", () => {
  it("hides the Plan button and menu entry from non-admins", async () => {
    const user = userEvent.setup();
    const db = seedDb();
    db.user.isInstanceAdmin = false;
    installFakeApi(db);
    signIn(db);
    renderApp("/t/ENG");

    expect(await screen.findByText("ENG issue 1")).toBeInTheDocument();
    const topbar = screen.getByRole("banner");
    expect(within(topbar).queryByRole("button", { name: "Plan" })).not.toBeInTheDocument();
    const menu = await openAccountMenu(user);
    expect(within(menu).queryByRole("menuitem", { name: /Plan/ })).not.toBeInTheDocument();
  });

  it("redirects non-admins from the plan route to the board", async () => {
    const db = seedDb();
    db.user.isInstanceAdmin = false;
    installFakeApi(db);
    signIn(db);
    const { path } = renderApp("/t/ENG/plan");

    await waitFor(() => expect(path()).toBe("/t/ENG"));
    expect(await screen.findByText("ENG issue 1")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Deploy path" })).not.toBeInTheDocument();
  });

  it("shows admins the Plan button and opens the plan", async () => {
    const user = userEvent.setup();
    const db = seedDb();
    installFakeApi(db);
    signIn(db);
    const { path } = renderApp("/t/ENG");

    const topbar = await screen.findByRole("banner");
    await user.click(await within(topbar).findByRole("button", { name: "Plan" }));
    await waitFor(() => expect(path()).toBe("/t/ENG/plan"));
    expect(await screen.findByRole("heading", { name: "Deploy path" })).toBeInTheDocument();
  });
});
