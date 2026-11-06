import type { InstanceFixSeverity } from "@teamflow/core";

/** Colour of a status dot or pill on the admin page. */
export type Health = "ok" | "warn" | "bad" | "off";

export const FIX_HEALTH: Record<InstanceFixSeverity, Health> = {
  bad: "bad",
  warn: "warn",
  info: "off",
};
