import { configure, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { adminRoutes } from "./adminFixtures";
import { installFakeApi, seedDb, signIn } from "./fakeApi";
import { renderApp } from "./renderApp";
import { HOW_TOS, howToForFix } from "../src/routes/admin/howTos";
import serverChecks from "../../server/src/lib/instanceAdmin.ts?raw";

configure({ asyncUtilTimeout: 3000 });

describe("how-tos", () => {
  it("cover every fix the server's overview checks can report", () => {
    const source = serverChecks;
    const body = source.slice(source.indexOf("export function collectFixes"));
    const ids = [...body.matchAll(/id: "([a-z-]+)"/g)].map((match) => match[1]!);
    expect(ids.length).toBeGreaterThan(10);
    for (const id of ids) expect(howToForFix(id), id).not.toBeNull();
    expect(new Set(HOW_TOS.map((howTo) => howTo.id)).size).toBe(HOW_TOS.length);
  });

  it("lists the ones matching today's checks first, marked", async () => {
    const db = seedDb();
    installFakeApi(db, { extraRoutes: adminRoutes() });
    signIn(db);
    renderApp("/t/ENG/admin/help");

    await screen.findByRole("heading", { name: "How-tos & fixes" });
    await waitFor(() => expect(screen.getByText("found now")).toBeInTheDocument());
    const first = screen.getAllByRole("region")[0]!;
    expect(
      within(first).getByRole("heading", { name: "Back up the database and uploads" }),
    ).toBeInTheDocument();
    expect(within(first).getByText("sudo teamflow-backup")).toBeInTheDocument();
  });

  it("opens from a fix on the Overview", async () => {
    const user = userEvent.setup();
    const db = seedDb();
    installFakeApi(db, { extraRoutes: adminRoutes() });
    signIn(db);
    const { path: currentPath } = renderApp("/t/ENG/admin/overview");

    const fixes = await screen.findByRole("region", { name: "Common fixes" });
    await user.click(within(fixes).getByRole("button", { name: "How-to" }));
    await waitFor(() => expect(currentPath()).toBe("/t/ENG/admin/help"));
    expect(
      await screen.findByRole("region", { name: "Back up the database and uploads" }),
    ).toBeInTheDocument();
  });
});
