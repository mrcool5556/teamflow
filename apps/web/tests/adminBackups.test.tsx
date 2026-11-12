import { configure, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MaintenanceBackupListPublic, ServerPower } from "@teamflow/core";
import { describe, expect, it } from "vitest";
import { adminRoutes, makeOverview } from "./adminFixtures";
import { installFakeApi, seedDb, signIn, type FakeRoute } from "./fakeApi";
import { renderApp } from "./renderApp";

configure({ asyncUtilTimeout: 3000 });

const MB = 1024 * 1024;

function makeList(): MaintenanceBackupListPublic {
  return {
    backups: [
      {
        name: "teamflow_2026-11-11_031500.db",
        kind: "database",
        sizeBytes: 3 * MB,
        createdAt: "2026-11-11T03:15:00.000Z",
        deletable: false,
        restorable: true,
      },
      {
        name: "teamflow_2026-11-10_031500.db",
        kind: "database",
        sizeBytes: 3 * MB,
        createdAt: "2026-11-10T03:15:00.000Z",
        deletable: true,
        restorable: true,
      },
      {
        name: "teamflow_uploads_2026-11-09_224012.tar.gz",
        kind: "uploads",
        sizeBytes: 200 * MB,
        createdAt: "2026-11-09T22:40:12.000Z",
        deletable: true,
        restorable: false,
      },
    ],
    totalBytes: 206 * MB,
    backupDir: "/var/backups/teamflow",
    retention: { keepDatabaseBackups: 10, keepUploadArchives: 1 },
  };
}

function setup(powers?: ServerPower[]) {
  const db = seedDb();
  if (powers) db.user = { ...db.user, serverRole: "admin", serverPowers: powers };
  let list = makeList();
  const status = { ...makeOverview().maintenance, enabled: true, backupScriptReady: true };
  const routes: FakeRoute[] = [
    ["GET", /^\/server\/maintenance$/, () => ({ status })],
    ["POST", /^\/server\/maintenance\/check$/, () => ({ status })],
    ["GET", /^\/server\/maintenance\/job$/, () => ({ job: null })],
    ["GET", /^\/server\/maintenance\/backups$/, () => list],
    [
      "DELETE",
      /^\/server\/maintenance\/backups\/(.+)$/,
      ({ params }) => {
        const name = decodeURIComponent(params[0]!);
        const gone = list.backups.find((b) => b.name === name)!;
        list = {
          ...list,
          backups: list.backups.filter((b) => b.name !== name),
          totalBytes: list.totalBytes - gone.sizeBytes,
        };
        return list;
      },
    ],
    ["PUT", /^\/server\/maintenance\/backup-retention$/, ({ body }) => ({ retention: body })],
    ...adminRoutes({}),
  ];
  const api = installFakeApi(db, { extraRoutes: routes });
  signIn(db);
  return { ...api, ...renderApp("/t/ENG/admin/updates") };
}

describe("Server admin → Updates & backups: the backup list", () => {
  it("shows the total, each backup's date, type and size, and no Delete for the newest database backup", async () => {
    setup();
    const section = await screen.findByRole("region", { name: "Backups" });
    expect(await within(section).findByText("206.0 MB")).toBeInTheDocument();
    const rows = within(section).getAllByRole("row");
    expect(rows).toHaveLength(4); // header + 3
    const newest = rows.find((row) => within(row).queryByText("teamflow_2026-11-11_031500.db"))!;
    expect(within(newest).queryByRole("button", { name: /^Delete/ })).not.toBeInTheDocument();
    expect(within(newest).getByText("newest, kept")).toBeInTheDocument();
    const uploads = rows.find((row) => within(row).queryByText(/teamflow_uploads_/))!;
    expect(within(uploads).getByText("uploads")).toBeInTheDocument();
    expect(within(uploads).getByText("200.0 MB")).toBeInTheDocument();
  });

  it("deletes a backup only after a confirm that says it is permanent", async () => {
    const user = userEvent.setup();
    const { calls } = setup();
    const section = await screen.findByRole("region", { name: "Backups" });
    await user.click(
      await within(section).findByRole("button", { name: "Delete teamflow_2026-11-10_031500.db" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: /Delete teamflow_2026-11-10_031500.db for good/,
    });
    expect(dialog).toHaveTextContent("This can't be undone. It frees 3.0 MB.");
    await user.click(within(dialog).getByRole("button", { name: "Delete backup" }));
    await waitFor(() =>
      expect(
        calls.some(
          (c) =>
            c.method === "DELETE" &&
            c.path === "/server/maintenance/backups/teamflow_2026-11-10_031500.db",
        ),
      ).toBe(true),
    );
    expect(await within(section).findByText("203.0 MB")).toBeInTheDocument();
  });

  it("saves the keep-N settings and refuses numbers outside 1-100", async () => {
    const user = userEvent.setup();
    const { calls } = setup();
    const dbKeep = await screen.findByLabelText("Keep database backups");
    expect(dbKeep).toHaveValue("10");
    expect(screen.getByLabelText("Keep upload archives")).toHaveValue("1");

    await user.clear(dbKeep);
    await user.type(dbKeep, "0");
    expect(await screen.findByText("Enter a number from 1 to 100.")).toBeInTheDocument();
    await user.clear(dbKeep);
    await user.type(dbKeep, "14");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(
        calls.find((c) => c.method === "PUT" && c.path === "/server/maintenance/backup-retention")
          ?.body,
      ).toEqual({ keepDatabaseBackups: 14, keepUploadArchives: 1 }),
    );
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
  });

  it("shows only the backup list with the Backups power, and only updates with Updates", async () => {
    const backupsOnly = setup(["backups"]);
    expect(await screen.findByRole("region", { name: "Backups" })).toBeInTheDocument();
    expect(screen.queryByText(/checks for new releases/)).not.toBeInTheDocument();
    backupsOnly.unmount();

    setup(["updates"]);
    expect(await screen.findByText(/checks for new releases/)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Backups" })).not.toBeInTheDocument();
  });
});
