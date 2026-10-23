import { configure, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("applies a look in one click and offers to go back after a change", async () => {
    const user = userEvent.setup();
    openAppearance();
    const looks = await screen.findByRole("radiogroup", { name: "Looks" });
    expect(within(looks).getByRole("radio", { name: /Teamflow/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await user.click(within(looks).getByRole("radio", { name: /Calm/ }));
    expect(document.documentElement.dataset.chromeStyle).toBe("minimal");
    expect(document.documentElement.dataset.colorPreset).toBe("ocean");
    expect(screen.getByText(/Current look/)).toHaveTextContent("Calm");

    await user.click(screen.getByRole("radio", { name: /Hard edge/ }));
    expect(screen.getByRole("button", { name: "Back to Calm" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to Calm" }));
    expect(document.documentElement.dataset.shape).toBe("round");
  });

  it("picks a UI style from picture tiles", async () => {
    const user = userEvent.setup();
    openAppearance();
    const styles = await screen.findByRole("radiogroup", { name: "UI style" });
    expect(within(styles).getAllByRole("radio")).toHaveLength(8);
    await user.click(within(styles).getByRole("radio", { name: "Glass" }));
    expect(document.documentElement.dataset.chromeStyle).toBe("glass");
    expect(within(styles).getByRole("radio", { name: "Glass" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });
});
