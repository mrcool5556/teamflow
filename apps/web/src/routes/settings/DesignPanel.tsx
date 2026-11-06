import {
  DEFAULT_UI_ACCENT,
  DEFAULT_UI_PRIMARY,
  mergeUserProfile,
  type UserProfile,
} from "@teamflow/core";
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { CustomColorField } from "../../components/CustomColorField";
import { DesignPreview, type DesignPreviewView } from "../../components/DesignPreview";
import { AppearanceShare } from "../../components/AppearanceShare";
import { ProfileSaveStatus } from "../../components/ProfileSaveStatus";
import { SavedMixes } from "../../components/SavedMixes";
import { NARROW_SCREEN, useMediaQuery } from "../../hooks/useMediaQuery";
import { settingsPath, useAppRoute } from "../../lib/appRoute";
import {
  ACCENT_OPTIONS,
  BUTTON_OPTIONS,
  chooseColour,
  COLOUR_CHOICES,
  CORNER_OPTIONS,
  currentColourChoice,
  FONT_OPTIONS,
  hasPartner,
  INPUT_OPTIONS,
  labelOf,
  LIP_OPTIONS,
  LIP_SHADOW_OPTIONS,
  SURFACE_OPTIONS,
  TEXT_OPTIONS,
  TOGGLE_OPTIONS,
  UI_STYLE_OPTIONS,
  type AspectOption,
} from "../../lib/designAspects";
import { paintedTheme } from "../../profile";
import { useSession } from "../../session/session";

type Appearance = UserProfile["appearance"];

const VIEWS: { value: DesignPreviewView; label: string }[] = [
  { value: "board", label: "Board" },
  { value: "drawer", label: "Drawer open" },
  { value: "settings", label: "Settings" },
];

/**
 * One aspect: a row of chips on a wide screen; on a phone a collapsed section that shows the
 * current value and opens to the chips.
 */
function Aspect({
  title,
  current,
  narrow,
  note,
  children,
}: {
  title: string;
  current: string;
  narrow: boolean;
  note?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = `design-aspect-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  const shown = !narrow || open;
  return (
    <section
      className={`design-aspect${shown ? "" : " design-aspect--collapsed"}`}
      aria-labelledby={id}
    >
      <h3 id={id} className="design-aspect-title">
        {narrow ? (
          <button
            type="button"
            className="design-aspect-toggle"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            <span>{title}</span>
            <span className="design-aspect-current">{current}</span>
            <span aria-hidden="true">{open ? "▴" : "▾"}</span>
          </button>
        ) : (
          title
        )}
      </h3>
      {shown ? (
        <>
          {children}
          {note ? <p className="design-aspect-note">{note}</p> : null}
        </>
      ) : null}
    </section>
  );
}

function Chips<T extends string>({
  label,
  options,
  value,
  disabled,
  onChange,
}: {
  label: string;
  options: AspectOption<T>[];
  value: T;
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <div className="design-chips" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          disabled={disabled}
          title={option.hint}
          className={`design-chip${value === option.value ? " active" : ""}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Settings → Appearance → Design: every aspect of the look, with a large live preview. */
export function DesignPanel() {
  const { profile, updateProfile } = useSession();
  const navigate = useNavigate();
  const { teamKey } = useAppRoute();
  const narrow = useMediaQuery(NARROW_SCREEN);
  const [view, setView] = useState<DesignPreviewView>("board");
  const [bigPreview, setBigPreview] = useState(false);
  const a = profile.appearance;
  const customDraftRef = useRef({ ...a.customColors });
  useLayoutEffect(() => {
    customDraftRef.current = { ...a.customColors };
  }, [a.customColors]);

  const patch = (next: Partial<Appearance>) =>
    updateProfile(mergeUserProfile(profile, { appearance: next }));

  const painted = paintedTheme(a);
  const colour = currentColourChoice(a, painted);
  const lipped = a.buttons === "lipped";

  return (
    <div className="settings-panel design-panel">
      <header className="settings-panel-header">
        <div className="settings-panel-title-row">
          <button
            type="button"
            className="ghost design-back"
            aria-label="Back to Appearance"
            onClick={() => navigate(settingsPath(teamKey, "appearance"))}
          >
            <span aria-hidden="true">←</span> Appearance
          </button>
          <h2>Design</h2>
          <ProfileSaveStatus />
        </div>
        <p className="settings-copy settings-lead">
          Mix every part of the look. Changes apply as you go; weak pairings get a heads-up, never a
          block.
        </p>
      </header>

      <div className="design-layout">
        <section
          className={`design-preview${narrow && !bigPreview ? " design-preview--small" : ""}`}
          aria-label="Preview"
        >
          <div className="design-preview-bar">
            <div
              className="segmented design-preview-views"
              role="radiogroup"
              aria-label="Preview view"
            >
              {VIEWS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={view === option.value}
                  className={view === option.value ? "active" : ""}
                  onClick={() => setView(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {narrow ? (
              <button
                type="button"
                className="link-btn"
                aria-expanded={bigPreview}
                onClick={() => setBigPreview((value) => !value)}
              >
                {bigPreview ? "Smaller preview" : "Bigger preview"}
              </button>
            ) : null}
          </div>
          <div className="design-preview-frame board-preview-surface" aria-hidden="true">
            <DesignPreview view={view} />
          </div>
        </section>

        <aside className="design-side" aria-label="Your mixes and sharing">
          <section className="design-side-group" aria-labelledby="design-mixes-title">
            <h3 id="design-mixes-title">Your mixes</h3>
            <SavedMixes />
          </section>
          <section className="design-side-group" aria-labelledby="design-share-title">
            <h3 id="design-share-title">Share this mix</h3>
            <AppearanceShare />
          </section>
        </aside>

        <div className="design-aspects">
          <Aspect title="Colours" current={colour.label} narrow={narrow}>
            <div
              className="design-chips design-chips--colours"
              role="radiogroup"
              aria-label="Colours"
            >
              {COLOUR_CHOICES.map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  role="radio"
                  aria-checked={colour.id === choice.id}
                  className={`design-chip design-colour-chip${colour.id === choice.id ? " active" : ""}`}
                  style={
                    {
                      "--chip-bg": choice.swatch[0],
                      "--chip-panel": choice.swatch[1],
                      "--chip-text": choice.swatch[2],
                      "--chip-accent": choice.swatch[3],
                    } as CSSProperties
                  }
                  onClick={() => patch(chooseColour(a, choice))}
                >
                  <span className="design-colour-swatch" aria-hidden="true" />
                  {choice.label}
                </button>
              ))}
            </div>
            <div className="design-subrow">
              <span className="design-subrow-label">Light or dark</span>
              <Chips
                label="Light or dark"
                options={[
                  { value: "dark", label: "Dark" },
                  { value: "light", label: "Light" },
                  { value: "system", label: "Match system" },
                ]}
                value={a.theme}
                disabled={!hasPartner(a.colorTheme)}
                onChange={(theme) => patch({ theme })}
              />
            </div>
            {!hasPartner(a.colorTheme) ? (
              <p className="design-aspect-note">
                {colour.label} has only a {painted} side, so it stays {painted}.
              </p>
            ) : null}
            <div className="design-subrow">
              <span className="design-subrow-label">Accent</span>
              <Chips
                label="Accent colour"
                options={ACCENT_OPTIONS}
                value={a.colorPreset}
                onChange={(colorPreset) => patch({ colorPreset })}
              />
            </div>
            {a.colorPreset === "custom" ? (
              <div className="appearance-color-grid">
                <CustomColorField
                  label="Primary"
                  value={a.customColors.primary ?? DEFAULT_UI_PRIMARY}
                  profile={profile}
                  colorKey="primary"
                  customDraftRef={customDraftRef}
                  onCommit={updateProfile}
                />
                <CustomColorField
                  label="Accent"
                  value={a.customColors.accent ?? DEFAULT_UI_ACCENT}
                  profile={profile}
                  colorKey="accent"
                  customDraftRef={customDraftRef}
                  onCommit={updateProfile}
                />
              </div>
            ) : null}
          </Aspect>

          <Aspect title="Fonts" current={labelOf(FONT_OPTIONS, a.fontSet)} narrow={narrow}>
            <Chips
              label="Fonts"
              options={FONT_OPTIONS}
              value={a.fontSet}
              onChange={(fontSet) => patch({ fontSet })}
            />
          </Aspect>

          <Aspect title="Corners" current={labelOf(CORNER_OPTIONS, a.shape)} narrow={narrow}>
            <Chips
              label="Corners"
              options={CORNER_OPTIONS}
              value={a.shape}
              onChange={(shape) => patch({ shape })}
            />
          </Aspect>

          <Aspect
            title="Windows and cards"
            current={labelOf(SURFACE_OPTIONS, a.surface)}
            narrow={narrow}
          >
            <Chips
              label="Windows and cards"
              options={SURFACE_OPTIONS}
              value={a.surface}
              onChange={(surface) => patch({ surface })}
            />
          </Aspect>

          <Aspect title="Buttons" current={labelOf(BUTTON_OPTIONS, a.buttons)} narrow={narrow}>
            <Chips
              label="Buttons"
              options={BUTTON_OPTIONS}
              value={a.buttons}
              onChange={(buttons) => patch({ buttons })}
            />
            <div className={`design-subrow${lipped ? "" : " is-off"}`}>
              <span className="design-subrow-label">Lip metal</span>
              <Chips
                label="Lip metal"
                options={LIP_OPTIONS}
                value={a.lip}
                disabled={!lipped}
                onChange={(lip) => patch({ lip })}
              />
              <Chips
                label="Rim shadow"
                options={LIP_SHADOW_OPTIONS}
                value={a.lipShadow}
                disabled={!lipped}
                onChange={(lipShadow) => patch({ lipShadow })}
              />
            </div>
            {!lipped ? (
              <p className="design-aspect-note">Lip metal is for Lipped buttons.</p>
            ) : null}
          </Aspect>

          <Aspect title="Text fields" current={labelOf(INPUT_OPTIONS, a.inputs)} narrow={narrow}>
            <Chips
              label="Text fields"
              options={INPUT_OPTIONS}
              value={a.inputs}
              onChange={(inputs) => patch({ inputs })}
            />
          </Aspect>

          <Aspect title="Switches" current={labelOf(TOGGLE_OPTIONS, a.toggles)} narrow={narrow}>
            <Chips
              label="Switches"
              options={TOGGLE_OPTIONS}
              value={a.toggles}
              onChange={(toggles) => patch({ toggles })}
            />
          </Aspect>

          <Aspect
            title="Base UI style"
            current={labelOf(UI_STYLE_OPTIONS, a.chromeStyle)}
            narrow={narrow}
            note="Draws whatever the aspects above leave on Auto: borders, shadows and glows."
          >
            <Chips
              label="Base UI style"
              options={UI_STYLE_OPTIONS}
              value={a.chromeStyle}
              onChange={(chromeStyle) => patch({ chromeStyle })}
            />
          </Aspect>

          <Aspect title="Text" current={labelOf(TEXT_OPTIONS, a.textContrast)} narrow={narrow}>
            <Chips
              label="Text"
              options={TEXT_OPTIONS}
              value={a.textContrast}
              onChange={(textContrast) => patch({ textContrast })}
            />
            <label className="appearance-switch">
              <input
                type="checkbox"
                role="switch"
                checked={a.semanticContrast === "preserve"}
                onChange={(e) =>
                  patch({ semanticContrast: e.target.checked ? "preserve" : "adapt" })
                }
              />
              <span className="appearance-switch-track" aria-hidden="true" />
              <span>Keep exact team colours</span>
            </label>
          </Aspect>
        </div>
      </div>
    </div>
  );
}
