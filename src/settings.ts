import { readFileSync, writeFileSync, mkdirSync } from "fs";
import path from "path";

const DATA_DIR = path.join(import.meta.dir, "..", "data");
const SETTINGS_PATH = path.join(DATA_DIR, "guild-settings.json");

type GuildSettingsEntry = {
  modLogChannelId: string;
  exemptRoleIds: string[];
  welcomeDmEnabled: boolean;
  welcomeDmTitle: string;
  welcomeDmMessage: string;
};

type GuildSettings = Record<string, GuildSettingsEntry>;

let settings: GuildSettings = {};

// Load settings from disk
try {
  mkdirSync(DATA_DIR, { recursive: true });
  settings = JSON.parse(readFileSync(SETTINGS_PATH, "utf-8"));
} catch {
  settings = {};
}

function save() {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

const DEFAULT_WELCOME_TITLE = "Stay Safe!";
const DEFAULT_WELCOME_MESSAGE =
  "No team member from this server will ever DM you first. " +
  "If you receive a DM claiming to be from our team, it is a scam.\n\n" +
  "Please disable DMs from server members in your Privacy Settings to protect yourself. " +
  "DMs are the single biggest attack vector in Discord.\n\n" +
  "**How to disable DMs:**\n" +
  "Right-click this server icon > Privacy Settings > Direct Messages > turn OFF";

function ensureGuild(guildId: string): GuildSettingsEntry {
  if (!settings[guildId]) {
    settings[guildId] = {
      modLogChannelId: "",
      exemptRoleIds: [],
      welcomeDmEnabled: false,
      welcomeDmTitle: DEFAULT_WELCOME_TITLE,
      welcomeDmMessage: DEFAULT_WELCOME_MESSAGE,
    };
  }
  // Migrate existing entries that don't have welcome fields
  if (settings[guildId].welcomeDmEnabled === undefined) {
    settings[guildId].welcomeDmEnabled = false;
    settings[guildId].welcomeDmTitle = DEFAULT_WELCOME_TITLE;
    settings[guildId].welcomeDmMessage = DEFAULT_WELCOME_MESSAGE;
  }
  return settings[guildId];
}

export function setModLogChannel(guildId: string, channelId: string) {
  const entry = ensureGuild(guildId);
  entry.modLogChannelId = channelId;
  save();
}

export function getModLogChannelId(guildId: string): string | null {
  return settings[guildId]?.modLogChannelId || null;
}

export function addExemptRole(guildId: string, roleId: string) {
  const entry = ensureGuild(guildId);
  if (!entry.exemptRoleIds.includes(roleId)) {
    entry.exemptRoleIds.push(roleId);
    save();
  }
}

export function removeExemptRole(guildId: string, roleId: string) {
  const entry = ensureGuild(guildId);
  entry.exemptRoleIds = entry.exemptRoleIds.filter((id) => id !== roleId);
  save();
}

export function getExemptRoleIds(guildId: string): string[] {
  return settings[guildId]?.exemptRoleIds || [];
}

export function setWelcomeDmEnabled(guildId: string, enabled: boolean) {
  const entry = ensureGuild(guildId);
  entry.welcomeDmEnabled = enabled;
  save();
}

export function isWelcomeDmEnabled(guildId: string): boolean {
  return ensureGuild(guildId).welcomeDmEnabled;
}

export function setWelcomeDmTitle(guildId: string, title: string) {
  const entry = ensureGuild(guildId);
  entry.welcomeDmTitle = title;
  save();
}

export function getWelcomeDmTitle(guildId: string): string {
  return ensureGuild(guildId).welcomeDmTitle;
}

export function setWelcomeDmMessage(guildId: string, message: string) {
  const entry = ensureGuild(guildId);
  entry.welcomeDmMessage = message;
  save();
}

export function getWelcomeDmMessage(guildId: string): string {
  return ensureGuild(guildId).welcomeDmMessage;
}

export function removeGuild(guildId: string) {
  delete settings[guildId];
  save();
}
