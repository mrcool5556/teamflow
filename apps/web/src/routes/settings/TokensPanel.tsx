import { useState } from "react";
import { client } from "../../api";
import { PanelStatus } from "../../components/PanelStatus";
import { errorMessage } from "../../lib/errorSink";
import { usePanelStatus } from "../../lib/panelStatus";

export function TokensPanel() {
  const { status, onMessage } = usePanelStatus();
  const [patName, setPatName] = useState("Cursor MCP");
  const [createdPat, setCreatedPat] = useState<string | null>(null);

  async function createPat() {
    onMessage(null);
    try {
      const token = await client.createToken({
        name: patName,
        scopes: ["read", "write"],
      });
      setCreatedPat(token.token);
    } catch (err) {
      onMessage(errorMessage(err, "Failed to create token"), "error");
    }
  }

  return (
    <div className="settings-panel">
      <header className="settings-panel-header">
        <h2>API tokens</h2>
        <p className="settings-copy settings-lead">
          Personal access tokens for MCP, CLI, and the Discord bot.
        </p>
      </header>
      <PanelStatus status={status} />

      <section className="settings-section">
        <h3>Personal access tokens</h3>
        <p className="settings-copy">Use a PAT for MCP and CLI. It is shown once when created.</p>
        <div className="row">
          <input
            value={patName}
            onChange={(e) => setPatName(e.target.value)}
            placeholder="Token name"
          />
          <button type="button" onClick={() => void createPat()}>
            Create token
          </button>
        </div>
        {createdPat ? <pre className="token-box">{createdPat}</pre> : null}
      </section>
    </div>
  );
}
