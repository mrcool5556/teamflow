import { screen, waitFor } from "@testing-library/react";
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
});
