import { describe, expect, it, vi } from "vitest";
import { TeamflowApiError, TeamflowClient } from "@teamflow/api-client";

describe("space requests", () => {
  it("keeps the numbers of a space_storage_full refusal on the error", async () => {
    const body = {
      error: "This space is full",
      code: "space_storage_full",
      usedBytes: 10,
      capBytes: 10,
      fileBytes: 5,
      remainingBytes: 0,
    };
    const fetchImpl = vi.fn(async () => Response.json(body, { status: 413 }));
    const client = new TeamflowClient({ baseUrl: "http://api", token: "t", fetchImpl });
    const error = await client.getTeamStorage("team").catch((err: unknown) => err);
    expect(error).toBeInstanceOf(TeamflowApiError);
    expect(error).toMatchObject({
      status: 413,
      code: "space_storage_full",
      message: "This space is full",
      details: { remainingBytes: 0, capBytes: 10 },
    });
  });

  it("calls the instance admin routes", async () => {
    const fetchImpl = vi.fn(async () => Response.json({}));
    const client = new TeamflowClient({ baseUrl: "http://api", token: "t", fetchImpl });
    await client.getTeamStorage("t1");
    await client.listSpaces();
    await client.updateSpace("t1", { capBytes: null });
    await client.emptySpaceTrash("t1");
    await client.listInstanceUsers("sa m");
    const calls = fetchImpl.mock.calls.map((call) => {
      const [url, init] = call as unknown as [string, RequestInit | undefined];
      return `${init?.method ?? "GET"} ${url}`;
    });
    expect(calls).toEqual([
      "GET http://api/teams/t1/storage",
      "GET http://api/instance/spaces",
      "PATCH http://api/instance/spaces/t1",
      "POST http://api/instance/spaces/t1/empty-trash",
      "GET http://api/instance/users?q=sa%20m",
    ]);
  });
});
