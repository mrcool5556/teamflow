import { useRef, useState } from "react";
import { formatStorageBytes, type InstanceSpaceDetailPublic, type SpaceType } from "@teamflow/core";
import { Dialog } from "../../ui/Dialog";
import { DialogTitle } from "../../ui/DialogTitle";
import {
  useCreateSpaceMutation,
  useInstanceUsersQuery,
  useSpaceSettingsQuery,
} from "../../queries/instance";
import { useSession } from "../../session/session";
import { CapField } from "./CapField";
import { capFromDraft, type CapDraft } from "./capBytes";

/** "Client portal" -> "CP"; 2-8 uppercase letters and digits, as team keys need. */
function suggestKey(name: string) {
  const words = name.toUpperCase().match(/[A-Z0-9]+/g) ?? [];
  const key = words.length > 1 ? words.map((word) => word[0]).join("") : (words[0] ?? "");
  return key.slice(0, 8);
}

export function CreateSpaceDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (space: InstanceSpaceDetailPublic) => void;
}) {
  const { user } = useSession();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  const [spaceType, setSpaceType] = useState<SpaceType>("admin");
  const [cap, setCap] = useState<CapDraft>({ gbText: "10", noLimit: false });
  const [ownerQuery, setOwnerQuery] = useState("");
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const settings = useSpaceSettingsQuery().data;
  const users = useInstanceUsersQuery(ownerQuery).data ?? [];
  const create = useCreateSpaceMutation();

  const effectiveKey = keyTouched ? key : suggestKey(name);
  const owner = users.find((u) => u.id === (ownerId ?? user?.id)) ?? null;
  const capBytes = capFromDraft(cap);
  const keyValid = /^[A-Z0-9]{2,8}$/.test(effectiveKey);
  const canSubmit =
    name.trim().length > 0 &&
    keyValid &&
    (spaceType === "free" || capBytes !== "invalid") &&
    !create.isPending;

  const submit = async () => {
    if (!canSubmit) return;
    setError(null);
    try {
      const space = await create.mutateAsync({
        name: name.trim(),
        key: effectiveKey,
        spaceType,
        ...(spaceType === "admin" && capBytes !== "invalid" ? { capBytes } : {}),
        ...(ownerId ? { ownerUserId: ownerId } : {}),
      });
      onCreated(space);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the space");
    }
  };

  return (
    <Dialog
      onClose={onClose}
      backdropClassName="quick-add-backdrop"
      className="quick-add-modal admin-dialog"
      as="form"
      initialFocusRef={nameRef}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <DialogTitle>New space</DialogTitle>
      <div className="admin-dialog-row">
        <label>
          Name
          <input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Key
          <input
            value={effectiveKey}
            maxLength={8}
            aria-invalid={(effectiveKey.length > 0 && !keyValid) || undefined}
            onChange={(e) => {
              setKeyTouched(true);
              setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""));
            }}
          />
        </label>
      </div>

      <fieldset className="admin-choice">
        <legend>Type</legend>
        {(["admin", "free"] as const).map((type) => (
          <label key={type} className={spaceType === type ? "active" : undefined}>
            <input
              type="radio"
              name="space-type"
              value={type}
              checked={spaceType === type}
              onChange={() => setSpaceType(type)}
            />
            <strong>{type === "admin" ? "Admin space" : "Free space"}</strong>
            <span>
              {type === "admin"
                ? "You set the upload allowance, or no limit."
                : `Default cap${settings ? ` (${formatStorageBytes(settings.freeSpaceCapBytes)})` : ""}. Counts toward the owner's free spaces.`}
            </span>
          </label>
        ))}
      </fieldset>

      {spaceType === "admin" ? (
        <CapField label="Upload allowance" value={cap} onChange={setCap} />
      ) : (
        <p className="settings-field-hint">
          Upload allowance:{" "}
          {settings ? formatStorageBytes(settings.freeSpaceCapBytes) : "the free-space default"}.
          Change the default in Space defaults, or pick Admin space for a custom allowance.
        </p>
      )}

      <label>
        Owner
        <input
          type="search"
          value={ownerQuery}
          placeholder={owner ? `${owner.name} (${owner.email})` : "Search users"}
          onChange={(e) => setOwnerQuery(e.target.value)}
        />
      </label>
      {ownerQuery ? (
        <ul className="admin-user-pick" aria-label="Users">
          {users.map((candidate) => (
            <li key={candidate.id}>
              <button
                type="button"
                onClick={() => {
                  setOwnerId(candidate.id);
                  setOwnerQuery("");
                }}
              >
                {candidate.name} <span>{candidate.email}</span>
              </button>
            </li>
          ))}
          {users.length === 0 ? <li className="settings-field-hint">No users match.</li> : null}
        </ul>
      ) : (
        <p className="settings-field-hint">
          {owner ? (
            <>
              {owner.name}
              {owner.id === user?.id ? " (you)" : ""} gets the Owner role.
              {spaceType === "free" && settings
                ? ` Owns ${owner.freeSpaces} of ${settings.freeSpacesPerUser} free spaces; an admin may go over.`
                : ""}
            </>
          ) : (
            "You get the Owner role."
          )}
        </p>
      )}

      {error ? (
        <p className="settings-hint settings-hint--warn" role="alert">
          {error}
        </p>
      ) : null}
      <div className="quick-add-actions">
        <button type="button" className="ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" disabled={!canSubmit}>
          {create.isPending ? "Creating…" : "Create space"}
        </button>
      </div>
    </Dialog>
  );
}
