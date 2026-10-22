import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { IssueAttachmentPublic } from "@teamflow/core";
import { describe, expect, it } from "vitest";
import { installFakeApi, seedDb, signIn, type FakeDb } from "./fakeApi";
import { renderApp } from "./renderApp";

function attachment(
  db: FakeDb,
  overrides: Partial<IssueAttachmentPublic> & Pick<IssueAttachmentPublic, "id" | "filename">,
): IssueAttachmentPublic {
  return {
    issueId: null,
    rowId: null,
    fileId: `file-${overrides.id}`,
    fileRef: `file_${overrides.id}`,
    mimeType: "text/plain",
    sizeBytes: 120,
    kind: "other",
    uploaderId: db.user.id,
    uploaderName: db.user.name,
    createdAt: new Date().toISOString(),
    downloadUrl: `/attachments/${overrides.id}/download`,
    canStream: false,
    ...overrides,
  };
}

async function openRowFiles() {
  const user = userEvent.setup();
  const topbar = await screen.findByRole("banner");
  await screen.findByRole("button", { name: "ENG row 1" });
  const rowFiles = screen
    .getAllByRole("button", { name: "Files" })
    .find((button) => !topbar.contains(button))!;
  await user.click(rowFiles);
  return { user, drawer: await screen.findByRole("dialog", { name: /shared files/ }) };
}

describe("useAttachmentList in the row files drawer", () => {
  it("uses its own class names and lists the row's files once", async () => {
    const db = seedDb();
    installFakeApi(db);
    signIn(db);
    db.attachments.push(attachment(db, { id: "a1", filename: "notes.txt", rowId: db.rows[0]!.id }));
    renderApp("/t/ENG");

    const { drawer } = await openRowFiles();
    expect(drawer).toHaveClass("drawer", "row-files-drawer");
    expect(drawer.className).not.toContain("issue-drawer");
    expect(drawer.querySelector("[class*='issue-drawer']")).toBeNull();
    expect(await within(drawer).findByRole("button", { name: "notes.txt" })).toBeInTheDocument();
    expect(within(drawer).getAllByText(/Tools, docs, and assets/)).toHaveLength(1);
  });

  it("removes a file only after the confirm dialog", async () => {
    const db = seedDb();
    const { calls } = installFakeApi(db);
    signIn(db);
    db.attachments.push(attachment(db, { id: "a1", filename: "notes.txt", rowId: db.rows[0]!.id }));
    renderApp("/t/ENG");

    const { user, drawer } = await openRowFiles();
    await user.click(await within(drawer).findByRole("button", { name: "Remove notes.txt" }));
    const confirm = screen.getByRole("dialog", { name: "Remove notes.txt?" });
    await user.click(within(confirm).getByRole("button", { name: "Remove" }));

    await waitFor(() =>
      expect(within(drawer).queryByRole("button", { name: "notes.txt" })).not.toBeInTheDocument(),
    );
    expect(calls.some((c) => c.method === "DELETE" && c.path.endsWith("/attachments/a1"))).toBe(
      true,
    );
  });

  it("refuses a file over the limit with an error toast", async () => {
    const db = seedDb();
    const { calls } = installFakeApi(db);
    signIn(db);
    renderApp("/t/ENG");

    const { user, drawer } = await openRowFiles();
    const input = drawer.querySelector<HTMLInputElement>("input[type='file']")!;
    await user.upload(input, new File(["x".repeat(4096)], "big.txt", { type: "text/plain" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/File is too large/);
    expect(calls.some((c) => c.method === "POST" && c.path.includes("/rows/"))).toBe(false);
  });

  it("opens a video in a lightbox above the drawer; Escape closes only the lightbox", async () => {
    const db = seedDb();
    installFakeApi(db);
    signIn(db);
    db.attachments.push(
      attachment(db, {
        id: "v1",
        filename: "demo.mp4",
        mimeType: "video/mp4",
        kind: "video",
        canStream: true,
        rowId: db.rows[0]!.id,
      }),
    );
    renderApp("/t/ENG");

    const { user, drawer } = await openRowFiles();
    await user.click(await within(drawer).findByRole("button", { name: "demo.mp4" }));
    expect(await screen.findByRole("dialog", { name: "demo.mp4" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "demo.mp4" })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("dialog", { name: /shared files/ })).toBeInTheDocument();
  });
});

describe("useAttachmentList in the issue drawer", () => {
  it("lists and removes the issue's own attachments", async () => {
    const db = seedDb();
    const { calls } = installFakeApi(db);
    signIn(db);
    const issue = db.issues[0]!;
    db.attachments.push(attachment(db, { id: "i1", filename: "spec.pdf", issueId: issue.id }));
    db.attachments.push(
      attachment(db, { id: "r1", filename: "row-only.txt", rowId: db.rows[0]!.id }),
    );
    const user = userEvent.setup();
    renderApp(`/t/ENG/issue/${issue.identifier}`);

    const drawer = await screen.findByRole("dialog", { name: new RegExp(issue.identifier) });
    expect(await within(drawer).findByRole("button", { name: "spec.pdf" })).toBeInTheDocument();
    expect(within(drawer).queryByRole("button", { name: "row-only.txt" })).not.toBeInTheDocument();

    await user.click(within(drawer).getByRole("button", { name: "Remove spec.pdf" }));
    await user.click(
      within(screen.getByRole("dialog", { name: "Remove spec.pdf?" })).getByRole("button", {
        name: "Remove",
      }),
    );
    await waitFor(() =>
      expect(within(drawer).queryByRole("button", { name: "spec.pdf" })).not.toBeInTheDocument(),
    );
    expect(
      calls.some((c) => c.method === "DELETE" && c.path === `/issues/${issue.id}/attachments/i1`),
    ).toBe(true);
  });
});
