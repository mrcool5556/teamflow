import { configure, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MaintenanceJobPublic, MaintenanceStatusPublic } from "@teamflow/core";
import { describe, expect, it } from "vitest";
import { makeOverview } from "./adminFixtures";
import { installFakeApi, seedDb, signIn, type FakeRoute } from "./fakeApi";
import { renderApp } from "./renderApp";

configure({ asyncUtilTimeout: 3000 });

function statusWith(extra: Partial<MaintenanceStatusPublic>): MaintenanceStatusPublic {
  return { ...makeOverview().maintenance, ...extra };
}

function updateJob(status: MaintenanceJobPublic["status"], logTail: string): MaintenanceJobPublic {
  return {
    id: "job-1",
    type: "update",
    status,
    startedAt: "2026-11-09T14:02:00.000Z",
    finishedAt: status === "running" ? null : "2026-11-09T14:03:00.000Z",
    logTail,
    options: { version: "0.9.3" },
  };
}

function renderUpdates(
  status: MaintenanceStatusPublic | (() => MaintenanceStatusPublic),
  extra: FakeRoute[] = [],
) {
  const read = typeof status === "function" ? status : () => status;
  const db = seedDb();
  const api = installFakeApi(db, {
    extraRoutes: [
      ...extra,
      ["GET", /^\/server\/maintenance$/, () => ({ status: read() })],
      ["POST", /^\/server\/maintenance\/check$/, () => ({ status: read() })],
      ["POST", /^\/server\/maintenance\/update$/, () => ({ job: read().job })],
    ],
  });
  signIn(db);
  renderApp("/t/ENG/settings/updates");
  return api;
}

describe("Settings → Updates", () => {
  it("up to date: one sentence, no update button", async () => {
    const base = makeOverview().maintenance;
    renderUpdates(
      statusWith({
        state: "up-to-date",
        release: { ...base.release, latest: { ...base.release.latest!, version: "0.9.2" } },
      }),
    );
    expect(await screen.findByRole("heading", { name: "You're up to date" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Update to/ })).not.toBeInTheDocument();
  });

  it("update available: notes and one button that sends the shown version", async () => {
    const user = userEvent.setup();
    const api = renderUpdates(statusWith({ state: "available" }));
    expect(await screen.findByRole("heading", { name: "v0.9.3 is available" })).toBeInTheDocument();
    expect(screen.getByText("Faster boards")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Update to v0.9.3" }));
    await waitFor(() =>
      expect(
        api.calls.some(
          (call) =>
            call.method === "POST" &&
            call.path.endsWith("/server/maintenance/update") &&
            JSON.stringify(call.body) === JSON.stringify({ version: "0.9.3", backupFull: false }),
        ),
      ).toBe(true),
    );
  });

  it("updating: steps and the last log lines, no buttons", async () => {
    renderUpdates(
      statusWith({
        state: "updating",
        job: updateJob(
          "running",
          "STEP download\n==> Verified teamflow-v0.9.3-linux-x64.tar.gz (sha256 ok)\nSTEP backup\nSTEP install\n==> Database migrations…\n",
        ),
        lastRun: { step: "install", failure: null, done: null },
      }),
    );
    expect(await screen.findByRole("heading", { name: "Updating to v0.9.3…" })).toBeInTheDocument();
    const steps = screen.getByRole("list", { name: "Update progress" });
    expect(within(steps).getByText(/Download/)).toHaveClass("update-step--done");
    expect(within(steps).getByText(/Install/)).toHaveClass("update-step--now");
    expect(
      within(screen.getByRole("region", { name: "Update status" })).getByText(
        /Database migrations/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Update to/ })).not.toBeInTheDocument();
  });

  it("failed: says it was rolled back, the one-line fix, and offers Try again", async () => {
    renderUpdates(
      statusWith({
        state: "failed",
        job: updateJob(
          "failed",
          "STEP download\nSTEP backup\nSTEP install\nFAIL migrate The database update for v0.9.3 failed. The backup was restored and v0.9.2 is running again.\n",
        ),
        lastRun: {
          step: "install",
          failure: {
            code: "migrate",
            message:
              "The database update for v0.9.3 failed. The backup was restored and v0.9.2 is running again.",
          },
          done: null,
        },
      }),
    );
    expect(
      await screen.findByRole("heading", { name: "Update to v0.9.3 didn't finish" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/rolled back automatically/)).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Update status" })).getByText(
        /The database update for v0.9.3 failed/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show log" })).toBeInTheDocument();
  });

  it("not set up: the reason and the installer line", async () => {
    renderUpdates(
      statusWith({
        state: "not-set-up",
        notSetUpReason:
          "The maintenance permission (sudo rule) is missing. Re-run the installer to add it.",
      }),
    );
    expect(
      await screen.findByRole("heading", {
        name: "One-click updates aren't set up on this server",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/sudo rule\) is missing/)).toBeInTheDocument();
    expect(
      screen.getByText(/releases\/latest\/download\/install.sh \| sudo bash/),
    ).toBeInTheDocument();
  });

  it("shows Back in a moment while the server restarts mid-update", async () => {
    let calls = 0;
    const running = statusWith({
      state: "updating",
      job: updateJob("running", "STEP restart\n"),
      lastRun: { step: "restart", failure: null, done: null },
    });
    renderUpdates(() => {
      calls += 1;
      if (calls > 1) throw Object.assign(new Error("Bad gateway"), { status: 502 });
      return running;
    }, [
      [
        "GET",
        /^\/health$/,
        () => {
          throw Object.assign(new Error("down"), { status: 502 });
        },
      ],
    ]);
    expect(await screen.findByRole("heading", { name: "Updating to v0.9.3…" })).toBeInTheDocument();
    expect(await screen.findByText("Back in a moment", {}, { timeout: 6000 })).toBeInTheDocument();
  }, 10_000);

  it("keeps backups, host details and the log under a closed Advanced section", async () => {
    const user = userEvent.setup();
    renderUpdates(statusWith({ state: "available", sudoPending: false }));
    const summary = await screen.findByText("Advanced");
    const details = summary.closest("details")!;
    expect(details.open).toBe(false);
    await user.click(summary);
    expect(details.open).toBe(true);
    expect(
      within(details).getByRole("button", { name: "Back up database now" }),
    ).toBeInTheDocument();
    expect(within(details).getByText("Prebuilt release (linux-x64)")).toBeInTheDocument();
    expect(within(details).getByRole("combobox")).toHaveValue("stable");
    expect(within(details).queryByText(/branch/i)).not.toBeInTheDocument();
  });
});
