import type { ColorPreset, ThemeMode, UserProfile } from "@teamflow/core";
import { COLOR_PRESETS, THEME_MODES, mergeUserProfile } from "@teamflow/core";

type AppearanceSettingsSectionProps = {
  profile: UserProfile;
  onProfileChange: (profile: UserProfile) => void;
};

export function AppearanceSettingsSection({
  profile,
  onProfileChange,
}: AppearanceSettingsSectionProps) {
  return (
    <section className="settings-section">
      <h3>Appearance</h3>
      <label>
        Theme
        <select
          value={profile.appearance.theme}
          onChange={(e) => {
            onProfileChange(
              mergeUserProfile(profile, {
                appearance: { theme: e.target.value as ThemeMode },
              }),
            );
          }}
        >
          {THEME_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {mode === "dark" ? "Dark" : "Light"}
            </option>
          ))}
        </select>
      </label>
      <label>
        Color scheme
        <select
          value={profile.appearance.colorPreset}
          onChange={(e) => {
            onProfileChange(
              mergeUserProfile(profile, {
                appearance: { colorPreset: e.target.value as ColorPreset },
              }),
            );
          }}
        >
          {COLOR_PRESETS.map((preset) => (
            <option key={preset} value={preset}>
              {preset.charAt(0).toUpperCase() + preset.slice(1)}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}
