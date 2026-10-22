import { useRef, useState } from "react";
import { Popover } from "../ui/Popover";

const TIPS: [string, string][] = [
  ["Ctrl/Shift+click", "select several cards"],
  ["Drag a selected card", "moves every selected card"],
  ["Alt+drag or middle-click", "pan the board"],
  ["Mouse wheel", "passes through columns and scrolls the board"],
  ["/", "jump to an issue or paste a link"],
  ["Esc", "close the topmost panel"],
];

/** "? Board tips" button next to Add row; the drag and pan hints live in its popover. */
export function BoardTips() {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className="ghost board-tips-trigger"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">?</span> Board tips
      </button>
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        className="board-tips"
        role="dialog"
        label="Board tips"
        maxWidth={480}
      >
        <strong className="board-tips-title">Board tips</strong>
        <dl className="board-tips-list">
          {TIPS.map(([keys, what]) => (
            <div key={keys}>
              <dt>{keys}</dt>
              <dd>{what}</dd>
            </div>
          ))}
        </dl>
      </Popover>
    </>
  );
}
