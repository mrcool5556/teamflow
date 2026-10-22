import { PanelStatus } from "../../components/PanelStatus";
import { TeamSettingsSection } from "../../components/TeamSettingsSection";
import { usePanelStatus } from "../../lib/panelStatus";
import { useSession } from "../../session/session";
import { useShell } from "../board/shellContext";
import { RequirePanel } from "./RequirePanel";

export function TeamPanel() {
  const { user } = useSession();
  const shell = useShell();
  const { status, onMessage } = usePanelStatus();
  return (
    <RequirePanel>
      {(team) => (
        <div className="settings-panel">
          <header className="settings-panel-header">
            <h2>Team</h2>
            <p className="settings-copy settings-lead">
              Members, invites, and team lifecycle for <strong>{team.name}</strong>.
            </p>
          </header>
          <PanelStatus status={status} />

          <TeamSettingsSection
            teamId={team.id}
            teamName={team.name}
            teamKey={team.key}
            members={shell.members}
            currentUserId={user?.id ?? null}
            permissions={shell.permissions}
            onMessage={onMessage}
            onTeamJoined={shell.onTeamJoined}
            onTeamLeft={shell.onTeamLeft}
            onTeamDeleted={shell.onTeamDeleted}
            onBoardChanged={shell.reloadBoard}
          />
        </div>
      )}
    </RequirePanel>
  );
}
