import { Hono } from "hono";
import { requestId } from "hono/request-id";
import { handleError } from "./middleware/error.js";
import { authRateLimit, bodyLimits, corsAllowlist, noSniff } from "./middleware/http.js";
import { attachmentsRoutes } from "./routes/attachments.js";
import { authRoutes } from "./routes/auth.js";
import { boardRoutes } from "./routes/board.js";
import { commentsRoutes } from "./routes/comments.js";
import { discordRoutes } from "./routes/discord.js";
import { filesRoutes } from "./routes/files.js";
import { healthRoutes } from "./routes/health.js";
import { invitesRoutes } from "./routes/invites.js";
import { issuesRoutes } from "./routes/issues.js";
import { maintenanceRoutes } from "./routes/maintenance.js";
import { membersRoutes } from "./routes/members.js";
import { projectsRoutes } from "./routes/projects.js";
import { rolesRoutes } from "./routes/roles.js";
import { mountSpa } from "./routes/spa.js";
import { teamsRoutes } from "./routes/teams.js";
import { tokensRoutes } from "./routes/tokens.js";
import { uploadsRoutes } from "./routes/uploads.js";
import type { AppEnv } from "./types.js";

/** Every API sub-app, mounted at "/" (each route file declares its full paths). */
export const API_ROUTES = [
  healthRoutes,
  authRoutes,
  tokensRoutes,
  teamsRoutes,
  boardRoutes,
  membersRoutes,
  invitesRoutes,
  rolesRoutes,
  discordRoutes,
  maintenanceRoutes,
  filesRoutes,
  projectsRoutes,
  issuesRoutes,
  commentsRoutes,
  attachmentsRoutes,
  uploadsRoutes,
] as const;

export function createApp() {
  const app = new Hono<AppEnv>();

  // Every response carries X-Request-Id (an incoming header is echoed) so 5xx log lines can be
  // matched to a client report.
  app.use("*", requestId());
  app.onError(handleError);
  app.use("*", corsAllowlist);
  app.use("*", noSniff);
  app.use("*", bodyLimits);
  app.use("/auth/login", authRateLimit);
  app.use("/auth/register", authRateLimit);
  app.use("/auth/forgot-password", authRateLimit);

  for (const routes of API_ROUTES) {
    app.route("/", routes);
  }

  mountSpa(app);
  return app;
}

export const app = createApp();
