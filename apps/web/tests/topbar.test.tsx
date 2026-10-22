import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { installFakeApi, seedDb, signIn } from "./fakeApi";
import { renderApp } from "./renderApp";

describe("topbar", () => {
  it("keeps Settings, About and Log out in the account menu", async () => {
    const user = userEvent.setup();
    const db = seedDb();
    installFakeApi(db);
    signIn(db);
    renderApp("/t/ENG");

    const topbar = await screen.findByRole("banner");
    expect(within(topbar).queryByRole("button", { name: "Settings" })).not.toBeInTheDocument();
    await user.click(within(topbar).getByRole("button", { name: /Account menu/ }));
    const menu = await screen.findByRole("menu", { name: "Account" });
    expect(within(menu).getByRole("menuitem", { name: /About Teamflow/ })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /Log out/ })).toBeInTheDocument();

    await user.click(within(menu).getByRole("menuitem", { name: /Settings/ }));
    expect(await screen.findByRole("heading", { name: "General" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  });

  it("focuses the ref search on '/' outside a field", async () => {
    const user = userEvent.setup();
    const db = seedDb();
    installFakeApi(db);
    signIn(db);
    renderApp("/t/ENG");

    const search = await screen.findByRole("textbox", { name: "Issue or board reference" });
    await waitFor(() => expect(search).toBeEnabled());
    await user.keyboard("/");
    expect(search).toHaveFocus();
    expect(search).toHaveValue("");
  });
});
