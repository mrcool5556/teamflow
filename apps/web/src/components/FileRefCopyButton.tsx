import { useState } from "react";
import { buildRefShareUrl } from "../lib/refLinks";

type FileRefCopyButtonProps = {
  fileRef: string;
  filename?: string;
  compact?: boolean;
  share?: boolean;
  className?: string;
};

export function FileRefCopyButton({
  fileRef,
  filename,
  compact = true,
  share = true,
  className,
}: FileRefCopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const copyValue = share ? buildRefShareUrl(fileRef) : fileRef;
  const label = filename ? `Copy link for ${filename}` : `Copy file link ${fileRef}`;

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

  return (
    <button
      type="button"
      className={`file-ref-copy-btn ${compact ? "compact" : ""} ${copied ? "copied" : ""} ${className ?? ""}`.trim()}
      title={label}
      aria-label={label}
      onClick={copyRef}
    >
      {copied ? "Copied" : share ? "Copy link" : fileRef}
    </button>
  );
}
