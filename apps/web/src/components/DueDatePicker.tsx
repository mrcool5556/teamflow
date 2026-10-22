import { useRef, useState } from "react";
import { formatDue, monthGrid, quickDays, sameDay, timeOf, withTime } from "../lib/dueDate";
import { Popover } from "../ui/Popover";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const TIME_CHIPS = ["09:00", "12:00", "17:00"];
const DEFAULT_TIME = "17:00";

type DueDatePickerProps = {
  /** ISO timestamp or null. */
  value: string | null;
  disabled?: boolean;
  onChange: (iso: string | null) => void;
};

/** Due date button; opens a month calendar with quick picks and a time field. */
export function DueDatePicker({ value, disabled, onChange }: DueDatePickerProps) {
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const current = value ? new Date(value) : null;
  const valid = current && !Number.isNaN(current.getTime()) ? current : null;
  const now = new Date();

  const [draftDay, setDraftDay] = useState<Date | null>(valid);
  const [draftTime, setDraftTime] = useState(valid ? timeOf(valid) : DEFAULT_TIME);
  const [month, setMonth] = useState<Date>(valid ?? now);

  function openPicker() {
    setDraftDay(valid);
    setDraftTime(valid ? timeOf(valid) : DEFAULT_TIME);
    setMonth(valid ?? new Date());
    setOpen(true);
  }

  function commit(day: Date | null, time = draftTime) {
    onChange(day ? withTime(day, time).toISOString() : null);
    setOpen(false);
  }

  const overdue = valid ? valid.getTime() < now.getTime() : false;

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className={`due-picker-trigger${overdue ? " due-picker-trigger--overdue" : ""}`}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={valid ? `Due ${formatDue(valid, now)}` : "Set due date"}
        onClick={() => (open ? setOpen(false) : openPicker())}
      >
        <span aria-hidden="true">📅</span>
        <span className="due-picker-value">{valid ? formatDue(valid, now) : "No due date"}</span>
      </button>
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        placement="bottom-end"
        className="due-picker"
        role="dialog"
        label="Due date"
        width={304}
      >
        <div className="due-picker-head">
          <button
            type="button"
            className="ghost due-picker-nav"
            aria-label="Previous month"
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          >
            ‹
          </button>
          <strong>{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</strong>
          <button
            type="button"
            className="ghost due-picker-nav"
            aria-label="Next month"
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
          >
            ›
          </button>
        </div>
        <div className="due-picker-grid" role="grid">
          {WEEKDAYS.map((day) => (
            <span key={day} className="due-picker-weekday" aria-hidden="true">
              {day}
            </span>
          ))}
          {monthGrid(month).map((day) => {
            const outside = day.getMonth() !== month.getMonth();
            const selected = draftDay ? sameDay(day, draftDay) : false;
            return (
              <button
                key={day.toISOString()}
                type="button"
                className={`due-picker-day${outside ? " is-outside" : ""}${sameDay(day, now) ? " is-today" : ""}${selected ? " is-selected" : ""}`}
                aria-pressed={selected}
                aria-label={day.toLocaleDateString(undefined, { dateStyle: "full" })}
                onClick={() => setDraftDay(day)}
              >
                {day.getDate()}
              </button>
            );
          })}
        </div>
        <div className="due-picker-chips">
          {quickDays(now).map((quick) => (
            <button
              key={quick.label}
              type="button"
              className="due-picker-chip"
              onClick={() => {
                setDraftDay(quick.day);
                setMonth(quick.day);
              }}
            >
              {quick.label}
            </button>
          ))}
        </div>
        <div className="due-picker-time">
          <label>
            <span className="sr-only">Time</span>
            <input
              type="time"
              value={draftTime}
              onChange={(e) => setDraftTime(e.target.value || DEFAULT_TIME)}
            />
          </label>
          {TIME_CHIPS.map((time) => (
            <button
              key={time}
              type="button"
              className={`due-picker-chip${draftTime === time ? " is-selected" : ""}`}
              onClick={() => setDraftTime(time)}
            >
              {time}
            </button>
          ))}
        </div>
        <div className="due-picker-actions">
          <button type="button" className="ghost due-picker-clear" onClick={() => commit(null)}>
            Clear
          </button>
          <button type="button" disabled={!draftDay} onClick={() => commit(draftDay)}>
            Set
          </button>
        </div>
      </Popover>
    </>
  );
}
