import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;

function getEncryptionKey() {
  const raw =
    process.env.TEAMFLOW_SECRETS_KEY ??
    process.env.JWT_SECRET ??
    "dev-secret";
  if (!process.env.TEAMFLOW_SECRETS_KEY) {
    console.warn(
      "[teamflow] TEAMFLOW_SECRETS_KEY not set; using JWT_SECRET for integration secret encryption.",
    );
  }
  return createHash("sha256").update(raw).digest();
}

export function encryptSecret(plaintext: string) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

export function decryptSecret(blob: string) {
  const [version, ivPart, tagPart, dataPart] = blob.split(":");
  if (version !== "v1" || !ivPart || !tagPart || !dataPart) {
    throw new Error("Invalid encrypted secret format");
  }

  const iv = Buffer.from(ivPart, "base64url");
  const tag = Buffer.from(tagPart, "base64url");
  const data = Buffer.from(dataPart, "base64url");
  const decipher = createDecipheriv(ALGO, getEncryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function botConfigKeyConfigured() {
  return Boolean(process.env.TEAMFLOW_BOT_CONFIG_KEY?.trim());
}

export function assertBotConfigKey(provided: string | undefined) {
  const expected = process.env.TEAMFLOW_BOT_CONFIG_KEY?.trim();
  if (!expected) {
    throw new Error("Bot config endpoint is disabled");
  }
  if (!provided?.trim()) {
    throw new Error("Missing bot config key");
  }

  const a = Buffer.from(provided.trim());
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("Invalid bot config key");
  }
}
