export type DiscordBotServiceState =
  | "not_installed"
  | "stopped"
  | "running"
  | "failed"
  | "unknown";

export type DiscordBotServiceStatusPublic = {
  /** Linux host with scripts + sudo for systemctl management */
  managementAvailable: boolean;
  managementReason: string | null;
  platform: string;
  scriptReady: boolean;
  sudoReady: boolean;
  sudoDetail: string | null;
  unitInstalled: boolean;
  unitEnabled: boolean;
  state: DiscordBotServiceState;
  processRunning: boolean;
  credentialsConfigured: boolean;
  botConfigKeyConfigured: boolean;
  botEnvReady: boolean;
  teamflowUrl: string | null;
  lastLogTail: string | null;
};
