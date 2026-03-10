import {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  Events,
} from "discord.js";
import { config, validateConfig } from "./config.js";
import { handleMessage, handleThreadReply } from "./handlers.js";
import { handleCommand, commands } from "./commands.js";
import { startReminderLoop } from "./reminders.js";

validateConfig();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Message, Partials.Channel],
});

// Register slash commands on startup
client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);

  // Register slash commands
  const rest = new REST({ version: "10" }).setToken(config.discordToken);
  try {
    await rest.put(Routes.applicationCommands(readyClient.user.id), {
      body: commands.map((c) => c.toJSON()),
    });
    console.log("Slash commands registered");
  } catch (err) {
    console.error("Failed to register slash commands:", err);
  }

  // Start the 24h reminder loop
  startReminderLoop(client);

  console.log("Bot is ready.");
  if (config.monitoredChannels.length > 0) {
    console.log(`Monitoring channels: ${config.monitoredChannels.join(", ")}`);
  } else {
    console.log("Monitoring all channels");
  }
});

// Handle new messages
client.on(Events.MessageCreate, async (message) => {
  try {
    if (message.channel.isThread()) {
      await handleThreadReply(message);
    } else {
      await handleMessage(message);
    }
  } catch (err) {
    console.error("Error handling message:", err);
  }
});

// Handle slash commands
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  try {
    await handleCommand(interaction);
  } catch (err) {
    console.error("Error handling command:", err);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: "Something went wrong.",
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: "Something went wrong.",
        ephemeral: true,
      });
    }
  }
});

client.login(config.discordToken);
