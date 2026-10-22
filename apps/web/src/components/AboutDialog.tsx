import { TEAMFLOW_ABOUT, getVisibleSupportLinks } from "@teamflow/core";
import { Dialog } from "../ui/Dialog";
import { DialogTitle } from "../ui/DialogTitle";

type AboutDialogProps = {
  open: boolean;
  version: string;
  onClose: () => void;
};

export function AboutDialog({ open, version, onClose }: AboutDialogProps) {
  const supportLinks = getVisibleSupportLinks();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      backdropClassName="about-backdrop"
      className="about-dialog"
    >
      <header className="about-dialog-header">
        <div>
          <p className="eyebrow">{TEAMFLOW_ABOUT.name.toUpperCase()}</p>
          <DialogTitle>About</DialogTitle>
        </div>
        <button
          type="button"
          className="ghost drawer-close-btn"
          aria-label="Close"
          title="Close (Esc)"
          onClick={onClose}
        >
          ✕
        </button>
      </header>

      <p className="about-tagline">{TEAMFLOW_ABOUT.tagline}</p>

      <dl className="about-meta">
        <div>
          <dt>Version</dt>
          <dd>
            <code>v{version}</code>
          </dd>
        </div>
        <div>
          <dt>License</dt>
          <dd>
            <a href={TEAMFLOW_ABOUT.licenseUrl} target="_blank" rel="noreferrer">
              {TEAMFLOW_ABOUT.licenseName}
            </a>
          </dd>
        </div>
      </dl>

      <p className="about-license-note muted">
        Free to use and modify. If you run a modified version for others, you must share the source
        under the same license.
      </p>

      <div className="about-actions">
        <a
          className="about-link-btn"
          href={TEAMFLOW_ABOUT.githubUrl}
          target="_blank"
          rel="noreferrer"
        >
          View on GitHub
        </a>
        {supportLinks.map((link) => (
          <a
            key={link.label}
            className={link.accent ? "about-link-btn about-link-btn--accent" : "about-link-btn"}
            href={link.url}
            target="_blank"
            rel="noreferrer"
          >
            {link.label}
          </a>
        ))}
      </div>

      {supportLinks.map((link) =>
        link.qrImageUrl ? (
          <div key={`${link.label}-qr`} className="about-qr">
            <p className="about-qr-label">{link.label}</p>
            <img src={link.qrImageUrl} alt={`${link.label} QR code`} />
          </div>
        ) : null,
      )}
    </Dialog>
  );
}
