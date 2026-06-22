import { eq } from "drizzle-orm";
import type {
  DiscordBotRuntimeConfig,
  DiscordBotSecretsPublic,
  UpdateDiscordBotSecretsInput,
} from "@teamflow/core";
import type { Db } from "@teamflow/db";
import { schema } from "@teamflow/db";
import {
  botConfigKeyConfigured,
  decryptSecret,
  encryptSecret,
} from "./secretsCrypto.js";
import { userHasTeamPermission } from "./permissions.js";

const ROW_ID = "default";

function defaultSecretsPublic(): DiscordBotSecretsPublic {
  return {
    configured: false,
    clientId: null,
    hasBotToken: false,
    hasPat: false,
    teamflowUrl: "http://localhost:3000",
    publicUrl: "http://localhost:5173",
    messageContentIntent: false,
    botConfigKeyConfigured: botConfigKeyConfigured(),
    updatedAt: null,
  };
}

function mapSecretsPublic(
  row: typeof schema.discordBotSecrets.$inferSelect | undefined,
): DiscordBotSecretsPublic {
  if (!row) return defaultSecretsPublic();

  const hasBotToken = Boolean(row.botTokenEnc);
  const hasPat = Boolean(row.patEnc);
  return {
    configured: hasBotToken && hasPat && Boolean(row.clientId),
    clientId: row.clientId ?? null,
    hasBotToken,
    hasPat,
    teamflowUrl: row.teamflowUrl,
    publicUrl: row.publicUrl,
    messageContentIntent: row.messageContentIntent === 1,
    botConfigKeyConfigured: botConfigKeyConfigured(),
    updatedAt: row.updatedAt ?? null,
  };
}

async function getSecretsRow(db: Db) {
  const [row] = await db
    .select()
    .from(schema.discordBotSecrets)
    .where(eq(schema.discordBotSecrets.id, ROW_ID))
    .limit(1);
  return row;
}

export async function getDiscordBotSecretsPublic(db: Db) {
  const row = await getSecretsRow(db);
  return mapSecretsPublic(row);
}

export async function updateDiscordBotSecrets(
  db: Db,
  teamId: string,
  actorUserId: string,
  input: UpdateDiscordBotSecretsInput,
) {
  if (!(await userHasTeamPermission(db, actorUserId, teamId, "integrations.discord.secrets"))) {
    throw new Error("Permission denied");
  }

  const current = await getSecretsRow(db);
  const now = new Date().toISOString();
  const nextBotTokenEnc =
    input.botToken !== undefined ? encryptSecret(input.botToken) : current?.botTokenEnc ?? null;
  const nextPatEnc =
    input.pat !== undefined ? encryptSecret(input.pat) : current?.patEnc ?? null;
  const nextClientId = input.clientId ?? current?.clientId ?? null;

  if (input.botToken !== undefined && !input.botToken.trim()) {
    throw new Error("Bot token cannot be empty");
  }
  if (input.pat !== undefined && !input.pat.trim()) {
    throw new Error("PAT cannot be empty");
  }
  if (input.clientId !== undefined && !input.clientId.trim()) {
    throw new Error("Client ID cannot be empty");
  }

  const payload = {
    id: ROW_ID,
    botTokenEnc: nextBotTokenEnc,
    clientId: nextClientId,
    patEnc: nextPatEnc,
    teamflowUrl: input.teamflowUrl ?? current?.teamflowUrl ?? "http://localhost:3000",
    publicUrl: input.publicUrl ?? current?.publicUrl ?? "http://localhost:5173",
    messageContentIntent:
      input.messageContentIntent !== undefined
        ? input.messageContentIntent
          ? 1
          : 0
        : (current?.messageContentIntent ?? 0),
    updatedAt: now,
    updatedByUserId: actorUserId,
  };

  await db
    .insert(schema.discordBotSecrets)
    .values(payload)
    .onConflictDoUpdate({
      target: schema.discordBotSecrets.id,
      set: {
        botTokenEnc: payload.botTokenEnc,
        clientId: payload.clientId,
        patEnc: payload.patEnc,
        teamflowUrl: payload.teamflowUrl,
        publicUrl: payload.publicUrl,
        messageContentIntent: payload.messageContentIntent,
        updatedAt: payload.updatedAt,
        updatedByUserId: payload.updatedByUserId,
      },
    });

  return getDiscordBotSecretsPublic(db);
}

export async function getDiscordBotRuntimeConfig(db: Db): Promise<DiscordBotRuntimeConfig | null> {
  const row = await getSecretsRow(db);
  if (!row?.botTokenEnc || !row.patEnc || !row.clientId) {
    return null;
  }

  return {
    botToken: decryptSecret(row.botTokenEnc),
    clientId: row.clientId,
    pat: decryptSecret(row.patEnc),
    teamflowUrl: row.teamflowUrl.replace(/\/$/, ""),
    publicUrl: row.publicUrl.replace(/\/$/, ""),
    messageContentIntent: row.messageContentIntent === 1,
  };
}
