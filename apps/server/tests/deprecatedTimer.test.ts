import { beforeAll, describe, expect, it } from "vitest";
import { api, bootApp, json, registerUser, type RegisteredUser, type TestApp } from "./helpers";

type IssueBody = {
  issue: {
    id: string;
    dueDate: string | null;
    timerActiveAt: string | null;
    timerElapsedSec: number;
    timerTargetSec: number | null;
  };
};

let app: TestApp;
let user: RegisteredUser;
let issueId: string;

beforeAll(async () => {
  app = await bootApp();
  user = await registerUser(app);
  const res = await api(app, "POST", "/issues", {
    token: user.token,
    body: { teamId: user.teamId, title: "Old client issue" },
  });
  issueId = (await json<IssueBody>(res)).issue.id;
});

// The web app dropped its timer for the due date, but MCP, the CLI and older clients may still
// send and read the timer fields. Keep them working until a schema version drops the columns.
describe("deprecated issue timer fields", () => {
  it("are still accepted on PATCH and returned on the issue", async () => {
    const res = await api(app, "PATCH", `/issues/${issueId}`, {
      token: user.token,
      body: { timerElapsedSec: 90, timerTargetSec: 600, timerActiveAt: null },
    });
    expect(res.status).toBe(200);
    const { issue } = await json<IssueBody>(res);
    expect(issue).toMatchObject({ timerElapsedSec: 90, timerTargetSec: 600, timerActiveAt: null });
  });

  it("do not get in the way of due dates", async () => {
    const dueDate = "2026-11-02T17:00:00.000Z";
    const res = await api(app, "PATCH", `/issues/${issueId}`, {
      token: user.token,
      body: { dueDate },
    });
    expect(res.status).toBe(200);
    const { issue } = await json<IssueBody>(res);
    expect(issue.dueDate).toBe(dueDate);
    expect(issue.timerElapsedSec).toBe(90);
  });
});
