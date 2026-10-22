import { useRef, useState, type ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LayerStack, LayerStackContext, useLayer } from "../src/ui/layerStack";

function Isolated({ children }: { children: ReactNode }) {
  const [stack] = useState(() => new LayerStack());
  return <LayerStackContext.Provider value={stack}>{children}</LayerStackContext.Provider>;
}

function TestModal({ label, onClose }: { label: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayer({ open: true, onEscape: onClose, modal: true, containerRef: ref });
  return (
    <div ref={ref} role="dialog" aria-label={label}>
      <button type="button">{label} first</button>
      <button type="button">{label} last</button>
    </div>
  );
}

function ModalHost({ onClose = () => {} }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {open ? (
        <TestModal
          label="Modal"
          onClose={() => {
            onClose();
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

function PlainLayer({ onEscape }: { onEscape: () => void }) {
  useLayer({ open: true, onEscape });
  return null;
}

describe("LayerStack", () => {
  it("closes only the topmost layer on Escape", async () => {
    const user = userEvent.setup();
    const below = vi.fn();
    const above = vi.fn();
    render(
      <Isolated>
        <PlainLayer onEscape={below} />
        <PlainLayer onEscape={above} />
      </Isolated>,
    );

    await user.keyboard("{Escape}");
    expect(above).toHaveBeenCalledTimes(1);
    expect(below).not.toHaveBeenCalled();
  });

  it("hands Escape to the next layer once the top one closes", async () => {
    const user = userEvent.setup();
    const settingsClose = vi.fn();
    render(
      <Isolated>
        <PlainLayer onEscape={settingsClose} />
        <ModalHost />
      </Isolated>,
    );

    await user.click(screen.getByRole("button", { name: "Open" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(settingsClose).not.toHaveBeenCalled();

    await user.keyboard("{Escape}");
    expect(settingsClose).toHaveBeenCalledTimes(1);
  });

  it("ignores Escape that an input stopped", async () => {
    const user = userEvent.setup();
    const onEscape = vi.fn();
    render(
      <Isolated>
        <PlainLayer onEscape={onEscape} />
        <input aria-label="Rename" onKeyDown={(event) => event.stopPropagation()} />
      </Isolated>,
    );

    await user.click(screen.getByLabelText("Rename"));
    await user.keyboard("{Escape}");
    expect(onEscape).not.toHaveBeenCalled();
  });

  it("moves focus into a modal, traps Tab and restores focus to the trigger", async () => {
    const user = userEvent.setup();
    render(
      <Isolated>
        <ModalHost />
        <button type="button">Outside</button>
      </Isolated>,
    );

    const trigger = screen.getByRole("button", { name: "Open" });
    await user.click(trigger);
    const first = screen.getByRole("button", { name: "Modal first" });
    const last = screen.getByRole("button", { name: "Modal last" });
    expect(first).toHaveFocus();

    await user.tab();
    expect(last).toHaveFocus();
    await user.tab();
    expect(first).toHaveFocus();
    await user.tab({ shift: true });
    expect(last).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
  });

  it("pulls focus back when it escapes the modal", async () => {
    const user = userEvent.setup();
    render(
      <Isolated>
        <ModalHost />
        <button type="button">Outside</button>
      </Isolated>,
    );

    await user.click(screen.getByRole("button", { name: "Open" }));
    screen.getByRole("button", { name: "Outside" }).focus();
    expect(screen.getByRole("button", { name: "Modal first" })).toHaveFocus();
  });

  it("does not trap focus for non-modal layers", async () => {
    const user = userEvent.setup();
    render(
      <Isolated>
        <PlainLayer onEscape={() => {}} />
        <button type="button">A</button>
        <button type="button">B</button>
      </Isolated>,
    );

    await user.tab();
    expect(screen.getByRole("button", { name: "A" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "B" })).toHaveFocus();
  });
});
