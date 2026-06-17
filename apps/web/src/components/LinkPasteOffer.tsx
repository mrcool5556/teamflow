import { useEffect, useState } from "react";
import { defaultLinkLabel } from "../lib/richText";

export type LinkPasteTarget = {
  url: string;
  start: number;
  end: number;
};

type LinkPasteOfferProps = {
  target: LinkPasteTarget | null;
  onKeep: () => void;
  onShorten: (label: string) => void;
  /** Avoid textarea blur when clicking offer controls (e.g. description editor). */
  preventBlur?: boolean;
};

export function LinkPasteOffer({
  target,
  onKeep,
  onShorten,
  preventBlur = true,
}: LinkPasteOfferProps) {
  const [label, setLabel] = useState("");

  useEffect(() => {
    if (!target) return;
    setLabel(defaultLinkLabel(target.url));
  }, [target]);

  if (!target) return null;

  return (
    <div
      className="link-paste-offer"
      role="status"
      onMouseDown={preventBlur ? (e) => e.preventDefault() : undefined}
    >
      <p className="link-paste-offer-copy">
        Link pasted — it&apos;ll stay clickable. Shorten the display text?
      </p>
      <div className="link-paste-offer-row">
        <input
          className="link-paste-offer-input"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Short label"
          aria-label="Short link label"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (label.trim()) onShorten(label.trim());
            }
            if (e.key === "Escape") {
              e.preventDefault();
              onKeep();
            }
          }}
        />
        <button type="button" className="ghost" onClick={onKeep}>
          Keep URL
        </button>
        <button
          type="button"
          disabled={!label.trim()}
          onClick={() => onShorten(label.trim())}
        >
          Shorten
        </button>
      </div>
    </div>
  );
}
