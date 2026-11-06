import { MAX_MIX_NAME_LENGTH, MAX_SAVED_MIXES, type SavedMix } from "@teamflow/core";
import { useEffect, useState, type FormEvent } from "react";
import { applyMix, canSaveMix, deleteMix, mixInUse, renameMix, saveMix } from "../lib/savedMixes";
import { useSession } from "../session/session";
import { Toast } from "../ui/BottomDock";

/** Design page: save the current look as a named mix, and use, rename or delete saved ones. */
export function SavedMixes() {
  const { profile, updateProfile } = useSession();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");
  const [deleted, setDeleted] = useState<{ mix: SavedMix; index: number } | null>(null);

  useEffect(() => {
    if (!deleted) return;
    const id = window.setTimeout(() => setDeleted(null), 8000);
    return () => window.clearTimeout(id);
  }, [deleted]);

  const full = !canSaveMix(profile);

  function submitNew(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    updateProfile(saveMix(profile, name));
    setName("");
    setNaming(false);
  }

  function submitRename(e: FormEvent, id: string) {
    e.preventDefault();
    updateProfile(renameMix(profile, id, renameText));
    setRenaming(null);
  }

  function remove(mix: SavedMix) {
    setDeleted({ mix, index: profile.mixes.findIndex((m) => m.id === mix.id) });
    updateProfile(deleteMix(profile, mix.id));
  }

  function undoDelete() {
    if (!deleted) return;
    const mixes = [...profile.mixes];
    mixes.splice(deleted.index, 0, deleted.mix);
    updateProfile({ ...profile, mixes: mixes.slice(0, MAX_SAVED_MIXES) });
    setDeleted(null);
  }

  return (
    <div className="saved-mixes">
      {profile.mixes.length === 0 ? (
        <p className="saved-mixes-empty">
          No saved mixes yet. Save the look you have now to come back to it later.
        </p>
      ) : (
        <ul className="saved-mixes-list" aria-label="Your mixes">
          {profile.mixes.map((mix) => {
            const inUse = mixInUse(profile.appearance, mix);
            return (
              <li key={mix.id} className={`saved-mix${inUse ? " saved-mix--in-use" : ""}`}>
                {renaming === mix.id ? (
                  <form className="saved-mix-rename" onSubmit={(e) => submitRename(e, mix.id)}>
                    <input
                      type="text"
                      aria-label={`New name for ${mix.name}`}
                      value={renameText}
                      maxLength={MAX_MIX_NAME_LENGTH}
                      autoFocus
                      onChange={(e) => setRenameText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          e.stopPropagation();
                          setRenaming(null);
                        }
                      }}
                    />
                    <button type="submit" disabled={!renameText.trim()}>
                      Save
                    </button>
                  </form>
                ) : (
                  <>
                    <span className="saved-mix-name">{mix.name}</span>
                    {inUse ? (
                      <span className="saved-mix-badge">in use</span>
                    ) : (
                      <button
                        type="button"
                        className="ghost saved-mix-use"
                        aria-label={`Use ${mix.name}`}
                        onClick={() => updateProfile(applyMix(profile, mix))}
                      >
                        Use
                      </button>
                    )}
                    <button
                      type="button"
                      className="link-btn"
                      aria-label={`Rename ${mix.name}`}
                      onClick={() => {
                        setRenaming(mix.id);
                        setRenameText(mix.name);
                      }}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="link-btn saved-mix-delete"
                      aria-label={`Delete ${mix.name}`}
                      onClick={() => remove(mix)}
                    >
                      Delete
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {naming ? (
        <form className="saved-mix-new" onSubmit={submitNew}>
          <input
            type="text"
            aria-label="Name for this mix"
            placeholder="Name this mix"
            value={name}
            maxLength={MAX_MIX_NAME_LENGTH}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                setNaming(false);
              }
            }}
          />
          <button type="submit" disabled={!name.trim()}>
            Save
          </button>
          <button type="button" className="ghost" onClick={() => setNaming(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <button
          type="button"
          className="ghost saved-mix-save"
          disabled={full}
          onClick={() => setNaming(true)}
        >
          Save as new mix…
        </button>
      )}
      {full ? (
        <p className="saved-mixes-full">
          You have {MAX_SAVED_MIXES} mixes, the most there can be. Delete one to save another.
        </p>
      ) : null}

      {deleted ? (
        <Toast onDismiss={() => setDeleted(null)}>
          Deleted “{deleted.mix.name}”.{" "}
          <button type="button" className="link-btn" onClick={undoDelete}>
            Undo
          </button>
        </Toast>
      ) : null}
    </div>
  );
}
