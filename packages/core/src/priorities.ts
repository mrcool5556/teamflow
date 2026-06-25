export const PRIORITY_LABELS = {
  none: "No priority",
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
} as const satisfies Record<"none" | "low" | "medium" | "high" | "urgent", string>;

/** Default chip colors for low → urgent (independent of UI accent). */
export const PRIORITY_COLOR_DEFAULTS = {
  low: "#6eb5e8",
  medium: "#d9b84a",
  high: "#ff8a3d",
  urgent: "#ff4d4d",
} as const;
