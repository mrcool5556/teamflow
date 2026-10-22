import { useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";

/**
 * Click-to-rename for row and column labels. Enter or blur saves exactly once; Escape cancels
 * without saving (the blur that follows an Enter or Escape is ignored).
 */
export function useInlineRename(label: string, onSave: (name: string) => void) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(label);
  const finishedRef = useRef(false);

  function start() {
    setValue(label);
    finishedRef.current = false;
    setEditing(true);
  }

  function finish(save: boolean) {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setEditing(false);
    if (save) onSave(value);
  }

  const inputProps = {
    autoFocus: true,
    value,
    onChange: (event: ChangeEvent<HTMLInputElement>) => setValue(event.target.value),
    onBlur: () => finish(true),
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        finish(true);
      } else if (event.key === "Escape") {
        event.preventDefault();
        // Escape here only cancels the rename, not selection or settings.
        event.stopPropagation();
        finish(false);
      }
    },
  };

  return { editing, start, inputProps };
}
