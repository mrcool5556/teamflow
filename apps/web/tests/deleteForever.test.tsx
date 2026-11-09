import { configure, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TeamFilePublic } from "@teamflow/core";
import { describe, expect, it } from "vitest";
import { MIB, makeStorage } from "./adminFixtures";
import { installFakeApi, seedDb, signIn } from "./fakeApi";
import { renderApp } from "./renderApp";

configure({ asyncUtilTimeout: 3000 });

const trashed: TeamFilePublic = {
  fileId: "00000000-0000-4000-8000-0000000000f1",
  fileRef: "file_old00001",
  filename: "old-build.zip",
  mimeType: "application/zip",
  sizeBytes: 120 * MIB,
  kind: "zip",
  uploaderId: "user-1",
  uploaderName: "Ada",
  createdAt: "2026-11-01T10:00:00.000Z",
  deletedAt: "2026-11-05T10:00:00.000Z",
  purgeAt: "2026-11-12T10:00:00.000Z",
  linkCount: 0,
  references: [],
};

describe("delete forever from the Files trash", () => {
  it("confirms with the space it frees, deletes, and refreshes the meter", async () => {
    const user = userEvent.setup();
    const db = seedDb();
    let inTrash = true;
    const { calls } = installFakeApi(db, {
      extraRoutes: [
        [
          "GET",
          /^\/teams\/([^/]+)\/files$/,
          ({ query }) =>
            query.get("trash") === "1"
              ? { files: inTrash ? [trashed] : [], totalBytes: 0, fileCount: 0, trash: true }
              : { files: [], totalBytes: 0, fileCount: 0, trash: false },
        ],
        [
          "DELETE",
          /^\/teams\/([^/]+)\/files\/([^/]+)\/forever$/,
          () => {
            inTrash = false;
            return { fileId: trashed.fileId, freedBytes: trashed.sizeBytes };
          },
        ],
        ["GET", /^\/teams\/([^/]+)\/storage$/, () => ({ storage: makeStorage() })],
      ],
    });
    signIn(db);
    renderApp("/t/ENG");

    const topbar = await screen.findByRole("banner");
    await user.click(await within(topbar).findByRole("button", { name: "Files" }));
    await user.click(await screen.findByRole("button", { name: "Trash" }));
    await user.click(await screen.findByRole("button", { name: "Delete forever" }));

    const confirm = await screen.findByRole("dialog", { name: /Delete .* forever\?/ });
    expect(confirm).toHaveTextContent("This can't be undone. It frees 120 MB in this Flow");
    await user.click(within(confirm).getByRole("button", { name: "Delete forever" }));

    await waitFor(() =>
      expect(
        calls.some((c) => c.method === "DELETE" && c.path.endsWith(`/${trashed.fileId}/forever`)),
      ).toBe(true),
    );
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Delete forever" })).not.toBeInTheDocument(),
    );
    const storageCalls = calls.filter((c) => c.path.endsWith("/storage"));
    expect(storageCalls.length).toBeGreaterThan(1);
  });
});
