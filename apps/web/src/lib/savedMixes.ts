import {
  MAX_MIX_NAME_LENGTH,
  MAX_SAVED_MIXES,
  mergeUserProfile,
  type SavedMix,
  type UserProfile,
} from "@teamflow/core";

type Appearance = UserProfile["appearance"];

/** Settings that make two mixes look the same (text contrast and team colours included). */
const MIX_KEYS = [
  "theme",
  "colorPreset",
  "chromeStyle",
  "shape",
  "colorTheme",
  "fontSet",
  "surface",
  "buttons",
  "lip",
  "lipShadow",
  "inputs",
  "toggles",
  "textContrast",
  "semanticContrast",
] as const satisfies readonly (keyof Appearance)[];

function newMixId() {
  // crypto.randomUUID needs a secure context; self-hosted Teamflow may be served over plain http.
  return `mix-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function cleanMixName(name: string) {
  return name.trim().replace(/\s+/g, " ").slice(0, MAX_MIX_NAME_LENGTH);
}

export function canSaveMix(profile: UserProfile) {
  return profile.mixes.length < MAX_SAVED_MIXES;
}

/** Whether the appearance is showing this mix right now. */
export function mixInUse(appearance: Appearance, mix: SavedMix) {
  const same = MIX_KEYS.every((key) => appearance[key] === mix.appearance[key]);
  if (!same) return false;
  if (appearance.colorPreset !== "custom") return true;
  const a = appearance.customColors;
  const b = mix.appearance.customColors;
  return (
    (a.primary ?? "").toLowerCase() === (b.primary ?? "").toLowerCase() &&
    (a.accent ?? "").toLowerCase() === (b.accent ?? "").toLowerCase()
  );
}

/** The profile with the current appearance saved as a new mix (first in the list). */
export function saveMix(profile: UserProfile, name: string): UserProfile {
  const clean = cleanMixName(name);
  if (!clean || !canSaveMix(profile)) return profile;
  const mix: SavedMix = { id: newMixId(), name: clean, appearance: profile.appearance };
  return mergeUserProfile(profile, { mixes: [mix, ...profile.mixes] });
}

export function renameMix(profile: UserProfile, id: string, name: string): UserProfile {
  const clean = cleanMixName(name);
  if (!clean) return profile;
  return mergeUserProfile(profile, {
    mixes: profile.mixes.map((mix) => (mix.id === id ? { ...mix, name: clean } : mix)),
  });
}

export function deleteMix(profile: UserProfile, id: string): UserProfile {
  return mergeUserProfile(profile, { mixes: profile.mixes.filter((mix) => mix.id !== id) });
}

/** The profile wearing a saved mix; board size and team bits stay. */
export function applyMix(profile: UserProfile, mix: SavedMix): UserProfile {
  // Custom colours are replaced, not merged, so an old custom accent does not linger.
  const cleared = { ...profile, appearance: { ...profile.appearance, customColors: {} } };
  return mergeUserProfile(cleared, { appearance: mix.appearance });
}
