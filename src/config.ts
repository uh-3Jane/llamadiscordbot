import { readFileSync } from "fs";
import path from "path";

export type TeamCategory = {
  label: string;
  description: string;
  members: string[]; // Discord user IDs
};

export type TeamConfig = {
  categories: Record<string, TeamCategory>;
  fallbackMembers: string[];
};

// Load team.json
const teamPath = path.join(import.meta.dir, "..", "team.json");
let teamConfig: TeamConfig;
try {
  teamConfig = JSON.parse(readFileSync(teamPath, "utf-8"));
} catch (err) {
  console.error("Failed to load team.json:", err);
  process.exit(1);
}

export const team = teamConfig;

export const config = {
  discordToken: process.env.DISCORD_TOKEN!,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
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

  if (missing.length > 0) {
    console.error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
    console.error("Copy .env.example to .env and fill in the values.");
    process.exit(1);
  }

  // Validate team.json
  const categoryNames = Object.keys(team.categories);
  if (categoryNames.length === 0) {
    console.error("team.json must have at least one category defined.");
    process.exit(1);
  }

  const unconfigured = categoryNames.filter((name) =>
    team.categories[name].members.some((m) => m === "PASTE_USER_ID")
  );
  if (
    unconfigured.length > 0 ||
    team.fallbackMembers.some((m) => m === "PASTE_USER_ID")
  ) {
    console.error(
      "team.json still has placeholder user IDs. Fill in your Discord user IDs."
    );
    console.error("Unconfigured categories:", unconfigured.join(", "));
    process.exit(1);
  }
}

/** Get user pings for a category, e.g. "<@123> <@456>" */
export function getMentionsForCategory(category: string): string {
  const members =
    team.categories[category]?.members || team.fallbackMembers;
  return members.map((id) => `<@${id}>`).join(" ");
}

/** Get all configured member IDs (for checking if a replier is support) */
export function getAllSupportMemberIds(): string[] {
  const ids = new Set<string>();
  for (const cat of Object.values(team.categories)) {
    for (const id of cat.members) ids.add(id);
  }
  for (const id of team.fallbackMembers) ids.add(id);
  return [...ids];
}

/** Get the label for a category */
export function getCategoryLabel(category: string): string {
  return team.categories[category]?.label || "General Support";
}
