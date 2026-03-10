# Discord Mod Bot

AI-powered Discord moderation bot that provides support, detects scams, and tracks unresolved help requests.

## Features

- **Smart message classification** -- Uses Claude AI to understand user messages and decide how to respond
- **Direct answers** -- Answers common questions automatically without human intervention
- **Support threads** -- Creates threaded conversations for complex issues and pings your support team
- **24-hour reminders** -- Automatically pings the support role again if a ticket goes unanswered for 24 hours (up to 3 times)
- **Scam detection** -- Flags suspicious messages (phishing links, fake giveaways, social engineering) and warns users
- **Slash commands** -- `/resolve` to close tickets, `/tickets` to view open ones

## Setup

### 1. Create a Discord Bot

1. Go to https://discord.com/developers/applications
2. Click "New Application" and name it
3. Go to **Bot** tab, click "Reset Token", copy it
4. Enable these **Privileged Gateway Intents**:
   - Message Content Intent
   - Server Members Intent
5. Go to **OAuth2 > URL Generator**, select:
   - Scopes: `bot`, `applications.commands`
   - Permissions: `Send Messages`, `Create Public Threads`, `Manage Threads`, `Read Message History`, `Embed Links`
6. Copy the generated URL and invite the bot to your server

### 2. Get an Anthropic API Key

Get one at https://console.anthropic.com

### 3. Configure

```bash
cp .env.example .env
```

Fill in `.env`:
- `DISCORD_TOKEN` -- your bot token
- `ANTHROPIC_API_KEY` -- your Anthropic key
- `SUPPORT_ROLE_ID` -- right-click your support role in Discord > Copy ID
- `SUPPORT_EMAIL` -- your support email address
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

## How It Works

```
User sends message
       |
  Claude classifies it
       |
  +---------+---------+
  |         |         |
 SCAM    HELP     GENERAL
  |         |         |
 Warn    Can AI    Ignore
 users   answer?
          |    |
         YES   NO
          |    |
        Reply  Create thread
               Ping support role
               Track ticket
               |
               24h no reply?
               |
               Ping again (up to 3x)
```

## Slash Commands

| Command | Permission | Description |
|---------|-----------|-------------|
| `/resolve` | Manage Messages | Mark current support thread as resolved |
| `/tickets` | Manage Messages | View open support tickets needing attention |

## Cost

The bot uses Claude Haiku for classification (~$0.001 per message). At 1000 messages/day, that's roughly $1/day.
