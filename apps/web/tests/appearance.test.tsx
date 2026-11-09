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
  await waitFor(() => expect(screen.getByLabelText("Flow")).toBeEnabled());
  return db;
}

/** The Design page, where Share lives. */
async function openDesign() {
  const db = seedDb();
  installFakeApi(db);
  signIn(db);
  renderApp("/t/ENG/settings/appearance/design");
  await waitFor(() => expect(screen.getByLabelText("Flow")).toBeEnabled());
  await screen.findByRole("region", { name: "Share this mix" });
  return db;
}

describe("appearance panel", () => {
  it("is short: looks, quick changes, board and a way to the Design page", async () => {
    await openAppearance();
    const quick = await screen.findByRole("region", { name: "Quick changes" });
    for (const group of ["Light or dark", "Accent colour", "Corner style", "Text"]) {
      expect(within(quick).getByRole("radiogroup", { name: group })).toBeInTheDocument();
    }
    expect(screen.getByRole("region", { name: "Board" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open Design page/ })).toBeInTheDocument();
    // The detailed controls live on the Design page.
    expect(screen.queryByRole("radiogroup", { name: "UI style" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("switch", { name: /Keep exact team colours/ }),
    ).not.toBeInTheDocument();
  });

  it("keeps a one-mode colour theme in its mode and says why", async () => {
    const db = seedDb();
    db.profile = mergeUserProfile(db.profile, { appearance: { colorTheme: "cozy" } });
    installFakeApi(db);
    signIn(db);
    renderApp("/t/ENG/settings/appearance");
    const mode = await screen.findByRole("radiogroup", { name: "Light or dark" });
    await waitFor(() => expect(within(mode).getByRole("radio", { name: "Dark" })).toBeDisabled());
    expect(screen.getByText(/Cozy has only a light side/)).toBeInTheDocument();
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

    await user.click(screen.getByRole("radio", { name: "Sharp" }));
    expect(screen.getByRole("button", { name: "Back to Calm" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to Calm" }));
    expect(document.documentElement.dataset.shape).toBe("round");
  });

  it("offers pill corners", async () => {
    const user = userEvent.setup();
    const db = await openAppearance();
    const corners = await screen.findByRole("radiogroup", { name: "Corner style" });
    await user.click(within(corners).getByRole("radio", { name: "Pill" }));
    await waitFor(() => expect(document.documentElement.dataset.shape).toBe("pill"));
    await waitFor(() => expect(db.profile.appearance.shape).toBe("pill"));
  });

  it("offers only primary and accent for custom colours", async () => {
    const user = userEvent.setup();
    await openAppearance();
    const palette = await screen.findByRole("radiogroup", { name: "Accent colour" });
    expect(within(palette).getByRole("radio", { name: /own/ })).toBeChecked();
    await user.click(within(palette).getByRole("radio", { name: "Custom" }));
    expect(screen.getByText("Primary")).toBeInTheDocument();
    expect(screen.getByText("Accent")).toBeInTheDocument();
    expect(screen.queryByText("Soft text")).not.toBeInTheDocument();
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
    expect(screen.getByLabelText("Flow name")).toBeInTheDocument();
    expect(screen.getByLabelText("Flow key")).toHaveAccessibleDescription(/2–8 characters/);
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

  it("resets everything and lets you undo it", async () => {
    const user = userEvent.setup();
    await openAppearance();
    const looks = await screen.findByRole("radiogroup", { name: "Looks" });
    await user.click(within(looks).getByRole("radio", { name: /Machined/ }));
    await waitFor(() => expect(document.documentElement.dataset.surface).toBe("soft-inset"));

    await user.click(screen.getByRole("button", { name: "Reset all to default" }));
    expect(document.documentElement.dataset.surface).toBeUndefined();
    const region = screen.getByRole("region", { name: "Notifications" });
    expect(within(region).getByText(/Appearance reset to default/)).toBeInTheDocument();

    await user.click(within(region).getByRole("button", { name: "Undo" }));
    expect(document.documentElement.dataset.surface).toBe("soft-inset");
    expect(within(region).queryByText(/reset to default/)).not.toBeInTheDocument();
  });

  it("previews an imported look before using it", async () => {
    const user = userEvent.setup();
    const db = await openDesign();
    const look = buildLookExport(
      mergeUserProfile(createDefaultUserProfile(), { appearance: { chromeStyle: "neon" } }),
    );
    const share = screen.getByRole("region", { name: "Share this mix" });
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
    await openDesign();
    const share = screen.getByRole("region", { name: "Share this mix" });
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

      const toggle = screen.getByRole("button", { name: /Quick changes/ });
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByRole("radiogroup", { name: "Accent colour" })).not.toBeInTheDocument();
      expect(screen.getByRole("radiogroup", { name: "Looks" })).toBeInTheDocument();

      await user.click(toggle);
      expect(screen.getByRole("radiogroup", { name: "Accent colour" })).toBeInTheDocument();

      const preview = screen.getByRole("complementary", { name: "Preview" });
      expect(preview).toHaveClass("appearance-preview--strip");
      await user.click(within(preview).getByRole("button", { name: "Bigger" }));
      expect(preview).not.toHaveClass("appearance-preview--strip");
    });
  });
});
