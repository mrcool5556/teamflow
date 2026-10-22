import type { RequestIdVariables } from "hono/request-id";
import type { AuthVariables } from "./middleware/auth.js";
import type { TeamVariables } from "./middleware/team.js";

/**
 * Hono environment shared by the app and every sub-router. Variables are set by middleware:
 * `requestId` always, `auth` by requireAuth, and the team variables by loadTeam(...).
 */
export type AppEnv = {
  Variables: RequestIdVariables & AuthVariables & TeamVariables;
};
