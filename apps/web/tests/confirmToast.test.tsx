import { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BottomDockProvider, Docked, Toast } from "../src/ui/BottomDock";
import { ConfirmProvider } from "../src/ui/ConfirmDialog";
import { useConfirm, type ConfirmOptions } from "../src/ui/confirmContext";
import { installFakeApi, seedDb, signIn } from "./fakeApi";
import { renderApp } from "./renderApp";

function Asker({
  options,
  onResult,
}: {
  options: ConfirmOptions;
  onResult: (ok: boolean) => void;
}) {
  const confirm = useConfirm();
  return (
    <button type="button" onClick={() => void confirm(options).then(onResult)}>
      Ask
    </button>
  );
}

function renderAsker(options: ConfirmOptions) {
  const onResult = vi.fn();
  render(
    <ConfirmProvider>
      <Asker options={options} onResult={onResult} />
    </ConfirmProvider>,
  );
  return onResult;
}

describe("ConfirmDialog", () => {
  it("resolves true on confirm", async () => {
    const user = userEvent.setup();
    const onResult = renderAsker({
      title: "Archive it?",
      message: "Details",
      confirmLabel: "Archive",
    });
    await user.click(screen.getByRole("button", { name: "Ask" }));

    const dialog = screen.getByRole("dialog", { name: "Archive it?" });
    expect(dialog).toHaveTextContent("Details");
    expect(within(dialog).getByRole("button", { name: "Archive" })).toHaveFocus();
    await user.click(within(dialog).getByRole("button", { name: "Archive" }));

    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ask" })).toHaveFocus();
  });

  it("resolves false on Escape, and focuses Cancel for destructive actions", async () => {
    const user = userEvent.setup();
    const onResult = renderAsker({ title: "Delete it?", confirmLabel: "Delete", danger: true });
    await user.click(screen.getByRole("button", { name: "Ask" }));

    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Delete" })).toHaveClass("danger");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
  });

  it("asks queued questions one at a time", async () => {
    const user = userEvent.setup();
    const results: string[] = [];
    function Twice() {
      const confirm = useConfirm();
      return (
        <button
          type="button"
          onClick={() => {
            void confirm({ title: "First?" }).then((ok) => results.push(`first:${ok}`));
            void confirm({ title: "Second?" }).then((ok) => results.push(`second:${ok}`));
          }}
        >
          Go
        </button>
      );
    }
    render(
      <ConfirmProvider>
        <Twice />
      </ConfirmProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Go" }));
    expect(screen.getByRole("dialog", { name: "First?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByRole("dialog", { name: "Second?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(results).toEqual(["first:true", "second:false"]));
  });

  it("guards comment deletion in the issue drawer", async () => {
    const user = userEvent.setup();
    const db = seedDb();
    const { calls } = installFakeApi(db);
    signIn(db);
    db.comments.push({
      id: "c1",
      issueId: db.issues[0]!.id,
      authorId: db.user.id,
      authorName: db.user.name,
      body: "Looks good",
      createdAt: new Date().toISOString(),
    });
    renderApp(`/t/ENG/issue/${db.issues[0]!.identifier}`);

    await user.click(await screen.findByRole("button", { name: "Delete comment" }));
    const dialog = screen.getByRole("dialog", { name: "Delete this comment?" });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(calls.some((c) => c.method === "DELETE" && c.path.includes("/comments/"))).toBe(false);

    await user.click(screen.getByRole("button", { name: "Delete comment" }));
    await user.click(
      within(screen.getByRole("dialog", { name: "Delete this comment?" })).getByRole("button", {
        name: "Delete",
      }),
    );
    await waitFor(() => expect(screen.queryByText("Looks good")).not.toBeInTheDocument());
    expect(calls.some((c) => c.method === "DELETE" && c.path.includes("/comments/c1"))).toBe(true);
  });
});

describe("bottom dock", () => {
  it("stacks the bar above the toasts instead of overlapping them", () => {
    render(
      <BottomDockProvider>
        <Toast>Deleted ENG-1</Toast>
        <Docked slot="bar">
          <div role="toolbar" aria-label="Bulk issue actions" />
        </Docked>
      </BottomDockProvider>,
    );
    const bar = screen.getByRole("toolbar");
    const toast = screen.getByRole("status");
    const region = screen.getByRole("region", { name: "Notifications" });
    expect(region).toContainElement(toast);
    expect(region).not.toContainElement(bar);
    expect(region.parentElement).toHaveClass("bottom-dock");
    expect(region.parentElement).toContainElement(bar);
    // The bar comes first in the dock column, so it renders above the toast region.
    expect(bar.compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows error toasts with a dismiss button", async () => {
    const user = userEvent.setup();
    function Host() {
      const [error, setError] = useState<string | null>("Save failed");
      return (
        <BottomDockProvider>
          {error ? (
            <Toast tone="error" onDismiss={() => setError(null)}>
              {error}
            </Toast>
          ) : null}
        </BottomDockProvider>
      );
    }
    render(<Host />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Save failed");
    await user.click(within(alert).getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
