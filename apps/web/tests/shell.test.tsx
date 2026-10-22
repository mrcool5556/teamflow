import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { permissionsForSystemSlug } from "@teamflow/core";
import { describe, expect, it } from "vitest";
import { queryKeys } from "../src/queries/keys";
import { installFakeApi, seedDb, signIn } from "./fakeApi";
import { renderApp } from "./renderApp";

describe("login form", () => {
  it("submits with Enter", async () => {
    const db = seedDb();
    installFakeApi(db);
    const { path } = renderApp("/login");
    await userEvent.type(screen.getByLabelText("Email"), "ada@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "correct-horse{Enter}");
    await waitFor(() => expect(path()).toBe("/t/ENG"));
  });
});

describe("settings panels", () => {
  it("shows a panel's own success message", async () => {
    const db = seedDb();
    installFakeApi(db);
    signIn(db);
    renderApp("/t/ENG/settings/team");
    await userEvent.click(await screen.findByRole("button", { name: "Create invite link" }));
    expect(await screen.findByText("Invite link created for Engineering.")).toHaveAttribute(
      "role",
      "status",
    );
  });

  it("shows a panel's own error message", async () => {
    const db = seedDb();
    installFakeApi(db, {
      fail: (method, path) =>
        method === "POST" && path === "/auth/tokens" ? "Token limit reached" : undefined,
    });
    signIn(db);
    renderApp("/t/ENG/settings/tokens");
    await userEvent.click(await screen.findByRole("button", { name: "Create token" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Token limit reached");
  });

  it("leaves Updates for General when the permission goes away", async () => {
    const db = seedDb();
    installFakeApi(db);
    signIn(db);
    const { path, queryClient } = renderApp("/t/ENG/settings/updates");
    expect(await screen.findByRole("heading", { name: "Updates & backups" })).toBeInTheDocument();

    const eng = db.teams[0]!;
    db.permissions[eng.id] = {
      ...db.permissions[eng.id]!,
      roleSlug: "member",
      permissions: permissionsForSystemSlug("member"),
    };
    await act(() => queryClient.invalidateQueries({ queryKey: queryKeys.permissions(eng.id) }));

    await waitFor(() => expect(path()).toBe("/t/ENG/settings/general"));
    expect(screen.getByRole("heading", { name: "General" })).toBeInTheDocument();
  });
});
