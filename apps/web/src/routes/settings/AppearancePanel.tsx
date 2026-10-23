import { useState } from "react";
import { AppearanceSettingsSection } from "../../components/AppearanceSettingsSection";
import { BoardLayoutPreview } from "../../components/BoardLayoutPreview";
import { ProfileSaveStatus } from "../../components/ProfileSaveStatus";
import { NARROW_SCREEN, useMediaQuery } from "../../hooks/useMediaQuery";
import { useSession } from "../../session/session";

export function AppearancePanel() {
  const { profile, updateProfile } = useSession();
  const narrow = useMediaQuery(NARROW_SCREEN);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  return (
    <div className="settings-panel appearance-panel">
      <header className="settings-panel-header">
        <div className="settings-panel-title-row">
          <h2>Appearance</h2>
          <ProfileSaveStatus />
        </div>
        <p className="settings-copy settings-lead">
          Pick a look, then fine-tune it. Changes apply as you go.
        </p>
      </header>

      <div className="appearance-layout">
        <AppearanceSettingsSection profile={profile} onProfileChange={updateProfile} />
        <aside
          className={`appearance-preview${narrow && !previewExpanded ? " appearance-preview--strip" : ""}`}
          aria-label="Preview"
        >
          <div className="appearance-preview-bar">
            <p className="appearance-preview-caption">Preview</p>
            {narrow ? (
              <>
                <ProfileSaveStatus />
                <button
                  type="button"
                  className="link-btn appearance-preview-toggle"
                  aria-expanded={previewExpanded}
                  onClick={() => setPreviewExpanded((value) => !value)}
                >
                  {previewExpanded ? "Smaller" : "Bigger"}
                </button>
              </>
            ) : null}
          </div>
          <div className="appearance-preview-frame board-preview-surface" aria-hidden="true">
            <BoardLayoutPreview />
          </div>
        </aside>
      </div>
    </div>
  );
}
