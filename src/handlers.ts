import {
  Message,
  PartialMessage,
  TextChannel,
  EmbedBuilder,
  Colors,
  AttachmentBuilder,
  Guild,
  AuditLogEvent,
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

// Track audit log entry counts to handle Discord's batched audit log entries
// (Discord increments count on existing entries instead of creating new ones for bulk mod deletions)
const auditLogTracker = new Map<string, number>();

interface DeletedBy {
  isMod: boolean;
  userId: string;
  userTag: string;
  roleColor?: number;
}

/**
 * Determine who deleted a message by checking the audit log.
 * - If a mod deleted it, there will be a recent AuditLogEvent.MessageDelete entry.
 * - If the user deleted their own message, no audit log entry exists.
 * Requires the bot to have VIEW_AUDIT_LOG permission.
 */
async function getDeleter(guild: Guild, msg: CachedMessage): Promise<DeletedBy> {
  try {
    // Brief delay to let Discord create the audit log entry
    await new Promise((r) => setTimeout(r, 1000));

    const auditLogs = await guild.fetchAuditLogs({
      type: AuditLogEvent.MessageDelete,
      limit: 5,
    });

    const entry = auditLogs.entries.find((e) => {
      if (e.target?.id !== msg.authorId) return false;

      const extra = e.extra as { channel?: { id: string }; count?: number } | null;
      if (extra?.channel?.id !== msg.channelId) return false;

      // Only consider entries from the last 15 seconds
      if (Date.now() - e.createdTimestamp > 15000) return false;

      // Discord batches audit log entries: same mod deleting multiple messages
      // from the same user in the same channel increments 'count' on one entry.
      // Track the count so we only attribute each increment once.
      const currentCount = extra?.count || 1;
      const lastCount = auditLogTracker.get(e.id) || 0;

      if (currentCount > lastCount) {
        auditLogTracker.set(e.id, currentCount);
        return true;
      }

      return false;
    });

    if (entry && entry.executor && entry.executor.id !== msg.authorId) {
      console.log(
        `[AUDIT] Message deleted by mod: ${entry.executor.tag} (${entry.executor.id})`
      );

      // Fetch the mod's member info to get their role color
      const member = await guild.members.fetch(entry.executor.id).catch(() => null);
      const roleColor = member?.displayColor || undefined;

      return {
        isMod: true,
        userId: entry.executor.id,
        userTag: entry.executor.tag,
        roleColor: roleColor && roleColor !== 0 ? roleColor : undefined,
      };
    }

    console.log(`[AUDIT] Message self-deleted by: ${msg.authorTag}`);
  } catch (err) {
    console.log(
      "[AUDIT] Could not fetch audit logs (bot may need VIEW_AUDIT_LOG permission):",
      err
    );
  }

  // Default: user deleted their own message
  return {
    isMod: false,
    userId: msg.authorId,
    userTag: msg.authorTag,
  };
}

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
  // Check if bot was mentioned by looking for <@BOT_ID> in message content
  const botId = message.client.user.id;
  if (
    !message.content.includes(`<@${botId}>`) &&
    !message.content.includes(`<@!${botId}>`)
  ) {
    return;
  }

  console.log(
    `[MENTION] Bot mentioned by ${message.author.tag} (${message.author.id}), owner is ${message.guild.ownerId}`
  );

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

  if (content === "help" || content === "commands") {
    await handleHelp(message);
  } else if (content.startsWith("exempt")) {
    await handleExempt(message);
  } else if (content.startsWith("unexempt")) {
    await handleUnexempt(message);
  } else if (content === "status") {
    await handleStatus(message);
  } else if (content === "") {
    // No command -- set this channel as mod log
    await handleSetChannel(message);
  } else {
    // Unknown command -- show help
    await handleHelp(message);
  }
}

async function handleSetChannel(message: Message) {
  setModLogChannel(message.guild!.id, message.channelId);

  const embed = new EmbedBuilder()
    .setColor(Colors.Green)
    .setTitle("Mod Log Configured")
    .setDescription(
      `Deleted messages will now be logged to <#${message.channelId}>.\n\n` +
        `To change this, ping me in a different channel.\n` +
        `**Note:** The bot needs \`View Audit Log\` permission to detect mod deletions.`
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

async function handleHelp(message: Message) {
  const botMention = `<@${message.client.user!.id}>`;

  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle("Available Commands")
        .setDescription(
          [
            `${botMention} -- Set this channel as the mod log`,
            `${botMention} \`help\` -- Show this message`,
            `${botMention} \`status\` -- Show current configuration`,
            `${botMention} \`exempt\` \`@role\` -- Exempt a role from logging`,
            `${botMention} \`unexempt\` \`@role\` -- Remove a role exemption`,
          ].join("\n")
        )
        .setFooter({ text: "Only the server owner can use these commands." }),
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
  console.log(
    `[CACHE] Cached message ${message.id} from @${message.author.tag} in #${
      "name" in message.channel ? (message.channel as TextChannel).name : "unknown"
    }`
  );
}

/**
 * When a message is deleted, log it to that server's mod log channel.
 * Only logs messages that were in our custom cache (sent after bot started).
 */
export async function handleMessageDelete(
  message: Message<boolean> | PartialMessage
) {
  console.log(`[DELETE] messageDelete event fired for message ${message.id}`);

  const cached = getCachedMessage(message.id);
  if (!cached) {
    console.log(`[DELETE] Message ${message.id} not in cache, skipping`);
    return;
  }

  // Remove from cache immediately to prevent any possibility of double-processing
  removeCachedMessage(message.id);
  console.log(
    `[DELETE] Removed message ${message.id} from cache, processing deletion by @${cached.authorTag}`
  );

  if (
    config.monitoredChannels.length > 0 &&
    !config.monitoredChannels.includes(cached.channelId)
  ) {
    console.log(`[DELETE] Message ${message.id} not in monitored channels, skipping`);
    return;
  }

  // Check exemption
  if (isExempt(cached.guildId, cached.roleIds)) {
    console.log(`[DELETE] Message ${message.id} from exempt user, skipping`);
    return;
  }

  const guild = message.client.guilds.cache.get(cached.guildId);
  if (!guild) {
    console.log(`[DELETE] Guild ${cached.guildId} not found, skipping`);
    return;
  }

  await logDeletedMessage(message.client, guild, cached);
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
  if (!modLogChannelId) {
    console.log(`[LOG] No mod log channel set for "${guild.name}", skipping`);
    return;
  }

  console.log(
    `[LOG] Processing deleted message ${msg.id} from @${msg.authorTag} in #${msg.channelName}`
  );

  // Determine who deleted the message (user self-delete vs mod delete)
  const deletedBy = await getDeleter(guild, msg);

  const modChannel = await client.channels.fetch(modLogChannelId);
  if (!modChannel || !("send" in modChannel)) {
    console.error(`[LOG] Could not find mod log channel for "${guild.name}"`);
    return;
  }

  const channel = modChannel as TextChannel;

  // Color: mod's role color (or Gold fallback) for mod deletions, Red for self-deletions
  let embedColor: number;
  if (deletedBy.isMod) {
    embedColor = deletedBy.roleColor || Colors.Gold;
  } else {
    embedColor = Colors.Red;
  }

  const deletedByLabel = deletedBy.isMod
    ? `<@${deletedBy.userId}> (Mod)`
    : `<@${msg.authorId}> (Self)`;

  const embed = new EmbedBuilder()
    .setColor(embedColor)
    .setTitle(
      `Message deleted by ${deletedBy.isMod ? deletedBy.userTag : msg.authorTag}`
    )
    .addFields(
      {
        name: "Author",
        value: `<@${msg.authorId}> (${msg.authorTag})`,
        inline: true,
      },
      { name: "Deleted by", value: deletedByLabel, inline: true },
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
      console.log(`[LOG] Downloading attachment: ${att.name}`);
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
    `[LOG] Logged deleted message from @${msg.authorTag} in #${msg.channelName} (${guild.name}) — deleted by ${
      deletedBy.isMod ? `mod @${deletedBy.userTag}` : "self"
    }`
  );
}
