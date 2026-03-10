import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  Options,
} from "discord.js";
import { config, validateConfig } from "./config.js";
import {
  handleMessageCreate,
  handleMessageDelete,
  handleMention,
} from "./handlers.js";

validateConfig();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
  ],
  partials: [Partials.Message, Partials.Channel],
  makeCache: Options.cacheWithLimits({
    // Disable Discord.js's internal message cache entirely
    // We use our own cache in cache.ts
    MessageManager: 0,
  }),
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  console.log(`Connected to ${readyClient.guilds.cache.size} server(s)`);
  readyClient.guilds.cache.forEach((guild) => {
    console.log(`  - ${guild.name} (${guild.id})`);
  });
  console.log("Ping me in a channel to set it as the mod log output.");
  console.log("Bot is ready.");
});

client.on(Events.MessageCreate, async (message) => {
  try {
    // Check if the bot was mentioned (setup command)
    await handleMention(message);
  } catch (err) {
    console.error("Error handling mention:", err);
  }
  // Cache the message for deleted message tracking
  handleMessageCreate(message);
});

client.on(Events.MessageDelete, async (message) => {
  try {
    await handleMessageDelete(message);
  } catch (err) {
    console.error("Error handling deleted message:", err);
  }
});

client.login(config.discordToken);
