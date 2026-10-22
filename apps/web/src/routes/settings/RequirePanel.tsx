import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { settingsPath } from "../../lib/appRoute";
import { useShell, type TeamAccess } from "../board/shellContext";

/**
 * Team panels need a team and, for some, a permission. Once the permission set is known, a
 * user without it (or who just lost it) is sent to General instead of a blank panel.
 */
export function RequirePanel({
  access,
  children,
}: {
  access?: keyof TeamAccess;
  children: (team: { id: string; key: string; name: string }) => ReactNode;
}) {
  const shell = useShell();
  const general = <Navigate to={settingsPath(shell.teamKey, "general")} replace />;
  if (!shell.teamsLoaded) return null;
  if (!shell.team) return general;
  if (access) {
    if (!shell.permissionsReady) return null;
    if (!shell.access[access]) return general;
  }
  return <>{children(shell.team)}</>;
}
