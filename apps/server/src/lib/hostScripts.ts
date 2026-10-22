import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { config } from "../config.js";

/**
 * Running the host maintenance scripts (backup.sh, update.sh, discord-bot.sh): shared by
 * lib/maintenance.ts and lib/discordBotService.ts.
 */

/** Root-owned copies installed by deploy/proxmox-lxc/setup-maintenance-sudo.sh. */
export const INSTALLED_SCRIPT_DIR = "/usr/local/lib/teamflow/";

export const BASH_PATH = "/usr/bin/bash";

/** TEAMFLOW_MAINTENANCE_SUDO (default true). */
export function useSudo() {
  return config.maintenance.sudo;
}

/** The installed copies are executable and listed in sudoers directly; checkout copies run via bash. */
function scriptUsesDirectSudo(script: string) {
  return script.startsWith(INSTALLED_SCRIPT_DIR);
}

export function formatCommand(command: string, args: string[]) {
  return [command, ...args].join(" ");
}

/** The command line for running `script args` (via sudo -n when enabled). */
export function buildSpawnArgs(script: string, args: string[], sudo = useSudo()) {
  if (process.platform === "win32") {
    return { command: "bash", args: [script, ...args] };
  }
  if (sudo) {
    if (scriptUsesDirectSudo(script)) {
      return { command: "sudo", args: ["-n", script, ...args] };
    }
    return { command: "sudo", args: ["-n", BASH_PATH, script, ...args] };
  }
  return { command: BASH_PATH, args: [script, ...args] };
}

export type SudoProbe = { ready: boolean; command: string; detail: string };

/**
 * Check that `sudo -n <script> --help` works without a password prompt. Spawns a process, so it
 * only runs from explicit checks and actions, never from a GET.
 */
export async function probeSudo(script: string, env?: NodeJS.ProcessEnv): Promise<SudoProbe> {
  if (!useSudo() || process.platform === "win32") {
    return { ready: true, command: "", detail: "sudo not required" };
  }
  if (!existsSync(script)) {
    return { ready: false, command: "", detail: `Script missing: ${script}` };
  }

  const { command, args } = buildSpawnArgs(script, ["--help"], true);
  const cmdline = formatCommand(command, args);

  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], env });
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      resolve({ ready: false, command: cmdline, detail: err.message });
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ ready: true, command: cmdline, detail: "ok" });
        return;
      }
      resolve({
        ready: false,
        command: cmdline,
        detail: stderr.trim() || `exit ${code ?? "unknown"}`,
      });
    });
  });
}
