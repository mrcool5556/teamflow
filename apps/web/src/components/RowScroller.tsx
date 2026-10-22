import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

type Overflow = { before: number; after: number };

const NONE: Overflow = { before: 0, after: 0 };

/** Columns (children of the first child) that are not fully visible on each side. */
function measure(scroller: HTMLElement): Overflow {
  const track = scroller.firstElementChild;
  if (!track) return NONE;
  const view = scroller.getBoundingClientRect();
  let before = 0;
  let after = 0;
  for (const column of Array.from(track.children)) {
    const box = column.getBoundingClientRect();
    if (box.width === 0) continue;
    if (box.left < view.left - 1) before += 1;
    else if (box.right > view.right + 1) after += 1;
  }
  return { before, after };
}

/**
 * Horizontal scroller for one board row. When columns run past either edge it fades that edge
 * and offers a button that scrolls one column ("3 more →", "←").
 */
export function RowScroller({ children }: { children: ReactNode }) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [overflow, setOverflow] = useState<Overflow>(NONE);

  const update = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const next = measure(scroller);
    setOverflow((prev) => (prev.before === next.before && prev.after === next.after ? prev : next));
  }, []);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    update();
    scroller.addEventListener("scroll", update, { passive: true });
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(update);
      observer.observe(scroller);
      if (scroller.firstElementChild) observer.observe(scroller.firstElementChild);
    }
    return () => {
      scroller.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, [update]);

  const scrollByColumn = (direction: 1 | -1) => {
    const scroller = scrollerRef.current;
    const column = scroller?.firstElementChild?.firstElementChild;
    if (!scroller || !column) return;
    const gap = Number.parseFloat(getComputedStyle(scroller.firstElementChild!).columnGap) || 0;
    scroller.scrollBy({
      left: direction * (column.getBoundingClientRect().width + gap),
      behavior: "smooth",
    });
  };

  return (
    <div
      className={`board-row-scroll-frame${overflow.before ? " has-before" : ""}${overflow.after ? " has-after" : ""}`}
    >
      <div ref={scrollerRef} className="board-row-scroll">
        {children}
      </div>
      {overflow.before > 0 ? (
        <button
          type="button"
          className="board-row-scroll-btn board-row-scroll-btn--before"
          aria-label={`Scroll left (${overflow.before} more)`}
          onClick={() => scrollByColumn(-1)}
        >
          ←
        </button>
      ) : null}
      {overflow.after > 0 ? (
        <button
          type="button"
          className="board-row-scroll-btn board-row-scroll-btn--after"
          aria-label={`Scroll right (${overflow.after} more ${overflow.after === 1 ? "column" : "columns"})`}
          onClick={() => scrollByColumn(1)}
        >
          {overflow.after} more →
        </button>
      ) : null}
    </div>
  );
}
