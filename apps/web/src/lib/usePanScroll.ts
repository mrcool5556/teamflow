import { useEffect, type RefObject } from "react";

/** Plain-drag pans wait for this much movement, so a click on empty space stays a click. */
const PLAIN_PAN_THRESHOLD_PX = 4;

/** Controls and text the pointer must stay free to use: never start a pan on these. */
const INTERACTIVE =
  "button, input, textarea, select, a, label, [contenteditable], [role='button'], " +
  ".assignee-picker-panel, .priority-picker-panel, [data-layer]";

/** Board pieces with their own drag (cards, column and row handles) or their own clicks. */
const DRAGGABLE =
  ".issue-card, .column-label, .row-separator-bar, .row-drag-handle, .column-drag-handle, " +
  ".bulk-action-bar";

/**
 * How a mouse press on the board starts panning, if at all.
 * - "immediate": middle button anywhere, or Alt + left button off cards and handles.
 * - "threshold": a plain left press on empty board space (row background, gaps between
 *   columns, empty column space); panning starts once the pointer has moved a few pixels.
 */
export type PanMode = "immediate" | "threshold";

export function panModeFor(
  event: Pick<MouseEvent, "button" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey">,
  target: Element,
): PanMode | null {
  if (target.closest(INTERACTIVE)) return null;
  if (event.button === 1) return "immediate";
  if (event.button !== 0) return null;
  if (target.closest(DRAGGABLE)) return null;
  if (event.altKey) return "immediate";
  // Modifier clicks belong to card selection.
  if (event.ctrlKey || event.metaKey || event.shiftKey) return null;
  return "threshold";
}

function findPanScrollTarget(target: Element, root: HTMLElement, mode: PanMode) {
  // Alt and middle-click inside a column scroll that column; a plain drag moves the row.
  if (mode === "immediate") {
    const columnBody = target.closest(".column-body");
    if (columnBody instanceof HTMLElement && root.contains(columnBody)) return columnBody;
  }

  const rowScroll = target.closest(".board-row-scroll");
  if (rowScroll instanceof HTMLElement && root.contains(rowScroll)) return rowScroll;

  return root;
}

export function usePanScroll(rootRef: RefObject<HTMLElement | null>, enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    if (!rootRef.current) return;
    const panRoot: HTMLElement = rootRef.current;

    /** "pending": pressed on empty space, waiting for the threshold. */
    let state: "idle" | "pending" | "panning" = "idle";
    let scrollEl: HTMLElement | null = null;
    let startX = 0;
    let startY = 0;
    let startScrollLeft = 0;
    let startScrollTop = 0;
    let thresholdPan = false;

    function beginPan() {
      state = "panning";
      scrollEl?.classList.add("is-pan-scrolling");
      document.body.classList.add("board-pan-active");
    }

    function onMouseDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const mode = panModeFor(event, target);
      if (!mode) return;

      scrollEl = findPanScrollTarget(target, panRoot, mode);
      startX = event.clientX;
      startY = event.clientY;
      startScrollLeft = scrollEl.scrollLeft;
      startScrollTop = scrollEl.scrollTop;
      thresholdPan = mode === "threshold";
      if (thresholdPan) {
        // No preventDefault: a click on empty space still moves focus (blurs a search box).
        state = "pending";
        return;
      }
      beginPan();
      event.preventDefault();
    }

    function onMouseMove(event: MouseEvent) {
      if (state === "idle" || !scrollEl) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (state === "pending") {
        if (Math.hypot(dx, dy) < PLAIN_PAN_THRESHOLD_PX) return;
        beginPan();
        window.getSelection()?.removeAllRanges();
      }
      scrollEl.scrollLeft = startScrollLeft - dx;
      scrollEl.scrollTop = startScrollTop - dy;
    }

    /** While a plain press may become a pan, it must not start a text selection instead. */
    function onSelectStart(event: Event) {
      if (state !== "idle") event.preventDefault();
    }

    /** The click that ends a plain-drag pan is not a click on empty space (keeps the selection). */
    function swallowNextClick(event: MouseEvent) {
      event.stopPropagation();
      event.preventDefault();
    }

    function endPan() {
      if (state === "idle") return;
      const panned = state === "panning";
      state = "idle";
      scrollEl?.classList.remove("is-pan-scrolling");
      scrollEl = null;
      document.body.classList.remove("board-pan-active");
      if (panned && thresholdPan) {
        window.addEventListener("click", swallowNextClick, { capture: true, once: true });
        // A mouseup outside the board produces no click; do not eat a later one.
        window.setTimeout(
          () => window.removeEventListener("click", swallowNextClick, { capture: true }),
          0,
        );
      }
    }

    panRoot.addEventListener("mousedown", onMouseDown);
    document.addEventListener("selectstart", onSelectStart);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", endPan);

    return () => {
      panRoot.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("selectstart", onSelectStart);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", endPan);
      window.removeEventListener("click", swallowNextClick, { capture: true });
      document.body.classList.remove("board-pan-active");
    };
  }, [rootRef, enabled]);
}
