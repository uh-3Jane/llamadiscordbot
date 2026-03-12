# Discord Mod Bot

Logs deleted messages and sends safety warning DMs to new members.

## Features

### Deleted Message Logging
- **Deleted message logging** -- When anyone deletes a message, the bot copies the full content (text, images, links, embeds, stickers) to a designated mod channel
- **Mod vs self-deletion detection** -- Uses audit logs to show whether a message was deleted by a mod or by the user themselves, with color-coded embeds
- **Attachment recovery** -- Attempts to re-download images and files before Discord's CDN expires
- **In-memory message cache** -- Caches the last 10,000 messages so deleted content is always available

### Welcome DMs
- **New member safety warnings** -- Automatically DMs new members when they join, warning them about scam DMs and how to disable DMs
- **Customizable message** -- Server owner can set a custom title and message body
- **Preview before enabling** -- Preview the DM before turning it on

### General
- **Per-server configuration** -- Each server is configured independently via `@bot` mention commands
- **Role exemptions** -- Exempt specific roles (e.g. team members) from deletion logging
- **Multi-server support** -- One bot instance works across multiple servers with independent settings

## Setup

### 1. Create a Discord Bot

1. Go to https://discord.com/developers/applications
2. Click "New Application" and name it
3. Go to **Bot** tab, click "Reset Token", copy it
4. Enable **Message Content Intent** and **Server Members Intent** under Privileged Gateway Intents
5. Go to **OAuth2 > URL Generator**, select:
   - Scopes: `bot`
   - Permissions: `Send Messages`, `Read Message History`, `Embed Links`, `Attach Files`, `View Audit Log`
6. Copy the generated URL and invite the bot to your server

### 2. Configure

```bash
cp .env.example .env
```

Fill in `.env`:
- `DISCORD_TOKEN` -- your bot token
- `MONITORED_CHANNELS` -- (optional) comma-separated channel IDs to monitor. Leave empty to monitor all channels.

### 3. Install & Run

```bash
bun install
bun run start
```

With Docker:
```bash
docker compose up --build
```

### 4. Set up the mod log channel

Once the bot is online, the **server owner** pings the bot in the channel they want to use as the mod log:

```
@BotName
```

The bot will confirm and start logging deleted messages there.

## Bot Commands

All commands are issued by mentioning the bot. Only the **server owner** can use these.

**Delete Logging**

| Command | Description |
|---------|-------------|
| `@bot` | Set the current channel as the mod log |
| `@bot exempt @role` | Exempt a role from deletion logging |
| `@bot unexempt @role` | Remove a role exemption |

**Welcome DMs**

| Command | Description |
|---------|-------------|
| `@bot welcome on` | Enable welcome DMs for new members |
| `@bot welcome off` | Disable welcome DMs |
| `@bot welcome preview` | Preview the welcome DM (sends to your DMs) |
| `@bot set-welcome <message>` | Set a custom welcome DM message |
| `@bot set-welcome-title <title>` | Set a custom welcome DM title |

**General**

| Command | Description |
|---------|-------------|
| `@bot status` | Show current configuration |
| `@bot help` | Show available commands |

## How It Works

```
User sends message --> cached in memory (last 10k messages)
         |
   Message is deleted
         |
   Bot checks audit log:
   - Mod deleted it? --> Gold embed, shows which mod
   - Self-deleted?   --> Red embed
         |
   Bot posts to #mod-log:
   - Full text content
   - Author @mention + tag
   - Who deleted it (mod or self)
   - Re-uploaded images/files
   - Original channel + timestamp
   - Embed URLs/links
```

## Cost

Free -- no external APIs needed. Just Discord.
