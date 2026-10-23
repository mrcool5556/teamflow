import { useSession } from "../session/session";

/** "Saving… / ✓ Saved / Not saved · Retry" for the profile; nothing before the first change. */
export function ProfileSaveStatus() {
  const { profileSaveState, retryProfileSave } = useSession();
  if (profileSaveState === "idle") return null;
  return (
    <span className={`save-status save-status--${profileSaveState}`} role="status">
      {profileSaveState === "saving" ? "Saving…" : null}
      {profileSaveState === "saved" ? "✓ Saved" : null}
      {profileSaveState === "error" ? (
        <>
          Not saved ·{" "}
          <button type="button" className="link-btn" onClick={retryProfileSave}>
            Retry
          </button>
        </>
      ) : null}
    </span>
  );
}
