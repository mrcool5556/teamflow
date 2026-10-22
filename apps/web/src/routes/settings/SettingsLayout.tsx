import { Outlet, useNavigate } from "react-router";
import { SettingsNav } from "../../components/SettingsNav";
import { isSettingsPanel, settingsPath, useAppRoute } from "../../lib/appRoute";
import { useShell } from "../board/shellContext";
import { useLayer } from "../../ui/layerStack";

/** The settings sidebar: header, panel navigation and the panel route. */
export function SettingsLayout() {
  const navigate = useNavigate();
  const { settingsPanel } = useAppRoute();
  const { team, teamKey, access, closeSettings, settingsPointerDownRef } = useShell();
  const panel = isSettingsPanel(settingsPanel) ? settingsPanel : "general";

  useLayer({ open: true, onEscape: closeSettings });

  return (
    <aside
      className="settings-sidebar panel settings"
      onPointerDown={() => {
        settingsPointerDownRef.current = true;
      }}
    >
      <div className="settings-sidebar-header">
        <h2>Settings</h2>
        <button
          type="button"
          className="ghost settings-close-btn"
          aria-label="Close settings"
          onClick={closeSettings}
        >
          ×
        </button>
      </div>
      <div className="settings-shell">
        <SettingsNav
          panel={panel}
          onPanelChange={(next) => navigate(settingsPath(teamKey, next))}
          showTeam={Boolean(team)}
          showRoles={access.showRoles}
          showIntegrations={access.showIntegrations}
          showUpdates={access.showMaintenance}
        />
        <div className="settings-main">
          <Outlet />
        </div>
      </div>
    </aside>
  );
}
