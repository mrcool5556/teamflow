import { useCallback, useEffect, useRef, useState } from "react";

type DraftFieldOptions = {
  /** The saved value as the server (or the optimistic cache) currently has it. */
  serverValue: string;
  /** Changing this (for example the issue id) discards the draft and starts from `serverValue`. */
  resetKey: string;
  /** Turn the draft into the value to save, or `null` when it must not be saved (an empty title). */
  normalize: (draft: string) => string | null;
  save: (value: string) => void;
  delayMs?: number;
};

/**
 * A text field that autosaves without fighting the person typing in it.
 *
 * The local draft is the source of truth while the field is focused or a save is queued: the
 * server value (which comes back trimmed) never overwrites it then, so a trailing space typed
 * before a pause survives. When the field is idle, a server value that changed elsewhere is
 * adopted.
 */
export function useDraftField({
  serverValue,
  resetKey,
  normalize,
  save,
  delayMs = 500,
}: DraftFieldOptions) {
  const [draft, setDraftState] = useState(serverValue);
  const draftRef = useRef(serverValue);
  const focusedRef = useRef(false);
  /** Typed here since the last save; only then does leaving the field save. */
  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const serverRef = useRef(serverValue);
  const optionsRef = useRef({ normalize, save });

  useEffect(() => {
    optionsRef.current = { normalize, save };
  });

  const setDraft = useCallback((value: string) => {
    draftRef.current = value;
    setDraftState(value);
  }, []);

  const cancelTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  // A different record: start over from its saved value.
  useEffect(() => {
    cancelTimer();
    dirtyRef.current = false;
    serverRef.current = serverValue;
    setDraft(serverValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the record switch resets
  }, [resetKey]);

  // Same record, new saved value: adopt it only when nobody is editing here.
  useEffect(() => {
    serverRef.current = serverValue;
    if (focusedRef.current || timerRef.current) return;
    setDraft(serverValue);
  }, [serverValue, setDraft]);

  const flush = useCallback((value: string) => {
    dirtyRef.current = false;
    const next = optionsRef.current.normalize(value);
    if (next === null || next === serverRef.current) return;
    optionsRef.current.save(next);
  }, []);

  // Closing mid-pause still saves what was typed.
  useEffect(
    () => () => {
      if (!timerRef.current) return;
      cancelTimer();
      flush(draftRef.current);
    },
    [cancelTimer, flush],
  );

  const onChange = useCallback(
    (value: string) => {
      setDraft(value);
      dirtyRef.current = true;
      cancelTimer();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        flush(value);
      }, delayMs);
    },
    [cancelTimer, delayMs, flush, setDraft],
  );

  const onFocus = useCallback(() => {
    focusedRef.current = true;
  }, []);

  const onBlur = useCallback(() => {
    focusedRef.current = false;
    const typed = dirtyRef.current || timerRef.current !== null;
    cancelTimer();
    if (!typed) {
      // Only looked: catch up with anything saved elsewhere meanwhile.
      setDraft(serverRef.current);
      return;
    }
    const value = draftRef.current;
    flush(value);
    // Not being edited any more, so show what was saved (trimmed), unless it was refused.
    const next = optionsRef.current.normalize(value);
    setDraft(next === null ? serverRef.current : next);
  }, [cancelTimer, flush, setDraft]);

  return { value: draft, onChange, onFocus, onBlur };
}
