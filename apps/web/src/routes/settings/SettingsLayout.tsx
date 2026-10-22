import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router";
import { SettingsNav } from "../../components/SettingsNav";
import { isSettingsPanel, settingsPath, useAppRoute } from "../../lib/appRoute";
import { useShell } from "../board/shellContext";

/** The settings sidebar: header, panel navigation and the panel route. */
export function SettingsLayout() {
  const navigate = useNavigate();
  const { settingsPanel } = useAppRoute();
  const { team, teamKey, access, closeSettings, settingsPointerDownRef } = useShell();
  const panel = isSettingsPanel(settingsPanel) ? settingsPanel : "general";

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeSettings();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeSettings]);

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
