import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { installFakeApi, makeIssue, seedDb, signIn } from "./fakeApi";
import { renderApp } from "./renderApp";

/*
 * jsdom has no layout, so these tests give the board one: columns are 300 px wide with a 10 px
 * gap, rows are 500 px apart, and cards are 60 px tall with a 10 px gap, starting 10 px into the
 * cell. A card lifted out of its column (`issue-card--lifted`) takes no space. dnd-kit's drag
 * overlay is a fixed element placed from its inline style (its translate is ignored, as in
 * dnd-kit's own measuring).
 */
const COLUMN = { width: 300, gap: 10 };
const ROW_PITCH = 500;
const CARD = { height: 60, gap: 10, inset: 10 };

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function cellOrigin(cell: Element) {
  const rowEl = cell.closest("[data-row-id]")!;
  const rowIndex = Array.from(document.querySelectorAll(".board-row[data-row-id]")).indexOf(rowEl);
  const colIndex = Array.from(rowEl.querySelectorAll("section.cell")).indexOf(cell);
  return { left: colIndex * (COLUMN.width + COLUMN.gap), top: rowIndex * ROW_PITCH + 100 };
}

function fakeLayout(this: Element): DOMRect {
  const el = this as HTMLElement;
  // dnd-kit measures the overlay through its only child.
  const overlay = [el, el.parentElement].find((node) => node?.style.position === "fixed");
  if (overlay) {
    return rect(
      parseFloat(overlay.style.left),
      parseFloat(overlay.style.top),
      parseFloat(overlay.style.width),
      parseFloat(overlay.style.height),
    );
  }
  if (el.matches("section.cell")) {
    const { left, top } = cellOrigin(el);
    return rect(left, top, COLUMN.width, 400);
  }
  if (el.matches("article.issue-card[data-issue-id]")) {
    const cell = el.closest("section.cell");
    if (!cell || el.classList.contains("issue-card--lifted")) return rect(0, 0, 0, 0);
    const placed = Array.from(
      cell.querySelectorAll("article.issue-card[data-issue-id]:not(.issue-card--lifted)"),
    );
    const { left, top } = cellOrigin(cell);
    return rect(
      left,
      top + CARD.inset + placed.indexOf(el) * (CARD.height + CARD.gap),
      COLUMN.width,
      CARD.height,
    );
  }
  return rect(0, 0, 0, 0);
}

function card(identifier: string) {
  return document.querySelector<HTMLElement>(
    `article.issue-card[data-issue-id="${identifier.toLowerCase().replace("-", "-issue-")}"]`,
  )!;
}

function centre(el: Element) {
  const box = el.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

const pointer = { isPrimary: true, button: 0, pointerId: 1 };

/** Press on `identifier`, move by (dx, dy) in steps, and optionally release. */
async function drag(identifier: string, dx: number, dy: number, { release = true } = {}) {
  const start = centre(card(identifier));
  fireEvent.pointerDown(card(identifier), { ...pointer, clientX: start.x, clientY: start.y });
  // Past the 6 px activation distance first, then to the target.
  await act(async () => {
    fireEvent.pointerMove(document, { ...pointer, clientX: start.x + 8, clientY: start.y });
  });
  await act(async () => {
    fireEvent.pointerMove(document, { ...pointer, clientX: start.x + dx, clientY: start.y + dy });
  });
  if (release) {
    await act(async () => {
      fireEvent.pointerUp(document, { ...pointer, clientX: start.x + dx, clientY: start.y + dy });
    });
  }
}

function todoOrder() {
  const cell = card("ENG-1").closest("section.cell")!;
  return Array.from(cell.querySelectorAll<HTMLElement>("article.issue-card[data-issue-id]")).map(
    (el) => within(el).getByRole("button", { name: /ENG issue/ }).textContent,
  );
}

async function renderThreeCardColumn() {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(fakeLayout);
  const db = seedDb();
  // ENG row 1, Todo: ENG-1, ENG-2, ENG-4 (boardSort follows the number).
  db.issues.push(makeIssue(db.teams[0]!, 4, db.rows[0]!.id, db.statuses[0]!));
  const { calls } = installFakeApi(db);
  signIn(db);
  renderApp("/t/ENG");
  await screen.findByText("ENG issue 4");
  expect(todoOrder()).toEqual(["ENG issue 1", "ENG issue 2", "ENG issue 4"]);
  const patchCount = () => calls.filter((c) => c.method === "PATCH").length;
  return { calls, patchCount };
}

// jsdom has no PointerEvent; dnd-kit's pointer sensor needs isPrimary, button and coordinates.
const hadPointerEvent = "PointerEvent" in window;
beforeAll(() => {
  if (hadPointerEvent) return;
  class FakePointerEvent extends MouseEvent {
    readonly isPrimary: boolean;
    readonly pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.isPrimary = init.isPrimary ?? true;
      this.pointerId = init.pointerId ?? 1;
    }
  }
  (window as { PointerEvent?: unknown }).PointerEvent = FakePointerEvent;
});
afterAll(() => {
  if (!hadPointerEvent) delete (window as { PointerEvent?: unknown }).PointerEvent;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("dropping a card where it already is", () => {
  it.each([
    ["on itself", 0],
    ["on the gap just above itself", -8],
    ["on the gap just below itself", 8],
  ])("keeps the order and sends nothing when dropped %s", async (_label, dy) => {
    const { patchCount } = await renderThreeCardColumn();

    await drag("ENG-2", 0, dy);

    // Give any (wrong) reorder a chance to land before asserting it did not.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(todoOrder()).toEqual(["ENG issue 1", "ENG issue 2", "ENG issue 4"]);
    expect(patchCount()).toBe(0);
  });

  it("still moves the card when it is dropped past its neighbour", async () => {
    const { calls } = await renderThreeCardColumn();

    // Two card pitches down: the held card's top edge is past ENG-4's middle.
    await drag("ENG-2", 0, 2 * (CARD.height + CARD.gap));

    await waitFor(() => expect(todoOrder()).toEqual(["ENG issue 1", "ENG issue 4", "ENG issue 2"]));
    const sorts = Object.fromEntries(
      calls
        .filter((c) => c.method === "PATCH")
        .map((c) => [c.path.split("/").pop(), (c.body as { boardSort: number }).boardSort]),
    );
    expect(sorts).toEqual({ "eng-issue-1": 0, "eng-issue-4": 1, "eng-issue-2": 2 });
  });
});
