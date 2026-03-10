import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
} from "discord.js";
import { config, validateConfig } from "./config.js";
import {
  handleMessageCreate,
  handleMessageDelete,
  clearModLogCache,
} from "./handlers.js";

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
  console.log(
    `Looking for mod log channels named: ${config.modLogChannelNames.join(", ")}`
  );
  console.log(`Connected to ${readyClient.guilds.cache.size} server(s)`);
  readyClient.guilds.cache.forEach((guild) => {
    console.log(`  - ${guild.name} (${guild.id})`);
  });
  console.log("Bot is ready.");
});

// Cache every message
client.on(Events.MessageCreate, handleMessageCreate);

// Log deleted messages
client.on(Events.MessageDelete, async (message) => {
  try {
    await handleMessageDelete(message);
  } catch (err) {
    console.error("Error handling deleted message:", err);
  }
});

// Re-scan for mod log channel if channels are created/updated/deleted
client.on(Events.ChannelCreate, (channel) => {
  if ("guild" in channel && channel.guild) clearModLogCache(channel.guild.id);
});
client.on(Events.ChannelUpdate, (_, channel) => {
  if ("guild" in channel && channel.guild) clearModLogCache(channel.guild.id);
});
client.on(Events.ChannelDelete, (channel) => {
  if ("guild" in channel && channel.guild) clearModLogCache(channel.guild.id);
});

client.login(config.discordToken);
