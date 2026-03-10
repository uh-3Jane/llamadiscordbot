import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
} from "discord.js";
import { config, validateConfig } from "./config.js";
import { handleMessageCreate, handleMessageDelete } from "./handlers.js";

validateConfig();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel],
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  console.log(`Logging deleted messages to channel ${config.modLogChannelId}`);
  if (config.monitoredChannels.length > 0) {
    console.log(`Monitoring channels: ${config.monitoredChannels.join(", ")}`);
  } else {
    console.log("Monitoring all channels");
  }
  console.log("Bot is ready.");
});

// Cache every message as it comes in
client.on(Events.MessageCreate, handleMessageCreate);

// Log deleted messages to the mod channel
client.on(Events.MessageDelete, async (message) => {
  try {
    await handleMessageDelete(message);
  } catch (err) {
    console.error("Error handling deleted message:", err);
  }
});

client.login(config.discordToken);
