import { resolveUiColors, type UserProfile } from "@teamflow/core";

type CustomColors = NonNullable<UserProfile["appearance"]["customColors"]>;

let dragDepth = 0;
let previewFrame = 0;
let pendingPreview: {
  appearance: UserProfile["appearance"];
  customColors: CustomColors;
} | null = null;

export function beginAppearanceColorDrag() {
  if (dragDepth++ === 0) {
    document.documentElement.dataset.appearanceColorDrag = "true";
  }
}

export function endAppearanceColorDrag() {
  if (dragDepth <= 0) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) {
    delete document.documentElement.dataset.appearanceColorDrag;
  }
}

export function applyCustomColorPreview(
  appearance: UserProfile["appearance"],
  customColors: CustomColors,
) {
  const root = document.documentElement;
  const { primary, accent } = resolveUiColors({ ...appearance, customColors });
  root.style.setProperty("--primary", primary);
  root.style.setProperty("--accent", accent);
  root.style.setProperty("--accent-text", accent);

  if (customColors.text) {
    root.style.setProperty("--text", customColors.text);
  }

  if (customColors.textSoft) {
    root.style.setProperty("--text-soft", customColors.textSoft);
  }
}

export function scheduleCustomColorPreview(
  appearance: UserProfile["appearance"],
  customColors: CustomColors,
) {
  pendingPreview = { appearance, customColors };
  if (previewFrame) return;

  previewFrame = window.requestAnimationFrame(() => {
    previewFrame = 0;
    if (!pendingPreview) return;
    applyCustomColorPreview(pendingPreview.appearance, pendingPreview.customColors);
    pendingPreview = null;
  });
}

export function cancelScheduledCustomColorPreview() {
  if (previewFrame) {
    window.cancelAnimationFrame(previewFrame);
    previewFrame = 0;
  }
  pendingPreview = null;
}

export function flushCustomColorPreview(
  appearance: UserProfile["appearance"],
  customColors: CustomColors,
) {
  cancelScheduledCustomColorPreview();
  applyCustomColorPreview(appearance, customColors);
}
