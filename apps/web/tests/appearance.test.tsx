import { configure, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { installFakeApi, seedDb, signIn } from "./fakeApi";
import { renderApp } from "./renderApp";

// Whole-app renders: allow for a slow first paint when the full suite runs in parallel.
configure({ asyncUtilTimeout: 3000 });

/** Render Appearance and wait until the saved profile has loaded (teams load after it). */
async function openAppearance(options?: Parameters<typeof installFakeApi>[1]) {
  const db = seedDb();
  installFakeApi(db, options);
  signIn(db);
  renderApp("/t/ENG/settings/appearance");
  await waitFor(() => expect(screen.getByLabelText("Workspace")).toBeEnabled());
  return db;
}

describe("appearance panel", () => {
  it("groups controls into Colour and Shape & style, with no empty advanced box", async () => {
    await openAppearance();
    expect(await screen.findByRole("region", { name: "Colour" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Shape & style" })).toBeInTheDocument();
    expect(screen.queryByText("Advanced chrome tuning")).not.toBeInTheDocument();
  });

  it("applies a look in one click and offers to go back after a change", async () => {
    const user = userEvent.setup();
    await openAppearance();
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
    await openAppearance();
    const styles = await screen.findByRole("radiogroup", { name: "UI style" });
    expect(within(styles).getAllByRole("radio")).toHaveLength(8);
    await user.click(within(styles).getByRole("radio", { name: "Glass" }));
    expect(document.documentElement.dataset.chromeStyle).toBe("glass");
    expect(within(styles).getByRole("radio", { name: "Glass" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("offers only primary and accent for custom colours, and team colours as a switch", async () => {
    const user = userEvent.setup();
    await openAppearance();
    const palette = await screen.findByRole("radiogroup", { name: "UI color" });
    await user.click(within(palette).getByRole("radio", { name: "Custom" }));
    expect(screen.getByText("Primary")).toBeInTheDocument();
    expect(screen.getByText("Accent")).toBeInTheDocument();
    expect(screen.queryByText("Soft text")).not.toBeInTheDocument();

    const exact = screen.getByRole("switch", { name: /Keep exact team colours/ });
    expect(exact).not.toBeChecked();
    await user.click(exact);
    expect(document.documentElement.dataset.semanticContrast).toBe("preserve");
  });

  it("has board size under Appearance, not General", async () => {
    const user = userEvent.setup();
    await openAppearance();
    const board = await screen.findByRole("region", { name: "Board" });
    expect(within(board).getByRole("radiogroup", { name: "Column width" })).toBeInTheDocument();
    expect(within(board).getByText("Card min height")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "General" }));
    expect(await screen.findByRole("heading", { name: "General" })).toBeInTheDocument();
    expect(screen.queryByText("Card min height")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Appearance → Board" })).toBeInTheDocument();
  });

  it("shows Saving…, then Saved, and offers Retry when a save fails", async () => {
    const user = userEvent.setup();
    let failSaves = true;
    const db = await openAppearance({
      fail: (method, path) =>
        failSaves && method === "PUT" && path.startsWith("/auth/profile") ? "Disk full" : undefined,
    });

    await user.click(screen.getByRole("radio", { name: "Light" }));
    expect(screen.getByText("Saving…")).toBeInTheDocument();
    expect(await screen.findByText(/Not saved/)).toBeInTheDocument();

    failSaves = false;
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("✓ Saved")).toBeInTheDocument();
    expect(db.profile.appearance.theme).toBe("light");
  });
});
