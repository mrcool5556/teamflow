import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Dialog, Drawer } from "../src/ui/Dialog";
import { DialogTitle } from "../src/ui/DialogTitle";
import { installFakeApi, seedDb, signIn } from "./fakeApi";
import { renderApp } from "./renderApp";

function backdropOf(dialog: HTMLElement) {
  return dialog.parentElement!;
}

describe("Dialog", () => {
  it("is a modal dialog named by its title", () => {
    render(
      <Dialog onClose={() => {}} backdropClassName="about-backdrop" className="about-dialog">
        <DialogTitle>About</DialogTitle>
        <button type="button">Close</button>
      </Dialog>,
    );
    const dialog = screen.getByRole("dialog", { name: "About" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveClass("about-dialog");
    expect(backdropOf(dialog)).toHaveClass("about-backdrop");
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
  });

  it("renders nothing while closed", () => {
    render(
      <Dialog open={false} onClose={() => {}} backdropClassName="b" label="Hidden">
        content
      </Dialog>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes on Escape and on a backdrop click", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Dialog onClose={onClose} backdropClassName="b" label="Quick add">
        <input aria-label="Name" />
      </Dialog>,
    );

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(backdropOf(screen.getByRole("dialog")));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("ignores clicks inside the panel and drags that end on the backdrop", () => {
    const onClose = vi.fn();
    render(
      <Dialog onClose={onClose} backdropClassName="b" label="Quick add">
        <input aria-label="Name" />
      </Dialog>,
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.click(screen.getByLabelText("Name"));
    fireEvent.pointerDown(screen.getByLabelText("Name"));
    fireEvent.click(backdropOf(dialog));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("can keep the backdrop and Escape from closing it", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Dialog
        onClose={onClose}
        backdropClassName="b"
        label="Confirm"
        closeOnBackdrop={false}
        closeOnEscape={false}
      >
        <button type="button">OK</button>
      </Dialog>,
    );
    await user.keyboard("{Escape}");
    await user.click(backdropOf(screen.getByRole("dialog")));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not pass clicks on to the component that opened it", async () => {
    const user = userEvent.setup();
    const parentClick = vi.fn();
    render(
      <div onClick={parentClick}>
        <Dialog onClose={() => {}} backdropClassName="b" label="Lightbox">
          <button type="button">Download</button>
        </Dialog>
      </div>,
    );
    await user.click(screen.getByRole("button", { name: "Download" }));
    await user.click(backdropOf(screen.getByRole("dialog")));
    expect(parentClick).not.toHaveBeenCalled();
  });
});

describe("Drawer", () => {
  it("renders an aside.drawer inside the drawer backdrop", () => {
    render(
      <Drawer onClose={() => {}} className="issue-drawer">
        <DialogTitle>Files</DialogTitle>
      </Drawer>,
    );
    const drawer = screen.getByRole("dialog", { name: "Files" });
    expect(drawer.tagName).toBe("ASIDE");
    expect(drawer).toHaveClass("drawer", "issue-drawer");
    expect(backdropOf(drawer)).toHaveClass("drawer-backdrop");
  });

  it("closes the team Files drawer on Escape and returns focus to the Files button", async () => {
    const user = userEvent.setup();
    const db = seedDb();
    installFakeApi(db);
    signIn(db);
    renderApp("/t/ENG");

    const topbar = await screen.findByRole("banner");
    const filesButton = await within(topbar).findByRole("button", { name: "Files" });
    await user.click(filesButton);
    expect(await screen.findByRole("dialog", { name: "File directory" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "File directory" })).not.toBeInTheDocument(),
    );
    expect(within(topbar).getByRole("button", { name: "Files" })).toHaveFocus();
  });

  it("closes the issue drawer on Escape", async () => {
    const user = userEvent.setup();
    const db = seedDb();
    installFakeApi(db);
    signIn(db);
    const { path } = renderApp("/t/ENG/issue/ENG-1");

    expect(await screen.findByRole("dialog", { name: /ENG-1/ })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(path()).toBe("/t/ENG"));
  });
});
