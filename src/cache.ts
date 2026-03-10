import { Message, Collection, Attachment } from "discord.js";

type CachedMessage = {
  id: string;
  content: string;
  authorId: string;
  authorTag: string; // e.g. "username#1234" or "username"
  authorDisplayName: string;
  channelId: string;
  channelName: string;
  guildId: string;
  createdAt: Date;
  attachments: Array<{
    name: string;
    url: string;
    proxyURL: string;
    contentType: string | null;
    size: number;
  }>;
  embeds: Array<{ url: string | null; title: string | null; description: string | null }>;
  stickers: Array<{ name: string; url: string }>;
};

// In-memory cache with a max size to prevent unbounded growth
const MAX_CACHE_SIZE = 10_000;
const messageCache = new Map<string, CachedMessage>();
const insertionOrder: string[] = [];

export function cacheMessage(message: Message) {
  if (message.author.bot) return;
  if (!message.guild) return;

  const channelName =
    "name" in message.channel ? (message.channel as any).name : "unknown";

  const cached: CachedMessage = {
    id: message.id,
    content: message.content,
    authorId: message.author.id,
    authorTag: message.author.tag,
    authorDisplayName: message.author.displayName,
    channelId: message.channelId,
    channelName,
    guildId: message.guild.id,
    createdAt: message.createdAt,
    attachments: message.attachments.map((a: Attachment) => ({
      name: a.name,
      url: a.url,
      proxyURL: a.proxyURL,
      contentType: a.contentType,
      size: a.size,
    })),
    embeds: message.embeds.map((e) => ({
      url: e.url,
      title: e.title,
      description: e.description,
    })),
    stickers: message.stickers.map((s) => ({
      name: s.name,
      url: s.url,
    })),
  };

  // Evict oldest if at capacity
  if (messageCache.size >= MAX_CACHE_SIZE) {
    const oldest = insertionOrder.shift();
    if (oldest) messageCache.delete(oldest);
  }

  messageCache.set(message.id, cached);
  insertionOrder.push(message.id);
}

export function getCachedMessage(messageId: string): CachedMessage | undefined {
  return messageCache.get(messageId);
}

export function removeCachedMessage(messageId: string) {
  messageCache.delete(messageId);
  const idx = insertionOrder.indexOf(messageId);
  if (idx !== -1) insertionOrder.splice(idx, 1);
}

export type { CachedMessage };
