import { Outlet, useNavigate } from "react-router";
import { SettingsNav } from "../../components/SettingsNav";
import { isSettingsPanel, settingsPath, useAppRoute } from "../../lib/appRoute";
import { useShell } from "../board/shellContext";
import { useLayer } from "../../ui/layerStack";

/** Settings as a page: grouped navigation on the left, the panel in a readable column. */
export function SettingsLayout() {
  const navigate = useNavigate();
  const { settingsPanel } = useAppRoute();
  const { team, teamKey, access, closeSettings } = useShell();
  const panel = isSettingsPanel(settingsPanel) ? settingsPanel : "general";

  useLayer({ open: true, onEscape: closeSettings });

  return (
    <div className="settings-page">
      <aside className="settings-sidebar">
        <button type="button" className="ghost settings-back-btn" onClick={closeSettings}>
          <span aria-hidden="true">←</span> Back to board
          <kbd className="settings-back-kbd" aria-hidden="true">
            Esc
          </kbd>
        </button>
        <h2 className="settings-title">Settings</h2>
        <SettingsNav
          panel={panel}
          onPanelChange={(next) => navigate(settingsPath(teamKey, next))}
          teamKey={team?.key ?? null}
          showTeam={Boolean(team)}
          showRoles={access.showRoles}
          showIntegrations={access.showIntegrations}
          showUpdates={access.showMaintenance}
        />
      </aside>
      <main className="settings-main">
        <div className={`settings-column${panel === "appearance" ? " settings-column--wide" : ""}`}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
