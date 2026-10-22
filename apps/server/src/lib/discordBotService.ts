import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import type { DiscordBotServiceStatusPublic } from "@teamflow/core";
import { botConfigKeyConfigured } from "./secretsCrypto.js";
import { getDiscordBotSecretsPublic } from "./discordSecrets.js";
import type { Db } from "@teamflow/db";
import { defaultPublicUrl, syncDiscordBotEnv } from "./botConfigKey.js";
import { config } from "../config.js";
import { badRequest } from "./errors.js";

const BASH_PATH = "/usr/bin/bash";
const INSTALLED_SCRIPT_PREFIX = "/usr/local/lib/teamflow/";

function getAppDir() {
  return config.appDir;
}

function useSudo() {
  return config.maintenance.sudo;
}

function getDiscordBotScript() {
  const configured = config.maintenance.discordBotScript;
  if (configured) return configured;
  const installed = `${INSTALLED_SCRIPT_PREFIX}discord-bot.sh`;
  if (existsSync(installed)) return installed;
  return path.join(getAppDir(), "deploy/proxmox-lxc/discord-bot.sh");
}

function managementReason(): string | null {
  if (process.platform === "win32") {
    return "Discord bot service management is only available on Linux server installs. Run pnpm dev:discord locally.";
  }
  return null;
}

function scriptUsesDirectSudo(script: string) {
  return script.startsWith(INSTALLED_SCRIPT_PREFIX);
}

function buildSpawnArgs(script: string, args: string[]) {
  if (useSudo()) {
    if (scriptUsesDirectSudo(script)) {
      return { command: "sudo", args: ["-n", script, ...args] };
    }
    return { command: "sudo", args: ["-n", BASH_PATH, script, ...args] };
  }
  return { command: BASH_PATH, args: [script, ...args] };
}

async function runScript(
  args: string[],
  options?: { sudo?: boolean },
): Promise<{ stdout: string; stderr: string; code: number }> {
  const script = getDiscordBotScript();
  if (!existsSync(script)) {
    throw badRequest(`Discord bot script not found at ${script}`);
  }

  const shouldSudo = options?.sudo ?? useSudo();
  const { command, args: spawnArgs } = shouldSudo
    ? buildSpawnArgs(script, args)
    : { command: BASH_PATH, args: [script, ...args] };
  const env = {
    ...process.env,
    APP_DIR: getAppDir(),
  };

  return new Promise((resolve, reject) => {
    const child = spawn(command, spawnArgs, { env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ stdout, stderr, code: code ?? 1 });
    });
  });
}

async function probeSudo(script: string): Promise<{ ready: boolean; detail: string }> {
  if (!useSudo() || process.platform === "win32") {
    return { ready: true, detail: "sudo not required" };
  }
  if (!existsSync(script)) {
    return { ready: false, detail: `Script missing: ${script}` };
  }

  try {
    const result = await runScript(["--help"], { sudo: true });
    if (result.code === 0) return { ready: true, detail: "ok" };
    return { ready: false, detail: result.stderr.trim() || `exit ${result.code}` };
  } catch (err) {
    return {
      ready: false,
      detail: err instanceof Error ? err.message : "sudo probe failed",
    };
  }
}

type ScriptStatus = {
  unitInstalled: boolean;
  unitEnabled: boolean;
  state: DiscordBotServiceStatusPublic["state"];
  processRunning: boolean;
  botEnvReady: boolean;
  lastLogTail: string;
};

async function readScriptStatus(): Promise<ScriptStatus | null> {
  const script = getDiscordBotScript();
  if (!existsSync(script) || process.platform === "win32") return null;

  try {
    const result = await runScript(["status"], { sudo: false });
    if (result.code !== 0) return null;
    return JSON.parse(result.stdout.trim()) as ScriptStatus;
  } catch {
    return null;
  }
}

export async function getDiscordBotServiceStatus(db: Db): Promise<DiscordBotServiceStatusPublic> {
  const reason = managementReason();
  const script = getDiscordBotScript();
  const scriptReady = existsSync(script);
  const secrets = await getDiscordBotSecretsPublic(db);
  const managementAvailable = reason === null && scriptReady;
  const sudoProbe = managementAvailable
    ? await probeSudo(script)
    : { ready: false, detail: reason };
  const scriptStatus = reason === null && scriptReady ? await readScriptStatus() : null;
  const botEnvPath = path.join(getAppDir(), "data", "discord-bot.env");

  return {
    managementAvailable: managementAvailable && sudoProbe.ready,
    managementReason:
      reason ??
      (!scriptReady
        ? "Discord bot service script is missing on this host."
        : sudoProbe.ready
          ? null
          : `${sudoProbe.detail}. Run deploy/proxmox-lxc/setup-maintenance-sudo.sh on the server.`),
    platform: process.platform,
    scriptReady,
    sudoReady: sudoProbe.ready,
    sudoDetail: sudoProbe.ready ? null : sudoProbe.detail,
    unitInstalled: scriptStatus?.unitInstalled ?? false,
    unitEnabled: scriptStatus?.unitEnabled ?? false,
    state: scriptStatus?.state ?? "unknown",
    processRunning: scriptStatus?.processRunning ?? false,
    credentialsConfigured: secrets.configured,
    botConfigKeyConfigured: botConfigKeyConfigured(),
    botEnvReady: scriptStatus?.botEnvReady ?? existsSync(botEnvPath),
    teamflowUrl: secrets.configured ? secrets.teamflowUrl : null,
    lastLogTail: scriptStatus?.lastLogTail || null,
  };
}

async function assertCanManage(db: Db) {
  const secrets = await getDiscordBotSecretsPublic(db);
  if (!secrets.configured) {
    throw badRequest("Save bot credentials in Settings before enabling the Discord bot service.");
  }
}

async function runManagedAction(action: "enable" | "restart" | "stop") {
  const reason = managementReason();
  if (reason) throw badRequest(reason);

  const script = getDiscordBotScript();
  if (!existsSync(script)) {
    throw badRequest(`Discord bot script not found at ${script}`);
  }

  const sudoProbe = await probeSudo(script);
  if (!sudoProbe.ready) {
    throw badRequest(
      `${sudoProbe.detail}. Run deploy/proxmox-lxc/setup-maintenance-sudo.sh on the server.`,
    );
  }

  const result = await runScript([action], { sudo: true });
  if (result.code !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || `exit ${result.code}`;
    throw badRequest(`Discord bot ${action} failed: ${detail}`);
  }

  try {
    return JSON.parse(result.stdout.trim()) as ScriptStatus;
  } catch {
    return null;
  }
}

export async function enableDiscordBotService(db: Db) {
  await assertCanManage(db);
  const secrets = await getDiscordBotSecretsPublic(db);
  await syncDiscordBotEnv(getAppDir(), secrets.teamflowUrl || defaultPublicUrl());
  await runManagedAction("enable");
  return getDiscordBotServiceStatus(db);
}

export async function restartDiscordBotService(db: Db) {
  await assertCanManage(db);
  const secrets = await getDiscordBotSecretsPublic(db);
  await syncDiscordBotEnv(getAppDir(), secrets.teamflowUrl || defaultPublicUrl());
  await runManagedAction("restart");
  return getDiscordBotServiceStatus(db);
}

export async function stopDiscordBotService(db: Db) {
  await runManagedAction("stop");
  return getDiscordBotServiceStatus(db);
}
