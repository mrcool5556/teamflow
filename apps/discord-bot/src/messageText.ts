import type { Message } from "discord.js";

const URL_PATTERN = /https?:\/\/[^\s<>()]+/gi;

export function extractUrls(text: string) {
  return [...new Set(text.match(URL_PATTERN) ?? [])];
}

/** Plain text, embed fields, and attachment URLs from a Discord message. */
export function messageBody(message: Message) {
  const parts: string[] = [];

  const content = message.content.trim();
  if (content) parts.push(content);

  for (const embed of message.embeds) {
    if (embed.title?.trim()) parts.push(embed.title.trim());
    if (embed.description?.trim()) parts.push(embed.description.trim());
    if (embed.url) parts.push(embed.url);
    for (const field of embed.fields) {
      const name = field.name?.trim();
      const value = field.value?.trim();
      if (name && value) parts.push(`${name}: ${value}`);
      else if (value) parts.push(value);
      else if (name) parts.push(name);
    }
  }

  for (const attachment of message.attachments.values()) {
    parts.push(attachment.url);
  }

  return parts.join("\n").trim();
}

export function isHumanMessage(message: Message) {
  return !message.author.bot;
}
