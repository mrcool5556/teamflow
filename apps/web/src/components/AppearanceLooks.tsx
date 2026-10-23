import type { CSSProperties } from "react";
import { mergeUserProfile, type UserProfile } from "@teamflow/core";
import { activeLook, applyLook, LOOKS, nearestLook, type Look } from "../lib/appearanceLooks";

type AppearanceLooksProps = {
  profile: UserProfile;
  onProfileChange: (profile: UserProfile) => void;
};

function swatchStyle(look: Look) {
  const { swatch } = look;
  return {
    "--look-bg": swatch.background,
    "--look-surface": swatch.surface,
    "--look-border": swatch.border,
    "--look-text": swatch.text,
    "--look-primary": swatch.primary,
    "--look-accent": swatch.accent,
    "--look-radius": swatch.radius,
    "--look-border-width": swatch.borderWidth,
    "--look-shadow": swatch.shadow,
  } as CSSProperties;
}

/** Named looks: one click sets theme, colour, style and corners together. */
export function AppearanceLooks({ profile, onProfileChange }: AppearanceLooksProps) {
  const current = activeLook(profile.appearance);
  const nearest = current ? null : nearestLook(profile.appearance);

  const choose = (look: Look) =>
    onProfileChange(mergeUserProfile(profile, { appearance: applyLook(profile.appearance, look) }));

  return (
    <>
      <p className="appearance-looks-status" aria-live="polite">
        {current ? (
          <>
            Current look: <strong>{current.name}</strong>
          </>
        ) : (
          <>
            {nearest ? (
              <>
                <strong>{nearest.name}</strong> · customised.{" "}
                <button type="button" className="link-btn" onClick={() => choose(nearest)}>
                  Back to {nearest.name}
                </button>
              </>
            ) : (
              <>Your own look (customised below).</>
            )}
          </>
        )}
      </p>
      <div className="appearance-looks" role="radiogroup" aria-label="Looks">
        {LOOKS.map((look) => {
          const selected = current?.id === look.id;
          return (
            <button
              key={look.id}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`appearance-look${selected ? " active" : ""}`}
              style={swatchStyle(look)}
              onClick={() => choose(look)}
            >
              <span className="appearance-look-preview" aria-hidden="true">
                <span className="appearance-look-card" />
                <span className="appearance-look-card" />
                <span className="appearance-look-button" />
              </span>
              <span className="appearance-look-name">
                {look.name}
                <small>{look.settings.theme}</small>
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}
