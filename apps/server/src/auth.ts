/**
 * Phone sign-up (§18): one account per number, 18+ only, minimum data.
 *
 * - Phone numbers are stored only as an HMAC (keyed by SESSION_SECRET), so a
 *   database leak does not reveal them, yet uniqueness still holds.
 * - OTP codes are random, short-lived, attempt-limited and stored hashed.
 * - Session tokens are 256-bit random values; only their SHA-256 is stored.
 * - Date of birth is checked and discarded; we only keep that the check passed.
 */
import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import type { AccountStore } from './store/types.js';

export const OTP_TTL_MS = 10 * 60_000;
export const OTP_MAX_ATTEMPTS = 5;
export const SESSION_TTL_MS = 30 * 86_400_000;
export const SESSION_COOKIE = 'rw_session';

/** Light E.164 normalisation: keep + and digits; require 8–15 digits. */
export function normalisePhone(raw: string): string | null {
  const cleaned = raw.replace(/[\s().-]/g, '');
  const m = /^\+?(\d{8,15})$/.exec(cleaned);
  return m ? `+${m[1]}` : null;
}

export function isAdult(dob: { year: number; month: number; day: number }, now: Date): boolean {
  const eighteenth = new Date(Date.UTC(dob.year + 18, dob.month - 1, dob.day));
  return eighteenth.getTime() <= now.getTime();
}

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export class AuthService {
  constructor(
    private readonly store: AccountStore,
    private readonly secret: string,
    private readonly now: () => number,
  ) {}

  phoneHash(phone: string) {
    return createHmac('sha256', this.secret).update(phone).digest('hex');
  }

  /** Create (or replace) an OTP for this phone; returns the plain code to send. */
  async issueOtp(phone: string): Promise<string> {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const h = this.phoneHash(phone);
    await this.store.putOtp(h, sha256(`${h}:${code}`), this.now() + OTP_TTL_MS);
    return code;
  }

  /** Verify an OTP; on success returns the user id (creating the account if new) and a session token. */
  async verifyOtp(
    phone: string,
    code: string,
  ): Promise<
    { ok: true; userId: string; token: string; isNew: boolean } | { ok: false; reason: string }
  > {
    const h = this.phoneHash(phone);
    const otp = await this.store.getOtp(h);
    if (!otp || otp.expires_at < this.now())
      return { ok: false, reason: 'Code expired. Request a new one.' };
    if (otp.attempts >= OTP_MAX_ATTEMPTS)
      return { ok: false, reason: 'Too many attempts. Request a new code.' };
    const expected = Buffer.from(otp.code_hash, 'hex');
    const given = Buffer.from(sha256(`${h}:${code}`), 'hex');
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      await this.store.bumpOtpAttempts(h);
      return { ok: false, reason: 'Wrong code.' };
    }
    await this.store.deleteOtp(h);
    let user = await this.store.findUserByPhone(h);
    const isNew = !user;
    if (!user) {
      user = { id: `u_${randomUUID().replace(/-/g, '').slice(0, 20)}` };
      await this.store.createUser(user.id, h, this.now());
    }
    const token = randomBytes(32).toString('base64url');
    await this.store.createSession(sha256(token), user.id, this.now(), SESSION_TTL_MS);
    return { ok: true, userId: user.id, token, isNew };
  }

  async userForToken(token: string | undefined): Promise<string | undefined> {
    if (!token || token.length > 100) return undefined;
    return await this.store.sessionUser(sha256(token), this.now());
  }

  async logout(token: string) {
    await this.store.deleteSession(sha256(token));
  }
}
