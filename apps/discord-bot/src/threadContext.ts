import type { ChatInputCommandInteraction } from "discord.js";
import { extractUrls, isHumanMessage, messageBody } from "./messageText.js";

/** Recent human thread messages + URLs for issue descriptions. */
export async function buildThreadContext(
  interaction: ChatInputCommandInteraction,
): Promise<string | null> {
  const channel = interaction.channel;
  if (!channel?.isThread()) return null;

  try {
    const messages = await channel.messages.fetch({ limit: 50 });
    const sorted = [...messages.values()].sort(
      (a, b) => a.createdTimestamp - b.createdTimestamp,
    );

    const lines: string[] = [];
    const urls = new Set<string>();

    for (const message of sorted) {
      if (!isHumanMessage(message)) continue;

      const body = messageBody(message);
      if (!body) continue;

      lines.push(`**${message.author.username}:** ${body}`);
      for (const url of extractUrls(body)) urls.add(url);
    }

    if (lines.length === 0 && urls.size === 0) return null;

    const parts: string[] = ["## Discord thread", ...lines];
    if (urls.size > 0) {
      parts.push("", "## Links", ...[...urls].map((url) => `- ${url}`));
    }
    return parts.join("\n");
  } catch {
    return null;
  }
}

export function mergeDescription(
  userDescription: string | undefined,
  threadContext: string | null,
) {
  if (!threadContext) return userDescription;
  if (!userDescription?.trim()) return threadContext;
  return `${userDescription.trim()}\n\n---\n\n${threadContext}`;
}
