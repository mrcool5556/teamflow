import { useState } from "react";
import { client } from "../api";
import { errorMessage } from "../lib/errorSink";
import type { PanelMessage } from "../lib/panelStatus";

type CreateTeamSectionProps = {
  onMessage: PanelMessage;
  onTeamCreated: (teamId: string, switchToNew: boolean) => void;
};

function suggestTeamKey(name: string) {
  const cleaned = name.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (cleaned.length >= 2) return cleaned.slice(0, 8);
  return "TEAM";
}

function normalizeTeamKey(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
}

export function CreateTeamSection({ onMessage, onTeamCreated }: CreateTeamSectionProps) {
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  const [switchToNew, setSwitchToNew] = useState(false);
  const [creating, setCreating] = useState(false);

  function updateName(nextName: string) {
    setName(nextName);
    if (!keyTouched) {
      setKey(suggestTeamKey(nextName));
    }
  }

  async function submit() {
    const trimmedName = name.trim();
    const trimmedKey = normalizeTeamKey(key);
    if (!trimmedName) {
      onMessage("Team name is required.", "error");
      return;
    }
    if (trimmedKey.length < 2) {
      onMessage("Team key must be at least 2 characters (A–Z, 0–9).", "error");
      return;
    }

    setCreating(true);
    onMessage(null);
    try {
      const { team } = await client.createTeam({ name: trimmedName, key: trimmedKey });
      onMessage(
        switchToNew
          ? `Created ${team.key} — ${team.name}. Switched to the new board.`
          : `Created ${team.key} — ${team.name}. Your current board is unchanged — switch from the header when ready.`,
      );
      setName("");
      setKey("");
      setKeyTouched(false);
      onTeamCreated(team.id, switchToNew);
    } catch (err) {
      onMessage(errorMessage(err, "Failed to create team"), "error");
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="settings-section">
      <h3>Create team</h3>
      <p className="settings-copy">
        Add another board to your account. Your main board stays as-is — use the workspace dropdown
        in the header to switch between teams.
      </p>
      <label className="settings-field">
        <span className="settings-field-label">Team name</span>
        <input
          value={name}
          onChange={(e) => updateName(e.target.value)}
          placeholder="Side project"
          maxLength={120}
        />
      </label>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="create-team-key">
          Team key
        </label>
        <input
          id="create-team-key"
          aria-describedby="create-team-key-hint"
          value={key}
          onChange={(e) => {
            setKeyTouched(true);
            setKey(normalizeTeamKey(e.target.value));
          }}
          placeholder="SIDE"
          maxLength={8}
          spellCheck={false}
        />
        <span className="settings-field-hint" id="create-team-key-hint">
          Short label for refs and the header (2–8 characters, A–Z and 0–9).
        </span>
      </div>
      <label className="settings-checkbox">
        <input
          type="checkbox"
          checked={switchToNew}
          onChange={(e) => setSwitchToNew(e.target.checked)}
        />
        Switch to new team after creating
      </label>
      <button
        type="button"
        disabled={creating || !name.trim() || normalizeTeamKey(key).length < 2}
        onClick={() => void submit()}
      >
        {creating ? "Creating…" : "Create team"}
      </button>
    </section>
  );
}
