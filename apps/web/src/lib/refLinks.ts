import type { IssuePublic } from "@teamflow/core";
import { parseRefFromShareUrl } from "@teamflow/core";

export const PENDING_REF_STORAGE_KEY = "teamflow_pending_ref";

export function buildRefShareUrl(ref: string) {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("ref", ref.trim());
  return url.toString();
}

export function readRefFromLocation() {
  const params = new URLSearchParams(window.location.search);
  const ref = params.get("ref")?.trim();
  if (ref) return ref;

  const hash = window.location.hash.replace(/^#/, "");
  if (hash.startsWith("ref=")) {
    return decodeURIComponent(hash.slice(4)).trim() || null;
  }

  return null;
}

export function stashPendingRef(ref: string) {
  sessionStorage.setItem(PENDING_REF_STORAGE_KEY, ref.trim());
}

export function takePendingRef() {
  const ref = sessionStorage.getItem(PENDING_REF_STORAGE_KEY)?.trim();
  if (ref) sessionStorage.removeItem(PENDING_REF_STORAGE_KEY);
  return ref ?? null;
}

export function syncRefInLocation(ref: string | null) {
  const url = new URL(window.location.href);
  if (ref) {
    url.searchParams.set("ref", ref);
  } else {
    url.searchParams.delete("ref");
  }
  window.history.replaceState({}, "", url);
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
  const { delayMs = 0, ...scrollOptions } = options;
  const run = () => {
    target?.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "center",
      ...scrollOptions,
    });
  };
  if (delayMs > 0) window.setTimeout(run, delayMs);
  else run();
}

export function scrollToIssueRef(issueId: string, delayMs = 50) {
  scrollIntoBoardView(
    document.querySelector(`[data-issue-id="${CSS.escape(issueId)}"]`),
    { delayMs },
  );
}

export function scrollToColumnRef(columnKey: string, delayMs = 80) {
  const escaped = CSS.escape(columnKey);
  const run = () => {
    const target =
      document.querySelector(`section.column.cell[data-column-key="${escaped}"]`) ??
      document.querySelector(`[data-column-key="${escaped}"]`);
    scrollIntoBoardView(target);
  };
  if (delayMs > 0) window.setTimeout(run, delayMs);
  else run();
}

export function scrollToRowRef(rowId: string, delayMs = 0) {
  scrollIntoBoardView(
    document.querySelector(`[data-row-id="${CSS.escape(rowId)}"]`),
    { delayMs },
  );
}
