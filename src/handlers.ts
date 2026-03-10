import {
  Message,
  PartialMessage,
  TextChannel,
  EmbedBuilder,
  Colors,
  AttachmentBuilder,
} from "discord.js";
import { config } from "./config.js";
import {
  cacheMessage,
  getCachedMessage,
  removeCachedMessage,
  type CachedMessage,
} from "./cache.js";

/**
 * Cache every incoming message so we have the content when it gets deleted.
 */
export function handleMessageCreate(message: Message) {
  if (message.author.bot) return;
  if (!message.guild) return;

  if (
    config.monitoredChannels.length > 0 &&
    !config.monitoredChannels.includes(message.channelId)
  ) {
    return;
  }

  cacheMessage(message);
}

/**
 * When a message is deleted, log it to the mod channel.
 */
export async function handleMessageDelete(
  message: Message<boolean> | PartialMessage
) {
  // Try the cache first (most reliable), fall back to Discord's partial cache
  const cached = getCachedMessage(message.id);

  if (!cached) {
    // Message wasn't in our cache -- might be from before the bot started.
    // Discord's own cache might have it if partials are enabled.
    if (!message.author || message.author.bot) return;
    if (!message.guild) return;

    // Build a minimal cached object from whatever Discord gives us
    const fallback: CachedMessage = {
      id: message.id,
      content: message.content || "",
      authorId: message.author.id,
      authorTag: message.author.tag,
      authorDisplayName: message.author.displayName,
      channelId: message.channelId,
      channelName:
        "name" in message.channel
          ? (message.channel as TextChannel).name
          : "unknown",
      guildId: message.guild.id,
      createdAt: message.createdAt ?? new Date(),
      attachments: message.attachments
        ? message.attachments.map((a) => ({
            name: a.name,
            url: a.url,
            proxyURL: a.proxyURL,
            contentType: a.contentType,
            size: a.size,
          }))
        : [],
      embeds: message.embeds
        ? message.embeds.map((e) => ({
            url: e.url,
            title: e.title,
            description: e.description,
          }))
        : [],
      stickers: message.stickers
        ? message.stickers.map((s) => ({ name: s.name, url: s.url }))
        : [],
    };

    await logDeletedMessage(message.client, fallback);
    return;
  }

  // Check monitored channels
  if (
    config.monitoredChannels.length > 0 &&
    !config.monitoredChannels.includes(cached.channelId)
  ) {
    return;
  }

  await logDeletedMessage(message.client, cached);
  removeCachedMessage(message.id);
}

async function logDeletedMessage(
  client: import("discord.js").Client,
  msg: CachedMessage
) {
  const modChannel = await client.channels.fetch(config.modLogChannelId);
  if (!modChannel || !("send" in modChannel)) {
    console.error("[LOG] Could not find mod log channel");
    return;
  }

  const channel = modChannel as TextChannel;

  // Build the embed
  const embed = new EmbedBuilder()
    .setColor(Colors.Red)
    .setTitle("Deleted Message")
    .addFields(
      { name: "User", value: `<@${msg.authorId}> (${msg.authorTag})`, inline: true },
      { name: "Channel", value: `<#${msg.channelId}>`, inline: true },
      {
        name: "Posted at",
        value: `<t:${Math.floor(msg.createdAt.getTime() / 1000)}:F>`,
        inline: true,
      }
    )
    .setTimestamp();

  // Add message content
  if (msg.content) {
    // Discord embed description max is 4096 chars
    embed.setDescription(
      msg.content.length > 4000
        ? msg.content.substring(0, 4000) + "... (truncated)"
        : msg.content
    );
  } else {
    embed.setDescription("*(no text content)*");
  }

  // Add embed URLs if the original message had any
  if (msg.embeds.length > 0) {
    const embedInfo = msg.embeds
      .map((e) => {
        const parts = [];
        if (e.title) parts.push(`**${e.title}**`);
        if (e.url) parts.push(e.url);
        if (e.description)
          parts.push(e.description.substring(0, 200));
        return parts.join("\n");
      })
      .join("\n\n");

    if (embedInfo) {
      embed.addFields({
        name: "Embeds",
        value: embedInfo.substring(0, 1024),
      });
    }
  }

  // Add sticker info
  if (msg.stickers.length > 0) {
    embed.addFields({
      name: "Stickers",
      value: msg.stickers.map((s) => s.name).join(", "),
    });
  }

  // Try to re-download attachments (images, files) before Discord CDN expires
  const attachmentFiles: AttachmentBuilder[] = [];
  for (const att of msg.attachments) {
    try {
      const response = await fetch(att.proxyURL || att.url);
      if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer());
        attachmentFiles.push(
          new AttachmentBuilder(buffer, { name: att.name })
        );
      }
    } catch (err) {
      // CDN link may have already expired
      console.error(`[LOG] Failed to download attachment ${att.name}:`, err);
    }
  }

  // If we couldn't download some attachments, list them as text
  const failedAttachments = msg.attachments.filter(
    (_, i) => !attachmentFiles[i]
  );
  if (failedAttachments.length > 0) {
    embed.addFields({
      name: "Attachments (expired)",
      value: failedAttachments.map((a) => `${a.name} (${a.contentType})`).join("\n"),
    });
  }

  await channel.send({
    embeds: [embed],
    files: attachmentFiles,
  });

  console.log(
    `[LOG] Logged deleted message from @${msg.authorTag} in #${msg.channelName}`
  );
}
