import { beforeAll, describe, expect, it } from "vitest";
import {
  api,
  bootApp,
  joinTeam,
  json,
  registerUser,
  type RegisteredUser,
  type TestApp,
} from "./helpers";

describe("board.edit permission (issues, rows, columns, comments, attachments)", () => {
  let app: TestApp;
  let owner: RegisteredUser;
  let viewer: RegisteredUser;
  let member: RegisteredUser;
  let rowId: string;
  let statusId: string;
  let issueId: string;

  beforeAll(async () => {
    app = await bootApp();
    owner = await registerUser(app);
    viewer = await registerUser(app);
    member = await registerUser(app);
    await joinTeam(app, owner.token, owner.teamId, viewer.token, "viewer");
    await joinTeam(app, owner.token, owner.teamId, member.token, "member");

    const { rows } = await json<{ rows: { id: string }[] }>(
      await api(app, "GET", `/teams/${owner.teamId}/rows`, { token: owner.token }),
    );
    rowId = rows[0]!.id;
    const { statuses } = await json<{ statuses: { id: string }[] }>(
      await api(app, "GET", `/rows/${rowId}/statuses`, { token: owner.token }),
    );
    statusId = statuses[0]!.id;
    const created = await api(app, "POST", "/issues", {
      token: owner.token,
      body: { teamId: owner.teamId, rowId, statusId, title: "Owned", priority: "none" },
    });
    issueId = (await json<{ issue: { id: string } }>(created)).issue.id;
  });

  it("lets a viewer read the board but not change it", async () => {
    const as = { token: viewer.token };
    expect((await api(app, "GET", `/issues?teamId=${owner.teamId}`, as)).status).toBe(200);
    expect((await api(app, "GET", `/issues/${issueId}`, as)).status).toBe(200);

    const writes = [
      api(app, "POST", "/issues", {
        ...as,
        body: { teamId: owner.teamId, rowId, statusId, title: "Nope", priority: "none" },
      }),
      api(app, "PATCH", `/issues/${issueId}`, { ...as, body: { title: "Nope" } }),
      api(app, "POST", `/issues/${issueId}/complete`, as),
      api(app, "DELETE", `/issues/${issueId}`, as),
      api(app, "POST", `/teams/${owner.teamId}/rows`, { ...as, body: { name: "Nope" } }),
      api(app, "PATCH", `/rows/${rowId}`, { ...as, body: { name: "Nope" } }),
      api(app, "DELETE", `/rows/${rowId}`, as),
      api(app, "POST", `/rows/${rowId}/statuses`, { ...as, body: { name: "Nope" } }),
      api(app, "PATCH", `/statuses/${statusId}`, { ...as, body: { name: "Nope" } }),
      api(app, "DELETE", `/statuses/${statusId}`, as),
      api(app, "POST", `/issues/${issueId}/comments`, { ...as, body: { body: "Nope" } }),
      api(app, "POST", `/issues/${issueId}/uploads`, {
        ...as,
        body: { filename: "a.txt", mimeType: "text/plain", totalBytes: 3 },
      }),
      api(app, "POST", `/issues/${issueId}/attachments/link`, {
        ...as,
        body: { fileId: "00000000-0000-4000-8000-000000000000" },
      }),
    ];
    for (const res of await Promise.all(writes)) {
      expect(res.status).toBe(403);
      expect(await json(res)).toMatchObject({ code: "forbidden" });
    }
  });

  it("keeps members able to edit the board", async () => {
    const as = { token: member.token };
    const patch = await api(app, "PATCH", `/issues/${issueId}`, {
      ...as,
      body: { title: "Edited" },
    });
    expect(patch.status).toBe(200);
    const create = await api(app, "POST", "/issues", {
      ...as,
      body: { teamId: owner.teamId, rowId, statusId, title: "Mine", priority: "none" },
    });
    expect(create.status).toBeLessThan(300);
    const comment = await api(app, "POST", `/issues/${issueId}/comments`, {
      ...as,
      body: { body: "Looks good" },
    });
    expect(comment.status).toBeLessThan(300);
  });
});
