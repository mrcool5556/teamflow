import { PanelStatus } from "../../components/PanelStatus";
import { usePanelStatus } from "../../lib/panelStatus";
import { useInstanceOverviewQuery, useSpaceSettingsQuery } from "../../queries/instance";
import { useSignupSettingsQuery } from "../../queries/site";
import { StorageSignupForm } from "./siteForms";

/**
 * Free-space cap, free spaces per user, the free-disk floor and who can sign up (the same form
 * as setup step 4). New spaces only: existing caps never change.
 */
export function DefaultsPanel() {
  const settings = useSpaceSettingsQuery();
  const signup = useSignupSettingsQuery();
  const overview = useInstanceOverviewQuery();
  const { status, onMessage } = usePanelStatus();
  return (
    <div className="settings-panel">
      <header className="settings-panel-header">
        <h2>Flow defaults &amp; sign-up</h2>
        <p className="settings-copy settings-lead">
          What a new free Flow gets, how many each person may own, when the server stops all uploads
          to protect its disk, and who can make an account. Changing these never changes an existing
          Flow's cap.
        </p>
      </header>
      <PanelStatus status={status} />
      {settings.data && signup.data ? (
        <StorageSignupForm
          settings={settings.data}
          signup={signup.data}
          disk={overview.data?.disk ?? null}
          submitLabel="Save defaults"
          onSaved={() => onMessage("Defaults saved. They apply to new Flows; existing caps stay.")}
        />
      ) : (
        <p className="settings-hint">Loading…</p>
      )}
    </div>
  );
}
