import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  Colors,
  PermissionFlagsBits,
} from "discord.js";
import { ticketDb } from "./db.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("resolve")
    .setDescription("Mark the current support thread as resolved")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName("tickets")
    .setDescription("Show open support tickets")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
];

export async function handleCommand(interaction: ChatInputCommandInteraction) {
  switch (interaction.commandName) {
    case "resolve":
      await handleResolve(interaction);
      break;
    case "tickets":
      await handleTickets(interaction);
      break;
  }
}

async function handleResolve(interaction: ChatInputCommandInteraction) {
  if (!interaction.channel?.isThread()) {
    await interaction.reply({
      content: "This command can only be used in a support thread.",
      ephemeral: true,
    });
    return;
  }

  const ticket = ticketDb.getByThread(interaction.channelId);
  if (!ticket) {
    await interaction.reply({
      content: "No open ticket found for this thread.",
      ephemeral: true,
    });
    return;
  }

  ticketDb.resolveByThread(interaction.channelId);

  const embed = new EmbedBuilder()
    .setColor(Colors.Green)
    .setTitle("Ticket Resolved")
    .setDescription(
      `This support ticket has been marked as resolved by ${interaction.user.displayName}.`
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleTickets(interaction: ChatInputCommandInteraction) {
  const staleTickets = ticketDb.getStaleTickets();

  if (staleTickets.length === 0) {
    await interaction.reply({
      content: "No open support tickets needing attention.",
      ephemeral: true,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(Colors.Orange)
    .setTitle(`Open Support Tickets (${staleTickets.length})`)
    .setDescription(
      staleTickets
        .map(
          (t) =>
            `**#${t.id}** - ${t.summary}\n` +
            `User: <@${t.user_id}> | Pings: ${t.ping_count} | ` +
            `Thread: ${t.thread_id ? `<#${t.thread_id}>` : "N/A"}`
        )
        .join("\n\n")
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
