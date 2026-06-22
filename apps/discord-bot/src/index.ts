#!/usr/bin/env node

import { config as loadEnv } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

loadEnv({ path: join(dirname(fileURLToPath(import.meta.url)), "..", ".env") });

import {
  Client,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
} from "discord.js";
import { handleSlashCommand, slashCommands } from "./commands.js";
import { loadConfig, type BotConfig } from "./config.js";
import { registerTicketHandlers } from "./tickets.js";
import { createTeamflowClient } from "./teamflow.js";

async function resolveRegisterGuildIds(
  config: BotConfig,
  teamflow: ReturnType<typeof createTeamflowClient>,
) {
  const guildIds = new Set(config.registerGuildIds);

  try {
    const { teams } = await teamflow.listTeams();
    for (const team of teams) {
      try {
        const { settings } = await teamflow.getTeamDiscordSettings(team.id);
        if (settings.guildId) guildIds.add(settings.guildId);
      } catch {
        // skip teams the PAT cannot read
      }
    }
  } catch (err) {
    console.warn(
      "[teamflow-discord] Could not load guild IDs from Teamflow settings:",
      err instanceof Error ? err.message : err,
    );
  }

  return [...guildIds];
}

async function registerSlashCommands(
  config: BotConfig,
  teamflow: ReturnType<typeof createTeamflowClient>,
) {
  const rest = new REST({ version: "10" }).setToken(config.discordToken);
  const guildIds = await resolveRegisterGuildIds(config, teamflow);

  if (guildIds.length > 0) {
    for (const guildId of guildIds) {
      await rest.put(Routes.applicationGuildCommands(config.discordClientId, guildId), {
        body: slashCommands,
      });
      console.log(`[teamflow-discord] Registered slash commands for guild ${guildId}`);
    }
    return;
  }

  await rest.put(Routes.applicationCommands(config.discordClientId), {
    body: slashCommands,
  });
  console.log("[teamflow-discord] Registered global slash commands");
}

async function main() {
  const config = await loadConfig();
  const teamflow = createTeamflowClient(config);

  console.log(
    `[teamflow-discord] Config source: ${config.configSource === "settings" ? "Teamflow Settings" : ".env file"}`,
  );

  const { user } = await teamflow.me();
  console.log(`[teamflow-discord] Teamflow PAT user: ${user.name} (${user.email})`);

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      ...(config.messageContentIntent ? [GatewayIntentBits.MessageContent] : []),
    ],
  });

  registerTicketHandlers(client, config);

  client.once(Events.ClientReady, async (readyClient) => {
    console.log(`[teamflow-discord] Logged in as ${readyClient.user.tag}`);
    if (config.messageContentIntent) {
      console.log(
        "[teamflow-discord] Message Content Intent on — /create thread transcripts include human messages.",
      );
    } else {
      console.log(
        "[teamflow-discord] Thread transcripts need Message Content Intent: enable it in the Discord Developer Portal, set DISCORD_MESSAGE_CONTENT_INTENT=true in .env, restart.",
      );
    }
    try {
      await registerSlashCommands(config, teamflow);
    } catch (err) {
      console.error("[teamflow-discord] Failed to register slash commands:", err);
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.replied || interaction.deferred) return;

    try {
      await handleSlashCommand(interaction, config);
    } catch (err) {
      console.error("[teamflow-discord] Command failed:", err);
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({
            content: "Something went wrong running that command.",
          });
        } else {
          await interaction.reply({
            content: "Something went wrong running that command.",
            ephemeral: true,
          });
        }
      } catch (replyErr) {
        console.error("[teamflow-discord] Failed to send error reply:", replyErr);
      }
    }
  });

  await client.login(config.discordToken);
}

main().catch((err) => {
  console.error("[teamflow-discord] Fatal:", err);
  process.exit(1);
});
