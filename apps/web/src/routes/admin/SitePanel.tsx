import { PanelStatus } from "../../components/PanelStatus";
import { usePanelStatus } from "../../lib/panelStatus";
import { useMailSettingsQuery, useSiteSettingsQuery } from "../../queries/site";
import { MailForm, SiteForm } from "./siteForms";

/** Site name, public address and outgoing email (the same forms as setup steps 2 and 3). */
export function SitePanel() {
  const site = useSiteSettingsQuery();
  const mail = useMailSettingsQuery();
  const { status, onMessage } = usePanelStatus();
  return (
    <div className="settings-panel">
      <header className="settings-panel-header">
        <h2>Site &amp; email</h2>
        <p className="settings-copy settings-lead">
          What the server is called, the address people open it at, and how it sends email. Changes
          apply at once. Anything set in .env wins and shows as read-only.
        </p>
      </header>
      <PanelStatus status={status} />
      <h3 className="settings-section-title">Name and address</h3>
      {site.data ? (
        <SiteForm
          key={`${site.data.siteName}|${site.data.publicUrl}`}
          site={site.data}
          submitLabel="Save name and address"
          onSaved={() => onMessage("Name and address saved.")}
        />
      ) : (
        <p className="settings-hint">Loading…</p>
      )}
      <h3 className="settings-section-title">Email</h3>
      {mail.data ? (
        <MailForm
          mail={mail.data}
          submitLabel="Save email"
          onSaved={() => onMessage("Email settings saved.")}
        />
      ) : (
        <p className="settings-hint">Loading…</p>
      )}
    </div>
  );
}
