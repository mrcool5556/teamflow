import { useId, useState } from "react";
import { formatStorageBytes, type SpaceSettingsPublic } from "@teamflow/core";
import { PanelStatus } from "../../components/PanelStatus";
import { usePanelStatus } from "../../lib/panelStatus";
import { useSpaceSettingsQuery, useUpdateSpaceSettingsMutation } from "../../queries/instance";
import { CapField } from "./CapField";
import { bytesToGbText, capDraftFrom, capFromDraft, gbToBytes, type CapDraft } from "./capBytes";

/** Free-space cap, free spaces per user and the free-disk floor. New spaces only. */
export function DefaultsPanel() {
  const query = useSpaceSettingsQuery();
  const { status, onMessage } = usePanelStatus();
  return (
    <div className="settings-panel">
      <header className="settings-panel-header">
        <h2>Space defaults</h2>
        <p className="settings-copy settings-lead">
          What a new free space gets, how many each user may own, and when the server stops all
          uploads to protect its disk. Changing these never changes an existing space's cap.
        </p>
      </header>
      <PanelStatus status={status} />
      {query.data ? (
        <DefaultsForm settings={query.data} onMessage={onMessage} />
      ) : (
        <p className="settings-hint">Loading…</p>
      )}
    </div>
  );
}

function DefaultsForm({
  settings,
  onMessage,
}: {
  settings: SpaceSettingsPublic;
  onMessage: ReturnType<typeof usePanelStatus>["onMessage"];
}) {
  const save = useUpdateSpaceSettingsMutation();
  const perUserId = useId();
  const floorId = useId();
  const [cap, setCap] = useState<CapDraft>(() => capDraftFrom(settings.freeSpaceCapBytes));
  const [perUser, setPerUser] = useState(String(settings.freeSpacesPerUser));
  const [floor, setFloor] = useState(
    settings.minFreeDiskBytes > 0 ? bytesToGbText(settings.minFreeDiskBytes) : "0",
  );

  const capBytes = capFromDraft(cap);
  const perUserValue = Number(perUser);
  const perUserValid = Number.isInteger(perUserValue) && perUserValue >= 0 && perUserValue <= 1000;
  const floorBytes = floor.trim() === "0" ? 0 : gbToBytes(floor);
  const valid = typeof capBytes === "number" && perUserValid && floorBytes !== null;

  const submit = async () => {
    if (!valid) return;
    const next: Partial<SpaceSettingsPublic> = {
      freeSpaceCapBytes: capBytes,
      freeSpacesPerUser: perUserValue,
      minFreeDiskBytes: floorBytes,
    };
    try {
      await save.mutateAsync(next);
      onMessage("Space defaults saved. They apply to new spaces; existing caps stay.");
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "Could not save", "error");
    }
  };

  return (
    <form
      className="settings-section"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <CapField
        label="Free-space upload cap"
        value={cap}
        onChange={setCap}
        allowNoLimit={false}
        hint="New free spaces, and each new user's General, start with this."
      />
      <div className="settings-field">
        <label className="settings-field-label" htmlFor={perUserId}>
          Free spaces per user
        </label>
        <input
          id={perUserId}
          inputMode="numeric"
          value={perUser}
          aria-invalid={!perUserValid || undefined}
          onChange={(e) => setPerUser(e.target.value)}
        />
        <span className="settings-field-hint">
          Their General counts. Signing up always works; New team is refused past this.
        </span>
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor={floorId}>
          Keep this much disk free (GB)
        </label>
        <input
          id={floorId}
          inputMode="decimal"
          value={floor}
          aria-invalid={floorBytes === null || undefined}
          onChange={(e) => setFloor(e.target.value)}
        />
        <span className="settings-field-hint">
          Uploads pause for every space while free disk is under this. 0 turns it off.
          {floorBytes ? ` Now ${formatStorageBytes(floorBytes)}.` : ""}
        </span>
      </div>
      <button type="submit" disabled={!valid || save.isPending}>
        {save.isPending ? "Saving…" : "Save defaults"}
      </button>
    </form>
  );
}
