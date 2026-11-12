import { configure, fireEvent, screen, waitFor } from "@testing-library/react";
import type {
  MailSettingsPublic,
  SetupChecklistPublic,
  SiteSettingsAdminPublic,
} from "@teamflow/core";
import { describe, expect, it } from "vitest";
import { installFakeApi, seedDb, signIn, type FakeDb, type FakeRoute } from "./fakeApi";
import { renderApp } from "./renderApp";

configure({ asyncUtilTimeout: 3000 });

function site(extra: Partial<SiteSettingsAdminPublic> = {}): SiteSettingsAdminPublic {
  return {
    siteName: "Teamflow",
    siteNameSource: "default",
    publicUrl: "http://localhost:3000",
    publicUrlSource: "default",
    suggestedPublicUrl: "http://192.168.1.50:3000",
    ...extra,
  };
}

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

const CHECKLIST: SetupChecklistPublic = {
  items: [
    { id: "admin", state: "done", title: "Admin account", detail: "Ada · ada@example.com" },
    { id: "email", state: "skipped", title: "Email skipped", detail: "Resets need an admin." },
    { id: "flow", state: "todo", title: "First Flow", detail: "A board for you." },
  ],
  doneCount: 1,
  total: 3,
  complete: false,
  dismissed: false,
};

function setupServer(options: {
  setupNeeded: boolean;
  site?: SiteSettingsAdminPublic;
  db?: FakeDb;
}) {
  const db = options.db ?? seedDb();
  let needed = options.setupNeeded;
  const routes: FakeRoute[] = [
    [
      "GET",
      /^\/auth\/config$/,
      () => ({
        siteName: "Teamflow",
        inviteOnly: false,
        setupNeeded: needed,
        passwordResetEmail: false,
      }),
    ],
    [
      "POST",
      /^\/auth\/setup\/admin$/,
      () => {
        needed = false;
        return { user: db.user, token: "token-1" };
      },
    ],
    ["GET", /^\/instance\/site$/, () => ({ site: options.site ?? site() })],
    ["PATCH", /^\/instance\/site$/, ({ body }) => ({ site: { ...site(), ...(body as object) } })],
    ["GET", /^\/instance\/mail$/, () => ({ mail: MAIL })],
    ["PATCH", /^\/instance\/setup-checklist$/, () => ({ checklist: CHECKLIST })],
    ["GET", /^\/instance\/setup-checklist$/, () => ({ checklist: CHECKLIST })],
  ];
  const api = installFakeApi(db, { extraRoutes: routes });
  return { db, ...api };
}

describe("/setup on a fresh server", () => {
  it("sends the login page to setup and creates the admin with the code from the link", async () => {
    setupServer({ setupNeeded: true });
    const login = renderApp("/login");
    await waitFor(() => expect(login.path()).toBe("/setup"));
    login.unmount();

    const { calls } = setupServer({ setupNeeded: true });
    const app = renderApp("/setup?code=K7QM-2PXD");
    expect(
      await screen.findByRole("heading", { name: "Create the admin account" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Setup code/)).toHaveValue("K7QM-2PXD");

    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Ada" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ada@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "correct-horse" } });
    fireEvent.change(screen.getByLabelText("Password again"), {
      target: { value: "correct-horse" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Create admin account/ }));

    await waitFor(() => expect(app.path()).toBe("/setup/site"));
    const sent = calls.find((call) => call.path === "/auth/setup/admin");
    expect(sent?.body).toMatchObject({ code: "K7QM-2PXD", email: "ada@example.com", name: "Ada" });
    expect(await screen.findByRole("heading", { name: "Name and address" })).toBeInTheDocument();
  });

  it("checks the passwords match before sending anything", async () => {
    const { calls } = setupServer({ setupNeeded: true });
    renderApp("/setup?code=K7QM-2PXD");
    await screen.findByRole("heading", { name: "Create the admin account" });
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Ada" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ada@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "correct-horse" } });
    fireEvent.change(screen.getByLabelText("Password again"), { target: { value: "other-horse" } });
    fireEvent.click(screen.getByRole("button", { name: /Create admin account/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("not the same");
    expect(calls.some((call) => call.path === "/auth/setup/admin")).toBe(false);
  });
});

describe("/setup once the server has accounts", () => {
  it("is closed to anyone signed out", async () => {
    setupServer({ setupNeeded: false });
    const app = renderApp("/setup?code=K7QM-2PXD");
    await waitFor(() => expect(app.path()).toBe("/login"));
  });

  it("is not for members who are not instance admins", async () => {
    const db = seedDb();
    db.user = { ...db.user, isInstanceAdmin: false, serverRole: null, serverPowers: [] };
    setupServer({ setupNeeded: false, db });
    signIn(db);
    const app = renderApp("/setup/site");
    await waitFor(() => expect(app.path()).not.toMatch(/^\/setup/));
  });
});

describe("setup steps for the admin", () => {
  it("prefills the address from the request and saves only what .env does not set", async () => {
    const { db, calls } = setupServer({
      setupNeeded: false,
      site: site({ siteName: "From env", siteNameSource: "env" }),
    });
    signIn(db);
    const app = renderApp("/setup/site");
    const address = await screen.findByLabelText(/Public address/);
    expect(address).toHaveValue(window.location.origin);
    expect(screen.getByLabelText(/Site name/)).toHaveAttribute("readonly");
    expect(screen.getByText("Set in .env")).toBeInTheDocument();

    fireEvent.change(address, { target: { value: "https://tf.example.org/" } });
    fireEvent.click(screen.getByRole("button", { name: /Save and continue/ }));
    await waitFor(() => expect(app.path()).toBe("/setup/email"));
    const patch = calls.find((call) => call.method === "PATCH" && call.path === "/instance/site");
    expect(patch?.body).toEqual({ publicUrl: "https://tf.example.org" });
  });

  it("lets email be skipped and records it", async () => {
    const { db, calls } = setupServer({ setupNeeded: false });
    signIn(db);
    const app = renderApp("/setup/email");
    fireEvent.click(await screen.findByRole("button", { name: "Skip for now" }));
    await waitFor(() => expect(app.path()).toBe("/setup/storage"));
    expect(calls.find((call) => call.path === "/instance/setup-checklist")?.body).toEqual({
      emailSkipped: true,
    });
  });

  it("ends on the checklist with what's left", async () => {
    const { db } = setupServer({ setupNeeded: false });
    signIn(db);
    renderApp("/setup/done");
    expect(await screen.findByText("Email skipped")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Set up email" })).toHaveAttribute(
      "href",
      "/setup/email",
    );
    expect(screen.getByRole("link", { name: /Create my first Flow/ })).toBeInTheDocument();
  });
});
