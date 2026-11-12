import { configure, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  SERVER_POWERS,
  type MailSettingsPublic,
  type ServerAdminPublic,
  type ServerPower,
  type SetupChecklistPublic,
  type SiteSettingsAdminPublic,
} from "@teamflow/core";
import { describe, expect, it } from "vitest";
import { adminRoutes } from "./adminFixtures";
import { installFakeApi, seedDb, signIn, type FakeDb, type FakeRoute } from "./fakeApi";
import { renderApp } from "./renderApp";

configure({ asyncUtilTimeout: 3000 });

const CHECKLIST: SetupChecklistPublic = {
  items: [
    { id: "admin", state: "done", title: "Admin account", detail: "Ada" },
    { id: "email", state: "skipped", title: "Email skipped", detail: "Resets need an admin." },
    { id: "backup", state: "todo", title: "First backup", detail: "No backup yet." },
    { id: "flow", state: "done", title: "First Flow", detail: "2 on this server" },
  ],
  doneCount: 2,
  total: 4,
  complete: false,
  dismissed: false,
};

const SITE: SiteSettingsAdminPublic = {
  siteName: "Toasterland",
  siteNameSource: "saved",
  publicUrl: "https://teamflow.example.com",
  publicUrlSource: "env",
  suggestedPublicUrl: null,
};

const MAIL: MailSettingsPublic = {
  configured: false,
  source: "default",
  host: null,
  port: 587,
  security: "starttls",
  user: null,
  passwordSet: false,
  from: null,
};

const state: { admins?: ServerAdminPublic[] } = {};
function admins() {
  return (state.admins ??= [
    {
      id: "user-1",
      name: "Ada",
      email: "ada@example.com",
      role: "owner",
      powers: [...SERVER_POWERS],
      fromEnv: false,
    },
    {
      id: "user-3",
      name: "Sam",
      email: "sam@example.test",
      role: "admin",
      powers: ["backups"],
      fromEnv: false,
    },
    {
      id: "user-4",
      name: "Ops",
      email: "ops@example.test",
      role: "admin",
      powers: [...SERVER_POWERS],
      fromEnv: true,
    },
  ]);
}

function setup(path: string, configure?: (db: FakeDb) => void) {
  state.admins = undefined;
  const db = seedDb();
  configure?.(db);
  const extra: FakeRoute[] = [
    ["GET", /^\/instance\/setup-checklist$/, () => ({ checklist: CHECKLIST })],
    [
      "PATCH",
      /^\/instance\/setup-checklist$/,
      () => ({ checklist: { ...CHECKLIST, dismissed: true } }),
    ],
    ["GET", /^\/instance\/site$/, () => ({ site: SITE })],
    ["GET", /^\/instance\/mail$/, () => ({ mail: MAIL })],
    ["GET", /^\/instance\/admins$/, () => ({ admins: admins() })],
    [
      "PUT",
      /^\/instance\/admins\/([^/]+)$/,
      ({ params, body }) => {
        const powers = (body as { powers: ServerPower[] }).powers;
        const existing = admins().find((a) => a.id === params[0]);
        if (existing) existing.powers = powers;
        else
          state.admins!.push({
            id: params[0]!,
            name: "Jules",
            email: "jules@example.test",
            role: "admin",
            powers,
            fromEnv: false,
          });
        return { admin: admins().find((a) => a.id === params[0]) };
      },
    ],
    ["POST", /^\/instance\/owner\/transfer$/, () => ({ admins: admins() })],
    [
      "POST",
      /^\/instance\/users\/([^/]+)\/reset-link$/,
      () => ({
        reset: {
          url: "https://teamflow.example.com/?reset=abc123",
          expiresAt: "2026-11-09T12:00:00.000Z",
          emailed: false,
          emailError: null,
        },
      }),
    ],
    ...adminRoutes({}),
  ];
  const api = installFakeApi(db, { extraRoutes: extra });
  signIn(db);
  const app = renderApp(path);
  return { ...api, ...app };
}

describe("server admin: People", () => {
  it("shows the Owner the trusted list; a tick saves that person's powers", async () => {
    const user = userEvent.setup();
    const { calls } = setup("/t/ENG/admin/people");
    const owner = await screen.findByRole("region", { name: "Server Owner" });
    expect(within(owner).getByText("Ada")).toBeInTheDocument();
    const trusted = await screen.findByRole("list", { name: "Trusted admins" });
    const sam = within(trusted).getByText("Sam").closest("li")!;
    expect(within(sam).getByRole("checkbox", { name: "Backups" })).toBeChecked();
    await user.click(within(sam).getByRole("checkbox", { name: "Updates" }));
    await waitFor(() =>
      expect(
        calls.find((c) => c.method === "PUT" && c.path === "/instance/admins/user-3")?.body,
      ).toEqual({
        powers: ["backups", "updates"],
      }),
    );
    // Someone in TEAMFLOW_INSTANCE_ADMINS is locked: every power, no Remove.
    const ops = within(trusted).getByText("Ops").closest("li")!;
    expect(within(ops).getByText("Set in .env")).toBeInTheDocument();
    expect(within(ops).getByRole("checkbox", { name: "People" })).toBeDisabled();
    expect(within(ops).queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
  });

  it("transfers ownership only once the new Owner's email is typed", async () => {
    const user = userEvent.setup();
    const { calls } = setup("/t/ENG/admin/people");
    await user.click(await screen.findByRole("button", { name: /Transfer ownership/ }));
    const dialog = await screen.findByRole("dialog", { name: "Transfer ownership" });
    const go = within(dialog).getByRole("button", { name: "Transfer ownership" });
    expect(go).toBeDisabled();
    await user.type(within(dialog).getByLabelText(/Type sam@example.test/), "SAM@example.test");
    expect(go).toBeEnabled();
    await user.click(go);
    await waitFor(() =>
      expect(calls.find((c) => c.path === "/instance/owner/transfer")?.body).toEqual({
        userId: "user-3",
        confirmEmail: "SAM@example.test",
      }),
    );
  });

  it("shows a trusted admin with the People power everyone, but not the trusted list", async () => {
    setup("/t/ENG/admin/people", (db) => {
      db.user = { ...db.user, serverRole: "admin", serverPowers: ["people"] };
    });
    expect(await screen.findByRole("list", { name: "People" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Server Owner" })).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Trusted admins" })).not.toBeInTheDocument();
  });

  it("shows a reset link to pass on when email is not set up", async () => {
    const user = userEvent.setup();
    setup("/t/ENG/admin/people");
    const list = await screen.findByRole("list", { name: "People" });
    const jules = within(list).getByText("Jules").closest("li")!;
    await user.click(within(jules).getByRole("button", { name: "Send reset link" }));
    expect(
      await within(jules).findByText("https://teamflow.example.com/?reset=abc123"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Email is not set up/)).toBeInTheDocument();
  });
});

describe("server admin: Overview checklist card", () => {
  it("lists only what's left, links to the admin panels, and can be dismissed", async () => {
    const user = userEvent.setup();
    const { calls } = setup("/t/ENG/admin/overview");
    const card = await screen.findByRole("region", { name: "Setup checklist" });
    expect(within(card).getByText("2 of 4 done")).toBeInTheDocument();
    expect(within(card).queryByText("Admin account")).not.toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Set up email" })).toHaveAttribute(
      "href",
      "/t/ENG/admin/site",
    );
    expect(within(card).getByRole("link", { name: "Updates & backups" })).toHaveAttribute(
      "href",
      "/t/ENG/admin/updates",
    );
    await user.click(within(card).getByRole("button", { name: "Dismiss" }));
    await waitFor(() =>
      expect(
        calls.find((c) => c.path === "/instance/setup-checklist" && c.method === "PATCH")?.body,
      ).toEqual({ dismissed: true }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Setup checklist" })).not.toBeInTheDocument(),
    );
  });
});

describe("server admin: Site & email", () => {
  it("shows an address set in .env as read-only", async () => {
    setup("/t/ENG/admin/site");
    const address = await screen.findByLabelText(/Public address/);
    expect(address).toHaveValue("https://teamflow.example.com");
    expect(address).toHaveAttribute("readonly");
    expect(screen.getByText("Set in .env")).toBeInTheDocument();
    expect(screen.getByLabelText(/Site name/)).toHaveValue("Toasterland");
    expect(screen.getByLabelText("SMTP server")).toBeInTheDocument();
  });
});
