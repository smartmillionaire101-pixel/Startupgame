/**
 * Pieces every phone app shares: loose readers for view fields built in
 * parallel (a missing field means the app says so plainly), avatars, rows
 * and the context each app gets from the phone.
 */
import { useState, type ReactNode } from 'react';
import type { PlayerView } from '@runway/engine';
import { t, tx } from '../i18n';
import { useView } from '../store';
import { Button } from '../ui';
import { looseCmd } from '../city/life';
import type { PhoneApp } from './bus';
import { Portrait } from '../avatar/Portrait';
import { Icon, type IconName } from './icons';

export type View = PlayerView;

export const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);
export const str = (x: unknown, d = ''): string => (typeof x === 'string' ? x : d);
export const num = (x: unknown, d = 0): number =>
  typeof x === 'number' && Number.isFinite(x) ? x : d;
export const list = (x: unknown): Record<string, unknown>[] =>
  Array.isArray(x) ? x.filter(isObj) : [];

/** A field on `view.me` the engine may not send yet. */
const meField = (view: View, key: string): unknown =>
  (view.me as unknown as Record<string, unknown>)[key];

// ---------------------------------------------------------------------------
// What a phone app can ask the phone to do

export interface ThreadRef {
  ai?: string;
  player?: string;
  say?: string;
}

export interface PhoneCtx {
  /** Open another app (Back still returns to the home screen). */
  open: (app: PhoneApp) => void;
  /** Open a chat thread in Messages. */
  chat: (r: ThreadRef) => void;
  /** Close the phone. */
  close: () => void;
  /** Walk to a place in the City (closes the phone). */
  goPlace: (place: string) => void;
  /** Open Contacts to pick someone to invite over. */
  pickGuest: () => void;
  /** Contacts opened to invite someone over. */
  invite?: boolean;
  /** Wave 8: the wallet opened to send money ('' = pick who). */
  sendTo?: string;
  /** The Bank app opened on a transaction receipt (its reference, e.g. from a chat payment card). */
  receipt?: string;
  /** Wave 10: the Homes app opened at one of your homes. */
  property?: string;
}

// ---------------------------------------------------------------------------
// Needs and mood (Wave 7 §A)

export type NeedKey = 'hunger' | 'hygiene' | 'fun' | 'social';
export const NEED_KEYS: NeedKey[] = ['hunger', 'hygiene', 'fun', 'social'];

export function needsOf(view: View): Record<NeedKey, number> | null {
  const n = meField(view, 'needs');
  if (!isObj(n)) return null;
  const out = {} as Record<NeedKey, number>;
  for (const k of NEED_KEYS) out[k] = Math.max(0, Math.min(100, Math.round(num(n[k], 0))));
  return out;
}

export function moodOf(view: View): number | null {
  const m = meField(view, 'mood');
  return typeof m === 'number' && Number.isFinite(m) ? Math.round(m) : null;
}

export const needLabel = (k: NeedKey) =>
  ({ hunger: t('Hunger'), hygiene: t('Hygiene'), fun: t('Fun'), social: t('Social') })[k];

export const NEED_ICON: Record<NeedKey, IconName> = {
  hunger: 'food',
  hygiene: 'shower',
  fun: 'smile',
  social: 'people',
};

// ---------------------------------------------------------------------------
// People

export const kindName = (k: string | null) =>
  (
    ({
      partner: t('Fund partner'),
      angel: t('Angel investor'),
      founder: t('Founder'),
      owner: t('Business owner'),
      lp: t('LP manager'),
      accelerator: t('Accelerator'),
      devpartner: t('Development partner'),
      person: t('Person'),
      investor: t('Investor'),
      banker: t('Banker'),
    }) as Record<string, string>
  )[k ?? ''] ??
  k ??
  '';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

/** A player's background and gender come from the view, so the portrait matches the map. */
function PortraitAvatar({
  id,
  ai,
  bg,
  gender,
}: {
  id: string;
  ai?: boolean;
  bg?: string;
  gender?: 'female' | 'male' | null;
}) {
  const { view } = useView();
  const p = view.players.find((x) => x.id === id);
  return (
    <span className={`phone-avatar has-portrait${ai ? ' ai' : ''}`} aria-hidden="true">
      <Portrait id={id} bg={bg ?? p?.backgroundId} gender={gender ?? p?.gender} size="100%" />
    </span>
  );
}

/**
 * A person's round picture: their portrait (Phase 6a) when we know who they
 * are (`id`: a player or an AI character id), otherwise their initials.
 */
export function Avatar({
  name,
  ai,
  id,
  bg,
  gender,
}: {
  name: string;
  ai?: boolean;
  id?: string;
  bg?: string;
  gender?: 'female' | 'male' | null;
}) {
  if (id) return <PortraitAvatar id={id} ai={ai} bg={bg} gender={gender} />;
  return (
    <span className={`phone-avatar${ai ? ' ai' : ''}`} aria-hidden="true">
      {initials(name) || '•'}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Layout bits

export function Line({
  label,
  value,
  tone,
}: {
  label: ReactNode;
  value: ReactNode;
  tone?: 'good' | 'bad';
}) {
  return (
    <div className="spread phone-line">
      <span>{label}</span>
      <span className={tone}>{value}</span>
    </div>
  );
}

/** A section heading inside an app. */
export const H = ({ children }: { children: ReactNode }) => <h3 className="phone-h">{children}</h3>;

/** Plain "nothing here" text, with an optional icon. */
export function Nothing({ children, icon }: { children: ReactNode; icon?: IconName }) {
  return (
    <div className="phone-nothing">
      {icon && <Icon name={icon} size={30} />}
      <p>{children}</p>
    </div>
  );
}

/** A coloured round glyph at the start of a row. */
export function RowIcon({ name, color }: { name: IconName; color?: string }) {
  return (
    <span className="phone-row-icon" style={color ? { background: color } : undefined}>
      <Icon name={name} size={18} />
    </span>
  );
}

/** A labelled 0–100 meter. */
export function Meter({ label, value, icon }: { label: string; value: number; icon?: IconName }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const tone = v < 25 ? 'bad' : v < 50 ? 'warn' : 'good';
  return (
    <div
      className={`phone-meter tone-${tone}`}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={v}
    >
      {icon && <Icon name={icon} size={16} />}
      <span className="phone-meter-label">{label}</span>
      <span className="phone-meter-track">
        <span className="phone-meter-fill" style={{ width: `${v}%` }} />
      </span>
      <span className="phone-meter-n">{v}</span>
    </div>
  );
}

/** Quit your job: a second tap confirms (this month's hours aren't paid). */
export function QuitJob({ place }: { place: string }) {
  const { send } = useView();
  const [armed, setArmed] = useState(false);
  return (
    <Button
      variant={armed ? 'primary' : 'ghost'}
      onClick={() => {
        if (!armed) return setArmed(true);
        setArmed(false);
        void send(looseCmd({ type: 'job.quit' }), (r: { message?: string } | null) =>
          r?.message ? tx(r.message) : t('You left your job at {place}.', { place }),
        );
      }}
    >
      {armed ? t('Tap again to quit') : t('Quit job')}
    </Button>
  );
}
