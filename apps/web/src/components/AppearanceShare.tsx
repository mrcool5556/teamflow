import { useEffect, useState } from "react";
import type { UserProfile } from "@teamflow/core";
import { downloadBlob } from "../lib/download";
import { buildLookExport, parseLookText, withImportedLook } from "../lib/appearanceShare";
import { applyUserProfile } from "../profile";
import { useSession } from "../session/session";

/** Download or copy your look, or import someone else's with a preview before it is used. */
export function AppearanceShare() {
  const { user, profile, profileRef, updateProfile } = useSession();
  const [message, setMessage] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<UserProfile | null>(null);

  // A previewed look only paints the page; put the saved one back if we leave mid-preview.
  useEffect(() => {
    if (!candidate) return;
    applyUserProfile(candidate);
    // On purpose: restore whatever is saved when the preview ends, not what was saved before.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => applyUserProfile(profileRef.current);
  }, [candidate, profileRef]);

  const exportText = () =>
    JSON.stringify(
      buildLookExport(profile, user ? { name: user.name, email: user.email } : undefined),
      null,
      2,
    );

  function download() {
    const name = user?.name?.replace(/\s+/g, "-").toLowerCase() ?? "my";
    downloadBlob(
      new Blob([exportText()], { type: "application/json" }),
      `${name}-teamflow-look.json`,
    );
    setMessage("Look downloaded. Send the file to anyone who wants it.");
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(exportText());
      setMessage("Look copied. Paste it into a message.");
    } catch {
      setMessage("Could not copy here; use Download instead.");
    }
  }

  function preview(text: string) {
    setImportError(null);
    try {
      setCandidate(withImportedLook(profileRef.current, parseLookText(text)));
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "That is not a Teamflow look.");
    }
  }

  function closeImport() {
    setCandidate(null);
    setImportOpen(false);
    setImportText("");
    setImportError(null);
  }

  return (
    <div className="appearance-share">
      <p className="settings-copy appearance-share-intro">
        Send your look to someone, or use one they sent you. Theme, colours, style and board size
        come along; nothing about your teams does.
      </p>
      <div className="appearance-share-actions">
        <button type="button" className="ghost" onClick={download}>
          ⇩ Download look
        </button>
        <button type="button" className="ghost" onClick={() => void copy()}>
          ⧉ Copy as text
        </button>
        <button
          type="button"
          className="ghost"
          aria-expanded={importOpen}
          onClick={() => (importOpen ? closeImport() : setImportOpen(true))}
        >
          ⇪ Import a look…
        </button>
      </div>
      {message ? (
        <p className="settings-hint" role="status">
          {message}
        </p>
      ) : null}

      {importOpen ? (
        <div className="appearance-share-import">
          {candidate ? (
            <>
              <p className="appearance-share-previewing" role="status">
                Previewing the imported look on this page.
              </p>
              <div className="appearance-share-actions">
                <button
                  type="button"
                  onClick={() => {
                    updateProfile(candidate);
                    closeImport();
                    setMessage("Imported look is now yours.");
                  }}
                >
                  Use this look
                </button>
                <button type="button" className="ghost" onClick={() => setCandidate(null)}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <label className="appearance-share-file">
                <span>Choose a file</span>
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void file.text().then(preview);
                    e.target.value = "";
                  }}
                />
              </label>
              <label className="appearance-share-paste">
                <span>…or paste the text</span>
                <textarea
                  rows={5}
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder="Paste a look here"
                />
              </label>
              <button
                type="button"
                className="ghost"
                disabled={!importText.trim()}
                onClick={() => preview(importText)}
              >
                Preview
              </button>
              {importError ? (
                <p className="appearance-share-error" role="alert">
                  {importError}
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
