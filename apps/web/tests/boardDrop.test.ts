import { describe, expect, it } from "vitest";
import { reorderMultipleIssueIds, slotForPointer } from "../src/lib/boardDrop";

const cards = [
  { id: "a", top: 0, bottom: 60 },
  { id: "b", top: 70, bottom: 130 },
  { id: "c", top: 140, bottom: 200 },
];

describe("reorderMultipleIssueIds", () => {
  it("keeps the order when the anchor is the dragged card itself", () => {
    expect(reorderMultipleIssueIds(["a", "b", "c"], ["b"], "b", false)).toEqual(["a", "b", "c"]);
    expect(reorderMultipleIssueIds(["a", "b", "c"], ["b"], "b", true)).toEqual(["a", "b", "c"]);
  });

  it("keeps a dragged block in place when it is dropped on one of its own cards", () => {
    expect(reorderMultipleIssueIds(["a", "b", "c", "d"], ["b", "c"], "c", false)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("moves the block before or after another card", () => {
    expect(reorderMultipleIssueIds(["a", "b", "c"], ["a"], "c", false)).toEqual(["b", "a", "c"]);
    expect(reorderMultipleIssueIds(["a", "b", "c"], ["a"], "c", true)).toEqual(["b", "c", "a"]);
  });

  it("appends when there is no anchor", () => {
    expect(reorderMultipleIssueIds(["a", "b"], ["x"], null, true)).toEqual(["a", "b", "x"]);
  });
});

describe("slotForPointer", () => {
  const none = new Set<string>();

  it("resolves a point in the gap between two cards to between them", () => {
    expect(slotForPointer(cards, none, 65)).toEqual({ anchorIssueId: "b", insertAfter: false });
    expect(slotForPointer(cards, none, 135)).toEqual({ anchorIssueId: "c", insertAfter: false });
  });

  it("goes after the last card only past its middle", () => {
    expect(slotForPointer(cards, none, 169)).toEqual({ anchorIssueId: "c", insertAfter: false });
    expect(slotForPointer(cards, none, 171)).toEqual({ anchorIssueId: "c", insertAfter: true });
  });

  it("never anchors on a card that is being dragged", () => {
    const moving = new Set(["b"]);
    expect(slotForPointer(cards, moving, 90)).toEqual({ anchorIssueId: "c", insertAfter: false });
  });

  it("uses the end of an empty cell", () => {
    expect(slotForPointer([], none, 10)).toEqual({ anchorIssueId: null, insertAfter: true });
  });
});
