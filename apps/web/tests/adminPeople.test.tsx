import { configure, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  MailSettingsPublic,
  SetupChecklistPublic,
  SiteSettingsAdminPublic,
} from "@teamflow/core";
import { describe, expect, it } from "vitest";
import { adminRoutes } from "./adminFixtures";
import { installFakeApi, seedDb, signIn, type FakeRoute } from "./fakeApi";
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

function setup(path: string) {
  const db = seedDb();
  const extra: FakeRoute[] = [
    ["GET", /^\/instance\/setup-checklist$/, () => ({ checklist: CHECKLIST })],
    [
      "PATCH",
      /^\/instance\/setup-checklist$/,
      () => ({ checklist: { ...CHECKLIST, dismissed: true } }),
    ],
    ["GET", /^\/instance\/site$/, () => ({ site: SITE })],
    ["GET", /^\/instance\/mail$/, () => ({ mail: MAIL })],
    [
      "PATCH",
      /^\/instance\/users\/([^/]+)$/,
      ({ params, body }) => ({
        user: {
          id: params[0],
          name: "Jules",
          email: "jules@example.test",
          adminFromEnv: false,
          freeSpaces: 2,
          teamCount: 2,
          createdAt: "2026-10-02T10:00:00.000Z",
          ...(body as object),
        },
      }),
    ],
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
  it("lists everyone and makes someone a server admin after a confirm", async () => {
    const user = userEvent.setup();
    const { calls } = setup("/t/ENG/admin/people");
    const list = await screen.findByRole("list", { name: "People" });
    const ada = within(list).getByText("Ada").closest("li")!;
    expect(within(ada).getByText("(you)")).toBeInTheDocument();
    expect(within(ada).getByText("Server admin")).toBeInTheDocument();

    const jules = within(list).getByText("Jules").closest("li")!;
    await user.click(within(jules).getByRole("button", { name: "Make admin" }));
    const dialog = await screen.findByRole("dialog", { name: /Make Jules a server admin/ });
    await user.click(within(dialog).getByRole("button", { name: "Make admin" }));
    await waitFor(() =>
      expect(
        calls.find((c) => c.method === "PATCH" && c.path === "/instance/users/user-2")?.body,
      ).toEqual({ isInstanceAdmin: true }),
    );
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
