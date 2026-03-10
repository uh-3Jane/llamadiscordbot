import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(import.meta.dir, "..", "data", "bot.db");

// Ensure data directory exists
import { mkdirSync } from "fs";
mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id TEXT NOT NULL,
    thread_id TEXT,
    message_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    summary TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_pinged_at TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at TEXT,
    ping_count INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS scam_warnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    flagged_content TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Prepared statements
const insertTicket = db.prepare(`
  INSERT INTO tickets (channel_id, thread_id, message_id, user_id, user_name, summary)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const getOpenTickets = db.prepare(`
  SELECT * FROM tickets
  WHERE status = 'open'
  AND datetime(last_pinged_at) <= datetime('now', '-24 hours')
`);

const updateTicketPing = db.prepare(`
  UPDATE tickets
  SET last_pinged_at = datetime('now'), ping_count = ping_count + 1
  WHERE id = ?
`);

const resolveTicket = db.prepare(`
  UPDATE tickets
  SET status = 'resolved', resolved_at = datetime('now')
  WHERE id = ?
`);

const resolveTicketByThread = db.prepare(`
  UPDATE tickets
  SET status = 'resolved', resolved_at = datetime('now')
  WHERE thread_id = ? AND status = 'open'
`);

const getTicketByThread = db.prepare(`
  SELECT * FROM tickets WHERE thread_id = ? AND status = 'open'
`);

const insertScamWarning = db.prepare(`
  INSERT INTO scam_warnings (channel_id, message_id, user_id, flagged_content, reason)
  VALUES (?, ?, ?, ?, ?)
`);

export const ticketDb = {
  create(data: {
    channelId: string;
    threadId: string | null;
    messageId: string;
    userId: string;
    userName: string;
    summary: string;
  }) {
    return insertTicket.run(
      data.channelId,
      data.threadId,
      data.messageId,
      data.userId,
      data.userName,
      data.summary
    );
  },

  getStaleTickets() {
    return getOpenTickets.all() as Array<{
      id: number;
      channel_id: string;
      thread_id: string | null;
      message_id: string;
      user_id: string;
      user_name: string;
      summary: string;
      status: string;
      created_at: string;
      last_pinged_at: string;
      ping_count: number;
    }>;
  },

  markPinged(id: number) {
    return updateTicketPing.run(id);
  },

  resolve(id: number) {
    return resolveTicket.run(id);
  },

  resolveByThread(threadId: string) {
    return resolveTicketByThread.run(threadId);
  },

  getByThread(threadId: string) {
    return getTicketByThread.get(threadId) as
      | {
          id: number;
          channel_id: string;
          thread_id: string;
          user_id: string;
          user_name: string;
          summary: string;
          status: string;
          ping_count: number;
        }
      | undefined;
  },
};

export const scamDb = {
  log(data: {
    channelId: string;
    messageId: string;
    userId: string;
    flaggedContent: string;
    reason: string;
  }) {
    return insertScamWarning.run(
      data.channelId,
      data.messageId,
      data.userId,
      data.flaggedContent,
      data.reason
    );
  },
};

export default db;
