import type {
  ChromeStyle,
  ColorPreset,
  SemanticContrastMode,
  ShapePreset,
  TextContrastPreset,
  ThemeMode,
  UserProfile,
} from "@teamflow/core";
import {
  CHROME_STYLES,
  COLOR_PRESETS,
  DEFAULT_UI_ACCENT,
  DEFAULT_UI_PRIMARY,
  SEMANTIC_CONTRAST_MODES,
  SHAPE_PRESETS,
  TEXT_CONTRAST_PRESETS,
  UI_COLOR_PRESET_PALETTES,
  mergeUserProfile,
} from "@teamflow/core";
import { useRef } from "react";
import { CustomColorField } from "./CustomColorField";

type AppearanceSettingsSectionProps = {
  profile: UserProfile;
  onProfileChange: (profile: UserProfile) => void;
};

const COLOR_PRESET_LABELS: Record<ColorPreset, string> = {
  default: "Default",
  sunset: "Sunset",
  ocean: "Ocean",
  forest: "Forest",
  custom: "Custom",
};

const COLOR_PRESET_SWATCHES: Record<ColorPreset, string | null> = {
  default: DEFAULT_UI_PRIMARY,
  sunset: UI_COLOR_PRESET_PALETTES.sunset.primary,
  ocean: UI_COLOR_PRESET_PALETTES.ocean.primary,
  forest: UI_COLOR_PRESET_PALETTES.forest.primary,
  custom: null,
};

const CHROME_STYLE_LABELS: Record<ChromeStyle, string> = {
  industrial: "Industrial",
  minimal: "Minimal",
  soft: "Soft",
  classic: "Classic",
  glass: "Glass",
  terminal: "Terminal",
  paper: "Paper",
  neon: "Neon",
};

const CHROME_STYLE_HINTS: Record<ChromeStyle, string> = {
  industrial: "Thick borders and offset shadows — the default Teamflow look.",
  minimal: "Flat panels, thin borders, no drop shadows.",
  soft: "Light borders with gentle elevation shadows.",
  classic: "Balanced 2px chrome — closer to typical SaaS boards.",
  glass: "Frosted translucent panels over a soft color wash.",
  terminal: "Glow-accented borders — retro CLI control room.",
  paper: "Warm editorial surfaces with ink-like borders.",
  neon: "Dark stage with accent glow on interactive chrome.",
};

const SHAPE_LABELS: Record<ShapePreset, string> = {
  sharp: "Hard edge",
  soft: "Slightly rounded",
  round: "Rounded",
  octagon: "Octagon",
};

const TEXT_CONTRAST_LABELS: Record<TextContrastPreset, string> = {
  default: "Default",
  high: "High",
  muted: "Muted",
};

const SEMANTIC_CONTRAST_LABELS: Record<SemanticContrastMode, string> = {
  adapt: "Adapt to theme",
  preserve: "Keep team colors literal",
};

function patchAppearance(
  profile: UserProfile,
  appearance: Partial<UserProfile["appearance"]>,
) {
  return mergeUserProfile(profile, { appearance });
}

type SegmentOption<T extends string> = {
  value: T;
  label: string;
};

function AppearanceSegmentGroup<T extends string>({
  label,
  value,
  options,
  onChange,
  ariaLabel,
  className = "appearance-block",
}: {
  label: string;
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <span className="appearance-block-label">{label}</span>
      <div className="appearance-segment-group" role="radiogroup" aria-label={ariaLabel}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            className={`appearance-segment-btn ${value === option.value ? "active" : ""}`}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function AppearanceSettingsSection({
  profile,
  onProfileChange,
}: AppearanceSettingsSectionProps) {
  const { appearance } = profile;
  const custom = appearance.customColors;
  const customDraftRef = useRef({ ...custom });
  const showCustomColors = appearance.colorPreset === "custom";

  customDraftRef.current = { ...custom };

  return (
    <section className="settings-section appearance-settings">
      <AppearanceSegmentGroup
        label="Theme"
        value={appearance.theme}
        ariaLabel="Theme"
        options={[
          { value: "dark", label: "Dark" },
          { value: "light", label: "Light" },
        ]}
        onChange={(theme) =>
          onProfileChange(patchAppearance(profile, { theme: theme as ThemeMode }))
        }
      />

      <div className="appearance-block">
        <span className="appearance-block-label">UI color</span>
        <div className="appearance-preset-grid" role="radiogroup" aria-label="UI color">
          {COLOR_PRESETS.map((preset) => {
            const swatch = COLOR_PRESET_SWATCHES[preset];
            return (
              <button
                key={preset}
                type="button"
                role="radio"
                aria-checked={appearance.colorPreset === preset}
                className={`appearance-preset-btn ${appearance.colorPreset === preset ? "active" : ""}`}
                onClick={() =>
                  onProfileChange(patchAppearance(profile, { colorPreset: preset }))
                }
              >
                {swatch ? (
                  <span
                    className="appearance-preset-swatch"
                    style={{ background: swatch }}
                    aria-hidden="true"
                  />
                ) : null}
                {COLOR_PRESET_LABELS[preset]}
              </button>
            );
          })}
        </div>

        {showCustomColors ? (
          <div className="appearance-custom-colors">
            <div className="appearance-color-grid">
              <CustomColorField
                label="Primary"
                value={custom.primary ?? DEFAULT_UI_PRIMARY}
                profile={profile}
                colorKey="primary"
                customDraftRef={customDraftRef}
                onCommit={onProfileChange}
              />
              <CustomColorField
                label="Accent"
                value={custom.accent ?? DEFAULT_UI_ACCENT}
                profile={profile}
                colorKey="accent"
                customDraftRef={customDraftRef}
                onCommit={onProfileChange}
              />
              <CustomColorField
                label="Text"
                value={custom.text ?? (appearance.theme === "light" ? "#141414" : "#ececec")}
                profile={profile}
                colorKey="text"
                customDraftRef={customDraftRef}
                onCommit={onProfileChange}
              />
              <CustomColorField
                label="Soft text"
                value={custom.textSoft ?? (appearance.theme === "light" ? "#404040" : "#b8b8b8")}
                profile={profile}
                colorKey="textSoft"
                customDraftRef={customDraftRef}
                onCommit={onProfileChange}
              />
            </div>
          </div>
        ) : null}

        <AppearanceSegmentGroup
          label="Text contrast"
          value={appearance.textContrast}
          ariaLabel="Text contrast"
          className="appearance-subblock"
          options={TEXT_CONTRAST_PRESETS.map((preset) => ({
            value: preset,
            label: TEXT_CONTRAST_LABELS[preset],
          }))}
          onChange={(textContrast) =>
            onProfileChange(
              patchAppearance(profile, { textContrast: textContrast as TextContrastPreset }),
            )
          }
        />
      </div>

      <label className="appearance-select-field">
        UI style
        <select
          value={appearance.chromeStyle}
          onChange={(e) => {
            onProfileChange(
              patchAppearance(profile, { chromeStyle: e.target.value as ChromeStyle }),
            );
          }}
        >
          {CHROME_STYLES.map((chromeStyle) => (
            <option key={chromeStyle} value={chromeStyle}>
              {CHROME_STYLE_LABELS[chromeStyle]}
            </option>
          ))}
        </select>
      </label>
      <p className="muted appearance-style-hint">
        {CHROME_STYLE_HINTS[appearance.chromeStyle]}
      </p>

      <fieldset className="appearance-fieldset">
        <legend>Corner style</legend>
        <div className="appearance-shape-grid" role="radiogroup" aria-label="Corner style">
          {SHAPE_PRESETS.map((shape) => (
            <button
              key={shape}
              type="button"
              role="radio"
              aria-checked={appearance.shape === shape}
              className={`appearance-shape-option ${appearance.shape === shape ? "active" : ""}`}
              data-shape-preview={shape}
              onClick={() => onProfileChange(patchAppearance(profile, { shape }))}
            >
              <span className="appearance-shape-swatch" aria-hidden="true" />
              <span className="appearance-shape-label">{SHAPE_LABELS[shape]}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <label className="appearance-select-field">
        Team color display
        <select
          value={appearance.semanticContrast}
          onChange={(e) => {
            onProfileChange(
              patchAppearance(profile, {
                semanticContrast: e.target.value as SemanticContrastMode,
              }),
            );
          }}
        >
          {SEMANTIC_CONTRAST_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {SEMANTIC_CONTRAST_LABELS[mode]}
            </option>
          ))}
        </select>
      </label>
      <p className="muted appearance-settings-hint">
        {appearance.semanticContrast === "adapt"
          ? "Row and column tints adjust slightly for light or dark mode while keeping the same hue."
          : "Row and column colors use the same mixing as dark mode regardless of your theme."}
      </p>

      <details className="settings-advanced appearance-advanced">
        <summary className="settings-advanced-toggle">Advanced chrome tuning</summary>
        <div className="settings-advanced-panel">
          <p className="settings-copy">
            Fine-grained sliders for shadow depth, border weight, surface darkness, and glow
            intensity are planned here. Presets above set sensible defaults; advanced controls will
            layer on top without replacing your chosen UI style.
          </p>
          <p className="muted appearance-settings-hint">
            Tune while watching the live board preview.
          </p>
        </div>
      </details>
    </section>
  );
}
