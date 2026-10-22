import { AppearanceSettingsSection } from "../../components/AppearanceSettingsSection";
import { useSession } from "../../session/session";

export function AppearancePanel() {
  const { profile, updateProfile } = useSession();
  return (
    <div className="settings-panel">
      <header className="settings-panel-header">
        <h2>Appearance</h2>
        <p className="settings-copy settings-lead">
          Personalize how you feel your board should be.
        </p>
      </header>

      <AppearanceSettingsSection profile={profile} onProfileChange={updateProfile} />
    </div>
  );
}
