import { useState } from "react";
import { buildRefShareUrl } from "../lib/refLinks";

type RefCopyButtonProps = {
  value: string;
  title?: string;
  compact?: boolean;
  variant?: "default" | "issue";
  display?: "label" | "icon";
  share?: boolean;
  onGo?: () => void;
};

export function RefCopyButton({
  value,
  title,
  compact = false,
  variant = "default",
  display = "label",
  share = false,
  onGo,
}: RefCopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const copyValue = share ? buildRefShareUrl(value) : value;

  async function copyRef(event: React.MouseEvent) {
    event.stopPropagation();
    event.preventDefault();
    try {
      await navigator.clipboard.writeText(copyValue);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore clipboard failures
    }
  }

  function goToRef(event: React.MouseEvent) {
    event.stopPropagation();
    event.preventDefault();
    onGo?.();
  }

  if (display === "icon") {
    return (
      <span
        className={`ref-actions ${compact ? "compact" : ""}`}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {onGo ? (
          <button
            type="button"
            className="ref-action-btn ref-go-btn"
            title={title ?? `Go to ${value}`}
            aria-label={`Go to ${value}`}
            onClick={goToRef}
          >
            ↗
          </button>
        ) : null}
        <button
          type="button"
          className={`ref-action-btn ref-copy-btn icon ${copied ? "copied" : ""}`}
          title={
            title ??
            (share ? `Copy share link for ${value}` : `Copy reference ${value}`)
          }
          aria-label={share ? `Copy share link for ${value}` : `Copy ${value}`}
          onClick={copyRef}
        >
          {copied ? "✓" : share ? "⧉" : "⧉"}
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      className={`ref-copy-btn ${compact ? "compact" : ""} ${copied ? "copied" : ""} ref-copy-btn--${variant}`}
      title={
        title ??
        (share ? `Copy share link for ${value}` : `Copy reference ${value}`)
      }
      onPointerDown={(event) => event.stopPropagation()}
      onClick={copyRef}
    >
      <span className="ref-copy-label">{copied ? "Copied" : value}</span>
    </button>
  );
}
