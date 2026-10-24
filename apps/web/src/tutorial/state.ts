/**
 * Founder Journey 6: the guided first session (blueprint §3, §3.1).
 *
 * Client-side progress, per player, in localStorage `runway.tutorial.<id>`:
 * which step you're on and whether you finished or skipped. The server is
 * the judge of what actually happened (a company exists, a deal was won, an
 * expense was paid: see ./steps.ts), so a lost or cleared storage only means
 * the coach stops showing; the game itself never depends on it.
 *
 * Only brand-new founders who came through the entry screen get the tutorial
 * (`markNewPlayer` there, `claimNewPlayer` once the game loads). Everyone
 * else sees the full phone as before.
 */
import { useSyncExternalStore } from 'react';
import { setLookOverride } from '../city/acts/look';

export const TUTORIAL_STEPS = ['phone', 'idea', 'sale', 'payment', 'end'] as const;
export type TutorialStep = (typeof TUTORIAL_STEPS)[number];

export interface TutorialState {
  step: TutorialStep;
  status: 'active' | 'skipped' | 'done';
  /** Phone apps opened during the tutorial (the Bank, for step 1). */
  seen?: string[];
  /** The founder chose to go on without a first sale (§3.1: never block on one roll). */
  noSale?: boolean;
}

const KEY = (id: string) => `runway.tutorial.${id}`;
const NEW_KEY = 'runway.tutorial.new';

const cache = new Map<string, TutorialState | null>();
let version = 0;
const listeners = new Set<() => void>();
const changed = () => {
  version++;
  listeners.forEach((f) => f());
};

function read(id: string): TutorialState | null {
  if (cache.has(id)) return cache.get(id)!;
  let s: TutorialState | null = null;
  try {
    const raw = localStorage.getItem(KEY(id));
    const o = raw ? (JSON.parse(raw) as Partial<TutorialState>) : null;
    if (
      o &&
      TUTORIAL_STEPS.includes(o.step as TutorialStep) &&
      ['active', 'skipped', 'done'].includes(o.status ?? '')
    )
      s = {
        step: o.step!,
        status: o.status!,
        ...(Array.isArray(o.seen) ? { seen: o.seen.filter((x) => typeof x === 'string') } : {}),
        ...(o.noSale ? { noSale: true } : {}),
      };
  } catch {
    s = null;
  }
  cache.set(id, s);
  return s;
}

function write(id: string, s: TutorialState) {
  cache.set(id, s);
  try {
    localStorage.setItem(KEY(id), JSON.stringify(s));
  } catch {
    /* storage blocked: the tutorial lasts this session */
  }
  changed();
}
/** The step you're on, or null when there's no tutorial running (finished, skipped, never). */
export function activeStep(id: string): TutorialStep | null {
  const s = read(id);
  return s && s.status === 'active' ? s.step : null;
}

export function setTutorial(id: string, patch: Partial<TutorialState>) {
  const s = read(id) ?? { step: 'phone' as const, status: 'active' as const };
  write(id, { ...s, ...patch });
}

export const skipTutorial = (id: string) => setTutorial(id, { status: 'skipped' });
export const finishTutorial = (id: string) => setTutorial(id, { status: 'done', step: 'end' });

/** An app opened on the phone (the tutorial waits for the Bank in step 1). */
export function tutorialSaw(id: string, app: string) {
  const s = read(id);
  if (!s || s.status !== 'active' || s.seen?.includes(app)) return;
  write(id, { ...s, seen: [...(s.seen ?? []), app] });
}

/** Re-render on any tutorial change. */
export function useTutorial(id: string): TutorialState | null {
  useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => version,
    () => 0,
  );
  return read(id);
}

/** The entry screen: this browser just created a player (a founder gets the tutorial). */
export function markNewPlayer(o: { founder: boolean; top?: string | null }) {
  try {
    localStorage.setItem(NEW_KEY, JSON.stringify({ founder: o.founder, top: o.top ?? null }));
  } catch {
    /* storage blocked: no tutorial, no saved outfit colour */
  }
}

/**
 * Once the game has loaded the new player: start their tutorial (founders
 * without a company yet) and keep the outfit colour they picked.
 */
export function claimNewPlayer(me: { id: string; role: string }, hasCompany: boolean) {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(NEW_KEY);
    if (raw) localStorage.removeItem(NEW_KEY);
  } catch {
    return;
  }
  if (!raw) return;
  let o: { founder?: boolean; top?: string | null } = {};
  try {
    o = JSON.parse(raw) as typeof o;
  } catch {
    return;
  }
  if (o.top) setLookOverride(me.id, { top: o.top });
  if (o.founder && me.role === 'founder' && !hasCompany && !read(me.id))
    write(me.id, { step: 'phone', status: 'active' });
}

/**
 * Phone apps shown while the tutorial runs: one new system at a time
 * (blueprint §3.1, §5.2). Null: every app (no tutorial running).
 */
const APPS: Record<TutorialStep, string[]> = {
  phone: ['bank', 'map', 'settings'],
  idea: ['bank', 'map', 'settings', 'messages', 'contacts'],
  sale: ['bank', 'map', 'settings', 'messages', 'contacts', 'sales', 'founder', 'journey'],
  payment: ['bank', 'map', 'settings', 'messages', 'contacts', 'sales', 'founder', 'journey'],
  end: ['bank', 'map', 'settings', 'messages', 'contacts', 'sales', 'founder', 'journey'],
};

export function tutorialApps(step: TutorialStep | null): ReadonlySet<string> | null {
  return step ? new Set(APPS[step]) : null;
}
