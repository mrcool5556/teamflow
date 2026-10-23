import { AppearanceSettingsSection } from "../../components/AppearanceSettingsSection";
import { BoardLayoutPreview } from "../../components/BoardLayoutPreview";
import { useSession } from "../../session/session";

export function AppearancePanel() {
  const { profile, updateProfile } = useSession();
  return (
    <div className="settings-panel appearance-panel">
      <header className="settings-panel-header">
        <h2>Appearance</h2>
        <p className="settings-copy settings-lead">
          Pick a look, then fine-tune it. Changes apply as you go.
        </p>
      </header>

      <div className="appearance-layout">
        <AppearanceSettingsSection profile={profile} onProfileChange={updateProfile} />
        <aside className="appearance-preview" aria-label="Preview">
          <p className="appearance-preview-caption">Preview</p>
          <div className="appearance-preview-frame board-preview-surface" aria-hidden="true">
            <BoardLayoutPreview />
          </div>
        </aside>
      </div>
    </div>
  );
}
