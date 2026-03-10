import {
  Message,
  PartialMessage,
  TextChannel,
  ChannelType,
  EmbedBuilder,
  Colors,
  AttachmentBuilder,
  Guild,
} from "discord.js";
import { config } from "./config.js";
import {
  cacheMessage,
  getCachedMessage,
  removeCachedMessage,
  type CachedMessage,
} from "./cache.js";

// Cache resolved mod log channels per guild so we don't search every time
const modLogChannels = new Map<string, TextChannel | null>();

/**
 * Find the mod log channel in a guild by name.
 * Looks for channels matching any name in MOD_LOG_CHANNEL_NAMES.
 */
function findModLogChannel(guild: Guild): TextChannel | null {
  if (modLogChannels.has(guild.id)) {
    return modLogChannels.get(guild.id)!;
  }

  const channel = guild.channels.cache.find(
    (ch) =>
      ch.type === ChannelType.GuildText &&
      config.modLogChannelNames.includes(ch.name.toLowerCase())
  ) as TextChannel | undefined;

  modLogChannels.set(guild.id, channel || null);

  if (channel) {
    console.log(`[LOG] Found mod log channel #${channel.name} in "${guild.name}"`);
  } else {
    console.warn(
      `[LOG] No mod log channel found in "${guild.name}". ` +
        `Create a channel named one of: ${config.modLogChannelNames.join(", ")}`
    );
  }

  return channel || null;
}

/** Clear cached mod log channel for a guild (e.g. if channels change) */
export function clearModLogCache(guildId: string) {
  modLogChannels.delete(guildId);
}

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
 * When a message is deleted, log it to that server's mod log channel.
 */
export async function handleMessageDelete(
  message: Message<boolean> | PartialMessage
) {
  const cached = getCachedMessage(message.id);

  if (!cached) {
    if (!message.author || message.author.bot) return;
    if (!message.guild) return;

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

    await logDeletedMessage(message.client, message.guild, fallback);
    return;
  }

  if (
    config.monitoredChannels.length > 0 &&
    !config.monitoredChannels.includes(cached.channelId)
  ) {
    return;
  }

  // Resolve guild from cached guildId
  const guild = message.client.guilds.cache.get(cached.guildId);
  if (!guild) return;

  await logDeletedMessage(message.client, guild, cached);
  removeCachedMessage(message.id);
}

async function logDeletedMessage(
  client: import("discord.js").Client,
  guild: Guild,
  msg: CachedMessage
) {
  const modChannel = findModLogChannel(guild);
  if (!modChannel) return;

  // Don't log deletions from the mod log channel itself
  if (msg.channelId === modChannel.id) return;

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

  if (msg.content) {
    embed.setDescription(
      msg.content.length > 4000
        ? msg.content.substring(0, 4000) + "... (truncated)"
        : msg.content
    );
  } else {
    embed.setDescription("*(no text content)*");
  }

  if (msg.embeds.length > 0) {
    const embedInfo = msg.embeds
      .map((e) => {
        const parts = [];
        if (e.title) parts.push(`**${e.title}**`);
        if (e.url) parts.push(e.url);
        if (e.description) parts.push(e.description.substring(0, 200));
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

  if (msg.stickers.length > 0) {
    embed.addFields({
      name: "Stickers",
      value: msg.stickers.map((s) => s.name).join(", "),
    });
  }

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
      console.error(`[LOG] Failed to download attachment ${att.name}:`, err);
    }
  }

  const failedAttachments = msg.attachments.filter(
    (_, i) => !attachmentFiles[i]
  );
  if (failedAttachments.length > 0) {
    embed.addFields({
      name: "Attachments (expired)",
      value: failedAttachments
        .map((a) => `${a.name} (${a.contentType})`)
        .join("\n"),
    });
  }

  await modChannel.send({
    embeds: [embed],
    files: attachmentFiles,
  });

  console.log(
    `[LOG] Logged deleted message from @${msg.authorTag} in #${msg.channelName} (${guild.name})`
  );
}
