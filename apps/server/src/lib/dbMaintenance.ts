import { runDataMaintenance, type DataMaintenanceReport } from "@teamflow/db";
import { db } from "../db.js";

/** Local hour (0-23) at which the nightly data maintenance runs. */
export const NIGHTLY_HOUR = 3;

export function runServerDataMaintenance(): DataMaintenanceReport {
  const report = runDataMaintenance(db.$client);
  console.log("[teamflow] Nightly data maintenance:", JSON.stringify(report));
  return report;
}

/** Milliseconds from `now` until the next NIGHTLY_HOUR:00 local time. */
export function msUntilNextRun(now = new Date(), hour = NIGHTLY_HOUR) {
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

/**
 * Opt-in (TEAMFLOW_DB_MAINTENANCE_NIGHTLY=true): run the data maintenance every night at
 * NIGHTLY_HOUR. The timer is unref'd so it never keeps the process alive.
 */
export function scheduleNightlyMaintenance() {
  const schedule = () => {
    const timer = setTimeout(() => {
      try {
        runServerDataMaintenance();
      } catch (err) {
        console.error("[teamflow] Nightly data maintenance failed:", err);
      }
      schedule();
    }, msUntilNextRun());
    timer.unref();
  };
  schedule();
}
