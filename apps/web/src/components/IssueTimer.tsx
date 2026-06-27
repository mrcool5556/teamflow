import { useEffect, useRef, useState, type WheelEvent } from "react";
import { createPortal } from "react-dom";
import type { IssuePublic } from "@teamflow/core";
import { useFloatingPanelStyle } from "../hooks/useFloatingPanelStyle";
import { useDismissOnClickOutside } from "../hooks/useDismissOnClickOutside";
import {
  EMPTY_TIMER_PARTS,
  TIMER_FIELD_LABELS,
  formatTimer,
  getElapsedSeconds,
  getTimerDisplay,
  normalizeTimerInputs,
  stepTimerInputs,
  timerInputsFromParts,
  timerPartsFromInputs,
  timerPartsFromSeconds,
  timerSecondsFromParts,
  type TimerFieldLabel,
  type TimerInputValues,
} from "../lib/timer";

type IssueTimerProps = {
  issue: IssuePublic;
  onUpdate: (patch: {
    timerActiveAt: string | null;
    timerElapsedSec: number;
    timerTargetSec: number | null;
  }) => void;
  compact?: boolean;
  floatingPanel?: boolean;
};

function TimerDigitRow({
  values,
  live = false,
  onChange,
  onStep,
  onNormalize,
}: {
  values: TimerInputValues;
  live?: boolean;
  onChange?: (label: TimerFieldLabel, value: string) => void;
  onStep?: (label: TimerFieldLabel, delta: number) => void;
  onNormalize?: () => void;
}) {
  function handleWheel(event: WheelEvent<HTMLInputElement>, label: TimerFieldLabel) {
    if (!onStep) return;
    event.preventDefault();
    event.stopPropagation();
    const delta = event.deltaY < 0 ? 1 : event.deltaY > 0 ? -1 : 0;
    if (delta !== 0) onStep(label, delta);
  }

  return (
    <div className={`timer-clock-digits ${live ? "timer-clock-digits--live" : ""}`}>
      {TIMER_FIELD_LABELS.map((label) =>
        live || !onChange ? (
          <span key={label} className="timer-clock-digit">
            {values[label]}
          </span>
        ) : (
          <input
            key={label}
            className="timer-clock-digit timer-clock-digit-input timer-clock-digit-input--scroll"
            inputMode="numeric"
            maxLength={2}
            value={values[label]}
            aria-label={`${label}, scroll to adjust`}
            title="Scroll to adjust"
            onChange={(e) => onChange(label, e.target.value)}
            onBlur={onNormalize}
            onWheel={(e) => handleWheel(e, label)}
          />
        ),
      )}
    </div>
  );
}

export function IssueTimer({ issue, onUpdate, compact = false, floatingPanel = false }: IssueTimerProps) {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [addInputs, setAddInputs] = useState<TimerInputValues>(
    timerInputsFromParts(EMPTY_TIMER_PARTS),
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelStyle = useFloatingPanelStyle(open && floatingPanel, triggerRef, "auto");
  const panelPositioned = Boolean(panelStyle.position);
  const display = getTimerDisplay(issue, now);
  const isCountdown = issue.timerTargetSec != null;
  const isRunning = Boolean(issue.timerActiveAt);
  const hasTimer =
    issue.timerActiveAt != null ||
    issue.timerElapsedSec > 0 ||
    issue.timerTargetSec != null;

  const largeClockSeconds = isCountdown ? display.seconds : totalSeconds;
  const largeClockValues = timerInputsFromParts(timerPartsFromSeconds(largeClockSeconds));

  useEffect(() => {
    if (!issue.timerActiveAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [issue.timerActiveAt]);

  useDismissOnClickOutside(open, [rootRef, panelRef], () => setOpen(false));

  useEffect(() => {
    if (!open || isCountdown) return;
    setTotalSeconds(0);
    setAddInputs(timerInputsFromParts(EMPTY_TIMER_PARTS));
  }, [open, isCountdown]);

  function updateAddInput(label: TimerFieldLabel, value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 2);
    setAddInputs((prev) => ({ ...prev, [label]: digits }));
  }

  function normalizeAddInputs() {
    setAddInputs((prev) => normalizeTimerInputs(prev));
  }

  function stepAddInput(label: TimerFieldLabel, delta: number) {
    setAddInputs((prev) => stepTimerInputs(prev, label, delta));
  }

  function addTime() {
    const normalized = normalizeTimerInputs(addInputs);
    const chunk = timerSecondsFromParts(timerPartsFromInputs(normalized));
    if (chunk <= 0) return;

    if (isCountdown) {
      onUpdate({
        timerActiveAt: issue.timerActiveAt,
        timerElapsedSec: issue.timerElapsedSec,
        timerTargetSec: (issue.timerTargetSec ?? 0) + chunk,
      });
    } else {
      setTotalSeconds((prev) => prev + chunk);
    }

    setAddInputs(timerInputsFromParts(EMPTY_TIMER_PARTS));
  }

  function restartCountdown() {
    const seconds = issue.timerTargetSec ?? totalSeconds;
    if (seconds <= 0) return;
    onUpdate({
      timerActiveAt: new Date().toISOString(),
      timerElapsedSec: 0,
      timerTargetSec: seconds,
    });
  }

  function startCountdown() {
    if (totalSeconds <= 0) return;
    onUpdate({
      timerActiveAt: new Date().toISOString(),
      timerElapsedSec: 0,
      timerTargetSec: totalSeconds,
    });
  }

  function resumeCountdown() {
    if (!isCountdown || largeClockSeconds <= 0) return;
    onUpdate({
      timerActiveAt: new Date().toISOString(),
      timerElapsedSec: issue.timerElapsedSec,
      timerTargetSec: issue.timerTargetSec,
    });
  }

  function startStopwatch() {
    onUpdate({
      timerActiveAt: new Date().toISOString(),
      timerElapsedSec: issue.timerElapsedSec,
      timerTargetSec: null,
    });
    setTotalSeconds(0);
  }

  function pauseTimer() {
    onUpdate({
      timerActiveAt: null,
      timerElapsedSec: Math.floor(getElapsedSeconds(issue, Date.now())),
      timerTargetSec: issue.timerTargetSec,
    });
  }

  function resetTimer() {
    onUpdate({
      timerActiveAt: null,
      timerElapsedSec: 0,
      timerTargetSec: null,
    });
    setTotalSeconds(0);
    setAddInputs(timerInputsFromParts(EMPTY_TIMER_PARTS));
    setOpen(false);
  }

  const chunkSeconds = timerSecondsFromParts(timerPartsFromInputs(normalizeTimerInputs(addInputs)));

  const panel = open ? (
    <div
      ref={panelRef}
      className={`issue-timer-panel issue-timer-panel--clock ${compact ? "issue-timer-panel--compact" : ""} ${floatingPanel ? "issue-timer-panel--floating" : ""} ${panelPositioned ? "issue-timer-panel--positioned" : ""}`}
      style={floatingPanel ? panelStyle : undefined}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <p className="issue-timer-mode">
        {isCountdown
          ? isRunning
            ? "Countdown running"
            : "Countdown paused"
          : totalSeconds > 0
            ? "Countdown ready"
            : "Set countdown"}
      </p>

      <div className="timer-clock" aria-label="Timer total">
        <div className="timer-clock-labels">
          {TIMER_FIELD_LABELS.map((label) => (
            <span key={label} className="timer-clock-label">
              {label}
            </span>
          ))}
        </div>
        <TimerDigitRow values={largeClockValues} live />
      </div>

      <div className="timer-clock timer-clock--add" aria-label="Add time">
        <p className="timer-clock-add-label">Add time · scroll fields to adjust</p>
        <div className="timer-clock-labels">
          {TIMER_FIELD_LABELS.map((label) => (
            <span key={label} className="timer-clock-label">
              {label}
            </span>
          ))}
        </div>
        <TimerDigitRow
          values={addInputs}
          onChange={updateAddInput}
          onStep={stepAddInput}
          onNormalize={normalizeAddInputs}
        />
      </div>

      <div className="issue-timer-actions issue-timer-actions--add">
        <button type="button" disabled={chunkSeconds <= 0} onClick={addTime}>
          Add time
        </button>
      </div>

      <div className="issue-timer-actions">
        {isRunning ? (
          <button type="button" onClick={pauseTimer}>
            Pause
          </button>
        ) : isCountdown ? (
          <button type="button" onClick={display.finished ? restartCountdown : resumeCountdown}>
            {display.finished ? "Restart" : "Resume"}
          </button>
        ) : (
          <>
            <button type="button" disabled={totalSeconds <= 0} onClick={startCountdown}>
              Start countdown
            </button>
            <button type="button" className="ghost" onClick={startStopwatch}>
              Stopwatch
            </button>
          </>
        )}
        <button type="button" className="ghost" onClick={resetTimer}>
          Reset
        </button>
      </div>
    </div>
  ) : null;

  return (
    <div
      ref={rootRef}
      className={`issue-timer ${compact ? "issue-timer--compact" : ""} ${open ? "open" : ""} ${display.running ? "running" : ""} ${display.finished ? "finished" : ""}`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        ref={triggerRef}
        type="button"
        className={`issue-timer-trigger ${compact ? "compact" : ""}`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((value) => !value);
        }}
        title="Timer"
      >
        <span className="issue-timer-icon">⏱</span>
        {(!compact || hasTimer) && (
          <span className="issue-timer-value">
            {hasTimer ? formatTimer(display.seconds) : "Timer"}
          </span>
        )}
        {!compact && (
          <span className="assignee-picker-caret">{open ? "▴" : "▾"}</span>
        )}
      </button>

      {floatingPanel && panel && panelPositioned
        ? createPortal(panel, document.body)
        : !floatingPanel
          ? panel
          : null}
    </div>
  );
}
