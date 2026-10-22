import { useRef } from "react";
import { TEAMFLOW_ABOUT, getVisibleSupportLinks } from "@teamflow/core";
import { useLayer } from "../ui/layerStack";

type AboutDialogProps = {
  open: boolean;
  version: string;
  onClose: () => void;
};

export function AboutDialog({ open, version, onClose }: AboutDialogProps) {
  const supportLinks = getVisibleSupportLinks();

  const dialogRef = useRef<HTMLElement>(null);
  useLayer({ open, onEscape: onClose, modal: true, containerRef: dialogRef });

  if (!open) return null;

  return (
    <div className="about-backdrop" onClick={onClose}>
      <section
        ref={dialogRef}
        className="about-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="about-dialog-header">
          <div>
            <p className="eyebrow">{TEAMFLOW_ABOUT.name.toUpperCase()}</p>
            <h2 id="about-dialog-title">About</h2>
          </div>
          <button type="button" className="ghost" onClick={onClose}>
            Close
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
          Free to use and modify. If you run a modified version for others, you must share the
          source under the same license.
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
      </section>
    </div>
  );
}
