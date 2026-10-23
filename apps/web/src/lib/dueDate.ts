/** Date helpers for the due date picker (local time, Monday-first weeks). */

const pad = (n: number) => String(n).padStart(2, "0");

export function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function timeOf(date: Date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Local date at `time` ("HH:MM"). */
export function withTime(day: Date, time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours || 0, minutes || 0);
}

/** Six Monday-first weeks covering `month` (a date in that month). */
export function monthGrid(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  return Array.from(
    { length: 42 },
    (_, i) => new Date(first.getFullYear(), first.getMonth(), 1 - offset + i),
  );
}

/** "Fri 24 Oct · 17:00" (year added when it is not this year). */
export function formatDue(date: Date, now = new Date()) {
  const dayPart = date.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
  return `${dayPart} · ${timeOf(date)}`;
}

export function quickDays(now: Date): { label: string; day: Date }[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const addDays = (n: number) =>
    new Date(today.getFullYear(), today.getMonth(), today.getDate() + n);
  const toMonday = (8 - today.getDay()) % 7 || 7;
  return [
    { label: "Today", day: today },
    { label: "Tomorrow", day: addDays(1) },
    { label: "Next Mon", day: addDays(toMonday) },
    { label: "+1 week", day: addDays(7) },
  ];
}

/** How a due date reads on a card: done, past, within a day, or later. */
export type DueState = "done" | "overdue" | "soon" | "later";

const DAY_MS = 24 * 60 * 60 * 1000;

export function dueState(due: Date, done: boolean, now = new Date()): DueState {
  if (done) return "done";
  const left = due.getTime() - now.getTime();
  if (left < 0) return "overdue";
  if (left <= DAY_MS) return "soon";
  return "later";
}

/** Card chip text: "Today", "Tomorrow", "Yesterday", "Fri 24" this week, else "24 Oct". */
export function formatDueChip(due: Date, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const days = Math.round((day.getTime() - today.getTime()) / DAY_MS);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days > 1 && days < 7) {
    const weekday = due.toLocaleDateString(undefined, { weekday: "short" });
    return `${weekday} ${due.getDate()}`;
  }
  return due.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(due.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
}

/** The due date as a Date, or null when missing or unreadable. */
export function parseDue(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
