/**
 * Sign-up's pure rules (tested in test/signup.test.ts): which step comes
 * when, the username made from your name, what's wrong with an email (the
 * same rule as the server's), and the city to show before you pick one.
 */

/** The three careers you can join as. */
export type JoinRole = 'founder' | 'investor' | 'banker';
export type Step = 'path' | 'look' | 'about';
export const STEPS: readonly Step[] = ['path', 'look', 'about'];

/** Sign-up opens on the look when a role card on the landing page has already picked the path. */
export const firstStep = (joinAs?: JoinRole | null): Step => (joinAs ? 'look' : 'path');

/** The step after this one (null: this is the last, Play). */
export function nextStep(step: Step): Step | null {
  const i = STEPS.indexOf(step);
  return STEPS[i + 1] ?? null;
}

/**
 * The step Back goes to (null: leave sign-up). When the landing page picked
 * the path, Back from the look leaves too: that's where you picked it.
 */
export function prevStep(step: Step, skippedPath = false): Step | null {
  if (step === 'look' && skippedPath) return null;
  const i = STEPS.indexOf(step);
  return i > 0 ? STEPS[i - 1]! : null;
}

/** What the server accepts as a username. */
export const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;

/**
 * A username made from a name: lower case, accents dropped, anything else an
 * underscore ("Ada Okafor" → "ada_okafor"). `attempt` > 0 adds a number for
 * when the first one is taken ("ada_okafor2"). Empty when the name has no
 * letters or digits.
 */
export function suggestUsername(name: string, attempt = 0): string {
  let base = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!base) return '';
  if (base.length < 3) base = `${base}_player`;
  const suffix = attempt > 0 ? String(attempt + 1) : '';
  return `${base.slice(0, 20 - suffix.length).replace(/_+$/, '')}${suffix}`;
}

export type EmailProblem = 'empty' | 'spaces' | 'at' | 'name' | 'domain' | 'chars' | 'end' | 'long';

/**
 * What's wrong with an email, or null when the server will take it (its rule:
 * something@something.something, no spaces or <>"',;, at most 254 characters).
 */
export function emailProblem(raw: string): EmailProblem | null {
  const e = raw.trim();
  if (!e) return 'empty';
  if (/\s/.test(e)) return 'spaces';
  if (e.length > 254) return 'long';
  const parts = e.split('@');
  if (parts.length !== 2) return 'at';
  const [local, domain] = parts as [string, string];
  if (!local) return 'name';
  if (!domain) return 'domain';
  if (/[<>"',;]/.test(e)) return 'chars';
  const dot = domain.lastIndexOf('.');
  if (dot <= 0 || dot === domain.length - 1) return 'end';
  return null;
}

/**
 * The city to show before you pick one: the market in your time zone, else
 * Lagos (the first city), else the first there is.
 */
export function guessCity(
  markets: readonly { id: string; timeZone?: string }[],
  timeZone?: string | null,
): string | null {
  const here = timeZone ? markets.find((m) => m.timeZone === timeZone) : undefined;
  return here?.id ?? markets.find((m) => m.id === 'lagos')?.id ?? markets[0]?.id ?? null;
}

/** The browser's time zone (null when it can't say). */
export function browserTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}
