import type { Context } from "hono";
import type { z } from "zod";
import { validationError } from "./errors.js";

function firstIssue(error: z.ZodError) {
  return error.issues[0]?.message ?? "Invalid input";
}

/**
 * Read the request body as JSON. An empty body counts as `{}` (several POST routes take only
 * optional fields); a body that is not valid JSON is a 400, never a 500.
 */
export async function readJson(c: Context): Promise<unknown> {
  const text = await c.req.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw validationError("Malformed JSON body");
  }
}

/** Parse `value` with `schema` or throw a 400 validation_error with the first issue message. */
export function parseWith<S extends z.ZodTypeAny>(
  schema: S,
  value: unknown,
  options: { message?: string } = {},
): z.output<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw validationError(options.message ?? firstIssue(parsed.error));
  return parsed.data;
}

/** Validate the JSON body against a packages/core schema. */
export async function parseBody<S extends z.ZodTypeAny>(
  c: Context,
  schema: S,
  options: { message?: string } = {},
): Promise<z.output<S>> {
  return parseWith(schema, await readJson(c), options);
}

/** Validate the query string against a packages/core schema. */
export function parseQuery<S extends z.ZodTypeAny>(
  c: Context,
  schema: S,
  options: { message?: string } = {},
): z.output<S> {
  return parseWith(schema, c.req.query(), options);
}
