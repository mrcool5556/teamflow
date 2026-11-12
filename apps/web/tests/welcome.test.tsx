import { configure, fireEvent, screen, waitFor } from "@testing-library/react";
import type { SpaceAllowancePublic, TeamInvitePreview, TeamPublic } from "@teamflow/core";
import { describe, expect, it } from "vitest";
import { suggestFlowKey } from "../src/lib/flowKey";
import { installFakeApi, seedDb, signIn, type FakeRoute } from "./fakeApi";
import { renderApp } from "./renderApp";

configure({ asyncUtilTimeout: 3000 });

const FREE: SpaceAllowancePublic = {
  unlimited: false,
  owned: 0,
  limit: 3,
  capBytes: 1024 ** 3,
  canCreate: true,
};

function preview(extra: Partial<TeamInvitePreview> = {}): TeamInvitePreview {
  return {
    team: { id: "team-axiom", name: "Axiom Ops", key: "AXIOM" },
    roleId: "role-member",
    roleName: "Member",
    roleSlug: "member",
    role: "member",
    expired: false,
    revoked: false,
    exhausted: false,
    alreadyMember: false,
    ...extra,
  };
}

/** A signed-in user with no Flow yet. */
function newcomer(options: { allowance?: SpaceAllowancePublic; invite?: TeamInvitePreview } = {}) {
  const db = seedDb();
  db.user = {
    ...db.user,
    name: "Sam Rivers",
    isInstanceAdmin: false,
    serverRole: null,
    serverPowers: [],
  };
  db.teams = [];
  const addTeam = (name: string, key: string): TeamPublic => {
    const team: TeamPublic = {
      id: `team-${key.toLowerCase()}`,
      workspaceId: "ws",
      name,
      key,
      createdAt: new Date().toISOString(),
      spaceType: "free",
      storageCapBytes: 1024 ** 3,
    };
    db.teams.push(team);
    return team;
  };
  const routes: FakeRoute[] = [
    ["GET", /^\/auth\/space-allowance$/, () => ({ allowance: options.allowance ?? FREE })],
    [
      "POST",
      /^\/teams$/,
      ({ body }) => {
        const { name, key } = body as { name: string; key: string };
        return { team: addTeam(name, key) };
      },
    ],
    [
      "GET",
      /^\/invites\/([^/]+)$/,
      ({ params }) => {
        if (params[0] === "missing-code") {
          throw Object.assign(new Error("Invite not found"), { status: 404 });
        }
        return { preview: options.invite ?? preview() };
      },
    ],
    [
      "POST",
      /^\/invites\/([^/]+)\/accept$/,
      () => ({ team: addTeam("Axiom Ops", "AXIOM"), alreadyMember: false }),
    ],
  ];
  const api = installFakeApi(db, { extraRoutes: routes });
  signIn(db);
  return { db, ...api };
}

describe("suggestFlowKey", () => {
  it("uses initials for several words, else the first letters", () => {
    expect(suggestFlowKey("Design crew")).toBe("DC");
    expect(suggestFlowKey("Weekend build squad")).toBe("WBS");
    expect(suggestFlowKey("Axiom")).toBe("AXIO");
    expect(suggestFlowKey("!")).toBe("");
  });
});

describe("welcome after sign-up", () => {
  it("sends someone with no Flow from / to the welcome page with two choices", async () => {
    newcomer();
    const app = renderApp("/");
    await waitFor(() => expect(app.path()).toBe("/welcome"));
    expect(await screen.findByText("You just created your account.")).toBeInTheDocument();
    expect(screen.getByText("Welcome, Sam")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Create a Flow/ })).toHaveAttribute(
      "href",
      "/welcome/create",
    );
    expect(screen.getByRole("link", { name: /Join a Flow/ })).toHaveAttribute(
      "href",
      "/welcome/join",
    );
    expect(await screen.findByText(/uploads up to 1 GB · you can own 3/)).toBeInTheDocument();
  });

  it("creates a Flow with a suggested key and opens its board", async () => {
    const { calls } = newcomer();
    const app = renderApp("/welcome/create");
    fireEvent.change(await screen.findByLabelText("Flow name"), {
      target: { value: "Design crew" },
    });
    expect(screen.getByLabelText("Key")).toHaveValue("DC");
    expect(await screen.findByText(/this will be 1 of 3/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Create Flow/ }));
    await waitFor(() => expect(app.path()).toBe("/t/DC"));
    expect(calls.find((c) => c.method === "POST" && c.path === "/teams")?.body).toEqual({
      name: "Design crew",
      key: "DC",
    });
  });

  it("explains the limit instead of offering Create when it is reached", async () => {
    newcomer({ allowance: { ...FREE, owned: 3, canCreate: false } });
    renderApp("/welcome/create");
    expect(
      await screen.findByText(/already own 3 free Flows, the most allowed/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Create Flow/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage my Flows" })).toBeInTheDocument();
  });

  it("joins a Flow from a pasted invite link after showing who it is", async () => {
    const { calls } = newcomer();
    const app = renderApp("/welcome/join");
    fireEvent.change(await screen.findByLabelText("Invite link or code"), {
      target: { value: "https://teamflow.example.org/invite/k3J9xQ7wPz" },
    });
    expect(await screen.findByText("Axiom Ops")).toBeInTheDocument();
    expect(screen.getByText("You'll join as Member")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Join AXIOM/ }));
    await waitFor(() => expect(app.path()).toBe("/t/AXIOM"));
    expect(calls.some((c) => c.path === "/invites/k3J9xQ7wPz/accept")).toBe(true);
  });

  it("says when an invite is used up or unknown", async () => {
    newcomer({ invite: preview({ exhausted: true }) });
    renderApp("/welcome/join");
    const input = await screen.findByLabelText("Invite link or code");
    fireEvent.change(input, { target: { value: "p8Ft2LwZ" } });
    expect(await screen.findByText(/expired or was used up/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Join" })).toBeDisabled();

    fireEvent.change(input, { target: { value: "missing-code" } });
    expect(await screen.findByText(/was not found/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create a Flow instead" })).toBeInTheDocument();
  });
});
