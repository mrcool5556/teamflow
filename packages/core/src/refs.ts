import { z } from "zod";

const KEY_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Matches team keys from createTeamSchema (2–8 uppercase letters/digits). */
export const TEAM_KEY_IN_REF = "[A-Z0-9]{2,8}";

export const ISSUE_REF_PATTERN = new RegExp(
  `^(${TEAM_KEY_IN_REF})-(\\d+)$`,
  "i",
);
export const ROW_REF_PATTERN = /^row_[a-z0-9]{8}$/;
export const COLUMN_REF_PATTERN = /^col_[a-z0-9]{8}$/;

/** Matches issue, row, and column refs embedded in plain text. */
export const REF_TOKEN_PATTERN = new RegExp(
  `(${TEAM_KEY_IN_REF}-\\d+|row_[a-z0-9]{8}|col_[a-z0-9]{8})`,
  "gi",
);

export function isTeamflowRef(value: string) {
  const ref = value.trim();
  return (
    ISSUE_REF_PATTERN.test(ref) ||
    ROW_REF_PATTERN.test(ref) ||
    COLUMN_REF_PATTERN.test(ref)
  );
}

export function parseRefFromShareUrl(raw: string) {
  const text = raw.trim();
  if (!text) return null;
  if (isTeamflowRef(text)) return text;
  const match = text.match(/[?&]ref=([^&\s#]+)/i);
  if (!match) return null;
  let ref = match[1]!;
  try {
    ref = decodeURIComponent(ref);
  } catch {
    // keep raw ref segment
  }
  return isTeamflowRef(ref) ? ref : null;
}

export type RefTextSegment =
  | { type: "text"; value: string }
  | { type: "ref"; value: string };

export function splitRefText(text: string): RefTextSegment[] {
  if (!text) return [];

  const segments: RefTextSegment[] = [];
  const pattern = new RegExp(
    `https?:\\/\\/\\S*?[?&]ref=(${TEAM_KEY_IN_REF}-\\d+|row_[a-z0-9]{8}|col_[a-z0-9]{8})\\S*|(${TEAM_KEY_IN_REF}-\\d+|row_[a-z0-9]{8}|col_[a-z0-9]{8})`,
    "gi",
  );

  let lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      segments.push({ type: "text", value: text.slice(lastIndex, index) });
    }
    const ref = (match[1] ?? match[2])!;
    segments.push({ type: "ref", value: ref });
    lastIndex = index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", value: text.slice(lastIndex) });
  }

  return segments;
}

export function generateEntityKey(prefix: "row" | "col") {
  let suffix = "";
  for (let i = 0; i < 8; i++) {
    suffix += KEY_CHARS[Math.floor(Math.random() * KEY_CHARS.length)]!;
  }
  return `${prefix}_${suffix}`;
}

export function parseIssueRef(ref: string) {
  const match = ref.trim().match(ISSUE_REF_PATTERN);
  if (!match) return null;
  return {
    teamKey: match[1]!.toUpperCase(),
    number: Number.parseInt(match[2]!, 10),
  };
}

export const resolveRefSchema = z.object({
  ref: z.string().min(1).max(120),
});

export type ResolvedIssueRef = {
  type: "issue";
  ref: string;
  issueId: string;
  identifier: string;
};

export type ResolvedRowRef = {
  type: "row";
  ref: string;
  rowId: string;
  rowKey: string;
  rowName: string;
};

export type ResolvedColumnRef = {
  type: "column";
  ref: string;
  statusId: string;
  columnKey: string;
  columnName: string;
  rowId: string;
  rowKey: string;
  rowName: string;
};

export type ResolvedRef = ResolvedIssueRef | ResolvedRowRef | ResolvedColumnRef;
