import { createDefaultUserProfile, mergeUserProfile } from "@teamflow/core";
import { configure, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { designHeadsUps } from "../src/lib/designHeadsUp";
import { installFakeApi, seedDb, signIn } from "./fakeApi";
import { renderApp } from "./renderApp";

configure({ asyncUtilTimeout: 3000 });

const mix = (appearance: Parameters<typeof mergeUserProfile>[1]["appearance"]) =>
  mergeUserProfile(createDefaultUserProfile(), { appearance });
const ids = (...args: Parameters<typeof designHeadsUps>) =>
  designHeadsUps(...args).map((item) => item.id);

describe("design heads-up rules", () => {
  it("has nothing to say about the default look", () => {
    expect(ids(createDefaultUserProfile(), "dark")).toEqual([]);
  });

  it("flags the design library's weak pairings", () => {
    expect(ids(mix({ surface: "glass" }), "dark")).toContain("glass-theme");
    expect(ids(mix({ surface: "glass", colorTheme: "glass" }), "dark")).not.toContain(
      "glass-theme",
    );
    expect(ids(mix({ surface: "paper" }), "dark")).toContain("paper-dark");
    expect(ids(mix({ buttons: "cut-paper" }), "light")).not.toContain("paper-dark");
    expect(ids(mix({ buttons: "neon" }), "light")).toContain("neon-light");
    expect(ids(mix({ inputs: "notebook" }), "light")).toContain("notebook-font");
    expect(ids(mix({ inputs: "notebook", fontSet: "paper" }), "light")).not.toContain(
      "notebook-font",
    );
    expect(ids(mix({ toggles: "retro" }), "light")).toContain("retro-switch");
    expect(ids(mix({ toggles: "retro", buttons: "bevel95" }), "light")).not.toContain(
      "retro-switch",
    );
  });

  it("adds Teamflow's own checks", () => {
    expect(ids(mix({ buttons: "lipped", lip: "silver" }), "light")).toContain("lip-light");
    expect(ids(mix({ fontSet: "pixel" }), "dark")).toContain("pixel-dense");
    expect(ids(mix({ chromeStyle: "neon", surface: "paper" }), "dark")).toContain("style-surface");
    expect(ids(mix({ chromeStyle: "glass", surface: "glass" }), "dark")).not.toContain(
      "style-surface",
    );
  });

  it("checks the accent's contrast against the page and its button text", () => {
    const profile = createDefaultUserProfile();
    expect(
      ids(profile, "light", { bg: "#f3f3f3", primary: "#ffe066", buttonText: "#111111" }),
    ).toEqual(["accent-contrast"]);
    expect(
      ids(profile, "dark", { bg: "#0f0f0f", primary: "#3366dd", buttonText: "#111111" }),
    ).toEqual(["button-text-contrast"]);
    expect(
      ids(profile, "dark", { bg: "#0f0f0f", primary: "#ff5500", buttonText: "#111111" }),
    ).toEqual([]);
    // Colours it cannot read (not hex) are skipped, not guessed.
    expect(
      ids(profile, "dark", { bg: "color-mix(in srgb, red, blue)", primary: "#ff5500" }),
    ).toEqual([]);
  });
});

describe("heads-up line on the Design page", () => {
  it("warns about a weak pairing and still applies the choice", async () => {
    const user = userEvent.setup();
    const db = seedDb();
    installFakeApi(db);
    signIn(db);
    renderApp("/t/ENG/settings/appearance/design");
    const line = await screen.findByRole("status", { name: "Heads-up" });
    expect(line).toHaveTextContent("No heads-up for this mix.");

    const fields = screen.getByRole("radiogroup", { name: "Text fields" });
    await user.click(within(fields).getByRole("radio", { name: "Notebook" }));
    await waitFor(() => expect(line).toHaveTextContent(/handwriting/));
    expect(document.documentElement.dataset.inputs).toBe("notebook");
    await waitFor(() => expect(db.profile.appearance.inputs).toBe("notebook"));

    const fonts = screen.getByRole("radiogroup", { name: "Fonts" });
    await user.click(within(fonts).getByRole("radio", { name: "Paper" }));
    await waitFor(() => expect(line).toHaveTextContent("No heads-up for this mix."));
  });
});
