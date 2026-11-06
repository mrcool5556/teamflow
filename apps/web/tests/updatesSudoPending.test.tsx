import { configure, screen } from "@testing-library/react";
import type { MaintenanceStatusPublic } from "@teamflow/core";
import { describe, expect, it } from "vitest";
import { makeOverview } from "./adminFixtures";
import { installFakeApi, seedDb, signIn } from "./fakeApi";
import { renderApp } from "./renderApp";

configure({ asyncUtilTimeout: 3000 });

function statusWith(extra: Partial<MaintenanceStatusPublic>): MaintenanceStatusPublic {
  return { ...makeOverview().maintenance, ...extra };
}

function renderUpdates(status: MaintenanceStatusPublic) {
  const db = seedDb();
  installFakeApi(db, {
    extraRoutes: [
      ["GET", /^\/teams\/([^/]+)\/server\/maintenance$/, () => ({ status })],
      ["POST", /^\/teams\/([^/]+)\/server\/maintenance\/check$/, () => ({ status })],
      ["GET", /^\/teams\/([^/]+)\/server\/maintenance\/job$/, () => ({ job: status.job })],
    ],
  });
  signIn(db);
  renderApp("/t/ENG/settings/updates");
}

describe("Settings → Updates sudo badge", () => {
  it("says Update in progress, not Sudo missing, while an update runs", async () => {
    renderUpdates(
      statusWith({
        sudoReady: false,
        sudoPending: true,
        sudoDetail: null,
        job: {
          id: "job-1",
          type: "update",
          status: "running",
          startedAt: "2026-11-06T01:40:00.000Z",
          finishedAt: null,
          logTail: "Running setup-maintenance-sudo.sh",
          options: {},
        },
      }),
    );
    expect(await screen.findByText("Update in progress")).toBeInTheDocument();
    expect(screen.queryByText("Sudo missing")).not.toBeInTheDocument();
    expect(screen.queryByText(/command not found/)).not.toBeInTheDocument();
  });

  it("still shows a real sudo problem when nothing is running", async () => {
    renderUpdates(
      statusWith({
        sudoReady: false,
        sudoPending: false,
        sudoDetail: "a password is required (sudo -n backup.sh --help)",
      }),
    );
    expect(await screen.findByText("Sudo missing")).toBeInTheDocument();
    expect(screen.getByText(/a password is required/)).toBeInTheDocument();
  });
});
