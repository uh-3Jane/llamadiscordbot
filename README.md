# Discord Mod Bot

Logs deleted messages to a mod channel so your team can review them and take action.

## Features

- **Deleted message logging** -- When anyone deletes a message, the bot copies the full content (text, images, links, embeds, stickers) to a designated mod channel
- **User attribution** -- Each log includes the poster's @mention and Discord tag so mods can ban if needed
- **Attachment recovery** -- Attempts to re-download images and files before Discord's CDN expires
- **In-memory message cache** -- Caches the last 10,000 messages so deleted content is always available
- **Channel filtering** -- Optionally monitor only specific channels

## Setup

### 1. Create a Discord Bot

1. Go to https://discord.com/developers/applications
2. Click "New Application" and name it
3. Go to **Bot** tab, click "Reset Token", copy it
4. Enable **Message Content Intent** under Privileged Gateway Intents
5. Go to **OAuth2 > URL Generator**, select:
   - Scopes: `bot`
   - Permissions: `Send Messages`, `Read Message History`, `Embed Links`, `Attach Files`
6. Copy the generated URL and invite the bot to your server

### 2. Create a mod log channel

Create a private channel in your Discord server (e.g. `#deleted-messages`) that only mods can see. Right-click it and **Copy Channel ID** (requires Developer Mode: User Settings > Advanced).

### 3. Configure

```bash
cp .env.example .env
```

Fill in `.env`:
- `DISCORD_TOKEN` -- your bot token
- `MOD_LOG_CHANNEL_ID` -- the channel ID for deleted message logs
- `MONITORED_CHANNELS` -- (optional) comma-separated channel IDs to monitor

### 4. Install & Run

```bash
bun install
bun run start
```

For development with auto-reload:
```bash
bun run dev
```

With Docker:
```bash
docker compose up --build
```

## How It Works

```
User sends message --> cached in memory (last 10k messages)
         |
   User deletes it
         |
   Bot copies to #mod-log:
   - Full text content
   - @user mention + tag
   - Re-uploaded images/files
   - Original channel + timestamp
   - Embed URLs/links
```

## Cost

Free -- no external APIs needed. Just Discord.
