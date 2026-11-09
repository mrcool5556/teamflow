/**
 * How-tos for the server admin page. `fixIds` are the ids the Overview checks report
 * (apps/server/src/lib/instanceAdmin.ts → collectFixes); a matching how-to is listed first and
 * linked from the Overview. Commands are the Proxmox LXC (Setup B) ones unless marked Windows.
 */
export type HowTo = {
  id: string;
  title: string;
  fixIds: string[];
  /** One line on when this applies. */
  when: string;
  steps: { text: string; command?: string }[];
};

export const HOW_TOS: HowTo[] = [
  {
    id: "disk-full",
    title: "Free disk space",
    fixIds: ["disk-low", "disk-getting-full", "caps-exceed-disk"],
    when: "Uploads pause for everyone when free disk falls under the floor set in Flow defaults.",
    steps: [
      {
        text: "See what uses the disk.",
        command: "sudo du -sh /opt/teamflow/data/* /var/backups/teamflow",
      },
      {
        text: "Delete old backups you no longer need (keep the newest full one).",
        command: "ls -lt /var/backups/teamflow",
      },
      {
        text: "Empty the trash of the biggest Flows: Server admin → Flows → a Flow → Empty trash now.",
      },
      {
        text: "Lower caps on Flows that do not need them, or grow the container disk in Proxmox.",
      },
    ],
  },
  {
    id: "disk-unreadable",
    title: "Free disk space cannot be read",
    fixIds: ["disk-unreadable"],
    when: "The server could not run statfs on its upload folder, so the floor is not enforced.",
    steps: [
      {
        text: "Check that UPLOAD_DIR in .env points at a folder that exists and the teamflow user can read.",
      },
      { text: "Restart the server after fixing it.", command: "sudo systemctl restart teamflow" },
    ],
  },
  {
    id: "space-full",
    title: "A Flow is full",
    fixIds: ["spaces-full"],
    when: "Members of a full Flow cannot upload; issues, comments and links still work.",
    steps: [
      { text: "Open Server admin → Flows and pick the Flow to see its largest files." },
      { text: "Empty its trash, or ask the owner to remove files they no longer need." },
      {
        text: "Or raise its cap in the Upload cap box; free Flows can also be changed to admin Flows.",
      },
    ],
  },
  {
    id: "public-url",
    title: "Change the public address",
    fixIds: ["public-url-unset"],
    when: "Invite links, password-reset links and the Discord bot use it; it must be the address people open.",
    steps: [
      {
        text: "Open Site & email, enter the address people use (for example https://teamflow.example.org), press Check, then save. It applies at once.",
      },
      {
        text: "If the field says Set in .env, PUBLIC_URL in .env wins. Either change it there and restart, or delete the line, restart, and set it on the page.",
        command: "sudo nano /opt/teamflow/.env && sudo systemctl restart teamflow",
      },
      {
        text: "Windows: edit .env in the install folder, then restart the service.",
        command: "nssm restart Teamflow",
      },
    ],
  },
  {
    id: "email",
    title: "Set up email",
    fixIds: [],
    when: "Without email, forgotten passwords need an admin (People → Send reset link).",
    steps: [
      {
        text: "Open Site & email. Enter your provider's SMTP server, port and security (587 with STARTTLS is the usual), your login and the sender address.",
      },
      {
        text: "Press Send a test to me. It saves first, then reports what the SMTP server said.",
      },
      {
        text: "Gmail and most providers need an app password, not your normal one. If the field says Set in .env, the SMTP_* lines in .env win.",
      },
    ],
  },
  {
    id: "service",
    title: "Run Teamflow as a service",
    fixIds: ["no-service"],
    when: "Without a service the server does not come back after a crash or reboot.",
    steps: [
      {
        text: "Linux: install.sh sets up the teamflow systemd unit; check it.",
        command: "systemctl status teamflow",
      },
      {
        text: "Windows: install the NSSM service from the repo.",
        command: ".\\deploy\\windows\\install-service.ps1",
      },
    ],
  },
  {
    id: "maintenance",
    title: "Turn on updates and backups from the app",
    fixIds: ["maintenance-off", "maintenance-sudo"],
    when: "The Updates & backups buttons need the maintenance flag and a sudo rule for the teamflow user.",
    steps: [
      { text: "Set TEAMFLOW_MAINTENANCE_ENABLED=true in .env (Linux only)." },
      {
        text: "Install the root-owned scripts and the sudo rule (once; sudo update repeats it).",
        command: "sudo bash /opt/teamflow/deploy/proxmox-lxc/setup-maintenance-sudo.sh",
      },
      {
        text: "Restart, then press Check on Updates & backups.",
        command: "sudo systemctl restart teamflow",
      },
    ],
  },
  {
    id: "backups",
    title: "Back up the database and uploads",
    fixIds: ["no-backups", "backup-old", "uploads-not-backed-up"],
    when: "Pre-update backups copy the database only; uploads need a full backup.",
    steps: [
      {
        text: "Run a full backup now (database and data/uploads).",
        command: "sudo teamflow-backup",
      },
      { text: "Or press Full backup in Server admin → Updates & backups." },
      { text: "Backups land in /var/backups/teamflow; copy them off the server too." },
      {
        text: "Windows: run the backup script from the install folder.",
        command: ".\\deploy\\windows\\backup.ps1",
      },
    ],
  },
  {
    id: "update",
    title: "Update Teamflow",
    fixIds: ["update-available"],
    when: "The Overview says the server is behind its branch.",
    steps: [
      {
        text: "Press Update… in Server admin → Updates & backups, or from a shell:",
        command: "sudo update",
      },
      { text: "Windows:", command: ".\\deploy\\windows\\update.ps1" },
    ],
  },
  {
    id: "after-update-502",
    title: "502 or a blank page after an update",
    fixIds: [],
    when: "The proxy answers but Teamflow does not.",
    steps: [
      {
        text: "Read the last lines of the server log.",
        command: "journalctl -u teamflow -n 80 --no-pager",
      },
      { text: "Check the app answers locally.", command: "curl http://localhost:3000/health" },
      {
        text: "Run the diagnosis script from the repo.",
        command: "sudo bash /opt/teamflow/deploy/proxmox-lxc/diagnose.sh",
      },
      { text: "Restart once the cause is fixed.", command: "sudo systemctl restart teamflow" },
    ],
  },
  {
    id: "port",
    title: "Check the port and the service",
    fixIds: [],
    when: "The Overview shows the port the server listens on (PORT in .env, 3000 by default).",
    steps: [
      { text: "See which process holds the port.", command: "sudo ss -ltnp | grep 3000" },
      { text: "Check the service state.", command: "systemctl status teamflow" },
      { text: "Windows: find the process on the port.", command: "netstat -ano | findstr :3000" },
    ],
  },
  {
    id: "bot",
    title: "Fix the Discord bot",
    fixIds: ["bot-failed", "bot-stopped", "bot-not-installed"],
    when: "The bot is stopped, failed or not installed although credentials are saved.",
    steps: [
      { text: "Read its log.", command: "journalctl -u teamflow-discord -n 80 --no-pager" },
      {
        text: "A revoked PAT or bot token is the usual cause: save new ones in Settings → Integrations.",
      },
      {
        text: "Install or restart it (or use Server admin → Discord bot).",
        command: "sudo teamflow-discord restart",
      },
    ],
  },
];

/** The how-to for an Overview fix id, if any. */
export function howToForFix(fixId: string) {
  return HOW_TOS.find((howTo) => howTo.fixIds.includes(fixId)) ?? null;
}
