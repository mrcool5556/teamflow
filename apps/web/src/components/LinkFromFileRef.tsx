import { useState } from "react";
import { FILE_REF_PATTERN } from "@teamflow/core";
import { client } from "../api";
import { normalizeRefInput } from "../lib/refLinks";

type LinkFromFileRefProps = {
  teamId: string;
  label?: string;
  placeholder?: string;
  onLinkFileId: (fileId: string) => Promise<void>;
  disabled?: boolean;
};

export function LinkFromFileRef({
  teamId,
  label = "Link from file ref",
  placeholder = "Paste file_… or share link",
  onLinkFileId,
  disabled = false,
}: LinkFromFileRefProps) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const raw = value.trim();
    if (!raw || busy || disabled) return;

    const ref = normalizeRefInput(raw);
    if (!FILE_REF_PATTERN.test(ref)) {
      setError("Expected a file ref like file_ab12cd34 or its share link.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const result = await client.resolveRef(teamId, ref);
      if (result.resolved.type !== "file" || !result.file) {
        setError("File ref not found on this team.");
        return;
      }
      await onLinkFileId(result.file.fileId);
      setValue("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not link file");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="link-from-file-ref">
      <label className="link-from-file-ref-label">{label}</label>
      <div className="link-from-file-ref-row">
        <input
          type="text"
          value={value}
          placeholder={placeholder}
          disabled={disabled || busy}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <button type="button" className="secondary compact" disabled={disabled || busy} onClick={() => void submit()}>
          {busy ? "Linking…" : "Link"}
        </button>
      </div>
      {error ? <p className="link-from-file-ref-error">{error}</p> : null}
    </div>
  );
}
