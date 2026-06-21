import { PermissionFlagsBits, type ChatInputCommandInteraction } from "discord.js";

/** Role IDs on slash-command interactions (array), not only GuildMemberRoleManager cache. */
export function interactionRoleIds(interaction: ChatInputCommandInteraction) {
  if (!interaction.inGuild() || !interaction.member) return [];
  const member = interaction.member;
  if (!("roles" in member)) return [];

  const roles = member.roles;
  if (Array.isArray(roles)) return roles;
  if (roles && typeof roles === "object" && "cache" in roles) {
    return [...roles.cache.keys()];
  }
  return [];
}

export function memberCanUseCommands(
  interaction: ChatInputCommandInteraction,
  allowedRoleIds: string[],
  allowDiscordAdministrators: boolean,
) {
  if (allowedRoleIds.length === 0) {
    return false;
  }

  const guildId = interaction.guildId;
  const effectiveAllowed = guildId
    ? allowedRoleIds.filter((id) => id !== guildId)
    : allowedRoleIds;

  if (effectiveAllowed.length === 0) {
    return false;
  }

  if (
    allowDiscordAdministrators &&
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
  ) {
    return true;
  }

  const roleIds = interactionRoleIds(interaction);
  return effectiveAllowed.some((id) => roleIds.includes(id));
}

export function commandAccessDeniedMessage(allowedRoleIds: string[]) {
  if (allowedRoleIds.length === 0) {
    return "Teamflow commands are not configured for this server yet. A team admin must add allowed role IDs in Teamflow Settings → Discord bot.";
  }
  return "You don't have permission to use Teamflow commands on this server.";
}
