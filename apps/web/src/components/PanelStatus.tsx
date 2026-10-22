import type { PanelStatusValue } from "../lib/panelStatus";

/** A settings panel's last message: errors in the error banner style, the rest as a hint. */
export function PanelStatus({ status }: { status: PanelStatusValue }) {
  if (!status) return null;
  return status.tone === "error" ? (
    <div className="banner error" role="alert">
      {status.text}
    </div>
  ) : (
    <p className="settings-hint" role="status">
      {status.text}
    </p>
  );
}
