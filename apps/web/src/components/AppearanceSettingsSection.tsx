import type {
  ChromeStyle,
  ColorPreset,
  ShapePreset,
  TextContrastPreset,
  ThemeMode,
  UserProfile,
} from "@teamflow/core";
import {
  CHROME_STYLES,
  COLOR_PRESETS,
  DEFAULT_BOARD_COLUMN_WIDTH,
  DEFAULT_CARD_MIN_HEIGHT,
  DEFAULT_UI_ACCENT,
  DEFAULT_UI_PRIMARY,
  SHAPE_PRESETS,
  TEXT_CONTRAST_PRESETS,
  UI_COLOR_PRESET_PALETTES,
  mergeUserProfile,
} from "@teamflow/core";
import { useRef, type ReactNode } from "react";
import { AppearanceBoardControls } from "./AppearanceBoardControls";
import { AppearanceLooks } from "./AppearanceLooks";
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

/** Primary then accent; custom shows a colour wheel until its colours are picked. */
const COLOR_PRESET_SWATCHES: Record<ColorPreset, [string, string] | null> = {
  default: [DEFAULT_UI_PRIMARY, DEFAULT_UI_ACCENT],
  sunset: [UI_COLOR_PRESET_PALETTES.sunset.primary, UI_COLOR_PRESET_PALETTES.sunset.accent],
  ocean: [UI_COLOR_PRESET_PALETTES.ocean.primary, UI_COLOR_PRESET_PALETTES.ocean.accent],
  forest: [UI_COLOR_PRESET_PALETTES.forest.primary, UI_COLOR_PRESET_PALETTES.forest.accent],
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

function patchAppearance(profile: UserProfile, appearance: Partial<UserProfile["appearance"]>) {
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

/** One titled group of appearance controls (Colour, Shape & style, Board). */
export function AppearanceGroup({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const id = `appearance-group-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <section className="appearance-group" aria-labelledby={id}>
      <header className="appearance-group-header">
        <h3 id={id}>{title}</h3>
        {actions}
      </header>
      {children}
    </section>
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
    <div className="appearance-settings">
      <AppearanceGroup title="Looks">
        <AppearanceLooks profile={profile} onProfileChange={onProfileChange} />
      </AppearanceGroup>

      <h3 className="appearance-customise-heading">Customise</h3>
      <AppearanceGroup title="Colour">
        <AppearanceSegmentGroup
          label="Theme"
          value={appearance.theme}
          ariaLabel="Theme"
          options={[
            { value: "dark", label: "Dark" },
            { value: "light", label: "Light" },
            { value: "system", label: "Match system" },
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
                  onClick={() => onProfileChange(patchAppearance(profile, { colorPreset: preset }))}
                >
                  <span
                    className={`appearance-preset-swatch${swatch ? "" : " appearance-preset-swatch--custom"}`}
                    style={
                      swatch
                        ? {
                            background: `conic-gradient(${swatch[0]} 0 50%, ${swatch[1]} 50% 100%)`,
                          }
                        : undefined
                    }
                    aria-hidden="true"
                  />
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

        <label className="appearance-switch">
          <input
            type="checkbox"
            role="switch"
            checked={appearance.semanticContrast === "preserve"}
            onChange={(e) =>
              onProfileChange(
                patchAppearance(profile, {
                  semanticContrast: e.target.checked ? "preserve" : "adapt",
                }),
              )
            }
          />
          <span className="appearance-switch-track" aria-hidden="true" />
          <span>
            Keep exact team colours
            <span className="appearance-switch-hint">
              Off: row and column colours are toned to suit light or dark. On: they stay exactly as
              picked.
            </span>
          </span>
        </label>
      </AppearanceGroup>

      <AppearanceGroup title="Shape & style">
        <div className="appearance-block">
          <span className="appearance-block-label">UI style</span>
          <div className="appearance-style-grid" role="radiogroup" aria-label="UI style">
            {CHROME_STYLES.map((chromeStyle) => (
              <button
                key={chromeStyle}
                type="button"
                role="radio"
                aria-checked={appearance.chromeStyle === chromeStyle}
                title={CHROME_STYLE_HINTS[chromeStyle]}
                className={`appearance-style-tile${appearance.chromeStyle === chromeStyle ? " active" : ""}`}
                data-style-preview={chromeStyle}
                onClick={() => onProfileChange(patchAppearance(profile, { chromeStyle }))}
              >
                <span className="appearance-style-swatch" aria-hidden="true" />
                {CHROME_STYLE_LABELS[chromeStyle]}
              </button>
            ))}
          </div>
        </div>
        <p className="muted appearance-style-hint">{CHROME_STYLE_HINTS[appearance.chromeStyle]}</p>

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
      </AppearanceGroup>

      <AppearanceGroup
        title="Board"
        actions={
          <button
            type="button"
            className="link-btn appearance-group-reset"
            onClick={() =>
              onProfileChange(
                mergeUserProfile(profile, {
                  board: {
                    columnWidth: DEFAULT_BOARD_COLUMN_WIDTH,
                    columnWidthMode: "auto",
                    cardMinHeight: DEFAULT_CARD_MIN_HEIGHT,
                  },
                }),
              )
            }
          >
            Reset board
          </button>
        }
      >
        <AppearanceBoardControls profile={profile} onProfileChange={onProfileChange} />
      </AppearanceGroup>
    </div>
  );
}
