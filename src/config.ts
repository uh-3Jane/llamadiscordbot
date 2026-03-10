export const config = {
  discordToken: process.env.DISCORD_TOKEN!,
  modLogChannelId: process.env.MOD_LOG_CHANNEL_ID!,
  monitoredChannels: process.env.MONITORED_CHANNELS
    ? process.env.MONITORED_CHANNELS.split(",").map((id) => id.trim())
    : [],
};

export function validateConfig() {
  const missing: string[] = [];
  if (!process.env.DISCORD_TOKEN) missing.push("DISCORD_TOKEN");
  if (!process.env.MOD_LOG_CHANNEL_ID) missing.push("MOD_LOG_CHANNEL_ID");

  if (missing.length > 0) {
    console.error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
    console.error("Copy .env.example to .env and fill in the values.");
    process.exit(1);
  }
}
