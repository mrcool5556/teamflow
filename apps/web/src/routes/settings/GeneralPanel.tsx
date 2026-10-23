import { Link } from "react-router";
import { CreateTeamSection } from "../../components/CreateTeamSection";
import { PanelStatus } from "../../components/PanelStatus";
import { usePanelStatus } from "../../lib/panelStatus";
import { useShell } from "../board/shellContext";

export function GeneralPanel() {
  const { onTeamCreated } = useShell();
  const { status, onMessage } = usePanelStatus();

  return (
    <div className="settings-panel">
      <header className="settings-panel-header">
        <h2>General</h2>
        <p className="settings-copy settings-lead">Create another team.</p>
        <p className="settings-hint">
          Looks, board size and sharing your look are under{" "}
          <Link to="../appearance">Appearance</Link>.
        </p>
      </header>
      <PanelStatus status={status} />

      <CreateTeamSection onMessage={onMessage} onTeamCreated={onTeamCreated} />
    </div>
  );
}
