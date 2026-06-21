import type { Client, ThreadChannel } from "discord.js";
import type { BotConfig } from "./config.js";
import { buildShareUrl } from "./links.js";
import { getGuildRuntimeConfig } from "./guildConfig.js";
import { messageBody } from "./messageText.js";
import {
  createTeamflowClient,
  getDefaultRowId,
  teamflowErrorMessage,
} from "./teamflow.js";

export function registerTicketHandlers(client: Client, config: BotConfig) {
  client.on("threadCreate", (thread) => {
    void handleTicketThread(thread, config);
  });
}

async function handleTicketThread(thread: ThreadChannel, config: BotConfig) {
  if (!thread.parentId || thread.guildId === null) {
    return;
  }

  const teamflow = createTeamflowClient(config);

  try {
    const runtime = await getGuildRuntimeConfig(teamflow, config, thread.guildId);
    if (!runtime.ticketChannelIds.has(thread.parentId)) {
      return;
    }

    const teamId = runtime.teamId;
    const title = thread.name.trim() || "Discord ticket";
    let description = `Discord ticket thread: ${thread.url}`;

    try {
      const starter = await thread.fetchStarterMessage();
      const starterBody = starter ? messageBody(starter) : "";
      if (starterBody) {
        description = `${starterBody}\n\n---\n${description}`;
      }
    } catch {
      // starter unavailable — use thread URL only
    }

    const rowId = await getDefaultRowId(teamflow, teamId);
    const { issue } = await teamflow.createIssue({
      teamId,
      title,
      description,
      rowId,
      priority: "none",
    });

    const shareUrl = buildShareUrl(config.publicUrl, issue.identifier);
    await thread.send(
      `Created Teamflow issue **${issue.identifier}** — ${issue.title}\n${shareUrl}`,
    );
  } catch (err) {
    console.error("[teamflow-discord] ticket thread failed:", err);
    try {
      await thread.send(
        `Could not create Teamflow issue: ${teamflowErrorMessage(err)}`,
      );
    } catch {
      // ignore reply failures
    }
  }
}
