import {
  Message,
  ChannelType,
  TextChannel,
  ThreadChannel,
  EmbedBuilder,
  Colors,
} from "discord.js";
import { classifyMessage, type Classification } from "./classifier.js";
import { config } from "./config.js";
import { ticketDb, scamDb } from "./db.js";

// Track recent messages per channel for context
const channelHistory = new Map<string, string[]>();
const MAX_HISTORY = 10;

function addToHistory(channelId: string, content: string) {
  const history = channelHistory.get(channelId) || [];
  history.push(content);
  if (history.length > MAX_HISTORY) history.shift();
  channelHistory.set(channelId, history);
}

export async function handleMessage(message: Message) {
  // Ignore bots, DMs, and system messages
  if (message.author.bot) return;
  if (!message.guild) return;
  if (!message.content || message.content.trim().length === 0) return;

  // Check if we should monitor this channel
  if (
    config.monitoredChannels.length > 0 &&
    !config.monitoredChannels.includes(message.channelId)
  ) {
    return;
  }

  const channelName =
    "name" in message.channel ? (message.channel as TextChannel).name : "dm";

  // Get recent context
  const recentContext = channelHistory.get(message.channelId) || [];

  // Add current message to history
  addToHistory(
    message.channelId,
    `${message.author.displayName}: ${message.content}`
  );

  // Classify the message
  let classification: Classification;
  try {
    classification = await classifyMessage(
      message.content,
      message.author.displayName,
      channelName,
      recentContext
    );
  } catch (err) {
    console.error("Classification error:", err);
    return;
  }

  // Only act on confident classifications
  if (classification.confidence < 0.6) return;

  switch (classification.intent) {
    case "scam":
      await handleScam(message, classification);
      break;
    case "needs_help":
      await handleHelpRequest(message, classification);
      break;
    case "general":
      // Do nothing for general chat
      break;
  }
}

async function handleScam(message: Message, classification: Classification) {
  const embed = new EmbedBuilder()
    .setColor(Colors.Red)
    .setTitle("Scam Warning")
    .setDescription(
      [
        `The message above may be a scam or phishing attempt.`,
        "",
        `**Why this was flagged:** ${classification.scamReason}`,
        "",
        "**Stay safe:**",
        "- Never share your private keys or seed phrases",
        "- Never send crypto to strangers promising returns",
        "- Never click suspicious links or connect your wallet to unknown sites",
        "- Official staff will never DM you first asking for funds",
        "",
        `If you need real support, email **${config.supportEmail}**`,
      ].join("\n")
    )
    .setFooter({ text: "Automated scam detection" })
    .setTimestamp();

  await message.reply({ embeds: [embed] });

  // Log to database
  scamDb.log({
    channelId: message.channelId,
    messageId: message.id,
    userId: message.author.id,
    flaggedContent: message.content.substring(0, 500),
    reason: classification.scamReason || "Suspected scam",
  });

  console.log(
    `[SCAM] Flagged message from ${message.author.displayName}: ${classification.scamReason}`
  );
}

async function handleHelpRequest(
  message: Message,
  classification: Classification
) {
  // If we can answer directly, do so
  if (classification.directAnswer && !classification.needsHuman) {
    const embed = new EmbedBuilder()
      .setColor(Colors.Blue)
      .setDescription(classification.directAnswer)
      .setFooter({ text: "Automated support" });

    await message.reply({ embeds: [embed] });
    return;
  }

  // Needs human support -- create a thread and ping support
  const channel = message.channel;
  if (
    channel.type !== ChannelType.GuildText &&
    channel.type !== ChannelType.GuildForum
  ) {
    // Can't create threads in this channel type, just reply
    await message.reply(
      `Hey <@${message.author.id}>, I've flagged your question for the support team. ` +
        `<@&${config.supportRoleId}> can you help?\n\n` +
        `You can also reach us at **${config.supportEmail}**`
    );
    return;
  }

  // Create a support thread
  const threadName = `Support: ${classification.summary.substring(0, 90)}`;
  const thread = await (channel as TextChannel).threads.create({
    name: threadName,
    startMessage: message,
    autoArchiveDuration: 1440, // 24 hours
    reason: "Automated support thread",
  });

  const supportMessage = [
    `Hey <@${message.author.id}>, I've created this thread for your support request.`,
    "",
    `**Summary:** ${classification.summary}`,
    "",
    `<@&${config.supportRoleId}> -- someone needs help here.`,
    "",
    `If you'd prefer email support, reach us at **${config.supportEmail}**`,
  ].join("\n");

  await thread.send(supportMessage);

  // Create a ticket in the database for 24h reminder tracking
  ticketDb.create({
    channelId: message.channelId,
    threadId: thread.id,
    messageId: message.id,
    userId: message.author.id,
    userName: message.author.displayName,
    summary: classification.summary,
  });

  console.log(
    `[TICKET] Created support thread for ${message.author.displayName}: ${classification.summary}`
  );
}

/**
 * When a support role member replies in a support thread, resolve the ticket.
 */
export async function handleThreadReply(message: Message) {
  if (message.author.bot) return;
  if (!message.channel.isThread()) return;

  const thread = message.channel as ThreadChannel;
  const ticket = ticketDb.getByThread(thread.id);
  if (!ticket) return;

  // Check if the replier has the support role
  const member = message.member;
  if (!member) return;

  if (member.roles.cache.has(config.supportRoleId)) {
    ticketDb.resolveByThread(thread.id);
    console.log(
      `[TICKET] Resolved ticket #${ticket.id} -- support replied in thread`
    );
  }
}
