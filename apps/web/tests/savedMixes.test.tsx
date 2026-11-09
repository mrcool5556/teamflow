import {
  createDefaultUserProfile,
  MAX_SAVED_MIXES,
  mergeUserProfile,
  parseUserProfile,
} from "@teamflow/core";
import { configure, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { buildLookExport } from "../src/lib/appearanceShare";
import { applyMix, deleteMix, mixInUse, renameMix, saveMix } from "../src/lib/savedMixes";
import { installFakeApi, seedDb, signIn } from "./fakeApi";
import { renderApp } from "./renderApp";

configure({ asyncUtilTimeout: 3000 });

const machined = () =>
  mergeUserProfile(createDefaultUserProfile(), {
    appearance: { colorTheme: "machined", surface: "soft-inset", buttons: "lipped", shape: "pill" },
  });

describe("saved mixes in the profile", () => {
  it("saves, uses, renames and deletes a mix", () => {
    let profile = saveMix(machined(), "  Gold   desk ");
    expect(profile.mixes).toHaveLength(1);
    const [mix] = profile.mixes;
    expect(mix!.name).toBe("Gold desk");
    expect(mixInUse(profile.appearance, mix!)).toBe(true);

    profile = mergeUserProfile(profile, { appearance: { surface: "flat" } });
    expect(mixInUse(profile.appearance, mix!)).toBe(false);
    profile = applyMix(profile, mix!);
    expect(profile.appearance.surface).toBe("soft-inset");

    profile = renameMix(profile, mix!.id, "Night shift");
    expect(profile.mixes[0]!.name).toBe("Night shift");
    profile = deleteMix(profile, mix!.id);
    expect(profile.mixes).toEqual([]);
  });

  it(`keeps at most ${MAX_SAVED_MIXES} mixes`, () => {
    let profile = createDefaultUserProfile();
    for (let i = 0; i < MAX_SAVED_MIXES + 3; i += 1) profile = saveMix(profile, `Mix ${i}`);
    expect(profile.mixes).toHaveLength(MAX_SAVED_MIXES);
  });

  it("loads old profiles with no mixes and drops broken ones", () => {
    expect(parseUserProfile({ version: 1, board: { columnWidth: 420 } }).mixes).toEqual([]);
    const saved = saveMix(machined(), "Kept").mixes[0];
    const parsed = parseUserProfile({
      version: 1,
      board: { columnWidth: 420 },
      mixes: [saved, { id: "x", name: "" }, "nonsense"],
    });
    expect(parsed.mixes.map((m) => m.name)).toEqual(["Kept"]);
  });

  it("leaves saved mixes out of a shared look", () => {
    const profile = saveMix(machined(), "Private");
    expect(buildLookExport(profile).profile.mixes).toEqual([]);
  });
});

describe("Your mixes on the Design page", () => {
  it("saves the current look by name, shows it in use, and offers it under Looks", async () => {
    const user = userEvent.setup();
    const db = seedDb();
    installFakeApi(db);
    signIn(db);
    renderApp("/t/ENG/settings/appearance/design");
    await waitFor(() => expect(screen.getByLabelText("Flow")).toBeEnabled());

    // Make the look your own first, so it is not one of the built-in looks.
    const fonts = await screen.findByRole("radiogroup", { name: "Fonts" });
    await user.click(within(fonts).getByRole("radio", { name: "Studio" }));
    await user.click(screen.getByRole("button", { name: "Save as new mix…" }));
    await user.type(screen.getByLabelText("Name for this mix"), "Gold desk");
    await user.click(screen.getByRole("button", { name: "Save" }));
    const list = screen.getByRole("list", { name: "Your mixes" });
    expect(within(list).getByText("Gold desk")).toBeInTheDocument();
    expect(within(list).getByText("in use")).toBeInTheDocument();
    await waitFor(() => expect(db.profile.mixes.map((m) => m.name)).toEqual(["Gold desk"]));

    // Change something: the mix is no longer in use and can be put back.
    await user.click(within(fonts).getByRole("radio", { name: "Pixel" }));
    await user.click(within(list).getByRole("button", { name: "Use Gold desk" }));
    await waitFor(() => expect(document.documentElement.dataset.font).toBe("studio"));

    await user.click(screen.getByRole("button", { name: "Back to Appearance" }));
    const mixes = await screen.findByRole("group", { name: "Your mixes" });
    expect(within(mixes).getByRole("button", { name: "Gold desk" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText(/Your mix:/)).toHaveTextContent("Gold desk");
  });

  it("renames and deletes a mix, with undo", async () => {
    const user = userEvent.setup();
    const db = seedDb();
    db.profile = saveMix(machined(), "Night shift");
    installFakeApi(db);
    signIn(db);
    renderApp("/t/ENG/settings/appearance/design");
    const list = await screen.findByRole("list", { name: "Your mixes" });

    await user.click(within(list).getByRole("button", { name: "Rename Night shift" }));
    const field = within(list).getByLabelText("New name for Night shift");
    await user.clear(field);
    await user.type(field, "Late shift{Enter}");
    expect(within(list).getByText("Late shift")).toBeInTheDocument();

    await user.click(within(list).getByRole("button", { name: "Delete Late shift" }));
    expect(screen.queryByRole("list", { name: "Your mixes" })).not.toBeInTheDocument();
    const toast = screen.getByRole("region", { name: "Notifications" });
    await user.click(within(toast).getByRole("button", { name: "Undo" }));
    expect(screen.getByRole("list", { name: "Your mixes" })).toHaveTextContent("Late shift");
    await waitFor(() => expect(db.profile.mixes.map((m) => m.name)).toEqual(["Late shift"]));
  });

  it("has Share on the Design page instead of Appearance", async () => {
    const db = seedDb();
    installFakeApi(db);
    signIn(db);
    renderApp("/t/ENG/settings/appearance/design");
    expect(await screen.findByRole("region", { name: "Share this mix" })).toBeInTheDocument();
  });
});
