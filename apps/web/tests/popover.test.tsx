import { useRef, useState, type ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ContextMenu } from "../src/components/ContextMenu";
import { PriorityPicker } from "../src/components/PriorityPicker";
import { Dialog } from "../src/ui/Dialog";
import { Popover } from "../src/ui/Popover";

function Picker({ name, children }: { name: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => setOpen((value) => !value)}>
        {name}
      </button>
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        label={`${name} panel`}
        role="dialog"
        className="test-panel"
        positionedClassName="test-panel--positioned"
      >
        <button type="button">{name} option</button>
        {children}
      </Popover>
    </>
  );
}

const panel = (name: string) => screen.findByRole("dialog", { name: `${name} panel` });
const queryPanel = (name: string) => screen.queryByRole("dialog", { name: `${name} panel` });

describe("Popover", () => {
  it("portals a positioned panel onto the popover layer", async () => {
    const user = userEvent.setup();
    const { container } = render(<Picker name="Color" />);
    await user.click(screen.getByRole("button", { name: "Color" }));

    const el = await panel("Color");
    expect(container).not.toContainElement(el);
    expect(el).toHaveAttribute("data-layer", "popover");
    expect(el.style.position).toBe("fixed");
    expect(el.style.zIndex).toBe("var(--z-popover)");
    await waitFor(() => expect(el).toHaveClass("test-panel", "test-panel--positioned"));
  });

  it("toggles from its trigger and closes on an outside click", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Picker name="Color" />
        <p>Elsewhere</p>
      </>,
    );
    const trigger = screen.getByRole("button", { name: "Color" });

    await user.click(trigger);
    await panel("Color");
    await user.click(trigger);
    expect(queryPanel("Color")).not.toBeInTheDocument();

    await user.click(trigger);
    await user.click(await screen.findByRole("button", { name: "Color option" }));
    expect(queryPanel("Color")).toBeInTheDocument();

    await user.click(screen.getByText("Elsewhere"));
    expect(queryPanel("Color")).not.toBeInTheDocument();
  });

  it("stays open when a press starts inside and ends outside", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Picker name="Color" />
        <p>Elsewhere</p>
      </>,
    );
    await user.click(screen.getByRole("button", { name: "Color" }));
    const option = await screen.findByRole("button", { name: "Color option" });

    fireEvent.pointerDown(option);
    fireEvent.click(screen.getByText("Elsewhere"));
    expect(queryPanel("Color")).toBeInTheDocument();
  });

  it("keeps the parent open while using a nested popover, and Escape closes one at a time", async () => {
    const user = userEvent.setup();
    render(
      <Picker name="Edit">
        <Picker name="Color" />
      </Picker>,
    );
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(await screen.findByRole("button", { name: "Color" }));
    await user.click(await screen.findByRole("button", { name: "Color option" }));
    expect(queryPanel("Edit")).toBeInTheDocument();
    expect(queryPanel("Color")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(queryPanel("Color")).not.toBeInTheDocument();
    expect(queryPanel("Edit")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(queryPanel("Edit")).not.toBeInTheDocument();
  });

  it("returns focus to the trigger when closed with Escape from inside", async () => {
    const user = userEvent.setup();
    render(<Picker name="Color" />);
    const trigger = screen.getByRole("button", { name: "Color" });
    await user.click(trigger);
    (await screen.findByRole("button", { name: "Color option" })).focus();

    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
  });

  it("opens above a dialog, and Escape closes the popover before the dialog", async () => {
    const user = userEvent.setup();
    const closeDialog = vi.fn();
    render(
      <Dialog onClose={closeDialog} backdropClassName="b" label="Issue">
        <Picker name="Color" />
      </Dialog>,
    );
    await user.click(screen.getByRole("button", { name: "Color" }));
    const el = await panel("Color");
    expect(el.style.zIndex).toBe("var(--z-popover)");

    // Focus may enter the popover even though the dialog traps focus.
    const option = screen.getByRole("button", { name: "Color option" });
    option.focus();
    expect(option).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(queryPanel("Color")).not.toBeInTheDocument();
    expect(closeDialog).not.toHaveBeenCalled();

    await user.keyboard("{Escape}");
    expect(closeDialog).toHaveBeenCalledTimes(1);
  });
});

describe("pickers on Popover", () => {
  it("PriorityPicker selects a priority and closes", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<PriorityPicker priority="none" onSelect={onSelect} floatingPanel />);

    await user.click(screen.getByRole("button", { name: "Set priority" }));
    const options = await screen.findAllByRole("button", { name: /urgent/i });
    await user.click(options[0]!);
    expect(onSelect).toHaveBeenCalledWith("urgent");
    expect(screen.queryByText("Priority")).not.toBeInTheDocument();
  });

  it("ContextMenu closes its submenu before itself on Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onMove = vi.fn();
    render(
      <ContextMenu
        x={40}
        y={40}
        onClose={onClose}
        entries={[
          { kind: "item", id: "open", label: "Open", onSelect: () => {} },
          {
            kind: "submenu",
            id: "move",
            label: "Move to",
            entries: [{ kind: "item", id: "done", label: "Done", onSelect: onMove }],
          },
        ]}
      />,
    );

    await user.hover(await screen.findByRole("menuitem", { name: /Move to/ }));
    expect(await screen.findByRole("menu", { name: "Move to" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu", { name: "Move to" })).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ContextMenu runs a submenu item", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onMove = vi.fn();
    render(
      <ContextMenu
        x={40}
        y={40}
        onClose={onClose}
        entries={[
          {
            kind: "submenu",
            id: "move",
            label: "Move to",
            entries: [{ kind: "item", id: "done", label: "Done", onSelect: onMove }],
          },
        ]}
      />,
    );
    await user.hover(await screen.findByRole("menuitem", { name: /Move to/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Done" }));
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
  });
});
