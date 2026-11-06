import { configure, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GIB } from "@teamflow/core";
import { describe, expect, it } from "vitest";
import { adminRoutes } from "./adminFixtures";
import { installFakeApi, seedDb, signIn } from "./fakeApi";
import { renderApp } from "./renderApp";

configure({ asyncUtilTimeout: 3000 });

const MOD_ID = "00000000-0000-4000-8000-0000000000d2";

function setup(path: string) {
  const db = seedDb();
  const api = installFakeApi(db, { extraRoutes: adminRoutes() });
  signIn(db);
  return { ...api, ...renderApp(path) };
}

describe("space detail", () => {
  it("opens from the list and shows the breakdown, largest files and history", async () => {
    const user = userEvent.setup();
    const { path } = setup("/t/ENG/admin/spaces");
    const table = await screen.findByRole("table");
    await user.click(within(table).getByRole("button", { name: "Mod pack" }));
    await waitFor(() => expect(path()).toBe(`/t/ENG/admin/spaces/${MOD_ID}`));

    const storage = await screen.findByRole("region", { name: "Storage" });
    expect(within(storage).getByText("812 MB of 1.00 GB · 79%")).toBeInTheDocument();
    expect(within(storage).getByText(/Issue files 520 MB/)).toBeInTheDocument();
    expect(within(storage).getByText(/Trash 120 MB · purges/)).toBeInTheDocument();
    expect(within(storage).getByText("modpack-v3.zip")).toBeInTheDocument();
    const history = screen.getByRole("region", { name: "History" });
    expect(within(history).getByText(/Created: Free space for Jules/)).toBeInTheDocument();
    // The admin is not a member of Mod pack, so there is no board to open.
    expect(screen.queryByRole("button", { name: "Open board" })).not.toBeInTheDocument();
  });

  it("raises the cap and saves only what changed", async () => {
    const user = userEvent.setup();
    const { calls } = setup(`/t/ENG/admin/spaces/${MOD_ID}`);
    const capTile = await screen.findByRole("region", { name: "Upload cap" });
    expect(within(capTile).getByRole("button", { name: "Save" })).toBeDisabled();
    await user.click(within(capTile).getByRole("button", { name: "5 GB" }));
    await user.click(within(capTile).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ capBytes: 5 * GIB }),
    );
    expect(await screen.findByText(/Saved: free space, cap 5.00 GB/)).toBeInTheDocument();
  });

  it("warns that a cap under current use blocks uploads but deletes nothing", async () => {
    const user = userEvent.setup();
    setup(`/t/ENG/admin/spaces/${MOD_ID}`);
    const capTile = await screen.findByRole("region", { name: "Upload cap" });
    const input = within(capTile).getByLabelText("Cap");
    await user.clear(input);
    await user.type(input, "0.5");
    expect(
      within(capTile).getByText(/new uploads stop until files are removed/),
    ).toBeInTheDocument();
  });

  it("changes a free space to an admin space with no limit", async () => {
    const user = userEvent.setup();
    const { calls } = setup(`/t/ENG/admin/spaces/${MOD_ID}`);
    const capTile = await screen.findByRole("region", { name: "Upload cap" });
    await user.click(within(capTile).getByRole("button", { name: "Admin" }));
    await user.click(within(capTile).getByRole("checkbox", { name: "No limit" }));
    expect(
      within(capTile).getByText(/does not count toward Jules's free spaces/),
    ).toBeInTheDocument();
    await user.click(within(capTile).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({
        spaceType: "admin",
        capBytes: null,
      }),
    );
  });

  it("empties the trash after confirming", async () => {
    const user = userEvent.setup();
    const { calls } = setup(`/t/ENG/admin/spaces/${MOD_ID}`);
    const storage = await screen.findByRole("region", { name: "Storage" });
    await user.click(within(storage).getByRole("button", { name: "Empty trash now" }));
    const confirm = await screen.findByRole("dialog", { name: /Empty the trash of Mod pack/ });
    await user.click(within(confirm).getByRole("button", { name: "Empty trash" }));

    await waitFor(() =>
      expect(calls.some((c) => c.method === "POST" && c.path.endsWith("/empty-trash"))).toBe(true),
    );
    expect(await screen.findByText(/1 file\(s\) deleted, 120 MB freed/)).toBeInTheDocument();
    expect(within(storage).getByRole("button", { name: "Empty trash now" })).toBeDisabled();
  });

  it("says when a space does not exist", async () => {
    setup("/t/ENG/admin/spaces/00000000-0000-4000-8000-000000000bad");
    expect(await screen.findByRole("alert")).toHaveTextContent("Space not found");
  });
});
