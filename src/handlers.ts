import {
  Message,
  ChannelType,
  TextChannel,
  ThreadChannel,
  EmbedBuilder,
  Colors,
} from "discord.js";
import { classifyMessage, type Classification } from "./classifier.js";
import {
  config,
  getMentionsForCategory,
  getAllSupportMemberIds,
  getCategoryLabel,
} from "./config.js";
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
  if (message.author.bot) return;
  if (!message.guild) return;
  if (!message.content || message.content.trim().length === 0) return;

  if (
    config.monitoredChannels.length > 0 &&
    !config.monitoredChannels.includes(message.channelId)
  ) {
    return;
  }

  const channelName =
    "name" in message.channel ? (message.channel as TextChannel).name : "dm";

  const recentContext = channelHistory.get(message.channelId) || [];

  addToHistory(
    message.channelId,
    `${message.author.displayName}: ${message.content}`
  );

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

  if (classification.confidence < 0.6) return;

  switch (classification.intent) {
    case "scam":
      await handleScam(message, classification);
      break;
    case "needs_help":
      await handleHelpRequest(message, classification);
      break;
    case "general":
      break;
  }
}

async function handleScam(message: Message, classification: Classification) {
  const securityMentions = getMentionsForCategory("security");

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

  // Ping security team outside the embed so they get notified
  await message.reply({
    content: `${securityMentions} -- potential scam flagged`,
    embeds: [embed],
  });

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
  if (classification.directAnswer && !classification.needsHuman) {
    const embed = new EmbedBuilder()
      .setColor(Colors.Blue)
      .setDescription(classification.directAnswer)
      .setFooter({ text: "Automated support" });

    await message.reply({ embeds: [embed] });
    return;
  }

  const mentions = getMentionsForCategory(classification.category);
  const categoryLabel = getCategoryLabel(classification.category);

  const channel = message.channel;
  if (
    channel.type !== ChannelType.GuildText &&
    channel.type !== ChannelType.GuildForum
  ) {
    await message.reply(
      `Hey <@${message.author.id}>, I've flagged your question for **${categoryLabel}**.\n` +
        `${mentions} can you help?\n\n` +
        `You can also reach us at **${config.supportEmail}**`
    );
    return;
  }

  const threadName = `[${categoryLabel}] ${classification.summary.substring(0, 80)}`;
  const thread = await (channel as TextChannel).threads.create({
    name: threadName,
    startMessage: message,
    autoArchiveDuration: 1440,
    reason: "Automated support thread",
  });

  const supportMessage = [
    `Hey <@${message.author.id}>, I've created this thread for your support request.`,
    "",
    `**Category:** ${categoryLabel}`,
    `**Summary:** ${classification.summary}`,
    "",
    `${mentions} -- someone needs help here.`,
    "",
    `If you'd prefer email support, reach us at **${config.supportEmail}**`,
  ].join("\n");

  await thread.send(supportMessage);

  ticketDb.create({
    channelId: message.channelId,
    threadId: thread.id,
    messageId: message.id,
    userId: message.author.id,
    userName: message.author.displayName,
    summary: classification.summary,
    category: classification.category,
  });

  console.log(
    `[TICKET] Created ${categoryLabel} thread for ${message.author.displayName}: ${classification.summary}`
  );
}

/**
 * When a configured support member replies in a support thread, resolve the ticket.
 */
export async function handleThreadReply(message: Message) {
  if (message.author.bot) return;
  if (!message.channel.isThread()) return;

  const thread = message.channel as ThreadChannel;
  const ticket = ticketDb.getByThread(thread.id);
  if (!ticket) return;

  const supportMemberIds = getAllSupportMemberIds();
  if (supportMemberIds.includes(message.author.id)) {
    ticketDb.resolveByThread(thread.id);
    console.log(
      `[TICKET] Resolved ticket #${ticket.id} -- ${message.author.displayName} replied in thread`
    );
  }
}
