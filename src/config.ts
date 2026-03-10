export const config = {
  discordToken: process.env.DISCORD_TOKEN!,
  modLogChannelNames: (
    process.env.MOD_LOG_CHANNEL_NAMES || "mod-log,deleted-messages"
  )
    .split(",")
    .map((n) => n.trim().toLowerCase()),
  monitoredChannels: process.env.MONITORED_CHANNELS
    ? process.env.MONITORED_CHANNELS.split(",").map((id) => id.trim())
    : [],
};

export function validateConfig() {
  if (!process.env.DISCORD_TOKEN) {
    console.error("Missing DISCORD_TOKEN. Copy .env.example to .env and fill it in.");
    process.exit(1);
  }
}
