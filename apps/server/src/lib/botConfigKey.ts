import { randomBytes } from "node:crypto";
import path from "node:path";
import { getEnvFileValue, setEnvFileValue } from "./envFile.js";

export function generateBotConfigKey() {
  return randomBytes(32).toString("base64url");
}

export async function ensureBotConfigKey(appDir: string) {
  const rootEnvPath = path.join(appDir, ".env");
  let key = process.env.TEAMFLOW_BOT_CONFIG_KEY?.trim();
  let created = false;

  if (!key) {
    key = (await getEnvFileValue(rootEnvPath, "TEAMFLOW_BOT_CONFIG_KEY"))?.trim() ?? "";
  }

  if (!key) {
    key = generateBotConfigKey();
    await setEnvFileValue(rootEnvPath, "TEAMFLOW_BOT_CONFIG_KEY", key);
    created = true;
  }

  process.env.TEAMFLOW_BOT_CONFIG_KEY = key;
  return { key, created };
}

export async function syncDiscordBotEnv(appDir: string, teamflowUrl: string) {
  const { key } = await ensureBotConfigKey(appDir);
  const botEnvPath = path.join(appDir, "data", "discord-bot.env");
  await setEnvFileValue(botEnvPath, "TEAMFLOW_URL", teamflowUrl.replace(/\/$/, ""));
  await setEnvFileValue(botEnvPath, "TEAMFLOW_BOT_CONFIG_KEY", key);
}

export function defaultPublicUrl() {
  return (process.env.PUBLIC_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
