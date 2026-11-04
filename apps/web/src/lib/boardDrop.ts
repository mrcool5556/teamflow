/**
 * Where a dragged card (or block of selected cards) lands in a board cell.
 *
 * A slot is "before `anchorIssueId`", or "after `anchorIssueId`" for the last card, or the end of
 * an empty cell (`anchorIssueId: null`). The dragged cards themselves are never anchors: they are
 * lifted out of the column while dragging, so slots are counted among the cards that stay.
 */
export type DropSlot = { anchorIssueId: string | null; insertAfter: boolean };

export type CardBox = { id: string; top: number; bottom: number };

/**
 * The slot for a point at `y` in a cell whose cards are `cards` (any order). The point belongs
 * before the first remaining card whose middle is below it; past every middle it belongs after
 * the last card. Gaps between cards therefore resolve to the nearest boundary, never to
 * "the end of the cell".
 */
export function slotForPointer(
  cards: CardBox[],
  movingIds: ReadonlySet<string>,
  y: number,
): DropSlot {
  const remaining = cards.filter((card) => !movingIds.has(card.id)).sort((a, b) => a.top - b.top);
  if (remaining.length === 0) return { anchorIssueId: null, insertAfter: true };
  for (const card of remaining) {
    if (y < (card.top + card.bottom) / 2) return { anchorIssueId: card.id, insertAfter: false };
  }
  return { anchorIssueId: remaining[remaining.length - 1]!.id, insertAfter: true };
}

/**
 * `orderedIds` with `draggedIds` moved, as a block, to the slot. An anchor that is itself being
 * dragged (dropping a card on its own place) keeps the block where it was. An anchor that is not
 * in the list, or none, puts the block at the end.
 */
export function reorderMultipleIssueIds(
  orderedIds: string[],
  draggedIds: string[],
  anchorId: string | null,
  insertAfter: boolean,
): string[] {
  const dragSet = new Set(draggedIds);
  const next = orderedIds.filter((id) => !dragSet.has(id));
  const block = draggedIds;

  if (!anchorId) return [...next, ...block];

  if (dragSet.has(anchorId)) {
    const original = orderedIds.indexOf(anchorId);
    if (original < 0) return [...next, ...block];
    const stayingBefore = orderedIds.slice(0, original).filter((id) => !dragSet.has(id)).length;
    next.splice(stayingBefore, 0, ...block);
    return next;
  }

  let insertIndex = next.indexOf(anchorId);
  if (insertIndex < 0) return [...next, ...block];
  if (insertAfter) insertIndex += 1;
  next.splice(insertIndex, 0, ...block);
  return next;
}

export function sameOrder(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}
