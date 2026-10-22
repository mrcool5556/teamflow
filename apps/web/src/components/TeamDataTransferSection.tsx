import { useRef, useState } from "react";
import { client } from "../api";
import { errorMessage } from "../lib/errorSink";
import type { PanelMessage } from "../lib/panelStatus";
import { downloadBlob } from "../lib/download";

type TeamDataTransferSectionProps = {
  teamId: string;
  teamName: string;
  teamKey: string;
  onMessage: PanelMessage;
  onImported?: () => void;
};

export function TeamDataTransferSection({
  teamId,
  teamName,
  teamKey,
  onMessage,
  onImported,
}: TeamDataTransferSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [includeFiles, setIncludeFiles] = useState(false);
  const [forceImport, setForceImport] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  async function exportBundle() {
    setExporting(true);
    setStatusMessage(null);
    onMessage(null);
    try {
      const { blob, filename } = await client.exportTeamBundle(teamId, includeFiles);
      if (blob.size === 0) {
        throw new Error("Export returned an empty file");
      }
      downloadBlob(blob, filename);
      const message = `Exported ${teamKey} bundle${includeFiles ? " with files" : ""} for ${teamName}.`;
      setStatusMessage(message);
      onMessage(message);
    } catch (err) {
      const message = errorMessage(err, "Export failed");
      setStatusMessage(message);
      onMessage(message, "error");
    } finally {
      setExporting(false);
    }
  }

  async function importBundle(file: File) {
    setImporting(true);
    setStatusMessage(null);
    onMessage(null);
    try {
      const { result } = await client.importTeamBundle(teamId, file, { force: forceImport });
      if (result.skipped) {
        const message = `This bundle was already imported (export ${result.exportId.slice(0, 8)}…). Enable “Force re-import” to merge again.`;
        setStatusMessage(message);
        onMessage(message);
        return;
      }
      const message = `Imported ${result.issuesCreated} issues, ${result.rowsCreated} rows, ${result.commentsCreated} comments, ${result.filesCreated} files into ${teamName}.`;
      setStatusMessage(message);
      onMessage(message);
      onImported?.();
    } catch (err) {
      const message = errorMessage(err, "Import failed");
      setStatusMessage(message);
      onMessage(message, "error");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <section className="settings-section">
      <h3>Export &amp; import</h3>
      <p className="settings-copy">
        Download a portable <strong>teamflow-bundle/1</strong> zip of{" "}
        <strong>
          {teamKey} — {teamName}
        </strong>
        , or merge a bundle into this team. Assignees match by email; refs in descriptions are
        rewritten on import.
      </p>

      <div className="settings-subsection">
        <h4>Export</h4>
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={includeFiles}
            onChange={(e) => setIncludeFiles(e.target.checked)}
          />
          Include attached files (larger download)
        </label>
        <button type="button" disabled={exporting} onClick={() => void exportBundle()}>
          {exporting ? "Exporting…" : "Download bundle"}
        </button>
        {statusMessage ? <p className="settings-hint">{statusMessage}</p> : null}
      </div>

      <div className="settings-subsection">
        <h4>Import</h4>
        <p className="settings-hint">
          Merges rows, columns, issues, and comments into this team. Re-importing the same bundle is
          skipped unless forced.
        </p>
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={forceImport}
            onChange={(e) => setForceImport(e.target.checked)}
          />
          Force re-import (duplicate data if the same bundle was imported before)
        </label>
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip,application/zip"
          disabled={importing}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importBundle(file);
          }}
        />
        {importing ? <p className="settings-hint">Importing…</p> : null}
      </div>
    </section>
  );
}
