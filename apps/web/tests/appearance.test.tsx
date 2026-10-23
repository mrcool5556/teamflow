import { configure, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultUserProfile, mergeUserProfile } from "@teamflow/core";
import { buildLookExport } from "../src/lib/appearanceShare";
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
    expect(screen.getByRole("link", { name: "Appearance" })).toBeInTheDocument();
    expect(
      screen.queryByText(/Profile backup|Export profile|Import profile/),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Advanced" })).not.toBeInTheDocument();
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

  it("resets a group and lets you undo it", async () => {
    const user = userEvent.setup();
    await openAppearance();
    await user.click(screen.getByRole("radio", { name: "Glass" }));
    expect(document.documentElement.dataset.chromeStyle).toBe("glass");

    await user.click(screen.getByRole("button", { name: "Reset shape & style" }));
    expect(document.documentElement.dataset.chromeStyle).toBe("industrial");
    const region = screen.getByRole("region", { name: "Notifications" });
    expect(within(region).getByText(/Shape & style reset to default/)).toBeInTheDocument();

    await user.click(within(region).getByRole("button", { name: "Undo" }));
    expect(document.documentElement.dataset.chromeStyle).toBe("glass");
    expect(within(region).queryByText(/reset to default/)).not.toBeInTheDocument();
  });

  it("previews an imported look before using it", async () => {
    const user = userEvent.setup();
    const db = await openAppearance();
    const look = buildLookExport(
      mergeUserProfile(createDefaultUserProfile(), { appearance: { chromeStyle: "neon" } }),
    );
    const share = screen.getByRole("region", { name: "Share this look" });
    await user.click(within(share).getByRole("button", { name: /Import a look/ }));
    const paste = within(share).getByPlaceholderText("Paste a look here");
    await user.click(paste);
    await user.paste(JSON.stringify(look));
    await user.click(within(share).getByRole("button", { name: "Preview" }));
    expect(document.documentElement.dataset.chromeStyle).toBe("neon");

    await user.click(within(share).getByRole("button", { name: "Cancel" }));
    expect(document.documentElement.dataset.chromeStyle).toBe("industrial");

    await user.click(within(share).getByRole("button", { name: "Preview" }));
    await user.click(within(share).getByRole("button", { name: "Use this look" }));
    expect(document.documentElement.dataset.chromeStyle).toBe("neon");
    await waitFor(() => expect(db.profile.appearance.chromeStyle).toBe("neon"));
  });

  it("explains a paste that is not a look", async () => {
    const user = userEvent.setup();
    await openAppearance();
    const share = screen.getByRole("region", { name: "Share this look" });
    await user.click(within(share).getByRole("button", { name: /Import a look/ }));
    await user.type(within(share).getByPlaceholderText("Paste a look here"), "hello");
    await user.click(within(share).getByRole("button", { name: "Preview" }));
    expect(within(share).getByRole("alert")).toHaveTextContent(/not a Teamflow look/);
  });

  describe("on a phone", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("collapses the Customise groups and keeps a small preview strip", async () => {
      vi.stubGlobal("matchMedia", (query: string) => ({
        matches: query.includes("max-width: 767px"),
        addEventListener: () => {},
        removeEventListener: () => {},
      }));
      const user = userEvent.setup();
      await openAppearance();

      const toggle = screen.getByRole("button", { name: /Colour/ });
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByRole("radiogroup", { name: "UI color" })).not.toBeInTheDocument();
      expect(screen.getByRole("radiogroup", { name: "Looks" })).toBeInTheDocument();

      await user.click(toggle);
      expect(screen.getByRole("radiogroup", { name: "UI color" })).toBeInTheDocument();

      const preview = screen.getByRole("complementary", { name: "Preview" });
      expect(preview).toHaveClass("appearance-preview--strip");
      await user.click(within(preview).getByRole("button", { name: "Bigger" }));
      expect(preview).not.toHaveClass("appearance-preview--strip");
    });
  });
});
