import { configure, screen, waitFor } from "@testing-library/react";
import { permissionsForSystemSlug } from "@teamflow/core";
import { describe, expect, it } from "vitest";
import { adminRoutes, makeOverview } from "./adminFixtures";
import { installFakeApi, seedDb, signIn, type FakeRoute } from "./fakeApi";
import { renderApp } from "./renderApp";

configure({ asyncUtilTimeout: 3000 });

/** Updates & backups and the Discord bot depend on the instance-admin flag only. */
function setup(path: string, options: { role?: "admin" | "owner"; noFlows?: boolean } = {}) {
  const db = seedDb();
  if (options.noFlows) db.teams = [];
  if (options.role === "admin") {
    for (const team of db.teams) {
      db.permissions[team.id] = {
        ...db.permissions[team.id]!,
        roleSlug: "admin",
        roleName: "Admin",
        permissions: permissionsForSystemSlug("admin"),
      };
    }
  }
  const status = makeOverview().maintenance;
  const routes: FakeRoute[] = [
    ["GET", /^\/server\/maintenance$/, () => ({ status })],
    ["POST", /^\/server\/maintenance\/check$/, () => ({ status })],
    ["GET", /^\/server\/maintenance\/job$/, () => ({ job: null })],
    [
      "GET",
      /^\/integrations\/discord\/service$/,
      () => ({
        status: {
          managementAvailable: true,
          unitInstalled: true,
          unitEnabled: true,
          state: "running",
          credentialsConfigured: true,
          detail: null,
        },
      }),
    ],
    ...adminRoutes({}),
  ];
  const api = installFakeApi(db, { extraRoutes: routes });
  signIn(db);
  return { ...api, ...renderApp(path) };
}

describe("server-wide admin sections", () => {
  it("shows Updates & backups to an instance admin who is only a Flow Admin", async () => {
    const { calls } = setup("/t/ENG/admin/updates", { role: "admin" });
    expect(await screen.findByRole("heading", { name: "Updates & backups" })).toBeInTheDocument();
    await waitFor(() => expect(calls.some((c) => c.path === "/server/maintenance")).toBe(true));
    expect(screen.queryByText(/where you are the Owner/)).not.toBeInTheDocument();
  });

  it("works with no Flow open at all", async () => {
    const { calls } = setup("/admin/updates", { noFlows: true });
    expect(await screen.findByRole("heading", { name: "Updates & backups" })).toBeInTheDocument();
    await waitFor(() => expect(calls.some((c) => c.path === "/server/maintenance")).toBe(true));
    expect(calls.some((c) => c.path.startsWith("/teams/") && c.path.includes("/server/"))).toBe(
      false,
    );
  });

  it("runs the Discord bot section from any Flow", async () => {
    const { calls } = setup("/t/ENG/admin/bot", { role: "admin" });
    expect(await screen.findByRole("heading", { name: "Discord bot" })).toBeInTheDocument();
    await waitFor(() =>
      expect(calls.some((c) => c.path === "/integrations/discord/service")).toBe(true),
    );
    expect(screen.queryByText(/where you are the Owner/)).not.toBeInTheDocument();
  });
});
