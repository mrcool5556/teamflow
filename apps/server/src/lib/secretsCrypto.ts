import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { config } from "../config.js";
import { serviceUnavailable, unauthorized } from "./errors.js";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
/** Fixed, public salt: the key material comes from the env secret; scrypt adds work factor. */
const KDF_SALT = "teamflow-secrets-v2";
const KDF_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

let warnedFallback = false;
const keyCache = new Map<string, Buffer>();

/** Both values were validated at boot (config.ts refuses placeholders outside development). */
function getRawKeyMaterial() {
  if (config.secretsKey) return config.secretsKey;
  if (!warnedFallback) {
    warnedFallback = true;
    console.warn(
      "[teamflow] TEAMFLOW_SECRETS_KEY not set; using JWT_SECRET for integration secret encryption.",
    );
  }
  return config.jwtSecret;
}

/** v2 key: scrypt-derived (current). */
function getEncryptionKey() {
  const raw = getRawKeyMaterial();
  const cacheKey = `v2:${raw}`;
  let key = keyCache.get(cacheKey);
  if (!key) {
    key = scryptSync(raw, KDF_SALT, 32, KDF_PARAMS);
    keyCache.set(cacheKey, key);
  }
  return key;
}

/** v1 key: plain SHA-256 of the raw secret. Kept only to decrypt values stored before v2. */
function getLegacyEncryptionKey() {
  const raw = getRawKeyMaterial();
  const cacheKey = `v1:${raw}`;
  let key = keyCache.get(cacheKey);
  if (!key) {
    key = createHash("sha256").update(raw).digest();
    keyCache.set(cacheKey, key);
  }
  return key;
}

export function encryptSecret(plaintext: string) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    "v2",
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

export function decryptSecret(blob: string) {
  const [version, ivPart, tagPart, dataPart] = blob.split(":");
  if ((version !== "v1" && version !== "v2") || !ivPart || !tagPart || !dataPart) {
    throw new Error("Invalid encrypted secret format");
  }

  const iv = Buffer.from(ivPart, "base64url");
  const tag = Buffer.from(tagPart, "base64url");
  const data = Buffer.from(dataPart, "base64url");
  const key = version === "v2" ? getEncryptionKey() : getLegacyEncryptionKey();
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function botConfigKeyConfigured() {
  return Boolean(config.botConfigKey);
}

export function assertBotConfigKey(provided: string | undefined) {
  const expected = config.botConfigKey ?? undefined;
  if (!expected) {
    throw serviceUnavailable("Bot config endpoint is disabled");
  }
  if (!provided?.trim()) {
    throw unauthorized("Missing bot config key");
  }

  const a = Buffer.from(provided.trim());
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw unauthorized("Invalid bot config key");
  }
}
