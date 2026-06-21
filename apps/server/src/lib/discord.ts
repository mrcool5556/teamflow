import { and, eq, ne } from "drizzle-orm";
import type { TeamDiscordSettingsPublic, UpdateTeamDiscordSettingsInput } from "@teamflow/core";
import type { Db } from "@teamflow/db";
import { schema } from "@teamflow/db";
import { userHasTeamAccess } from "./issues.js";
import { userIsTeamAdmin } from "./invites.js";

function parseIdJson(raw: string) {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string");
  } catch {
    return [];
  }
}

function sanitizeAllowedRoleIds(guildId: string | null, roleIds: string[]) {
  if (!guildId) return roleIds;
  return roleIds.filter((id) => id !== guildId);
}

function mapSettings(
  row: typeof schema.teamDiscordSettings.$inferSelect,
): TeamDiscordSettingsPublic {
  return {
    teamId: row.teamId,
    guildId: row.guildId ?? null,
    allowedRoleIds: parseIdJson(row.allowedRoleIds),
    ticketChannelIds: parseIdJson(row.ticketChannelIds),
    allowDiscordAdministrators: row.allowDiscordAdministrators === 1,
    updatedAt: row.updatedAt,
  };
}

const defaultSettings = (teamId: string): TeamDiscordSettingsPublic => ({
  teamId,
  guildId: null,
  allowedRoleIds: [],
  ticketChannelIds: [],
  allowDiscordAdministrators: false,
  updatedAt: new Date().toISOString(),
});

export async function getTeamDiscordSettings(db: Db, teamId: string) {
  const [row] = await db
    .select()
    .from(schema.teamDiscordSettings)
    .where(eq(schema.teamDiscordSettings.teamId, teamId))
    .limit(1);

  return row ? mapSettings(row) : defaultSettings(teamId);
}

export async function updateTeamDiscordSettings(
  db: Db,
  teamId: string,
  actorUserId: string,
  input: UpdateTeamDiscordSettingsInput,
) {
  if (!(await userIsTeamAdmin(db, actorUserId, teamId))) {
    throw new Error("Admin access required");
  }

  const current = await getTeamDiscordSettings(db, teamId);
  const guildId = input.guildId !== undefined ? input.guildId : current.guildId;
  const rawAllowedRoleIds =
    input.allowedRoleIds !== undefined ? input.allowedRoleIds : current.allowedRoleIds;
  const allowedRoleIds = sanitizeAllowedRoleIds(guildId, rawAllowedRoleIds);
  const ticketChannelIds =
    input.ticketChannelIds !== undefined
      ? input.ticketChannelIds
      : current.ticketChannelIds;
  const allowDiscordAdministrators =
    input.allowDiscordAdministrators !== undefined
      ? input.allowDiscordAdministrators
      : current.allowDiscordAdministrators;

  if (guildId && allowedRoleIds.includes(guildId)) {
    throw new Error(
      "Do not use the server ID as a role ID — that is the @everyone role and would allow everyone.",
    );
  }

  if (guildId) {
    const [conflict] = await db
      .select({ teamId: schema.teamDiscordSettings.teamId })
      .from(schema.teamDiscordSettings)
      .where(
        and(
          eq(schema.teamDiscordSettings.guildId, guildId),
          ne(schema.teamDiscordSettings.teamId, teamId),
        ),
      )
      .limit(1);

    if (conflict) {
      throw new Error("That Discord server is already linked to another team");
    }
  }

  const payload = {
    teamId,
    guildId: guildId ?? null,
    allowedRoleIds: JSON.stringify(allowedRoleIds),
    ticketChannelIds: JSON.stringify(ticketChannelIds),
    allowDiscordAdministrators: allowDiscordAdministrators ? 1 : 0,
    updatedAt: new Date().toISOString(),
  };

  await db
    .insert(schema.teamDiscordSettings)
    .values(payload)
    .onConflictDoUpdate({
      target: schema.teamDiscordSettings.teamId,
      set: {
        guildId: payload.guildId,
        allowedRoleIds: payload.allowedRoleIds,
        ticketChannelIds: payload.ticketChannelIds,
        allowDiscordAdministrators: payload.allowDiscordAdministrators,
        updatedAt: payload.updatedAt,
      },
    });

  return getTeamDiscordSettings(db, teamId);
}

export async function getDiscordGuildConfig(db: Db, guildId: string, userId: string) {
  const [row] = await db
    .select()
    .from(schema.teamDiscordSettings)
    .where(eq(schema.teamDiscordSettings.guildId, guildId))
    .limit(1);

  if (!row) {
    return null;
  }

  if (!(await userHasTeamAccess(db, userId, row.teamId))) {
    throw new Error("Team access denied");
  }

  const settings = mapSettings(row);
  return {
    teamId: settings.teamId,
    allowedRoleIds: settings.allowedRoleIds,
    ticketChannelIds: settings.ticketChannelIds,
    allowDiscordAdministrators: settings.allowDiscordAdministrators,
  };
}
