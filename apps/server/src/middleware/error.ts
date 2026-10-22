import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ApiError, codeForStatus } from "../lib/errors.js";
import type { AppEnv } from "../types.js";

/**
 * The single error handler: ApiError (and anything Hono raised) becomes `{ error, code }` with
 * its status; anything else is a bug, logged with the request id and returned as a plain 500.
 */
export const handleError: ErrorHandler<AppEnv> = (err, c) => {
  if (err instanceof ApiError) {
    return c.json(err.toBody(), err.status as ContentfulStatusCode);
  }
  if (err instanceof HTTPException) {
    const status = err.status as ContentfulStatusCode;
    return c.json({ error: err.message || "Request failed", code: codeForStatus(status) }, status);
  }
  console.error(
    `[teamflow] ${c.req.method} ${c.req.path} failed (request ${c.get("requestId") ?? "-"}):`,
    err,
  );
  return c.json({ error: "Internal Server Error", code: "internal_error" }, 500);
};
