import { fireEvent, render } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { panModeFor, usePanScroll } from "../src/lib/usePanScroll";

/** A trimmed board: one scrolling row with a column, a card, a header and a few controls. */
function Board({ onClick }: { onClick?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  usePanScroll(ref);
  return (
    <div ref={ref} className="board-scroll" data-testid="root" onClick={onClick}>
      <div className="board-row">
        <div className="row-separator-bar" data-testid="row-bar">
          <button type="button" className="row-drag-handle" data-testid="row-handle" />
        </div>
        <div className="board-row-scroll" data-testid="row-scroll">
          <div className="board-row-columns" data-testid="gap">
            <div className="board-column-stack">
              <div className="column-label" data-testid="column-label">
                <button type="button" className="column-drag-handle" data-testid="column-handle" />
              </div>
              <section className="column cell">
                <div className="column-body" data-testid="column-body">
                  <article className="issue-card" data-testid="card">
                    <h3 data-testid="card-title">Card</h3>
                  </article>
                  <p className="column-empty" data-testid="empty-text">
                    No issues here yet
                  </p>
                </div>
                <button type="button" className="add-card-btn" data-testid="add">
                  + Add issue
                </button>
              </section>
            </div>
          </div>
        </div>
        <input aria-label="Search row" data-testid="search" />
      </div>
    </div>
  );
}

const left = { button: 0, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false };

describe("panModeFor", () => {
  function target(testId: string) {
    render(<Board />);
    return document.querySelector(`[data-testid="${testId}"]`)!;
  }

  it.each(["row-scroll", "gap", "column-body", "empty-text", "root"])(
    "starts a plain-drag pan on empty space (%s)",
    (testId) => {
      expect(panModeFor(left, target(testId))).toBe("threshold");
    },
  );

  it.each([
    "card",
    "card-title",
    "add",
    "search",
    "row-handle",
    "row-bar",
    "column-handle",
    "column-label",
  ])("never starts a plain-drag pan on %s", (testId) => {
    expect(panModeFor(left, target(testId))).toBeNull();
  });

  it("keeps Alt+drag (off cards) and middle-click (anywhere but controls) immediate", () => {
    expect(panModeFor({ ...left, altKey: true }, target("column-body"))).toBe("immediate");
    expect(panModeFor({ ...left, altKey: true }, target("card"))).toBeNull();
    expect(panModeFor({ ...left, button: 1 }, target("card"))).toBe("immediate");
    expect(panModeFor({ ...left, button: 1 }, target("search"))).toBeNull();
  });

  it("leaves modifier clicks and other buttons alone", () => {
    expect(panModeFor({ ...left, ctrlKey: true }, target("gap"))).toBeNull();
    expect(panModeFor({ ...left, shiftKey: true }, target("gap"))).toBeNull();
    expect(panModeFor({ ...left, button: 2 }, target("gap"))).toBeNull();
  });
});

describe("usePanScroll", () => {
  function rowScroll() {
    return document.querySelector<HTMLElement>('[data-testid="row-scroll"]')!;
  }

  it("pans the row sideways once a plain drag passes the threshold", () => {
    render(<Board />);
    const row = rowScroll();
    row.scrollLeft = 200;
    const gap = document.querySelector('[data-testid="gap"]')!;

    fireEvent.mouseDown(gap, { button: 0, clientX: 500, clientY: 100 });
    fireEvent.mouseMove(window, { clientX: 498, clientY: 100 });
    expect(row.scrollLeft).toBe(200);
    expect(document.body).not.toHaveClass("board-pan-active");

    fireEvent.mouseMove(window, { clientX: 440, clientY: 100 });
    expect(row.scrollLeft).toBe(260);
    expect(document.body).toHaveClass("board-pan-active");

    fireEvent.mouseUp(window);
    expect(document.body).not.toHaveClass("board-pan-active");
  });

  it("does not take the press away from a click on empty space", () => {
    const onClick = vi.fn();
    render(<Board onClick={onClick} />);
    const gap = document.querySelector('[data-testid="gap"]')!;

    // Not prevented, so focus still moves (a search box blurs) and the click lands.
    expect(fireEvent.mouseDown(gap, { button: 0, clientX: 10, clientY: 10 })).toBe(true);
    fireEvent.mouseUp(window);
    fireEvent.click(gap);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("swallows the click that ends a pan, so it does not count as a click on empty space", () => {
    const onClick = vi.fn();
    render(<Board onClick={onClick} />);
    const gap = document.querySelector('[data-testid="gap"]')!;

    fireEvent.mouseDown(gap, { button: 0, clientX: 300, clientY: 10 });
    fireEvent.mouseMove(window, { clientX: 200, clientY: 10 });
    fireEvent.mouseUp(window);
    fireEvent.click(gap);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("leaves text selection in inputs and presses on cards alone", () => {
    render(<Board />);
    const row = rowScroll();
    row.scrollLeft = 100;
    const search = document.querySelector('[data-testid="search"]')!;
    const card = document.querySelector('[data-testid="card"]')!;

    expect(fireEvent.mouseDown(search, { button: 0, clientX: 10, clientY: 10 })).toBe(true);
    fireEvent.mouseMove(window, { clientX: 80, clientY: 10 });
    expect(fireEvent(search, new Event("selectstart", { bubbles: true, cancelable: true }))).toBe(
      true,
    );
    fireEvent.mouseUp(window);

    fireEvent.mouseDown(card, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.mouseMove(window, { clientX: 80, clientY: 10 });
    fireEvent.mouseUp(window);

    expect(row.scrollLeft).toBe(100);
  });

  it("keeps Alt+drag panning straight away", () => {
    render(<Board />);
    const row = rowScroll();
    row.scrollLeft = 50;
    const gap = document.querySelector('[data-testid="gap"]')!;

    expect(fireEvent.mouseDown(gap, { button: 0, altKey: true, clientX: 100, clientY: 0 })).toBe(
      false,
    );
    fireEvent.mouseMove(window, { clientX: 98, clientY: 0 });
    expect(row.scrollLeft).toBe(52);
    fireEvent.mouseUp(window);
  });
});
