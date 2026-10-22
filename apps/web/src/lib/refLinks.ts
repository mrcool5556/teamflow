import type { IssuePublic } from "@teamflow/core";
import { parseRefFromShareUrl } from "@teamflow/core";

/**
 * Share links keep the `/?ref=` form: descriptions and comments detect refs in that shape, and
 * the router redirects it to the issue route (or hands row/column refs to the board).
 */
export function buildRefShareUrl(ref: string) {
  const url = new URL("/", window.location.origin);
  url.searchParams.set("ref", ref.trim());
  return url.toString();
}

export function normalizeRefInput(raw: string) {
  return parseRefFromShareUrl(raw) ?? raw.trim();
}

export function issueMatchesBoardSearch(issue: IssuePublic, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = `${issue.identifier} ${issue.title} ${issue.description ?? ""}`.toLowerCase();
  return hay.includes(q);
}

type ScrollRefOptions = {
  delayMs?: number;
};

function scrollIntoBoardView(
  target: Element | null,
  options: ScrollIntoViewOptions & ScrollRefOptions = {},
) {
  if (!target) return;
  const { delayMs = 0, ...scrollOptions } = options;
  const run = () => {
    target.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
      ...scrollOptions,
    });
  };
  if (delayMs > 0) window.setTimeout(run, delayMs);
  else run();
}

export function scrollToIssueRef(issueId: string, delayMs = 50) {
  scrollIntoBoardView(document.querySelector(`[data-issue-id="${CSS.escape(issueId)}"]`), {
    delayMs,
    inline: "center",
  });
}

export function scrollToColumnRef(columnKey: string, delayMs = 80) {
  const escaped = CSS.escape(columnKey);
  const run = () => {
    const target =
      document.querySelector(`section.column.cell[data-column-key="${escaped}"]`) ??
      document.querySelector(`[data-column-key="${escaped}"]`);
    scrollIntoBoardView(target, { inline: "center" });
  };
  if (delayMs > 0) window.setTimeout(run, delayMs);
  else run();
}

export function scrollToRowRef(rowId: string, delayMs = 0) {
  scrollIntoBoardView(
    document.querySelector(`[data-row-id="${CSS.escape(rowId)}"] .row-separator-wrap`) ??
      document.querySelector(`[data-row-id="${CSS.escape(rowId)}"]`),
    { delayMs },
  );
}
