import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { INSTALLED_SCRIPT_DIR } from "../src/lib/maintenance.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

describe("maintenance sudo layout", () => {
  const sudoScript = read("deploy/proxmox-lxc/setup-maintenance-sudo.sh");
  const sudoersLine = sudoScript.split("\n").find((line) => line.includes("NOPASSWD:"))!;

  it("installs root-owned copies under /usr/local/lib/teamflow with mode 755", () => {
    expect(sudoScript).toMatch(/LIB_DIR="\/usr\/local\/lib\/teamflow"/);
    expect(sudoScript).toMatch(/install -d -m 755 -o root -g root "\$LIB_DIR"/);
    expect(sudoScript).toMatch(/install -m 755 -o root -g root "\$UPDATE_REPO" "\$UPDATE_BIN"/);
  });

  it("sudoers rule points only at the root-owned directory and keeps no env", () => {
    expect(sudoersLine).toBeTruthy();
    expect(sudoersLine).toContain("$BACKUP_BIN *");
    expect(sudoersLine).toContain("$UPDATE_BIN *");
    expect(sudoersLine).toContain("$DISCORD_BIN *");
    expect(sudoersLine).not.toMatch(/\$APP_DIR|BASH_BIN|_REPO/);
    expect(sudoScript).not.toMatch(/env_keep/);
    expect(sudoScript).not.toMatch(/\/usr\/local\/bin\/[^ ]+ \*/);
  });

  it("server defaults match the installed location", () => {
    expect(INSTALLED_SCRIPT_DIR).toBe("/usr/local/lib/teamflow/");
    const maintenance = read("apps/server/src/lib/maintenance.ts");
    const discord = read("apps/server/src/lib/discordBotService.ts");
    expect(maintenance).not.toMatch(/\/usr\/local\/bin\//);
    expect(discord).toContain("/usr/local/lib/teamflow/");
    expect(discord).not.toMatch(/\/usr\/local\/bin\/teamflow-discord/);
  });

  it("update.sh and install.sh no longer install sudo targets into /usr/local/bin", () => {
    for (const rel of ["deploy/proxmox-lxc/update.sh", "deploy/proxmox-lxc/install.sh"]) {
      const text = read(rel);
      expect(text, rel).not.toMatch(
        /install -m 755 .*\/usr\/local\/bin\/teamflow-(update|backup|discord)/,
      );
      expect(text, rel).toContain("setup-maintenance-sudo.sh");
    }
  });

  it("check-discord-bot.sh prints set/unset, never key values", () => {
    const text = read("deploy/proxmox-lxc/check-discord-bot.sh");
    expect(text).not.toMatch(/grep -E '\^\((TEAMFLOW_URL|PUBLIC_URL)[^']*\)='/);
    expect(text).toContain("report_keys");
    expect(text).not.toMatch(/SELECT teamflow_url, public_url/);
  });
});
