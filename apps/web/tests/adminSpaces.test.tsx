import { configure, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GIB } from "@teamflow/core";
import { describe, expect, it } from "vitest";
import { adminRoutes } from "./adminFixtures";
import { installFakeApi, seedDb, signIn } from "./fakeApi";
import { renderApp } from "./renderApp";

configure({ asyncUtilTimeout: 3000 });

function setup(path: string) {
  const db = seedDb();
  const state = {};
  const api = installFakeApi(db, { extraRoutes: adminRoutes(state) });
  signIn(db);
  const app = renderApp(path);
  return { ...api, ...app, state };
}

describe("admin spaces list", () => {
  it("lists every space with type, owner, members, issues, usage and cap", async () => {
    setup("/t/ENG/admin/spaces");
    const table = await screen.findByRole("table");
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(3); // header + 2 spaces
    const mod = rows.find((row) => within(row).queryByText("Mod pack"))!;
    expect(within(mod).getByText("Free")).toBeInTheDocument();
    expect(within(mod).getByText("Jules")).toBeInTheDocument();
    expect(within(mod).getByText("812 MB")).toBeInTheDocument();
    expect(within(mod).getByText("79%")).toBeInTheDocument();
    expect(within(mod).getByText("1.00 GB")).toBeInTheDocument();
    const eng = rows.find((row) => within(row).queryByText("Engineering"))!;
    expect(within(eng).getAllByText("No limit").length).toBeGreaterThan(0);
  });

  it("filters to spaces near their limit and searches by name", async () => {
    const user = userEvent.setup();
    setup("/t/ENG/admin/spaces");
    await screen.findByRole("table");
    await user.click(screen.getByRole("button", { name: "Near limit 1" }));
    const table = () => screen.getByRole("table");
    expect(within(table()).queryByText("Engineering")).not.toBeInTheDocument();
    expect(within(table()).getByText("Mod pack")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "All 2" }));
    await user.type(screen.getByRole("searchbox", { name: "Search spaces" }), "engin");
    expect(within(table()).getByText("Engineering")).toBeInTheDocument();
    expect(within(table()).queryByText("Mod pack")).not.toBeInTheDocument();
  });
});

describe("create space dialog", () => {
  it("creates an admin space with the allowance typed, owned by the admin", async () => {
    const user = userEvent.setup();
    const { calls, path } = setup("/t/ENG/admin/spaces");
    await screen.findByRole("table");
    await user.click(screen.getByRole("button", { name: "+ New space" }));
    const dialog = await screen.findByRole("dialog", { name: "New space" });

    await user.type(within(dialog).getByLabelText("Name"), "Client portal");
    expect(within(dialog).getByLabelText("Key")).toHaveValue("CP");
    await user.click(within(dialog).getByRole("button", { name: "5 GB" }));
    await user.click(within(dialog).getByRole("button", { name: "Create space" }));

    await waitFor(() =>
      expect(calls.find((c) => c.method === "POST" && c.path === "/instance/spaces")?.body).toEqual(
        {
          name: "Client portal",
          key: "CP",
          spaceType: "admin",
          capBytes: 5 * GIB,
        },
      ),
    );
    expect(screen.queryByRole("dialog", { name: "New space" })).not.toBeInTheDocument();
    // The new space's detail page opens.
    await waitFor(() =>
      expect(path()).toBe("/t/ENG/admin/spaces/00000000-0000-4000-8000-0000000000c1"),
    );
    expect(await screen.findByRole("heading", { name: "Client portal" })).toBeInTheDocument();
  });

  it("sends no cap for a free space and can make it for another user", async () => {
    const user = userEvent.setup();
    const { calls } = setup("/t/ENG/admin/spaces");
    await screen.findByRole("table");
    await user.click(screen.getByRole("button", { name: "+ New space" }));
    const dialog = await screen.findByRole("dialog", { name: "New space" });

    await user.type(within(dialog).getByLabelText("Name"), "Jam");
    await user.clear(within(dialog).getByLabelText("Key"));
    await user.type(within(dialog).getByLabelText("Key"), "jam1");
    await user.click(within(dialog).getByRole("radio", { name: /Free space/ }));
    expect(within(dialog).getByText(/Upload allowance: 1.00 GB/)).toBeInTheDocument();
    await user.type(within(dialog).getByRole("searchbox"), "jul");
    await user.click(await within(dialog).findByRole("button", { name: /Jules/ }));
    expect(within(dialog).getByText(/Owns 2 of 3 free spaces/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Create space" }));

    await waitFor(() =>
      expect(calls.find((c) => c.method === "POST" && c.path === "/instance/spaces")?.body).toEqual(
        {
          name: "Jam",
          key: "JAM1",
          spaceType: "free",
          ownerUserId: "user-2",
        },
      ),
    );
  });

  it("will not submit without a usable allowance", async () => {
    const user = userEvent.setup();
    setup("/t/ENG/admin/spaces");
    await screen.findByRole("table");
    await user.click(screen.getByRole("button", { name: "+ New space" }));
    const dialog = await screen.findByRole("dialog", { name: "New space" });
    await user.type(within(dialog).getByLabelText("Name"), "Big");
    await user.clear(within(dialog).getByLabelText("Upload allowance"));
    expect(within(dialog).getByRole("alert")).toHaveTextContent(/greater than 0/);
    expect(within(dialog).getByRole("button", { name: "Create space" })).toBeDisabled();
    await user.click(within(dialog).getByRole("checkbox", { name: "No limit" }));
    expect(within(dialog).getByRole("button", { name: "Create space" })).toBeEnabled();
  });
});

describe("space defaults", () => {
  it("saves the free-space cap, per-user limit and disk floor", async () => {
    const user = userEvent.setup();
    const { calls } = setup("/t/ENG/admin/defaults");
    const perUser = await screen.findByLabelText("Free spaces per user");
    await user.clear(perUser);
    await user.type(perUser, "5");
    await user.click(screen.getByRole("button", { name: "5 GB" }));
    const floor = screen.getByLabelText("Keep this much disk free (GB)");
    await user.clear(floor);
    await user.type(floor, "0");
    await user.click(screen.getByRole("button", { name: "Save defaults" }));

    await waitFor(() =>
      expect(
        calls.find((c) => c.method === "PATCH" && c.path === "/instance/settings")?.body,
      ).toEqual({ freeSpaceCapBytes: 5 * GIB, freeSpacesPerUser: 5, minFreeDiskBytes: 0 }),
    );
    expect(await screen.findByText(/Space defaults saved/)).toBeInTheDocument();
  });
});
