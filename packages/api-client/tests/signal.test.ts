import { describe, expect, it, vi } from "vitest";
import { TeamflowClient } from "@teamflow/api-client";

function abortableFetch() {
  return vi.fn(
    (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        const signal = init?.signal;
        if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
        signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        setTimeout(() => resolve(Response.json({ teams: [] })), 20);
      }),
  );
}

describe("request signal", () => {
  it("passes the bound signal to fetch and rejects when it aborts", async () => {
    const fetchImpl = abortableFetch();
    const client = new TeamflowClient({ baseUrl: "http://api", token: "t", fetchImpl });
    const controller = new AbortController();

    const pending = client.withSignal(controller.signal).listTeams();
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchImpl.mock.calls[0]![1]?.signal).toBe(controller.signal);
  });

  it("keeps the token of the original client and leaves it unbound", async () => {
    const fetchImpl = abortableFetch();
    const client = new TeamflowClient({ baseUrl: "http://api", fetchImpl });
    const bound = client.withSignal(new AbortController().signal);
    client.setToken("late-token");

    await bound.listTeams();
    await client.listTeams();

    const [boundInit, plainInit] = fetchImpl.mock.calls.map((call) => call[1]!);
    expect(new Headers(boundInit.headers).get("Authorization")).toBe("Bearer late-token");
    expect(plainInit.signal).toBeUndefined();
  });
});
