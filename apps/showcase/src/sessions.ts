/**
 * Sign the showcase characters back in. Their accounts are guest accounts in
 * the showcase world's own database, so instead of a sign-in flow the runner
 * writes a fresh session straight into that database before the server
 * starts (sessions last 30 days; a new one each day never runs out).
 */
import { createHash, randomBytes } from 'node:crypto';
import { SESSION_TTL_MS } from '../../server/src/auth.js';
import { Store } from '../../server/src/store/sqlite.js';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** A new session token for each user id, written into the database at `dbPath`. */
export function mintSessions(dbPath: string, userIds: string[], now = Date.now()) {
  const store = new Store(dbPath);
  try {
    return Object.fromEntries(
      userIds.map((id) => {
        const token = randomBytes(32).toString('base64url');
        store.createSession(sha256(token), id, now, SESSION_TTL_MS);
        return [id, token];
      }),
    );
  } finally {
    store.close();
  }
}
