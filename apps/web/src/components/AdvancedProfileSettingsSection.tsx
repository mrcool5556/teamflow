import { Link } from "react-router";

type AdvancedProfileSettingsSectionProps = {
  profileImportText: string;
  onProfileImportTextChange: (value: string) => void;
  profileMessage: string | null;
  onExportProfile: () => void | Promise<void>;
  onImportProfile: () => void | Promise<void>;
};

export function AdvancedProfileSettingsSection({
  profileImportText,
  onProfileImportTextChange,
  profileMessage,
  onExportProfile,
  onImportProfile,
}: AdvancedProfileSettingsSectionProps) {
  return (
    <section className="settings-section">
      <h3>Advanced</h3>
      <p className="settings-hint">
        Board column width and card height are now under{" "}
        <Link to="../appearance">Appearance → Board</Link>.
      </p>
      <details className="settings-advanced">
        <summary className="settings-advanced-toggle">Profile backup &amp; sharing</summary>
        <div className="settings-advanced-panel">
          <div className="settings-subsection">
            <p className="settings-copy">
              Download your profile JSON or paste one from another user. Import replaces your saved
              appearance and board preferences.
            </p>
            <div className="row settings-actions">
              <button type="button" onClick={() => void onExportProfile()}>
                Export profile
              </button>
            </div>
            <label>
              Import profile JSON
              <textarea
                className="profile-import"
                rows={6}
                value={profileImportText}
                onChange={(e) => onProfileImportTextChange(e.target.value)}
                placeholder="Paste exported profile JSON here…"
              />
            </label>
            <button
              type="button"
              className="ghost"
              disabled={!profileImportText.trim()}
              onClick={() => void onImportProfile()}
            >
              Import profile
            </button>
            {profileMessage ? <p className="settings-hint">{profileMessage}</p> : null}
          </div>
        </div>
      </details>
    </section>
  );
}
