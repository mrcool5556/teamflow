import { createContext, useContext } from "react";
import type { TeamPermission, TeamPermissionsPublic } from "@teamflow/core";

export function hasTeamPermission(
  snapshot: TeamPermissionsPublic | null | undefined,
  permission: TeamPermission,
): boolean {
  return snapshot?.permissions.includes(permission) ?? false;
}

/**
 * The signed-in user's permission set for the open team. The board shell provides it; outside
 * a shell (tests, previews) the board stays editable.
 */
export const TeamPermissionsContext = createContext<TeamPermissionsPublic | null | undefined>(
  undefined,
);

/** May the user create, edit, move, assign or delete issues, rows and columns? */
export function useCanEditBoard() {
  const snapshot = useContext(TeamPermissionsContext);
  return snapshot === undefined ? true : hasTeamPermission(snapshot, "board.edit");
}
