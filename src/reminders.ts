import { Client, TextChannel, ThreadChannel } from "discord.js";
import { ticketDb } from "./db.js";
import { config } from "./config.js";

const MAX_PINGS = 3; // Stop pinging after 3 follow-ups (72 hours)

export function startReminderLoop(client: Client) {
  const intervalMs = config.reminderCheckIntervalMinutes * 60 * 1000;

  setInterval(async () => {
    await checkStaleTickets(client);
  }, intervalMs);

  console.log(
    `[REMINDERS] Checking for stale tickets every ${config.reminderCheckIntervalMinutes} minutes`
  );
}

async function checkStaleTickets(client: Client) {
  const staleTickets = ticketDb.getStaleTickets();

  for (const ticket of staleTickets) {
    // Stop pinging after MAX_PINGS attempts
    if (ticket.ping_count >= MAX_PINGS) {
      console.log(
        `[REMINDERS] Ticket #${ticket.id} has been pinged ${ticket.ping_count} times, giving up`
      );
      ticketDb.resolve(ticket.id);
      continue;
    }

    try {
      // Try to send reminder in the support thread
      if (ticket.thread_id) {
        const channel = await client.channels.fetch(ticket.thread_id);
        if (channel && channel.isThread()) {
          const thread = channel as ThreadChannel;

          // Check if thread is still active/unarchived
          if (thread.archived) {
            await thread.setArchived(false);
          }

          const reminderMsg = [
            `**Reminder:** This support request from <@${ticket.user_id}> has not been resolved yet.`,
            "",
            `<@&${config.supportRoleId}> -- this ticket has been open for ${ticket.ping_count * 24}+ hours.`,
            "",
            `**Original request:** ${ticket.summary}`,
            "",
            `_Ping ${ticket.ping_count + 1} of ${MAX_PINGS}. After ${MAX_PINGS} pings, reach us at **${config.supportEmail}**_`,
          ].join("\n");

          await thread.send(reminderMsg);
          ticketDb.markPinged(ticket.id);

          console.log(
            `[REMINDERS] Pinged ticket #${ticket.id} (ping ${ticket.ping_count + 1}/${MAX_PINGS})`
          );
        }
      } else {
        // No thread -- send reminder in original channel
        const channel = await client.channels.fetch(ticket.channel_id);
        if (channel && "send" in channel) {
          const textChannel = channel as TextChannel;
          await textChannel.send(
            `**Reminder:** <@${ticket.user_id}>'s support request has not been addressed. ` +
              `<@&${config.supportRoleId}> please follow up.\n` +
              `**Request:** ${ticket.summary}\n` +
              `_You can also email **${config.supportEmail}**_`
          );
          ticketDb.markPinged(ticket.id);
        }
      }
    } catch (err) {
      console.error(`[REMINDERS] Failed to send reminder for ticket #${ticket.id}:`, err);
    }
  }
}
