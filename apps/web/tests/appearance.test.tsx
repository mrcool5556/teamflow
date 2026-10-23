import { configure, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { installFakeApi, seedDb, signIn } from "./fakeApi";
import { renderApp } from "./renderApp";

// Whole-app renders: allow for a slow first paint when the full suite runs in parallel.
configure({ asyncUtilTimeout: 3000 });

function openAppearance() {
  const db = seedDb();
  installFakeApi(db);
  signIn(db);
  renderApp("/t/ENG/settings/appearance");
  return db;
}

describe("appearance panel", () => {
  it("groups controls into Colour and Shape & style, with no empty advanced box", async () => {
    openAppearance();
    expect(await screen.findByRole("region", { name: "Colour" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Shape & style" })).toBeInTheDocument();
    expect(screen.queryByText("Advanced chrome tuning")).not.toBeInTheDocument();
  });
});
