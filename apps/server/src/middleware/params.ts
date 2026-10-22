import { createMiddleware } from "hono/factory";
import { z } from "zod";
import { idParamSchema } from "@teamflow/core";
import { validationError } from "../lib/errors.js";

/**
 * Path parameters that are not entity ids. Every other parameter must be a UUID
 * (idParamSchema from @teamflow/core).
 */
const SPECIAL_PARAMS: Record<string, { schema: z.ZodTypeAny; message: string }> = {
  memberId: { schema: idParamSchema.or(z.literal("me")), message: "Invalid memberId" },
  token: { schema: z.string().min(1).max(256), message: "Invalid invite token" },
  guildId: { schema: z.string().regex(/^\d{17,20}$/), message: "Invalid Discord server ID" },
  index: { schema: z.string().regex(/^\d{1,9}$/), message: "Invalid chunk index" },
};

/**
 * Validate every path parameter of the matched route before any lookup runs. Added to each
 * route chain that has parameters (route-level middleware is the only place Hono exposes them).
 */
export const validateParams = createMiddleware(async (c, next) => {
  for (const [name, value] of Object.entries(c.req.param() as Record<string, string>)) {
    const special = SPECIAL_PARAMS[name];
    const schema = special?.schema ?? idParamSchema;
    if (!schema.safeParse(value).success) {
      throw validationError(special?.message ?? `Invalid ${name}`);
    }
  }
  await next();
});
