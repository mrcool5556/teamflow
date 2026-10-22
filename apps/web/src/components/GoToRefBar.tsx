import { useEffect, useRef, useState } from "react";

type GoToRefBarProps = {
  disabled?: boolean;
  onGo: (ref: string) => void;
};

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

/** Ref search in the topbar: Enter goes, "/" anywhere outside a field focuses it. */
export function GoToRefBar({ disabled, onGo }: GoToRefBarProps) {
  const [ref, setRef] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (disabled) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      inputRef.current?.focus();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [disabled]);

  return (
    <form
      className="go-to-ref"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = ref.trim();
        if (!trimmed) return;
        onGo(trimmed);
      }}
    >
      <span className="go-to-ref-icon" aria-hidden="true">
        ⌕
      </span>
      <input
        ref={inputRef}
        className="go-to-ref-input"
        value={ref}
        onChange={(e) => setRef(e.target.value)}
        placeholder="Go to ENG-42 or paste a link"
        aria-label="Issue or board reference"
        aria-keyshortcuts="/"
        enterKeyHint="go"
        disabled={disabled}
      />
      <kbd className="go-to-ref-kbd" aria-hidden="true">
        /
      </kbd>
    </form>
  );
}
