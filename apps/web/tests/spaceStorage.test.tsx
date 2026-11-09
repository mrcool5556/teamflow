import { configure, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GIB, type SpaceStoragePublic } from "@teamflow/core";
import { TeamflowApiError } from "@teamflow/api-client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MIB, makeStorage } from "./adminFixtures";
import { installFakeApi, seedDb, signIn, type FakeRoute } from "./fakeApi";
import { renderApp } from "./renderApp";
import { client } from "../src/api";
import { storageNotice, uploadRefusal } from "../src/lib/spaceStorage";

afterEach(() => {
  vi.restoreAllMocks();
});

configure({ asyncUtilTimeout: 3000 });

const full = makeStorage({
  usedBytes: GIB,
  remainingBytes: 0,
  state: "full",
  breakdown: { issueFilesBytes: GIB, rowFilesBytes: 0, trashBytes: 0, uploadingBytes: 0 },
});

describe("storage messages", () => {
  it("say nothing with room, how much is left from 80%, and block when full", () => {
    expect(storageNotice(makeStorage())).toBeNull();
    expect(storageNotice(makeStorage({ capBytes: null, remainingBytes: null }))).toBeNull();
    const warn = storageNotice(
      makeStorage({ usedBytes: 900 * MIB, remainingBytes: 124 * MIB, state: "warn" }),
    );
    expect(warn).toMatchObject({
      tone: "warn",
      blocked: false,
      text: "124 MB left of this Flow's 1.00 GB.",
    });
    expect(storageNotice(full)).toMatchObject({ tone: "full", blocked: true });
    expect(storageNotice(full)?.text).toMatch(/This Flow is full: 1.00 GB of 1.00 GB/);
    expect(storageNotice(makeStorage({ diskLow: true, capBytes: null }))).toMatchObject({
      blocked: true,
      text: expect.stringMatching(/almost out of disk space/),
    });
  });

  it("refuse a file that does not fit before it is sent", () => {
    const room = makeStorage({ usedBytes: 836 * MIB, remainingBytes: 188 * MIB, state: "warn" });
    expect(uploadRefusal(room, { name: "small.png", size: 10 * MIB })).toBeNull();
    expect(uploadRefusal(room, { name: "poster.psd", size: 340 * MIB })).toBe(
      "poster.psd (340 MB) won't fit: this Flow has 188 MB left of its 1.00 GB. Remove files or ask a server admin for more.",
    );
    expect(uploadRefusal(full, { name: "a.txt", size: 1 })).toMatch(/This Flow is full/);
    expect(uploadRefusal(undefined, { name: "a.txt", size: 1 })).toBeNull();
    expect(
      uploadRefusal(makeStorage({ capBytes: null, remainingBytes: null }), {
        name: "x",
        size: 9 * GIB,
      }),
    ).toBeNull();
  });
});

function storageRoute(get: () => SpaceStoragePublic): FakeRoute {
  return ["GET", /^\/teams\/([^/]+)\/storage$/, () => ({ storage: get() })];
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

describe("Files drawer meter", () => {
  it("shows usage against the cap and that trashed files still count", async () => {
    const user = userEvent.setup();
    const db = seedDb();
    const storage = makeStorage({
      usedBytes: 812 * MIB,
      remainingBytes: GIB - 812 * MIB,
      state: "warn",
      breakdown: {
        issueFilesBytes: 692 * MIB,
        rowFilesBytes: 0,
        trashBytes: 120 * MIB,
        uploadingBytes: 0,
      },
    });
    installFakeApi(db, { extraRoutes: [storageRoute(() => storage)] });
    signIn(db);
    renderApp("/t/ENG");

    const topbar = await screen.findByRole("banner");
    await user.click(await within(topbar).findByRole("button", { name: "Files" }));
    const meter = await screen.findByRole("region", { name: "Storage" });
    expect(within(meter).getByText("812 MB of 1.00 GB · 79%")).toBeInTheDocument();
    expect(within(meter).getByRole("meter", { name: "Storage used" })).toBeInTheDocument();
    expect(within(meter).getByText(/212 MB left in this free Flow/)).toBeInTheDocument();
    expect(within(meter).getByText(/trash holds 120 MB, which counts/)).toBeInTheDocument();
  });

  it("shows bytes used without a bar for a space with no limit", async () => {
    const user = userEvent.setup();
    const db = seedDb();
    installFakeApi(db, {
      extraRoutes: [
        storageRoute(() =>
          makeStorage({
            spaceType: "admin",
            capBytes: null,
            remainingBytes: null,
            usedBytes: 3 * GIB,
          }),
        ),
      ],
    });
    signIn(db);
    renderApp("/t/ENG");
    const topbar = await screen.findByRole("banner");
    await user.click(await within(topbar).findByRole("button", { name: "Files" }));
    const meter = await screen.findByRole("region", { name: "Storage" });
    expect(within(meter).getByText("3.00 GB used · no limit")).toBeInTheDocument();
    expect(within(meter).queryByRole("meter")).not.toBeInTheDocument();
  });
});

describe("uploads when the space is full", () => {
  it("pauses the row upload zone with a clear message; linking still works", async () => {
    const db = seedDb();
    installFakeApi(db, { extraRoutes: [storageRoute(() => full)] });
    signIn(db);
    renderApp("/t/ENG");
    const { drawer } = await openRowFiles();
    expect(await within(drawer).findByRole("alert")).toHaveTextContent(/This Flow is full/);
    expect(within(drawer).getByRole("button", { name: "Choose file" })).toBeDisabled();
  });

  it("shows the same notice in the issue drawer", async () => {
    const db = seedDb();
    installFakeApi(db, { extraRoutes: [storageRoute(() => full)] });
    signIn(db);
    renderApp("/t/ENG/issue/ENG-1");
    expect(await screen.findByText(/This Flow is full: 1.00 GB of 1.00 GB/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose file" })).toBeDisabled();
  });

  it("refuses a file bigger than what is left without sending it", async () => {
    const db = seedDb();
    const { calls } = installFakeApi(db, {
      extraRoutes: [
        storageRoute(() =>
          makeStorage({ capBytes: 1000, usedBytes: 900, remainingBytes: 100, state: "warn" }),
        ),
      ],
    });
    signIn(db);
    renderApp("/t/ENG");
    const { user, drawer } = await openRowFiles();
    expect(await within(drawer).findByRole("status")).toHaveTextContent("100 B left");
    const input = drawer.querySelector<HTMLInputElement>("input[type='file']")!;
    await user.upload(input, new File(["x".repeat(500)], "notes.txt", { type: "text/plain" }));

    expect(
      await screen.findByText(/notes.txt \(500 B\) won't fit: this Flow has 100 B left/),
    ).toBeInTheDocument();
    expect(calls.some((c) => c.method === "POST" && c.path.includes("/attachments"))).toBe(false);
  });

  it("shows the server's refusal and refreshes the meter when the space filled meanwhile", async () => {
    const db = seedDb();
    let current = makeStorage();
    const { calls } = installFakeApi(db, { extraRoutes: [storageRoute(() => current)] });
    // Uploads go through XMLHttpRequest; stand in for the server's 413.
    vi.spyOn(client, "uploadRowFile").mockImplementation(async () => {
      current = full;
      throw new TeamflowApiError(
        "notes.txt (500 B) won't fit: this space has 0 B left of its 1.00 GB.",
        413,
        "space_storage_full",
        { remainingBytes: 0 },
      );
    });
    signIn(db);
    renderApp("/t/ENG");
    const { user, drawer } = await openRowFiles();
    const input = drawer.querySelector<HTMLInputElement>("input[type='file']")!;
    await user.upload(input, new File(["x".repeat(500)], "notes.txt", { type: "text/plain" }));

    expect(await screen.findByText(/won't fit: this space has 0 B left/)).toBeInTheDocument();
    await waitFor(() =>
      expect(within(drawer).getByRole("button", { name: "Choose file" })).toBeDisabled(),
    );
    expect(calls.filter((c) => c.path.endsWith("/storage")).length).toBeGreaterThan(1);
  });
});
