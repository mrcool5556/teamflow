import { GIB, formatStorageBytes } from "@teamflow/core";

/** Preset allowances offered next to the number field, in GB. */
export const CAP_PRESETS_GB = [1, 5, 10, 25];

/** "1.5" GB as typed -> bytes; null when the text is not a positive number. */
export function gbToBytes(text: string): number | null {
  const value = Number(text.trim().replace(",", "."));
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * GIB);
}

/** Bytes -> the GB text the field shows ("1", "2.5"). */
export function bytesToGbText(bytes: number) {
  return String(Math.round((bytes / GIB) * 100) / 100);
}

export type CapDraft = { gbText: string; noLimit: boolean };

export function capDraftFrom(capBytes: number | null): CapDraft {
  return capBytes === null
    ? { gbText: "", noLimit: true }
    : { gbText: bytesToGbText(capBytes), noLimit: false };
}

/** The cap in bytes (null = no limit), or "invalid" while the number is not usable. */
export function capFromDraft(draft: CapDraft): number | null | "invalid" {
  if (draft.noLimit) return null;
  return gbToBytes(draft.gbText) ?? "invalid";
}

export function capText(capBytes: number | null) {
  return capBytes === null ? "No limit" : formatStorageBytes(capBytes);
}
