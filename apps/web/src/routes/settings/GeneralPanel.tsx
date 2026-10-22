import { useState } from "react";
import { client } from "../../api";
import { AdvancedProfileSettingsSection } from "../../components/AdvancedProfileSettingsSection";
import { CreateTeamSection } from "../../components/CreateTeamSection";
import { PanelStatus } from "../../components/PanelStatus";
import { errorMessage } from "../../lib/errorSink";
import { usePanelStatus } from "../../lib/panelStatus";
import { useSession } from "../../session/session";
import { useShell } from "../board/shellContext";

export function GeneralPanel() {
  const { user, profile, updateProfile, replaceProfile } = useSession();
  const { onTeamCreated } = useShell();
  const { status, onMessage } = usePanelStatus();
  const [profileImportText, setProfileImportText] = useState("");
  const [profileMessage, setProfileMessage] = useState<string | null>(null);

  async function exportProfileFile() {
    setProfileMessage(null);
    try {
      const data = await client.exportProfile();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `teamflow-profile-${user?.name?.replace(/\s+/g, "-").toLowerCase() ?? "user"}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setProfileMessage("Profile exported. Share this file so others can import your layout.");
    } catch (err) {
      onMessage(errorMessage(err, "Failed to export profile"), "error");
    }
  }

  async function importProfileFile() {
    setProfileMessage(null);
    const raw = profileImportText.trim();
    if (!raw) return;
    try {
      const payload = JSON.parse(raw) as unknown;
      const { profile: imported } = await client.importProfile(payload);
      replaceProfile(imported);
      setProfileImportText("");
      setProfileMessage("Profile imported and saved to your account.");
    } catch (err) {
      onMessage(errorMessage(err, "Failed to import profile"), "error");
    }
  }

  return (
    <div className="settings-panel">
      <header className="settings-panel-header">
        <h2>General</h2>
        <p className="settings-copy settings-lead">
          Board layout, profile backup, and creating new teams.
        </p>
      </header>
      <PanelStatus status={status} />

      <AdvancedProfileSettingsSection
        profile={profile}
        onProfileChange={updateProfile}
        profileImportText={profileImportText}
        onProfileImportTextChange={setProfileImportText}
        profileMessage={profileMessage}
        onExportProfile={exportProfileFile}
        onImportProfile={importProfileFile}
      />

      <CreateTeamSection onMessage={onMessage} onTeamCreated={onTeamCreated} />
    </div>
  );
}
