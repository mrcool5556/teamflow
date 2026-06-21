import { parseRefFromShareUrl } from "@teamflow/core";
import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { BotConfig } from "./config.js";
import { buildShareUrl, formatIssueEmbed } from "./links.js";
import { getGuildRuntimeConfig } from "./guildConfig.js";
import { memberCanUseCommands, commandAccessDeniedMessage } from "./permissions.js";
import { buildThreadContext, mergeDescription } from "./threadContext.js";
import {
  createTeamflowClient,
  getDefaultRowId,
  teamflowErrorMessage,
} from "./teamflow.js";

function normalizeRefInput(raw: string) {
  return parseRefFromShareUrl(raw) ?? raw.trim();
}

export const slashCommands = [
  new SlashCommandBuilder()
    .setName("issue")
    .setDescription("Look up a Teamflow issue by ref (e.g. 11-3 or GEN-42)")
    .addStringOption((option) =>
      option.setName("ref").setDescription("Issue reference").setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("create")
    .setDescription("Create a Teamflow issue")
    .addStringOption((option) =>
      option.setName("title").setDescription("Issue title").setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("description")
        .setDescription("Optional description (thread chat appended when run in a thread)")
        .setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("link")
    .setDescription("Post a shareable Teamflow link for a ref")
    .addStringOption((option) =>
      option.setName("ref").setDescription("Issue reference").setRequired(true),
    ),
].map((command) => command.toJSON());

async function respond(
  interaction: ChatInputCommandInteraction,
  content: string,
  ephemeral = false,
) {
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ content });
    return;
  }
  await interaction.reply({ content, ephemeral });
}

export async function handleSlashCommand(
  interaction: ChatInputCommandInteraction,
  config: BotConfig,
) {
  await interaction.deferReply();

  const client = createTeamflowClient(config);

  try {
    const guildId = interaction.guildId;
    if (!guildId) {
      await respond(interaction, "This command can only be used in a Discord server.", true);
      return;
    }

    const runtime = await getGuildRuntimeConfig(client, config, guildId);
    if (
      !memberCanUseCommands(
        interaction,
        runtime.allowedRoleIds,
        runtime.allowDiscordAdministrators,
      )
    ) {
      await respond(
        interaction,
        commandAccessDeniedMessage(runtime.allowedRoleIds),
        true,
      );
      return;
    }

    const teamId = runtime.teamId;

    if (interaction.commandName === "issue") {
      const ref = normalizeRefInput(interaction.options.getString("ref", true));
      const result = await client.resolveRef(teamId, ref);
      if (!result.issue) {
        await respond(interaction, `No issue found for \`${ref}\`.`, true);
        return;
      }
      const shareUrl = buildShareUrl(config.publicUrl, result.issue.identifier);
      await respond(
        interaction,
        [formatIssueEmbed(result.issue), shareUrl].join("\n\n"),
      );
      return;
    }

    if (interaction.commandName === "link") {
      const ref = normalizeRefInput(interaction.options.getString("ref", true));
      const result = await client.resolveRef(teamId, ref);
      if (!result.resolved) {
        await respond(interaction, `Reference \`${ref}\` not found on this team.`, true);
        return;
      }
      const identifier =
        result.issue?.identifier ??
        (result.resolved.type === "issue"
          ? result.resolved.identifier
          : result.resolved.ref);
      const shareUrl = buildShareUrl(config.publicUrl, identifier);
      await respond(interaction, `**${identifier}**\n${shareUrl}`);
      return;
    }

    if (interaction.commandName === "create") {
      const title = interaction.options.getString("title", true).trim();
      const userDescription =
        interaction.options.getString("description")?.trim() || undefined;
      const threadContext = await buildThreadContext(interaction);
      const description = mergeDescription(userDescription, threadContext);
      const rowId = await getDefaultRowId(client, teamId);
      const { issue } = await client.createIssue({
        teamId,
        title,
        description,
        rowId,
        priority: "none",
      });
      const shareUrl = buildShareUrl(config.publicUrl, issue.identifier);
      await respond(
        interaction,
        `Created **${issue.identifier}** — ${issue.title}\n${shareUrl}`,
      );
      return;
    }

    await respond(interaction, "Unknown command.", true);
  } catch (err) {
    await respond(
      interaction,
      `Teamflow error: ${teamflowErrorMessage(err)}`,
      true,
    );
  }
}
