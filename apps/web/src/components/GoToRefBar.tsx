import { useState } from "react";

type GoToRefBarProps = {
  disabled?: boolean;
  onGo: (ref: string) => void;
};

export function GoToRefBar({ disabled, onGo }: GoToRefBarProps) {
  const [ref, setRef] = useState("");

  return (
    <form
      className="go-to-ref"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = ref.trim();
        if (!trimmed) return;
        onGo(trimmed);
      }}
    >
      <input
        className="go-to-ref-input"
        value={ref}
        onChange={(e) => setRef(e.target.value)}
        placeholder="Go to ENG-42 or paste link…"
        aria-label="Issue or board reference"
        disabled={disabled}
      />
      <button type="submit" disabled={disabled || !ref.trim()}>
        Go
      </button>
    </form>
  );
}
