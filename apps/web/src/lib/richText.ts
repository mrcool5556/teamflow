import { splitRefText } from "@teamflow/core";

export type RichTextSegment =
  | { type: "text"; value: string }
  | { type: "ref"; value: string }
  | { type: "link"; label: string; href: string }
  | { type: "url"; href: string };

const MARKDOWN_LINK = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/;
const RAW_URL = /https?:\/\/[^\s<>"')\]]+/;

export function defaultLinkLabel(url: string) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    const label = `${parsed.hostname.replace(/^www\./, "")}${path}`;
    return label.length > 48 ? `${label.slice(0, 45)}…` : label;
  } catch {
    return "link";
  }
}

function parseLinksInPlainText(text: string): RichTextSegment[] {
  if (!text) return [];

  const segments: RichTextSegment[] = [];
  let offset = 0;
  const pattern = new RegExp(
    `${MARKDOWN_LINK.source}|(${RAW_URL.source})`,
    "g",
  );

  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > offset) {
      segments.push({ type: "text", value: text.slice(offset, index) });
    }

    if (match[1] && match[2]) {
      segments.push({ type: "link", label: match[1], href: match[2] });
    } else if (match[3]) {
      segments.push({ type: "url", href: match[3] });
    }

    offset = index + match[0].length;
  }

  if (offset < text.length) {
    segments.push({ type: "text", value: text.slice(offset) });
  }

  return segments;
}

export function parseRichText(text: string): RichTextSegment[] {
  if (!text) return [];

  const segments: RichTextSegment[] = [];
  for (const part of splitRefText(text)) {
    if (part.type === "ref") {
      segments.push({ type: "ref", value: part.value });
      continue;
    }
    segments.push(...parseLinksInPlainText(part.value));
  }
  return segments;
}

export function findUrlInRange(text: string, start: number, end: number) {
  const slice = text.slice(start, end);
  const inSelection = slice.match(RAW_URL);
  if (inSelection?.index !== undefined) {
    const href = inSelection[0];
    return {
      href,
      start: start + inSelection.index,
      end: start + inSelection.index + href.length,
    };
  }

  const inText = text.match(RAW_URL);
  if (inText && inText.index !== undefined) {
    const href = inText[0];
    return { href, start: inText.index, end: inText.index + href.length };
  }

  return null;
}

export function shortenUrlInText(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  promptLabel: (url: string, defaultLabel: string) => string | null,
) {
  const found = findUrlInRange(text, selectionStart, selectionEnd);
  if (!found) return null;

  const label = promptLabel(found.href, defaultLinkLabel(found.href));
  if (!label?.trim()) return null;

  return applyShortLabel(text, found.start, found.end, found.href, label.trim());
}

export function applyShortLabel(
  text: string,
  start: number,
  end: number,
  href: string,
  label: string,
) {
  const replacement = `[${label}](${href})`;
  const value = text.slice(0, start) + replacement + text.slice(end);
  const nextStart = start + replacement.length;
  return { value, selectionStart: nextStart, selectionEnd: nextStart };
}

export function extractFirstUrl(text: string) {
  const match = text.match(RAW_URL);
  if (!match || match.index === undefined) return null;
  return { href: match[0], index: match.index };
}

export function insertTextWithLinkDetection(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  inserted: string,
) {
  const value = text.slice(0, selectionStart) + inserted + text.slice(selectionEnd);
  const urlInInsert = extractFirstUrl(inserted);
  const pastedUrl = urlInInsert
    ? {
        url: urlInInsert.href,
        start: selectionStart + urlInInsert.index,
        end: selectionStart + urlInInsert.index + urlInInsert.href.length,
      }
    : null;
  const cursor = selectionStart + inserted.length;
  return { value, selectionStart: cursor, selectionEnd: cursor, pastedUrl };
}

export function findFirstUrlTarget(text: string) {
  const found = extractFirstUrl(text);
  if (!found) return null;
  return {
    url: found.href,
    start: found.index,
    end: found.index + found.href.length,
  };
}
