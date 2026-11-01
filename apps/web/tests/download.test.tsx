import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { IssueAttachmentPublic } from "@teamflow/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadAttachmentFile } from "../src/lib/download";
import { installFakeApi, seedDb, signIn, type FakeDb } from "./fakeApi";
import { renderApp } from "./renderApp";

type Clicked = { href: string; download: string };
let clicked: Clicked[];

beforeEach(() => {
  clicked = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push({ href: this.href, download: this.download });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function attachment(
  db: FakeDb,
  overrides: Partial<IssueAttachmentPublic> & Pick<IssueAttachmentPublic, "id" | "filename">,
): IssueAttachmentPublic {
  return {
    issueId: db.issues[0]!.id,
    rowId: null,
    fileId: `file-${overrides.id}`,
    fileRef: `file_${overrides.id}`,
    mimeType: "application/zip",
    sizeBytes: 3 * 1024 ** 3,
    kind: "zip",
    uploaderId: db.user.id,
    uploaderName: db.user.name,
    createdAt: new Date().toISOString(),
    downloadUrl: `/attachments/${overrides.id}/download`,
    canStream: false,
    ...overrides,
  };
}

async function openIssueWithZip(fail?: (method: string, path: string) => string | undefined) {
  const db = seedDb();
  const api = installFakeApi(db, { fail });
  signIn(db);
  db.attachments.push(attachment(db, { id: "z1", filename: "huge.zip" }));
  renderApp(`/t/ENG/issue/${db.issues[0]!.identifier}`);
  const drawer = await screen.findByRole("dialog", { name: /ENG-1/ });
  const name = await within(drawer).findByRole("button", { name: "huge.zip" });
  return { api, drawer, name };
}

describe("attachment downloads", () => {
  it("hands the file to the browser through a tokenized URL, never as a Blob", async () => {
    const db = seedDb();
    const { calls } = installFakeApi(db);
    signIn(db);
    db.attachments.push(attachment(db, { id: "z1", filename: "huge.zip" }));

    await downloadAttachmentFile("z1", "huge.zip");

    expect(clicked).toHaveLength(1);
    expect(clicked[0]!.href).toMatch(/\/api\/attachments\/z1\/download\?token=tok-z1$/);
    expect(clicked[0]!.download).toBe("huge.zip");
    expect(calls.some((c) => c.method === "POST" && c.path === "/attachments/z1/download-token"));
    expect(
      calls.some((c) => c.method === "GET" && c.path.startsWith("/attachments/z1/download")),
    ).toBe(false);
  });

  it("shows Starting… on the clicked file and a toast pointing at the browser's downloads", async () => {
    const user = userEvent.setup();
    const { name } = await openIssueWithZip();

    await user.click(name);

    await waitFor(() => expect(clicked).toHaveLength(1));
    expect(name).toHaveTextContent("Starting…");
    expect(name).toHaveAttribute("aria-busy", "true");
    expect(
      await screen.findByText("Downloading huge.zip — progress is in your browser's downloads"),
    ).toBeInTheDocument();
    // The label goes back once the browser has had time to take over.
    await waitFor(() => expect(name).not.toHaveTextContent("Starting…"), { timeout: 3000 });
  });

  it("shows an error toast with Retry when the download cannot start", async () => {
    const user = userEvent.setup();
    let failing = true;
    const { name } = await openIssueWithZip((method, path) =>
      failing && method === "POST" && path.endsWith("/download-token") ? "Server busy" : undefined,
    );

    await user.click(name);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not download huge.zip: Server busy");
    expect(clicked).toHaveLength(0);
    expect(name).not.toHaveTextContent("Starting…");

    failing = false;
    await user.click(within(alert).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(clicked).toHaveLength(1));
    expect(screen.queryByText(/Could not download/)).not.toBeInTheDocument();
  });

  it("downloads from the video lightbox with the same feedback", async () => {
    const user = userEvent.setup();
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
      }),
    );
    renderApp(`/t/ENG/issue/${db.issues[0]!.identifier}`);
    const drawer = await screen.findByRole("dialog", { name: /ENG-1/ });
    await user.click(await within(drawer).findByRole("button", { name: "demo.mp4" }));
    const lightbox = await screen.findByRole("dialog", { name: "demo.mp4" });

    const button = within(lightbox).getByRole("button", { name: "Download" });
    await user.click(button);
    await waitFor(() => expect(clicked).toHaveLength(1));
    expect(clicked[0]!.href).toContain("/attachments/v1/download?token=");
    expect(within(lightbox).getByRole("button", { name: /Starting…/ })).toBeDisabled();
  });
});

describe("team bundle export", () => {
  it("hands the streamed bundle to the browser with feedback", async () => {
    const user = userEvent.setup();
    const db = seedDb();
    const { calls } = installFakeApi(db);
    signIn(db);
    renderApp("/t/ENG/settings/team");

    await user.click(await screen.findByLabelText(/Include attached files/));
    const button = screen.getByRole("button", { name: "Download bundle" });
    await user.click(button);

    await waitFor(() => expect(clicked).toHaveLength(1));
    expect(clicked[0]!.href).toMatch(
      /\/api\/teams\/[^/]+\/export\?token=tok-export&includeFiles=true$/,
    );
    expect(button).toHaveTextContent("Starting…");
    expect(
      await screen.findByText(
        "Downloading ENG bundle with files — progress is in your browser's downloads",
      ),
    ).toBeInTheDocument();
    // The bundle is never fetched into the page.
    expect(calls.some((c) => c.method === "GET" && c.path.includes("/export"))).toBe(false);
  });
});
