import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RowScroller } from "../src/components/RowScroller";

function rect(left: number, width: number) {
  return new DOMRect(left, 0, width, 100);
}

afterEach(() => vi.restoreAllMocks());

describe("RowScroller", () => {
  it("puts the step buttons beside the scroller, never inside the card area", () => {
    // Viewport 0-1000 px; five 300px columns, so two run past the right edge.
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
      this: Element,
    ) {
      if (this.classList.contains("board-row-scroll")) return rect(0, 1000);
      const index = Number((this as HTMLElement).dataset.col ?? -1);
      return index >= 0 ? rect(index * 310, 300) : rect(0, 0);
    });

    render(
      <RowScroller>
        <div className="board-row-columns">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} data-col={i} />
          ))}
        </div>
      </RowScroller>,
    );

    const after = screen.getByRole("button", { name: "Scroll right (2 more columns)" });
    const scroller = document.querySelector(".board-row-scroll")!;
    expect(scroller.contains(after)).toBe(false);
    expect(after.parentElement).toBe(scroller.parentElement);
    expect(after.previousElementSibling).toBe(scroller);
    expect(screen.queryByRole("button", { name: /Scroll left/ })).not.toBeInTheDocument();
  });
});
