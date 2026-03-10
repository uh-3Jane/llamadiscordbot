import { readFileSync, writeFileSync, mkdirSync } from "fs";
import path from "path";

const DATA_DIR = path.join(import.meta.dir, "..", "data");
const SETTINGS_PATH = path.join(DATA_DIR, "guild-settings.json");

type GuildSettingsEntry = {
  modLogChannelId: string;
  exemptRoleIds: string[];
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

function ensureGuild(guildId: string): GuildSettingsEntry {
  if (!settings[guildId]) {
    settings[guildId] = { modLogChannelId: "", exemptRoleIds: [] };
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

export function removeGuild(guildId: string) {
  delete settings[guildId];
  save();
}
