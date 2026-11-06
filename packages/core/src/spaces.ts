import { z } from "zod";

/**
 * Spaces: every team is a space. "admin" spaces are made by an instance admin, who sets the
 * upload allowance (or no limit); "free" spaces are made by any user and get the default cap.
 * Only uploads are capped; issues, comments, rows and links never are.
 */
export const SPACE_TYPES = ["admin", "free"] as const;
export type SpaceType = (typeof SPACE_TYPES)[number];

export const GIB = 1024 * 1024 * 1024;

/** Built-in defaults; env variables and the admin page override them. */
export const SPACE_DEFAULTS = {
  /** Upload cap for a new free space. */
  freeSpaceCapBytes: GIB,
  /** Free spaces one account may own (their General included). */
  freeSpacesPerUser: 3,
  /** Every upload is refused while the upload disk has less than this free. */
  minFreeDiskBytes: 2 * GIB,
} as const;

/** From this share of the cap the meter turns amber and upload zones show what is left. */
export const SPACE_WARN_RATIO = 0.8;

export type SpaceSettingsPublic = {
  freeSpaceCapBytes: number;
  freeSpacesPerUser: number;
  minFreeDiskBytes: number;
};

export const updateSpaceSettingsSchema = z
  .object({
    freeSpaceCapBytes: z.number().int().min(0).optional(),
    freeSpacesPerUser: z.number().int().min(0).max(1000).optional(),
    minFreeDiskBytes: z.number().int().min(0).optional(),
  })
  .refine((value) => Object.values(value).some((v) => v !== undefined), {
    message: "No updates provided",
  });
export type UpdateSpaceSettingsInput = z.infer<typeof updateSpaceSettingsSchema>;

export type SpaceStorageState = "ok" | "warn" | "full";

export type SpaceStorageBreakdown = {
  /** Active files linked to at least one issue. */
  issueFilesBytes: number;
  /** Active files linked only to rows (or to nothing yet). */
  rowFilesBytes: number;
  /** Files in the Files trash; they still use disk until purged. */
  trashBytes: number;
  /** Chunked uploads in progress, at their full size. */
  uploadingBytes: number;
};

export type SpaceStoragePublic = {
  teamId: string;
  spaceType: SpaceType;
  /** null = no limit. */
  capBytes: number | null;
  usedBytes: number;
  /** null when there is no cap. Never negative. */
  remainingBytes: number | null;
  state: SpaceStorageState;
  breakdown: SpaceStorageBreakdown;
  /** True while the server's upload disk is under the free-disk floor (uploads paused for all). */
  diskLow: boolean;
};

/** Body extras on a 413 `space_storage_full`. */
export type SpaceStorageFullDetails = {
  usedBytes: number;
  capBytes: number;
  fileBytes: number;
  remainingBytes: number;
};

export const SPACE_ERROR_CODES = {
  /** The upload does not fit in the space's cap (HTTP 413). */
  storageFull: "space_storage_full",
  /** The server's disk is under the free-disk floor (HTTP 507). */
  serverStorageLow: "server_storage_low",
  /** The account already owns the most free spaces allowed (HTTP 409). */
  freeSpaceLimit: "free_space_limit",
} as const;

export function spaceStorageState(usedBytes: number, capBytes: number | null): SpaceStorageState {
  if (capBytes === null) return "ok";
  if (usedBytes >= capBytes) return "full";
  if (usedBytes >= capBytes * SPACE_WARN_RATIO) return "warn";
  return "ok";
}

/** "812 MB", "2.1 MB", "1.00 GB", "0 B" (binary units), as the admin page and messages show them. */
export function formatStorageBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  if (unit === 0) return `${Math.round(value)} B`;
  if (unit >= 3) return `${value.toFixed(2)} ${units[unit]}`;
  const text = value < 10 ? value.toFixed(1).replace(/\.0$/, "") : String(Math.round(value));
  return `${text} ${units[unit]}`;
}

const capBytesSchema = z.number().int().min(0).nullable();

export const createSpaceSchema = z.object({
  name: z.string().min(1).max(120),
  key: z
    .string()
    .min(2)
    .max(8)
    .regex(/^[A-Z0-9]+$/, "Space key must be uppercase letters and numbers"),
  spaceType: z.enum(SPACE_TYPES),
  /** Admin spaces only; free spaces always get the free-space default. null = no limit. */
  capBytes: capBytesSchema.optional(),
  /** Becomes the space's Owner; defaults to the admin making it. */
  ownerUserId: z.string().uuid().optional(),
});
export type CreateSpaceInput = z.infer<typeof createSpaceSchema>;

export const updateSpaceSchema = z
  .object({
    spaceType: z.enum(SPACE_TYPES).optional(),
    capBytes: capBytesSchema.optional(),
  })
  .refine((value) => value.spaceType !== undefined || value.capBytes !== undefined, {
    message: "No updates provided",
  });
export type UpdateSpaceInput = z.infer<typeof updateSpaceSchema>;
