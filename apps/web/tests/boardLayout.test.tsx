import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { installFakeApi, seedDb, signIn } from "./fakeApi";
import { renderApp } from "./renderApp";

describe("board layout", () => {
  it("explains an empty column, and offers adding only to editors", async () => {
    const db = seedDb();
    installFakeApi(db);
    signIn(db);
    renderApp("/t/ENG");
    expect((await screen.findAllByText("No issues here yet")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Add one below or drag a card in").length).toBeGreaterThan(0);
  });

  it("does not suggest adding cards to a viewer", async () => {
    const db = seedDb("viewer");
    installFakeApi(db);
    signIn(db);
    renderApp("/t/ENG");
    expect((await screen.findAllByText("No issues here yet")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Add one below or drag a card in")).not.toBeInTheDocument();
  });

  it("leaves settings through one Back to board control, and shows no board on Team", async () => {
    const user = userEvent.setup();
    const db = seedDb();
    installFakeApi(db);
    signIn(db);
    renderApp("/t/ENG/settings/team");
    expect(await screen.findByRole("heading", { name: "Team" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /close/i })).not.toBeInTheDocument();
    expect(screen.queryByText("No issues here yet")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Back to board/ }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Back to board/ })).not.toBeInTheDocument(),
    );
    expect((await screen.findAllByText("No issues here yet")).length).toBeGreaterThan(0);
  });

  it("shows a sample preview on Appearance instead of the real board", async () => {
    const db = seedDb();
    installFakeApi(db);
    signIn(db);
    renderApp("/t/ENG/settings/appearance");
    expect(await screen.findByRole("complementary", { name: "Preview" })).toBeInTheDocument();
    expect(screen.getByText("Preview row")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Workspace")).toBeEnabled());
    expect(screen.queryByText("ENG issue 1")).not.toBeInTheDocument();
  });

  it("gives the team Files drawer its own classes", async () => {
    const user = userEvent.setup();
    const db = seedDb();
    installFakeApi(db);
    signIn(db);
    renderApp("/t/ENG");
    const topbar = await screen.findByRole("banner");
    await user.click(await within(topbar).findByRole("button", { name: "Files" }));
    const drawer = await screen.findByRole("dialog", { name: "File directory" });
    expect(drawer).toHaveClass("team-files-drawer");
    expect(drawer.className).not.toContain("issue-drawer");
    expect(drawer.querySelector("[class*='issue-drawer']")).toBeNull();
  });

  it("shows a row jump as a toast, not a banner above the board", async () => {
    const user = userEvent.setup();
    const db = seedDb();
    installFakeApi(db);
    signIn(db);
    renderApp("/t/ENG");
    const row = db.rows.find((r) => r.teamId === db.teams[0]!.id)!;
    const search = await screen.findByRole("textbox", { name: "Issue or board reference" });
    await waitFor(() => expect(search).toBeEnabled());
    await user.type(search, `${row.key}{Enter}`);
    const region = screen.getByRole("region", { name: "Notifications" });
    expect(await within(region).findByRole("status")).toHaveTextContent(`Row: ${row.name}`);
    expect(document.querySelector(".banner")).toBeNull();
  });
});
