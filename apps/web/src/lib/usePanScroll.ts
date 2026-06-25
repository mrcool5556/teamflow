import { useEffect, type RefObject } from "react";

function findPanScrollTarget(target: HTMLElement, root: HTMLElement) {
  const columnBody = target.closest(".column-body");
  if (columnBody instanceof HTMLElement && root.contains(columnBody)) {
    return columnBody;
  }

  const rowScroll = target.closest(".board-row-scroll");
  if (rowScroll instanceof HTMLElement && root.contains(rowScroll)) {
    return rowScroll;
  }

  return root;
}

function shouldStartPan(event: MouseEvent, target: HTMLElement) {
  const isMiddle = event.button === 1;
  const isAltLeft = event.button === 0 && event.altKey;
  if (!isMiddle && !isAltLeft) return false;

  if (
    target.closest(
      "button, input, textarea, select, a, [contenteditable], .assignee-picker-panel, .issue-timer-panel, .priority-picker-panel",
    )
  ) {
    return false;
  }

  if (isAltLeft && target.closest(".issue-card, .column-label, .row-separator-bar")) {
    return false;
  }

  return true;
}

export function usePanScroll(rootRef: RefObject<HTMLElement | null>, enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    if (!rootRef.current) return;
    const panRoot: HTMLElement = rootRef.current;

    let panning = false;
    let scrollEl: HTMLElement | null = null;
    let startX = 0;
    let startY = 0;
    let startScrollLeft = 0;
    let startScrollTop = 0;

    function onMouseDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!shouldStartPan(event, target)) return;

      const panTarget = findPanScrollTarget(target, panRoot);
      scrollEl = panTarget;
      panning = true;
      startX = event.clientX;
      startY = event.clientY;
      startScrollLeft = scrollEl.scrollLeft;
      startScrollTop = scrollEl.scrollTop;
      scrollEl.classList.add("is-pan-scrolling");
      document.body.classList.add("board-pan-active");
      event.preventDefault();
    }

    function onMouseMove(event: MouseEvent) {
      if (!panning || !scrollEl) return;
      scrollEl.scrollLeft = startScrollLeft - (event.clientX - startX);
      scrollEl.scrollTop = startScrollTop - (event.clientY - startY);
    }

    function endPan() {
      if (!panning) return;
      panning = false;
      scrollEl?.classList.remove("is-pan-scrolling");
      scrollEl = null;
      document.body.classList.remove("board-pan-active");
    }

    panRoot.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", endPan);

    return () => {
      panRoot.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", endPan);
      document.body.classList.remove("board-pan-active");
    };
  }, [rootRef, enabled]);
}
