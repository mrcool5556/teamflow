import { createContext, useContext } from "react";
import type { TeamMemberPublic, TeamPermissionsPublic, TeamPublic } from "@teamflow/core";

/** What the signed-in user may open or change in the current team's settings. */
export type TeamAccess = {
  showRoles: boolean;
  canManageRoles: boolean;
  showIntegrations: boolean;
  canManageDiscord: boolean;
  canManageDiscordSecrets: boolean;
  showMaintenance: boolean;
  canRunMaintenance: boolean;
};

/** State the board shell shares with the screens it hosts (settings panels, plan). */
export type ShellContextValue = {
  team: TeamPublic | null;
  teamKey: string | null;
  teamsLoaded: boolean;
  members: TeamMemberPublic[];
  permissions: TeamPermissionsPublic | null;
  /** The permission set for `team` has loaded (or failed); false without a team. */
  permissionsReady: boolean;
  access: TeamAccess;
  reloadBoard: () => void;
  reloadPermissions: () => void;
  onTeamCreated: (teamId: string, switchToNew: boolean) => void;
  onTeamJoined: (teamId: string) => void;
  onTeamLeft: (teamId: string) => void;
  onTeamDeleted: (teamId: string) => void;
  closeSettings: () => void;
};

export const ShellContext = createContext<ShellContextValue | null>(null);

export function useShell() {
  const shell = useContext(ShellContext);
  if (!shell) throw new Error("useShell needs the board shell");
  return shell;
}
