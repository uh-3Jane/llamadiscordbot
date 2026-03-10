export const config = {
  discordToken: process.env.DISCORD_TOKEN!,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
  supportRoleId: process.env.SUPPORT_ROLE_ID!,
  supportEmail: process.env.SUPPORT_EMAIL || "support@yourcompany.com",
  monitoredChannels: process.env.MONITORED_CHANNELS
    ? process.env.MONITORED_CHANNELS.split(",").map((id) => id.trim())
    : [],
  reminderCheckIntervalMinutes: parseInt(
    process.env.REMINDER_CHECK_INTERVAL_MINUTES || "30",
    10
  ),
};

export function validateConfig() {
  const missing: string[] = [];
  if (!process.env.DISCORD_TOKEN) missing.push("DISCORD_TOKEN");
  if (!process.env.ANTHROPIC_API_KEY) missing.push("ANTHROPIC_API_KEY");
  if (!process.env.SUPPORT_ROLE_ID) missing.push("SUPPORT_ROLE_ID");

  if (missing.length > 0) {
    console.error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
    console.error("Copy .env.example to .env and fill in the values.");
    process.exit(1);
  }
}
