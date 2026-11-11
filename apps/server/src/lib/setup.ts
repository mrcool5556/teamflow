import fs from "node:fs";
import path from "node:path";
import { randomInt, timingSafeEqual } from "node:crypto";
import {
  SETUP_CODE_ALPHABET,
  SETUP_CODE_PATTERN,
  SETUP_ERROR_CODES,
  normaliseSetupCode,
  type SetupAdminInput,
  type SetupStatusPublic,
} from "@teamflow/core";
import { resolveDatabasePath, schema, type Db, type DbExecutor } from "@teamflow/db";
import { eq, sql } from "drizzle-orm";
import { config } from "../config.js";
import { hashPassword } from "./auth.js";
import { ApiError } from "./errors.js";
import { getPublicUrl } from "./siteSettings.js";

/**
 * First-time setup. While the server has no accounts at all, the only way in is POST
 * /auth/setup/admin with the one-time setup code; ordinary registration is refused. The code is
 * TEAMFLOW_SETUP_CODE when set, otherwise generated once and kept in `<data dir>/setup-code`
 * (next to the database) so installers can print it. The file is removed once the admin account
 * exists. Contract with the installers: docs/SETUP.md.
 */

export const SETUP_CODE_FILE = "setup-code";

/** In-memory code for an in-memory database (tests), where there is no data directory. */
let memoryCode: string | null = null;
let announced = false;

function accountCount(db: DbExecutor) {
  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(schema.users)
    .get();
  return Number(row?.count ?? 0);
}

export function isSetupNeeded(db: DbExecutor) {
  return accountCount(db) === 0;
}

export function getSetupStatus(db: DbExecutor): SetupStatusPublic {
  const needed = isSetupNeeded(db);
  return { needed, codeRequired: needed };
}

/** `<data dir>/setup-code`, or null for an in-memory database. */
export function setupCodePath(): string | null {
  const dbPath = resolveDatabasePath(config.databaseUrl);
  if (dbPath === ":memory:") return null;
  return path.join(path.dirname(dbPath), SETUP_CODE_FILE);
}

export function generateSetupCode() {
  let raw = "";
  for (let i = 0; i < 8; i += 1) raw += SETUP_CODE_ALPHABET[randomInt(SETUP_CODE_ALPHABET.length)];
  return normaliseSetupCode(raw);
}

function readCodeFile(file: string) {
  try {
    const value = normaliseSetupCode(fs.readFileSync(file, "utf8").trim());
    return SETUP_CODE_PATTERN.test(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * The setup code while setup is needed, creating it on first call; null once an account exists
 * (and the file is removed then).
 */
export function ensureSetupCode(db: DbExecutor): string | null {
  if (!isSetupNeeded(db)) {
    removeSetupCode();
    return null;
  }
  if (config.setupCode) return normaliseSetupCode(config.setupCode);

  const file = setupCodePath();
  if (!file) {
    memoryCode ??= generateSetupCode();
    return memoryCode;
  }
  const existing = readCodeFile(file);
  if (existing) return existing;
  const code = generateSetupCode();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${code}\n`, { mode: 0o600 });
  return code;
}

export function removeSetupCode() {
  memoryCode = null;
  const file = setupCodePath();
  if (file) fs.rmSync(file, { force: true });
}

export function setupUrl(code: string) {
  return `${getPublicUrl()}/setup?code=${encodeURIComponent(code)}`;
}

/** Print the setup link once at boot on a fresh server, so the person installing can find it. */
export function announceSetupIfNeeded(db: DbExecutor, log: (line: string) => void = console.log) {
  const code = ensureSetupCode(db);
  if (!code || announced) return code;
  announced = true;
  log("[teamflow] Fresh install: no accounts yet.");
  log(`[teamflow] Setup code: ${code}`);
  log(`[teamflow] Open ${setupUrl(code)} to create the admin account.`);
  return code;
}

function codesMatch(expected: string, provided: string) {
  const a = Buffer.from(expected);
  const b = Buffer.from(normaliseSetupCode(provided));
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Test hook: the current code without side effects beyond creating it. */
export function currentSetupCodeForTests(db: DbExecutor) {
  return ensureSetupCode(db);
}

/**
 * Create the first account as instance admin. Refused (409 setup_done) as soon as any account
 * exists, re-checked inside the transaction so two racing calls cannot both succeed.
 */
export async function createSetupAdmin(db: Db, input: SetupAdminInput) {
  const expected = ensureSetupCode(db);
  if (!expected) {
    throw new ApiError(
      409,
      "This server is already set up. Log in instead.",
      SETUP_ERROR_CODES.done,
    );
  }
  if (!codesMatch(expected, input.code)) {
    throw new ApiError(
      403,
      "That setup code is not right. It was printed by the installer and is in the server log.",
      SETUP_ERROR_CODES.badCode,
    );
  }

  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(input.password);
  db.transaction((tx) => {
    if (!isSetupNeeded(tx)) {
      throw new ApiError(
        409,
        "This server is already set up. Log in instead.",
        SETUP_ERROR_CODES.done,
      );
    }
    tx.insert(schema.users)
      .values({
        id: userId,
        email: input.email,
        name: input.name,
        passwordHash,
        isInstanceAdmin: 1,
        // The setup account is the one Server Owner.
        isServerOwner: 1,
      })
      .run();
  });
  removeSetupCode();

  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  return user!;
}
