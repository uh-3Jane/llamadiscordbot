import {
  Message,
  PartialMessage,
  TextChannel,
  EmbedBuilder,
  Colors,
  AttachmentBuilder,
  Guild,
} from "discord.js";
import { config } from "./config.js";
import {
  setModLogChannel,
  getModLogChannelId,
  addExemptRole,
  removeExemptRole,
  getExemptRoleIds,
} from "./settings.js";
import {
  cacheMessage,
  getCachedMessage,
  removeCachedMessage,
  type CachedMessage,
} from "./cache.js";

// Track recently logged message IDs to prevent duplicates
const recentlyLogged = new Set<string>();

/**
 * Handle bot mentions -- setup commands.
 * Only the server owner can configure the bot.
 *
 * Commands (by pinging the bot):
 *   @bot                     -- set this channel as mod log
 *   @bot exempt @role        -- exempt a role from detection
 *   @bot unexempt @role      -- remove a role exemption
 *   @bot status              -- show current config
 */
export async function handleMention(message: Message) {
  if (message.author.bot) return;
  if (!message.guild) return;
  if (!message.client.user) return;
  if (!message.mentions.has(message.client.user)) return;

  // Only server owner can configure
  if (message.author.id !== message.guild.ownerId) {
    await message.reply(
      "Only the server owner can configure this bot."
    );
    return;
  }

  // Parse the command after the mention
  const content = message.content
    .replace(/<@!?\d+>/g, "")
    .trim()
    .toLowerCase();

  if (content.startsWith("exempt")) {
    await handleExempt(message);
  } else if (content.startsWith("unexempt")) {
    await handleUnexempt(message);
  } else if (content === "status") {
    await handleStatus(message);
  } else {
    // Default: set this channel as mod log
    await handleSetChannel(message);
  }
}

async function handleSetChannel(message: Message) {
  setModLogChannel(message.guild!.id, message.channelId);

  const embed = new EmbedBuilder()
    .setColor(Colors.Green)
    .setTitle("Mod Log Configured")
    .setDescription(
      `Deleted messages will now be logged to <#${message.channelId}>.\n\n` +
        `To change this, ping me in a different channel.`
    )
    .setTimestamp();

  await message.reply({ embeds: [embed] });
  console.log(
    `[SETUP] Mod log set to #${(message.channel as TextChannel).name} in "${message.guild!.name}"`
  );
}

async function handleExempt(message: Message) {
  const role = message.mentions.roles.first();
  if (!role) {
    await message.reply(
      "Mention a role to exempt. Example: `@bot exempt @Moderators`"
    );
    return;
  }

  addExemptRole(message.guild!.id, role.id);

  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(Colors.Green)
        .setDescription(
          `<@&${role.id}> is now exempt. Deleted messages from users with this role will be ignored.`
        ),
    ],
  });

  console.log(
    `[SETUP] Exempted role "${role.name}" in "${message.guild!.name}"`
  );
}

async function handleUnexempt(message: Message) {
  const role = message.mentions.roles.first();
  if (!role) {
    await message.reply(
      "Mention a role to un-exempt. Example: `@bot unexempt @Moderators`"
    );
    return;
  }

  removeExemptRole(message.guild!.id, role.id);

  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(Colors.Orange)
        .setDescription(
          `<@&${role.id}> is no longer exempt. Their deleted messages will be logged.`
        ),
    ],
  });

  console.log(
    `[SETUP] Un-exempted role "${role.name}" in "${message.guild!.name}"`
  );
}

async function handleStatus(message: Message) {
  const guildId = message.guild!.id;
  const modLogId = getModLogChannelId(guildId);
  const exemptRoles = getExemptRoleIds(guildId);

  const lines = [
    `**Mod log channel:** ${modLogId ? `<#${modLogId}>` : "Not set (ping me in a channel to set it)"}`,
    "",
    `**Exempt roles:** ${
      exemptRoles.length > 0
        ? exemptRoles.map((id) => `<@&${id}>`).join(", ")
        : "None"
    }`,
  ];

  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle("Bot Configuration")
        .setDescription(lines.join("\n")),
    ],
  });
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
  if (recentlyLogged.has(message.id)) return;
  recentlyLogged.add(message.id);
  setTimeout(() => recentlyLogged.delete(message.id), 30_000);

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
      roleIds: message.member
        ? [...message.member.roles.cache.keys()]
        : [],
    };

    // Check exemption
    if (isExempt(message.guild.id, fallback.roleIds)) return;

    await logDeletedMessage(message.client, message.guild, fallback);
    return;
  }

  if (
    config.monitoredChannels.length > 0 &&
    !config.monitoredChannels.includes(cached.channelId)
  ) {
    return;
  }

  // Check exemption
  if (isExempt(cached.guildId, cached.roleIds)) {
    removeCachedMessage(message.id);
    return;
  }

  const guild = message.client.guilds.cache.get(cached.guildId);
  if (!guild) return;

  await logDeletedMessage(message.client, guild, cached);
  removeCachedMessage(message.id);
}

/**
 * Check if a user's roles include any exempt role for this guild.
 */
function isExempt(guildId: string, userRoleIds: string[]): boolean {
  const exemptRoles = getExemptRoleIds(guildId);
  if (exemptRoles.length === 0) return false;
  return userRoleIds.some((roleId) => exemptRoles.includes(roleId));
}

async function logDeletedMessage(
  client: import("discord.js").Client,
  guild: Guild,
  msg: CachedMessage
) {
  const modLogChannelId = getModLogChannelId(guild.id);
  if (!modLogChannelId) return;

  if (msg.channelId === modLogChannelId) return;

  const modChannel = await client.channels.fetch(modLogChannelId);
  if (!modChannel || !("send" in modChannel)) {
    console.error(`[LOG] Could not find mod log channel for "${guild.name}"`);
    return;
  }

  const channel = modChannel as TextChannel;

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

  await channel.send({
    embeds: [embed],
    ...(attachmentFiles.length > 0 ? { files: attachmentFiles } : {}),
  });

  console.log(
    `[LOG] Logged deleted message from @${msg.authorTag} in #${msg.channelName} (${guild.name})`
  );
}
