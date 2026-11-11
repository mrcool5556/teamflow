import type { ServerPower, UserPublic } from "@teamflow/core";
import type { AdminSection } from "./appRoute";

/** The signed-in user's server powers (every power for the Server Owner). */
export function serverPowersOf(user: UserPublic | null | undefined): ServerPower[] {
  return user?.serverPowers ?? [];
}

export function hasServerPower(user: UserPublic | null | undefined, ...powers: ServerPower[]) {
  const held = serverPowersOf(user);
  return powers.some((power) => held.includes(power));
}

export function isServerOwner(user: UserPublic | null | undefined) {
  return user?.serverRole === "owner";
}

/** Which Server admin sections a user may open; Overview and How-tos need any power. */
export function canOpenAdminSection(user: UserPublic | null | undefined, section: AdminSection) {
  if (serverPowersOf(user).length === 0) return false;
  switch (section) {
    case "spaces":
      return hasServerPower(user, "flows");
    case "people":
      return isServerOwner(user) || hasServerPower(user, "people");
    case "site":
      return hasServerPower(user, "site");
    case "updates":
      return hasServerPower(user, "updates", "backups");
    case "bot":
      return hasServerPower(user, "discord");
    case "defaults":
      return hasServerPower(user, "flows", "signup");
    default:
      return true;
  }
}
