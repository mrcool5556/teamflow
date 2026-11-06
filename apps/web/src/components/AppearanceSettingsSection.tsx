import type { ColorPreset, ThemeMode, UserProfile } from "@teamflow/core";
import {
  COLOR_PRESETS,
  DEFAULT_UI_ACCENT,
  DEFAULT_UI_PRIMARY,
  SHAPE_PRESETS,
  UI_COLOR_PRESET_PALETTES,
  mergeUserProfile,
} from "@teamflow/core";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { NARROW_SCREEN, useMediaQuery } from "../hooks/useMediaQuery";
import { RESET_LABELS, resetAppearance, type ResetScope } from "../lib/appearanceReset";
import {
  ACCENT_OPTIONS,
  CORNER_OPTIONS,
  currentColourChoice,
  hasPartner,
  labelOf,
  TEXT_OPTIONS,
} from "../lib/designAspects";
import { paintedTheme } from "../profile";
import { Toast } from "../ui/BottomDock";
import { AppearanceBoardControls } from "./AppearanceBoardControls";
import { AppearanceLooks } from "./AppearanceLooks";
import { AppearanceShare } from "./AppearanceShare";
import { CustomColorField } from "./CustomColorField";
import { DesignPageLink } from "./DesignPageLink";

type AppearanceSettingsSectionProps = {
  profile: UserProfile;
  onProfileChange: (profile: UserProfile) => void;
};

/** Primary then accent for the preset swatches; custom shows a colour wheel. */
const COLOR_PRESET_SWATCHES: Record<Exclude<ColorPreset, "default">, [string, string] | null> = {
  sunset: [UI_COLOR_PRESET_PALETTES.sunset.primary, UI_COLOR_PRESET_PALETTES.sunset.accent],
  ocean: [UI_COLOR_PRESET_PALETTES.ocean.primary, UI_COLOR_PRESET_PALETTES.ocean.accent],
  forest: [UI_COLOR_PRESET_PALETTES.forest.primary, UI_COLOR_PRESET_PALETTES.forest.accent],
  custom: null,
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
  disabled = false,
}: {
  label: string;
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
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
            disabled={disabled}
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

/**
 * One titled group of appearance controls. On phones a `collapsible` group starts closed and its
 * title becomes the toggle; on wider screens every group is open.
 */
export function AppearanceGroup({
  title,
  actions,
  collapsible = false,
  children,
}: {
  title: string;
  actions?: ReactNode;
  collapsible?: boolean;
  children: ReactNode;
}) {
  const narrow = useMediaQuery(NARROW_SCREEN);
  const [openOnPhone, setOpenOnPhone] = useState(false);
  const canCollapse = collapsible && narrow;
  const open = !canCollapse || openOnPhone;
  const id = `appearance-group-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <section
      className={`appearance-group${open ? "" : " appearance-group--collapsed"}`}
      aria-labelledby={id}
    >
      <header className="appearance-group-header">
        <h3 id={id}>
          {canCollapse ? (
            <button
              type="button"
              className="appearance-group-toggle"
              aria-expanded={open}
              onClick={() => setOpenOnPhone((value) => !value)}
            >
              {title}
              <span aria-hidden="true">{open ? "▴" : "▾"}</span>
            </button>
          ) : (
            title
          )}
        </h3>
        {open ? actions : null}
      </header>
      {open ? children : null}
    </section>
  );
}

/**
 * Appearance, the simple panel: pick a look, then a few quick changes. Everything else (fonts,
 * windows and cards, buttons, fields, switches, UI style) is on the Design page.
 */
export function AppearanceSettingsSection({
  profile,
  onProfileChange,
}: AppearanceSettingsSectionProps) {
  const { appearance } = profile;
  const custom = appearance.customColors;
  const customDraftRef = useRef({ ...custom });
  customDraftRef.current = { ...custom };

  const [undo, setUndo] = useState<{ label: string; previous: UserProfile } | null>(null);
  useEffect(() => {
    if (!undo) return;
    const id = window.setTimeout(() => setUndo(null), 8000);
    return () => window.clearTimeout(id);
  }, [undo]);

  const reset = (scope: ResetScope) => {
    setUndo({ label: RESET_LABELS[scope], previous: profile });
    onProfileChange(resetAppearance(profile, scope));
  };

  const painted = paintedTheme(appearance);
  const colour = currentColourChoice(appearance, painted);
  const paired = hasPartner(appearance.colorTheme);
  // "Theme's own" shows the colour theme's own accent and page colour.
  const ownSwatch: [string, string] = [colour.swatch[3], colour.swatch[0]];

  return (
    <div className="appearance-settings">
      <AppearanceGroup
        title="Looks"
        actions={
          <button
            type="button"
            className="link-btn appearance-group-reset"
            onClick={() => reset("all")}
          >
            Reset all to default
          </button>
        }
      >
        <AppearanceLooks profile={profile} onProfileChange={onProfileChange} />
      </AppearanceGroup>

      <AppearanceGroup title="Quick changes" collapsible>
        <AppearanceSegmentGroup
          label="Light or dark"
          value={appearance.theme}
          ariaLabel="Light or dark"
          options={[
            { value: "dark", label: "Dark" },
            { value: "light", label: "Light" },
            { value: "system", label: "Match system" },
          ]}
          disabled={!paired}
          onChange={(theme) =>
            onProfileChange(patchAppearance(profile, { theme: theme as ThemeMode }))
          }
        />
        {paired ? null : (
          <p className="appearance-quick-note">
            {colour.label} has only a {painted} side; pick another colour theme on the Design page
            for light and dark.
          </p>
        )}

        <div className="appearance-block">
          <span className="appearance-block-label">Accent colour</span>
          <div className="appearance-preset-grid" role="radiogroup" aria-label="Accent colour">
            {COLOR_PRESETS.map((preset) => {
              const swatch = preset === "default" ? ownSwatch : COLOR_PRESET_SWATCHES[preset];
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
                  {labelOf(ACCENT_OPTIONS, preset)}
                </button>
              );
            })}
          </div>

          {appearance.colorPreset === "custom" ? (
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
        </div>

        <fieldset className="appearance-fieldset">
          <legend>Corners</legend>
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
                <span className="appearance-shape-label">{labelOf(CORNER_OPTIONS, shape)}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <AppearanceSegmentGroup
          label="Text"
          value={appearance.textContrast}
          ariaLabel="Text"
          options={TEXT_OPTIONS}
          onChange={(textContrast) => onProfileChange(patchAppearance(profile, { textContrast }))}
        />
      </AppearanceGroup>

      <AppearanceGroup
        title="Board"
        collapsible
        actions={
          <button
            type="button"
            className="link-btn appearance-group-reset"
            onClick={() => reset("board")}
          >
            Reset board
          </button>
        }
      >
        <AppearanceBoardControls profile={profile} onProfileChange={onProfileChange} />
      </AppearanceGroup>

      <DesignPageLink />

      <AppearanceGroup title="Share this look" collapsible>
        <AppearanceShare />
      </AppearanceGroup>

      {undo ? (
        <Toast onDismiss={() => setUndo(null)}>
          {undo.label}.{" "}
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              onProfileChange(undo.previous);
              setUndo(null);
            }}
          >
            Undo
          </button>
        </Toast>
      ) : null}
    </div>
  );
}
