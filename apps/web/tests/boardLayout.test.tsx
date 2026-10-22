import { screen } from "@testing-library/react";
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
});
