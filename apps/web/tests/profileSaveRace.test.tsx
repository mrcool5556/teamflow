import { configure, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mergeUserProfile } from "@teamflow/core";
import { describe, expect, it } from "vitest";
import { installFakeApi, seedDb, signIn, type FakeApiOptions } from "./fakeApi";
import { renderApp } from "./renderApp";

// Whole-app renders: allow for a slow first paint when the full suite runs in parallel.
configure({ asyncUtilTimeout: 3000 });

/** Holds back one request until `release` is called. */
function holdOne(match: (method: string, path: string) => boolean) {
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  let seen = 0;
  const gate: FakeApiOptions["gate"] = (method, path) => {
    if (!match(method, path)) return undefined;
    seen += 1;
    return seen === 1 ? held : undefined;
  };
  return { gate, release: () => release(), seen: () => seen };
}

const isProfile = (path: string) => path.startsWith("/auth/profile");

describe("profile saves racing with clicks", () => {
  it("keeps the last click when an older save answers late", async () => {
    const user = userEvent.setup();
    const hold = holdOne((method, path) => method === "PUT" && isProfile(path));
    const db = seedDb();
    installFakeApi(db, { gate: hold.gate });
    signIn(db);
    renderApp("/t/ENG/settings/appearance");
    await waitFor(() => expect(screen.getByLabelText("Workspace")).toBeEnabled());
    const theme = await screen.findByRole("radiogroup", { name: "Light or dark" });

    // Light goes out in a save that is slow to answer…
    await user.click(within(theme).getByRole("radio", { name: "Light" }));
    await waitFor(() => expect(hold.seen()).toBe(1));
    // …and Dark is clicked before it does.
    await user.click(within(theme).getByRole("radio", { name: "Dark" }));
    expect(document.documentElement.dataset.theme).toBe("dark");

    hold.release();
    await waitFor(() => expect(hold.seen()).toBe(2));
    await screen.findByText("✓ Saved");

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(within(theme).getByRole("radio", { name: "Dark" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(db.profile.appearance.theme).toBe("dark");
  });

  it("keeps a click made while the saved profile loads, without overwriting it", async () => {
    const user = userEvent.setup();
    const hold = holdOne((method, path) => method === "GET" && isProfile(path));
    const db = seedDb();
    db.profile = mergeUserProfile(db.profile, { appearance: { chromeStyle: "neon" } });
    installFakeApi(db, { gate: hold.gate });
    signIn(db);
    renderApp("/t/ENG/settings/appearance");
    const theme = await screen.findByRole("radiogroup", { name: "Light or dark" });
    await waitFor(() => expect(hold.seen()).toBe(1));

    await user.click(within(theme).getByRole("radio", { name: "Light" }));
    // The save waits for the saved profile instead of overwriting it with defaults.
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(db.profile.appearance.chromeStyle).toBe("neon");
    hold.release();
    await screen.findByText("✓ Saved");

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.dataset.chromeStyle).toBe("neon");
    await waitFor(() => expect(db.profile.appearance.theme).toBe("light"));
    expect(db.profile.appearance.chromeStyle).toBe("neon");
  });
});
