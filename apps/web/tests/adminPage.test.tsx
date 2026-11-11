import { configure, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { adminRoutes, makeOverview } from "./adminFixtures";
import { installFakeApi, seedDb, signIn } from "./fakeApi";
import { renderApp } from "./renderApp";

// Whole-app renders: allow for a slow first paint when the full suite runs in parallel.
configure({ asyncUtilTimeout: 3000 });

async function openAccountMenu(user: ReturnType<typeof userEvent.setup>) {
  const topbar = await screen.findByRole("banner");
  await user.click(within(topbar).getByRole("button", { name: /Account menu/ }));
  return screen.findByRole("menu", { name: "Account" });
}

describe("server admin page", () => {
  it("is not offered to non-admins, and its URL sends them to the board", async () => {
    const user = userEvent.setup();
    const db = seedDb();
    db.user.isInstanceAdmin = false;
    installFakeApi(db, { extraRoutes: adminRoutes({}) });
    signIn(db);
    const { path } = renderApp("/t/ENG/admin/overview");

    await waitFor(() => expect(path()).toBe("/t/ENG"));
    expect(await screen.findByText("ENG issue 1")).toBeInTheDocument();
    const menu = await openAccountMenu(user);
    expect(within(menu).queryByRole("menuitem", { name: /Server admin/ })).not.toBeInTheDocument();
  });

  it("opens from the account menu and shows server, bot, updates, backups, disk and fixes", async () => {
    const user = userEvent.setup();
    const db = seedDb();
    installFakeApi(db, { extraRoutes: adminRoutes({}) });
    signIn(db);
    const { path } = renderApp("/t/ENG");

    const menu = await openAccountMenu(user);
    await user.click(within(menu).getByRole("menuitem", { name: /Server admin/ }));
    await waitFor(() => expect(path()).toBe("/t/ENG/admin/overview"));

    const server = await screen.findByRole("region", { name: "Server" });
    expect(within(server).getByText("teamflow.service")).toBeInTheDocument();
    expect(within(server).getByText("0.0.0.0:3000")).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Discord bot" })).getByText("running"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Updates" })).getByText("v0.9.3 available"),
    ).toBeInTheDocument();
    const disk = screen.getByRole("region", { name: "Disk" });
    expect(within(disk).getByText("19.00 GB free of 30.00 GB")).toBeInTheDocument();
    expect(within(disk).getByText(/Uploads 4.00 GB/)).toBeInTheDocument();
    const fixes = screen.getByRole("region", { name: "Common fixes" });
    expect(within(fixes).getByText("Uploads are not in any backup")).toBeInTheDocument();

    // Port and URL detection: the server fetches its own PUBLIC_URL/health.
    await user.click(within(server).getByRole("button", { name: "Check public URL" }));
    expect(await within(server).findByText(/✓ 42 ms/)).toBeInTheDocument();
  });

  it("reports a disk that could not be read instead of drawing a bar", async () => {
    const db = seedDb();
    const overview = makeOverview();
    overview.disk = { ...overview.disk, totalBytes: null, freeBytes: null };
    installFakeApi(db, { extraRoutes: adminRoutes({ overview }) });
    signIn(db);
    renderApp("/t/ENG/admin");

    const disk = await screen.findByRole("region", { name: "Disk" });
    expect(within(disk).getByText("not readable")).toBeInTheDocument();
    expect(within(disk).getByText(/could not read free space/)).toBeInTheDocument();
  });

  it("goes back to the board with Back to board", async () => {
    const user = userEvent.setup();
    const db = seedDb();
    installFakeApi(db, { extraRoutes: adminRoutes({}) });
    signIn(db);
    const { path } = renderApp("/t/ENG/admin/overview");

    await screen.findByRole("region", { name: "Server" });
    await user.click(screen.getByRole("button", { name: /Back to board/ }));
    await waitFor(() => expect(path()).toBe("/t/ENG"));
  });
});
