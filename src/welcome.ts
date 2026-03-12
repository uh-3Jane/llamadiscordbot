import { GuildMember, EmbedBuilder, Colors } from "discord.js";
import {
  isWelcomeDmEnabled,
  getWelcomeDmTitle,
  getWelcomeDmMessage,
} from "./settings.js";

/**
 * Send a welcome/safety DM to new members when they join a server.
 * Only sends if the server owner has enabled the feature.
 */
export async function handleGuildMemberAdd(member: GuildMember) {
  if (member.user.bot) return;

  const guildId = member.guild.id;

  if (!isWelcomeDmEnabled(guildId)) {
    return;
  }

  const title = getWelcomeDmTitle(guildId);
  const message = getWelcomeDmMessage(guildId);

  const embed = new EmbedBuilder()
    .setColor(Colors.DarkGold)
    .setAuthor({
      name: member.guild.name,
      iconURL: member.guild.iconURL() || undefined,
    })
    .setTitle(title)
    .setDescription(message)
    .setFooter({ text: `Sent from server: ${member.guild.name}` })
    .setTimestamp();

  try {
    await member.send({ embeds: [embed] });
    console.log(
      `[WELCOME] Sent DM to ${member.user.tag} (joined "${member.guild.name}")`
    );
  } catch (err) {
    // User has DMs disabled -- nothing we can do
    console.log(
      `[WELCOME] Could not DM ${member.user.tag} (DMs likely disabled): ${err}`
    );
  }
}
