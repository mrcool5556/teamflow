import { useEffect, useState } from "react";
import type { TeamFilePublic } from "@teamflow/core";
import { getTeamFileDisplayName, normalizeRenamedFilename } from "@teamflow/core";
import { client } from "../api";

type TeamFileEditableNameProps = {
  teamId: string;
  file: TeamFilePublic;
  disabled?: boolean;
  onRenamed: (fileId: string, filename: string) => void;
  onError: (message: string | null) => void;
};

export function TeamFileEditableName({
  teamId,
  file,
  disabled = false,
  onRenamed,
  onError,
}: TeamFileEditableNameProps) {
  const displayName = getTeamFileDisplayName(file);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(displayName);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(displayName);
  }, [displayName, editing]);

  async function save() {
    const next = normalizeRenamedFilename(draft, file.filename);
    if (next === file.filename) {
      setEditing(false);
      setDraft(displayName);
      return;
    }

    setSaving(true);
    onError(null);
    try {
      const { filename } = await client.renameTeamFile(teamId, file.fileId, { filename: next });
      onRenamed(file.fileId, filename);
      setEditing(false);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not rename file");
      setDraft(displayName);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <input
        className="team-files-item-name-input"
        value={draft}
        aria-label={`Rename ${displayName}`}
        autoFocus
        disabled={saving}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void save()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void save();
          }
          if (event.key === "Escape") {
            setDraft(displayName);
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <button
      type="button"
      className="team-files-item-name team-files-item-name--editable"
      title="Click to rename"
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        setDraft(displayName);
        setEditing(true);
      }}
    >
      {displayName}
    </button>
  );
}
