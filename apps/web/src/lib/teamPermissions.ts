import type { TeamPermission, TeamPermissionsPublic } from "@teamflow/core";

export function hasTeamPermission(
  snapshot: TeamPermissionsPublic | null | undefined,
  permission: TeamPermission,
): boolean {
  return snapshot?.permissions.includes(permission) ?? false;
}
