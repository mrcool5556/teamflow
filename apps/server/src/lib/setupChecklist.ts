import type {
  SetupChecklistItem,
  SetupChecklistPublic,
  UpdateSetupProgressInput,
} from "@teamflow/core";
import { schema, type Db } from "@teamflow/db";
import { eq, sql } from "drizzle-orm";
import { config } from "../config.js";
import { detectSupervisor } from "./instanceAdmin.js";
import { getMaintenanceStatus } from "./maintenance.js";
import {
  getMailSettings,
  getSiteSettings,
  readInstanceSetting,
  writeInstanceSetting,
} from "./siteSettings.js";

/**
 * What's done and what's left after first-time setup: shown as setup step 5 and as a card on the
 * admin Overview until every item is done (or skipped) or the admin dismisses it. Most items are
 * read from the real state; the setup page only records "email skipped" and "storage reviewed".
 */

type SetupProgress = { emailSkippedAt?: string; storageReviewedAt?: string; dismissedAt?: string };
const KEY = "setup";

function progress(): SetupProgress {
  return readInstanceSetting<SetupProgress>(KEY) ?? {};
}

export function updateSetupProgress(input: UpdateSetupProgressInput) {
  const now = new Date().toISOString();
  const next = { ...progress() };
  const apply = (flag: boolean | undefined, field: keyof SetupProgress) => {
    if (flag === true) next[field] = next[field] ?? now;
    if (flag === false) delete next[field];
  };
  apply(input.emailSkipped, "emailSkippedAt");
  apply(input.storageReviewed, "storageReviewedAt");
  apply(input.dismissed, "dismissedAt");
  writeInstanceSetting(KEY, next);
}

export async function getSetupChecklist(db: Db, viewerId: string): Promise<SetupChecklistPublic> {
  const saved = progress();
  const site = getSiteSettings();
  const mail = getMailSettings();
  const [viewer] = await db
    .select({ name: schema.users.name, email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, viewerId))
    .limit(1);
  const spacesSaved = readInstanceSetting<unknown>("spaces") !== null;
  const teamCount = Number(
    db.select({ count: sql<number>`count(*)` }).from(schema.teams).get()?.count ?? 0,
  );

  const items: SetupChecklistItem[] = [
    {
      id: "admin",
      state: "done",
      title: "Admin account",
      detail: viewer ? `${viewer.name} · ${viewer.email}` : "",
    },
    {
      id: "site",
      state: site.publicUrlSource === "default" ? "todo" : "done",
      title: "Name and address",
      detail:
        site.publicUrlSource === "default"
          ? "The public address is still the built-in default."
          : `${site.siteName} · ${site.publicUrl}`,
    },
    mail.configured
      ? { id: "email", state: "done", title: "Email", detail: `Sending through ${mail.host}` }
      : {
          id: "email",
          state: saved.emailSkippedAt ? "skipped" : "todo",
          title: saved.emailSkippedAt ? "Email skipped" : "Email",
          detail: "Password resets need an admin until email is set up.",
        },
    {
      id: "storage",
      state: spacesSaved || saved.storageReviewedAt ? "done" : "todo",
      title: "Storage and sign-up",
      detail: "Upload cap per Flow, Flows per person, the free-disk floor and who can sign up.",
    },
    await backupItem(),
    serviceItem(),
    {
      id: "flow",
      state: teamCount > 0 ? "done" : "todo",
      title: "First Flow",
      detail: teamCount > 0 ? `${teamCount} on this server` : "A board for you and your people.",
    },
  ];

  const counted = items.filter((item) => item.state !== "unavailable");
  const doneCount = counted.filter((item) => item.state === "done").length;
  return {
    items,
    doneCount,
    total: counted.length,
    complete: counted.every((item) => item.state === "done" || item.state === "skipped"),
    dismissed: Boolean(saved.dismissedAt),
  };
}

async function backupItem(): Promise<SetupChecklistItem> {
  const maintenance = await getMaintenanceStatus();
  if (!maintenance.enabled) {
    return {
      id: "backup",
      state: "unavailable",
      title: "Backups",
      detail: "Backups from the app are off on this host. Back up the data folder yourself.",
    };
  }
  const count = maintenance.backups.length;
  return {
    id: "backup",
    state: count > 0 ? "done" : "todo",
    title: count > 0 ? "Backups" : "First backup",
    detail: count > 0 ? `${count} backup${count === 1 ? "" : "s"}` : "No backup yet.",
  };
}

function serviceItem(): SetupChecklistItem {
  const { supervisor, serviceName } = detectSupervisor();
  if (supervisor === "none") {
    return {
      id: "service",
      state: config.isProduction ? "todo" : "unavailable",
      title: "Runs as a service",
      detail: "It will not restart after a crash or reboot. Install the service.",
    };
  }
  return {
    id: "service",
    state: "done",
    title: "Runs as a service",
    detail: supervisor === "unknown" ? "Supervisor detected" : `${supervisor}${serviceName ? `: ${serviceName}` : ""}`,
  };
}
