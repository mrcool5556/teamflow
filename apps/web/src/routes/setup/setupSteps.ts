import type { SetupChecklistId } from "@teamflow/core";

/** The five setup steps, in order. Step 1 ("admin") lives at /setup, the rest at /setup/<id>. */
export const SETUP_STEPS = [
  { id: "admin", title: "Admin account", sub: "you" },
  { id: "site", title: "Name and address", sub: "site" },
  { id: "email", title: "Email", sub: "optional" },
  { id: "storage", title: "Storage and sign-up", sub: "rules" },
  { id: "done", title: "Checklist", sub: "what's left" },
] as const;
export type SetupStepId = (typeof SETUP_STEPS)[number]["id"];

export const setupStepPath = (id: SetupStepId) => (id === "admin" ? "/setup" : `/setup/${id}`);

/** Where each open checklist item is fixed. */
export const CHECKLIST_LINKS: Record<SetupChecklistId, { to: string; label: string } | null> = {
  admin: null,
  site: { to: "/setup/site", label: "Set the address" },
  email: { to: "/setup/email", label: "Set up email" },
  storage: { to: "/setup/storage", label: "Review the rules" },
  backup: { to: "/admin/updates", label: "Updates & backups" },
  service: { to: "/admin/help", label: "How to" },
  flow: { to: "/welcome/create", label: "Create a Flow" },
};
