import { parseRichText, type RichTextSegment } from "./richText";

export type DescriptionSegment =
  | RichTextSegment
  | { type: "bold"; value: string }
  | { type: "underline"; value: string }
  | { type: "highlight"; value: string };

function parseInlineMarkup(text: string): DescriptionSegment[] {
  if (!text) return [];

  const segments: DescriptionSegment[] = [];
  let offset = 0;
  const pattern = /\*\*(.+?)\*\*|__(.+?)__|==(.+?)==/g;

  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > offset) {
      segments.push({ type: "text", value: text.slice(offset, index) });
    }

    const inner = match[1] ?? match[2] ?? match[3] ?? "";
    const type = match[1] !== undefined
      ? "bold"
      : match[2] !== undefined
        ? "underline"
        : "highlight";
    segments.push({ type, value: inner });
    offset = index + match[0].length;
  }

  if (offset < text.length) {
    segments.push({ type: "text", value: text.slice(offset) });
  }

  return segments;
}

export function parseDescription(text: string): DescriptionSegment[] {
  if (!text.trim()) return [];

  const segments: DescriptionSegment[] = [];
  for (const part of parseRichText(text)) {
    if (part.type !== "text") {
      segments.push(part);
      continue;
    }
    segments.push(...parseInlineMarkup(part.value));
  }
  return segments;
}

export function wrapTextareaSelection(
  textarea: HTMLTextAreaElement,
  before: string,
  after: string,
) {
  const { value, selectionStart, selectionEnd } = textarea;
  const selected = value.slice(selectionStart, selectionEnd);
  const inner = selected || "text";
  const wrapped = `${before}${inner}${after}`;
  const nextValue = value.slice(0, selectionStart) + wrapped + value.slice(selectionEnd);
  const nextStart = selectionStart + before.length;
  const nextEnd = nextStart + inner.length;

  return { value: nextValue, selectionStart: nextStart, selectionEnd: nextEnd };
}
