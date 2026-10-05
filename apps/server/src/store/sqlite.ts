/**
 * Persistence adapter on Node's built-in SQLite (no native build step).
 *
 * Holds the append-only command log and periodic world snapshots (so the
 * deterministic engine can rebuild any world exactly), plus the non-game
 * data that must never enter the simulation: accounts, sessions, OTPs and
 * private chats.
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import type {
  AiMessageRow,
  AiThreadRow,
  AccountRow,
  AccountStore,
  EmailTokenRow,
  ChatRow,
  MessageRow,
  PresenceRow,
} from './types.js';

export type { ChatRow, MessageRow } from './types.js';

const MIGRATIONS: string[] = [
  `CREATE TABLE users (
     id TEXT PRIMARY KEY,
     phone_hash TEXT NOT NULL UNIQUE,
     created_at INTEGER NOT NULL,
     deleted_at INTEGER
   );
   CREATE TABLE sessions (
     token_hash TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     created_at INTEGER NOT NULL,
     expires_at INTEGER NOT NULL
   );
   CREATE INDEX sessions_user ON sessions(user_id);
   CREATE TABLE otps (
     phone_hash TEXT PRIMARY KEY,
     code_hash TEXT NOT NULL,
     expires_at INTEGER NOT NULL,
     attempts INTEGER NOT NULL DEFAULT 0
   );
   CREATE TABLE commands (
     seq INTEGER PRIMARY KEY AUTOINCREMENT,
     actor TEXT,
     command TEXT NOT NULL,
     at INTEGER NOT NULL,
     world_version INTEGER NOT NULL
   );
   CREATE TABLE snapshots (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     seq INTEGER NOT NULL,
     world_version INTEGER NOT NULL,
     data BLOB NOT NULL,
     created_at INTEGER NOT NULL
   );
   CREATE TABLE chats (
     id TEXT PRIMARY KEY,
     a TEXT NOT NULL,
     b TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     blocked_by TEXT,
     UNIQUE(a, b)
   );
   CREATE TABLE chat_messages (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
     sender TEXT NOT NULL,
     text TEXT NOT NULL,
     flagged INTEGER NOT NULL DEFAULT 0,
     created_at INTEGER NOT NULL
   );
   CREATE INDEX chat_messages_chat ON chat_messages(chat_id, id);
   CREATE TABLE reports (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     chat_id TEXT NOT NULL,
     reporter TEXT NOT NULL,
     reason TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     status TEXT NOT NULL DEFAULT 'open'
   );`,
  // Wave 2: where avatars are on the city map, and who has hidden themselves.
  `CREATE TABLE presence (
     user_id TEXT PRIMARY KEY,
     market TEXT NOT NULL,
     x REAL NOT NULL,
     y REAL NOT NULL,
     place TEXT,
     at INTEGER NOT NULL
   );
   CREATE INDEX presence_market_at ON presence(market, at);
   CREATE TABLE presence_settings (
     user_id TEXT PRIMARY KEY,
     visible INTEGER NOT NULL DEFAULT 1
   );`,
  // Guest play and email sign-in. Guests keep phone_hash = 'guest:<id>' so the
  // column stays NOT NULL UNIQUE without rebuilding the table.
  `ALTER TABLE users ADD COLUMN email TEXT;
   ALTER TABLE users ADD COLUMN guest INTEGER NOT NULL DEFAULT 0;
   CREATE UNIQUE INDEX users_email ON users(email);
   CREATE TABLE email_tokens (
     token_hash TEXT PRIMARY KEY,
     email TEXT NOT NULL,
     intent TEXT NOT NULL,
     user_id TEXT,
     expires_at INTEGER NOT NULL
   );`,
  // Wave 5: chats with AI characters, one thread per player and character.
  `CREATE TABLE ai_threads (
     user_id TEXT NOT NULL,
     character_id TEXT NOT NULL,
     name TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     read_id INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY (user_id, character_id)
   );
   CREATE TABLE ai_messages (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id TEXT NOT NULL,
     character_id TEXT NOT NULL,
     from_ai INTEGER NOT NULL,
     text TEXT NOT NULL,
     created_at INTEGER NOT NULL
   );
   CREATE INDEX ai_messages_thread ON ai_messages(user_id, character_id, id);`,
];

/** Presence rows this much older than the caller's window are deleted. */
const PRESENCE_PRUNE_GRACE_MS = 10 * 60_000;

export interface CommandRow {
  seq: number;
  actor: string | null;
  command: string;
  at: number;
  world_version: number;
}

export class Store implements AccountStore {
  readonly db: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(
      'PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA synchronous = NORMAL;',
    );
    this.migrate();
  }

  private migrate() {
    const row = this.db.prepare('PRAGMA user_version').get() as { user_version: number };
    for (let v = row.user_version; v < MIGRATIONS.length; v++) {
      this.tx(() => {
        this.db.exec(MIGRATIONS[v]!);
        this.db.exec(`PRAGMA user_version = ${v + 1}`);
      });
    }
  }

  tx<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const out = fn();
      this.db.exec('COMMIT');
      return out;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  close() {
    this.db.close();
  }

  // ---------------------------------------------------------------- users & sessions

  findUserByPhone(phoneHash: string): { id: string } | undefined {
    return this.db
      .prepare('SELECT id FROM users WHERE phone_hash = ? AND deleted_at IS NULL')
      .get(phoneHash) as { id: string } | undefined;
  }

  createUser(id: string, phoneHash: string, now: number) {
    this.db
      .prepare('INSERT INTO users (id, phone_hash, created_at) VALUES (?, ?, ?)')
      .run(id, phoneHash, now);
  }

  createGuestUser(id: string, now: number) {
    this.db
      .prepare('INSERT INTO users (id, phone_hash, created_at, guest) VALUES (?, ?, ?, 1)')
      .run(id, `guest:${id}`, now);
  }

  setEmail(userId: string, emailNorm: string): boolean {
    return this.tx(() => {
      const owner = this.db.prepare('SELECT id FROM users WHERE email = ?').get(emailNorm) as
        { id: string } | undefined;
      if (owner && owner.id !== userId) return false;
      const r = this.db
        .prepare('UPDATE users SET email = ?, guest = 0 WHERE id = ? AND deleted_at IS NULL')
        .run(emailNorm, userId);
      return r.changes === 1;
    });
  }

  findUserByEmail(emailNorm: string): { id: string } | undefined {
    return this.db
      .prepare('SELECT id FROM users WHERE email = ? AND deleted_at IS NULL')
      .get(emailNorm) as { id: string } | undefined;
  }

  getAccount(userId: string): AccountRow | undefined {
    const row = this.db
      .prepare('SELECT guest, email FROM users WHERE id = ? AND deleted_at IS NULL')
      .get(userId) as { guest: number; email: string | null } | undefined;
    return row ? { guest: row.guest === 1, email: row.email } : undefined;
  }

  putEmailToken(tokenHash: string, row: EmailTokenRow) {
    this.db
      .prepare(
        'INSERT INTO email_tokens (token_hash, email, intent, user_id, expires_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(tokenHash, row.email, row.intent, row.userId, row.expiresAt);
  }

  takeEmailToken(tokenHash: string, now: number): EmailTokenRow | undefined {
    return this.tx(() => {
      this.db.prepare('DELETE FROM email_tokens WHERE expires_at <= ?').run(now);
      const row = this.db
        .prepare(
          'DELETE FROM email_tokens WHERE token_hash = ? RETURNING email, intent, user_id, expires_at',
        )
        .get(tokenHash) as
        | { email: string; intent: 'login' | 'save'; user_id: string | null; expires_at: number }
        | undefined;
      return row
        ? { email: row.email, intent: row.intent, userId: row.user_id, expiresAt: row.expires_at }
        : undefined;
    });
  }

  /** Account deletion: drop personal data; keep only a tombstone id for game history. */
  deleteUser(id: string, now: number) {
    this.tx(() => {
      this.db
        .prepare(
          "UPDATE users SET phone_hash = 'deleted:' || id, email = NULL, deleted_at = ? WHERE id = ?",
        )
        .run(now, id);
      this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
      this.db.prepare('DELETE FROM email_tokens WHERE user_id = ?').run(id);
      this.db.prepare('DELETE FROM chats WHERE a = ? OR b = ?').run(id, id);
      this.db.prepare('DELETE FROM presence WHERE user_id = ?').run(id);
      this.db.prepare('DELETE FROM presence_settings WHERE user_id = ?').run(id);
      this.db.prepare('DELETE FROM ai_messages WHERE user_id = ?').run(id);
      this.db.prepare('DELETE FROM ai_threads WHERE user_id = ?').run(id);
    });
  }

  createSession(tokenHash: string, userId: string, now: number, ttlMs: number) {
    this.db
      .prepare(
        'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
      )
      .run(tokenHash, userId, now, now + ttlMs);
  }

  sessionUser(tokenHash: string, now: number): string | undefined {
    const row = this.db
      .prepare(
        'SELECT s.user_id AS id FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ? AND u.deleted_at IS NULL',
      )
      .get(tokenHash, now) as { id: string } | undefined;
    return row?.id;
  }

  deleteSession(tokenHash: string) {
    this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
  }

  putOtp(phoneHash: string, codeHash: string, expiresAt: number) {
    this.db
      .prepare(
        'INSERT INTO otps (phone_hash, code_hash, expires_at, attempts) VALUES (?, ?, ?, 0) ON CONFLICT(phone_hash) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0',
      )
      .run(phoneHash, codeHash, expiresAt);
  }

  getOtp(
    phoneHash: string,
  ): { code_hash: string; expires_at: number; attempts: number } | undefined {
    return this.db
      .prepare('SELECT code_hash, expires_at, attempts FROM otps WHERE phone_hash = ?')
      .get(phoneHash) as never;
  }

  bumpOtpAttempts(phoneHash: string) {
    this.db.prepare('UPDATE otps SET attempts = attempts + 1 WHERE phone_hash = ?').run(phoneHash);
  }

  deleteOtp(phoneHash: string) {
    this.db.prepare('DELETE FROM otps WHERE phone_hash = ?').run(phoneHash);
  }

  // ---------------------------------------------------------------- command log & snapshots

  appendCommand(actor: string | null, command: unknown, at: number, worldVersion: number): number {
    const r = this.db
      .prepare('INSERT INTO commands (actor, command, at, world_version) VALUES (?, ?, ?, ?)')
      .run(actor, JSON.stringify(command), at, worldVersion);
    return Number(r.lastInsertRowid);
  }

  commandsAfter(seq: number): CommandRow[] {
    return this.db
      .prepare(
        'SELECT seq, actor, command, at, world_version FROM commands WHERE seq > ? ORDER BY seq',
      )
      .all(seq) as unknown as CommandRow[];
  }

  saveSnapshot(seq: number, worldVersion: number, world: unknown, now: number) {
    const data = gzipSync(Buffer.from(JSON.stringify(world)));
    this.db
      .prepare('INSERT INTO snapshots (seq, world_version, data, created_at) VALUES (?, ?, ?, ?)')
      .run(seq, worldVersion, data, now);
    // Keep the last few snapshots for safety; the command log is the source of truth.
    this.db
      .prepare(
        'DELETE FROM snapshots WHERE id NOT IN (SELECT id FROM snapshots ORDER BY id DESC LIMIT 5)',
      )
      .run();
  }

  latestSnapshot<T>(): { seq: number; world: T } | undefined {
    const row = this.db
      .prepare('SELECT seq, data FROM snapshots ORDER BY id DESC LIMIT 1')
      .get() as { seq: number; data: Uint8Array } | undefined;
    if (!row) return undefined;
    return { seq: row.seq, world: JSON.parse(gunzipSync(row.data).toString('utf8')) as T };
  }

  // ---------------------------------------------------------------- chats

  findChat(a: string, b: string): ChatRow | undefined {
    const [x, y] = a < b ? [a, b] : [b, a];
    return this.db.prepare('SELECT * FROM chats WHERE a = ? AND b = ?').get(x, y) as
      ChatRow | undefined;
  }

  createChat(id: string, a: string, b: string, now: number): ChatRow {
    const [x, y] = a < b ? [a, b] : [b, a];
    this.db
      .prepare('INSERT INTO chats (id, a, b, created_at) VALUES (?, ?, ?, ?)')
      .run(id, x, y, now);
    return this.getChat(id)!;
  }

  getChat(id: string): ChatRow | undefined {
    return this.db.prepare('SELECT * FROM chats WHERE id = ?').get(id) as ChatRow | undefined;
  }

  chatsFor(userId: string): (ChatRow & {
    last_text: string | null;
    last_at: number | null;
    last_sender: string | null;
  })[] {
    return this.db
      .prepare(
        `SELECT c.*, m.text AS last_text, m.created_at AS last_at, m.sender AS last_sender FROM chats c
         LEFT JOIN chat_messages m ON m.id = (SELECT MAX(id) FROM chat_messages WHERE chat_id = c.id)
         WHERE c.a = ? OR c.b = ? ORDER BY COALESCE(m.created_at, c.created_at) DESC LIMIT 100`,
      )
      .all(userId, userId) as never;
  }

  addMessage(chatId: string, sender: string, text: string, flagged: boolean, now: number) {
    this.db
      .prepare(
        'INSERT INTO chat_messages (chat_id, sender, text, flagged, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(chatId, sender, text, flagged ? 1 : 0, now);
  }

  messages(chatId: string, limit = 100): MessageRow[] {
    return (
      this.db
        .prepare('SELECT * FROM chat_messages WHERE chat_id = ? ORDER BY id DESC LIMIT ?')
        .all(chatId, limit) as unknown as MessageRow[]
    ).reverse();
  }

  recentMessageCount(sender: string, since: number): number {
    return (
      this.db
        .prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE sender = ? AND created_at > ?')
        .get(sender, since) as { n: number }
    ).n;
  }

  blockChat(chatId: string, by: string) {
    this.db.prepare('UPDATE chats SET blocked_by = ? WHERE id = ?').run(by, chatId);
  }

  report(chatId: string, reporter: string, reason: string, now: number) {
    this.db
      .prepare('INSERT INTO reports (chat_id, reporter, reason, created_at) VALUES (?, ?, ?, ?)')
      .run(chatId, reporter, reason, now);
  }

  openReports() {
    return this.db.prepare("SELECT * FROM reports WHERE status = 'open' ORDER BY id").all();
  }

  // ---------------------------------------------------------------- presence

  putPresence(
    userId: string,
    market: string,
    p: { x: number; y: number; place: string | null; at: number },
  ) {
    this.db
      .prepare(
        `INSERT INTO presence (user_id, market, x, y, place, at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET market = excluded.market, x = excluded.x,
           y = excluded.y, place = excluded.place, at = excluded.at`,
      )
      .run(userId, market, p.x, p.y, p.place, p.at);
  }

  listPresence(market: string, sinceMs: number): PresenceRow[] {
    // Stale rows are useless; drop them while we're here.
    this.db.prepare('DELETE FROM presence WHERE at < ?').run(sinceMs - PRESENCE_PRUNE_GRACE_MS);
    return this.db
      .prepare(
        `SELECT p.user_id AS userId, p.market, p.x, p.y, p.place, p.at FROM presence p
         LEFT JOIN presence_settings s ON s.user_id = p.user_id
         WHERE p.market = ? AND p.at >= ? AND COALESCE(s.visible, 1) = 1
         ORDER BY p.at DESC LIMIT 500`,
      )
      .all(market, sinceMs) as unknown as PresenceRow[];
  }

  getPresenceVisible(userId: string): boolean {
    const row = this.db
      .prepare('SELECT visible FROM presence_settings WHERE user_id = ?')
      .get(userId) as { visible: number } | undefined;
    return row ? row.visible === 1 : true;
  }

  setPresenceVisible(userId: string, visible: boolean) {
    this.tx(() => {
      this.db
        .prepare(
          'INSERT INTO presence_settings (user_id, visible) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET visible = excluded.visible',
        )
        .run(userId, visible ? 1 : 0);
      if (!visible) this.db.prepare('DELETE FROM presence WHERE user_id = ?').run(userId);
    });
  }

  // ---------------------------------------------------------------- AI chats

  private static readonly AI_THREAD_SQL = `
    SELECT t.character_id AS characterId, t.name, t.created_at AS createdAt,
      m.text AS lastText, m.created_at AS lastAt, COALESCE(m.from_ai, 0) AS lastFromAi,
      (SELECT COUNT(*) FROM ai_messages u WHERE u.user_id = t.user_id
         AND u.character_id = t.character_id AND u.from_ai = 1 AND u.id > t.read_id) AS unread,
      (SELECT COUNT(*) FROM ai_messages c WHERE c.user_id = t.user_id
         AND c.character_id = t.character_id) AS count
    FROM ai_threads t
    LEFT JOIN ai_messages m ON m.id = (SELECT MAX(id) FROM ai_messages
      WHERE user_id = t.user_id AND character_id = t.character_id)`;

  private static aiThreadRow(r: Record<string, unknown>): AiThreadRow {
    return {
      characterId: r.characterId as string,
      name: r.name as string,
      createdAt: r.createdAt as number,
      lastText: (r.lastText as string | null) ?? null,
      lastAt: (r.lastAt as number | null) ?? null,
      lastFromAi: r.lastFromAi === 1,
      unread: Number(r.unread),
      count: Number(r.count),
    };
  }

  aiThreads(userId: string): AiThreadRow[] {
    return (
      this.db
        .prepare(
          `${Store.AI_THREAD_SQL} WHERE t.user_id = ?
           ORDER BY COALESCE(m.id, 0) DESC, t.created_at DESC LIMIT 100`,
        )
        .all(userId) as Record<string, unknown>[]
    ).map(Store.aiThreadRow);
  }

  aiThread(userId: string, characterId: string): AiThreadRow | undefined {
    const r = this.db
      .prepare(`${Store.AI_THREAD_SQL} WHERE t.user_id = ? AND t.character_id = ?`)
      .get(userId, characterId) as Record<string, unknown> | undefined;
    return r ? Store.aiThreadRow(r) : undefined;
  }

  aiMessages(userId: string, characterId: string, limit = 100): AiMessageRow[] {
    return (
      this.db
        .prepare(
          `SELECT id, from_ai, text, created_at FROM ai_messages
           WHERE user_id = ? AND character_id = ? ORDER BY id DESC LIMIT ?`,
        )
        .all(userId, characterId, limit) as {
        id: number;
        from_ai: number;
        text: string;
        created_at: number;
      }[]
    )
      .reverse()
      .map((m) => ({ id: m.id, fromAi: m.from_ai === 1, text: m.text, at: m.created_at }));
  }

  addAiMessage(
    userId: string,
    characterId: string,
    name: string,
    fromAi: boolean,
    text: string,
    now: number,
  ): AiMessageRow {
    return this.tx(() => {
      this.db
        .prepare(
          `INSERT INTO ai_threads (user_id, character_id, name, created_at) VALUES (?, ?, ?, ?)
           ON CONFLICT(user_id, character_id) DO UPDATE SET name = excluded.name`,
        )
        .run(userId, characterId, name, now);
      const r = this.db
        .prepare(
          'INSERT INTO ai_messages (user_id, character_id, from_ai, text, created_at) VALUES (?, ?, ?, ?, ?)',
        )
        .run(userId, characterId, fromAi ? 1 : 0, text, now);
      return { id: Number(r.lastInsertRowid), fromAi, text, at: now };
    });
  }

  markAiRead(userId: string, characterId: string) {
    this.db
      .prepare(
        `UPDATE ai_threads SET read_id = COALESCE((SELECT MAX(id) FROM ai_messages
           WHERE user_id = ? AND character_id = ?), 0)
         WHERE user_id = ? AND character_id = ?`,
      )
      .run(userId, characterId, userId, characterId);
  }
}
