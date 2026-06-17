import type { IssuePublic } from "@teamflow/core";

export type TimerDisplay = {
  mode: "stopwatch" | "countdown";
  seconds: number;
  running: boolean;
  finished: boolean;
};

export function getElapsedSeconds(issue: IssuePublic, now = Date.now()) {
  const activeMs = issue.timerActiveAt
    ? Math.max(0, (now - Date.parse(issue.timerActiveAt)) / 1000)
    : 0;
  return issue.timerElapsedSec + activeMs;
}

export function getTimerDisplay(issue: IssuePublic, now = Date.now()): TimerDisplay {
  const elapsed = getElapsedSeconds(issue, now);
  const running = Boolean(issue.timerActiveAt);

  if (issue.timerTargetSec != null) {
    const remaining = Math.max(0, Math.floor(issue.timerTargetSec - elapsed));
    return {
      mode: "countdown",
      seconds: remaining,
      running,
      finished: remaining <= 0,
    };
  }

  return {
    mode: "stopwatch",
    seconds: Math.floor(elapsed),
    running,
    finished: false,
  };
}

export function formatTimer(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const days = Math.floor(total / 86_400);
  const remainder = total % 86_400;
  const hrs = Math.floor(remainder / 3600);
  const mins = Math.floor((remainder % 3600) / 60);
  const secs = remainder % 60;
  const clock =
    hrs > 0
      ? `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
      : `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  if (days > 0) return `${days}d ${clock}`;
  return clock;
}

export const TIMER_FIELD_LABELS = ["mo", "we", "d", "h", "m", "s"] as const;
export type TimerFieldLabel = (typeof TIMER_FIELD_LABELS)[number];

export type TimerParts = Record<TimerFieldLabel, number>;

export function timerPartsFromSeconds(total: number): TimerParts {
  let remaining = Math.max(0, Math.floor(total));
  const mo = Math.floor(remaining / TIMER_MONTH_SEC);
  remaining %= TIMER_MONTH_SEC;
  const we = Math.floor(remaining / TIMER_WEEK_SEC);
  remaining %= TIMER_WEEK_SEC;
  const d = Math.floor(remaining / TIMER_DAY_SEC);
  remaining %= TIMER_DAY_SEC;
  const h = Math.floor(remaining / 3600);
  remaining %= 3600;
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  return { mo, we, d, h, m, s };
}

export function timerSecondsFromParts(parts: TimerParts) {
  return (
    parts.mo * TIMER_MONTH_SEC +
    parts.we * TIMER_WEEK_SEC +
    parts.d * TIMER_DAY_SEC +
    parts.h * 3600 +
    parts.m * 60 +
    parts.s
  );
}

export function padTimerPart(value: number) {
  return String(Math.min(99, Math.max(0, Math.floor(value)))).padStart(2, "0");
}

export function parseTimerPartInput(raw: string) {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(99, parsed);
}

export type TimerInputValues = Record<TimerFieldLabel, string>;

export function timerInputsFromParts(parts: TimerParts): TimerInputValues {
  return Object.fromEntries(
    TIMER_FIELD_LABELS.map((label) => [label, padTimerPart(parts[label])]),
  ) as TimerInputValues;
}

export function timerPartsFromInputs(inputs: TimerInputValues): TimerParts {
  return Object.fromEntries(
    TIMER_FIELD_LABELS.map((label) => [label, parseTimerPartInput(inputs[label])]),
  ) as TimerParts;
}

/** Collapse overflow (e.g. 25h → 1d 1h) via total seconds. */
export function normalizeTimerInputs(inputs: TimerInputValues): TimerInputValues {
  const seconds = timerSecondsFromParts(timerPartsFromInputs(inputs));
  return timerInputsFromParts(timerPartsFromSeconds(seconds));
}

export const EMPTY_TIMER_PARTS: TimerParts = {
  mo: 0,
  we: 0,
  d: 0,
  h: 0,
  m: 0,
  s: 0,
};

export const TIMER_MINUTE_SEC = 60;
export const TIMER_DAY_SEC = 86_400;
export const TIMER_WEEK_SEC = 7 * TIMER_DAY_SEC;
export const TIMER_MONTH_SEC = 30 * TIMER_DAY_SEC;

const TIMER_FIELD_STEP_SEC: Record<TimerFieldLabel, number> = {
  mo: TIMER_MONTH_SEC,
  we: TIMER_WEEK_SEC,
  d: TIMER_DAY_SEC,
  h: 3600,
  m: 60,
  s: 1,
};

/** Scroll-step one field; carries into larger units automatically. */
export function stepTimerInputs(
  inputs: TimerInputValues,
  field: TimerFieldLabel,
  delta: number,
): TimerInputValues {
  const seconds = timerSecondsFromParts(timerPartsFromInputs(inputs));
  const next = Math.max(0, seconds + delta * TIMER_FIELD_STEP_SEC[field]);
  return timerInputsFromParts(timerPartsFromSeconds(next));
}

export const TIMER_COUNTDOWN_UNITS = [
  { id: "minutes", label: "m" },
  { id: "days", label: "d" },
  { id: "weeks", label: "w" },
  { id: "months", label: "mo" },
] as const;

export type TimerCountdownUnit = (typeof TIMER_COUNTDOWN_UNITS)[number]["id"];

export const TIMER_DURATION_UNITS = ["days", "weeks", "months"] as const;
export type TimerDurationUnit = (typeof TIMER_DURATION_UNITS)[number];

export function timerCountdownToSeconds(amount: number, unit: TimerCountdownUnit) {
  const value = Math.max(1, Math.floor(amount));
  switch (unit) {
    case "minutes":
      return value * TIMER_MINUTE_SEC;
    case "days":
      return value * TIMER_DAY_SEC;
    case "weeks":
      return value * TIMER_WEEK_SEC;
    case "months":
      return value * TIMER_MONTH_SEC;
  }
}

export function timerDurationToSeconds(amount: number, unit: TimerDurationUnit) {
  const value = Math.max(1, Math.floor(amount));
  switch (unit) {
    case "days":
      return value * TIMER_DAY_SEC;
    case "weeks":
      return value * TIMER_WEEK_SEC;
    case "months":
      return value * TIMER_MONTH_SEC;
  }
}

export function formatTimerDurationLabel(amount: number, unit: TimerDurationUnit) {
  const value = Math.max(1, Math.floor(amount));
  const short =
    unit === "days" ? "d" : unit === "weeks" ? "w" : "mo";
  return `${value}${short}`;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
