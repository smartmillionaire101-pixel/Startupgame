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
import type { AccountStore, ChatRow, MessageRow } from './types.js';

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
];

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

  /** Account deletion: drop personal data; keep only a tombstone id for game history. */
  deleteUser(id: string, now: number) {
    this.tx(() => {
      this.db
        .prepare("UPDATE users SET phone_hash = 'deleted:' || id, deleted_at = ? WHERE id = ?")
        .run(now, id);
      this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
      this.db.prepare('DELETE FROM chats WHERE a = ? OR b = ?').run(id, id);
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

  chatsFor(userId: string): (ChatRow & { last_text: string | null; last_at: number | null })[] {
    return this.db
      .prepare(
        `SELECT c.*, m.text AS last_text, m.created_at AS last_at FROM chats c
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
}
