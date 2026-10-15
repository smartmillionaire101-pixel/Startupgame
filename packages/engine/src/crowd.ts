/**
 * The city's crowd (bankers at a lender, people on an AI company's team) as
 * the map draws them in clubs, bars and banks: a name fixed by who they are,
 * so every client and the AI chat agree. Pure; nothing here touches the
 * world, so it can't change how a log replays.
 */
import { CITY_NAME_PARTS } from './data/business-names.js';
import { MARKET_IDS, type MarketId } from './data/markets.js';
import { hashString } from './rng.js';

export type CrowdRole = 'banker' | 'staff';

/** `crowd:<market>:<role>:<org id>:<n>`: a banker at a lender, or someone on a company's team. */
export const crowdId = (market: MarketId, role: CrowdRole, org: string, n: number) =>
  `crowd:${market}:${role}:${org}:${n}`;

export function parseCrowdId(
  id: string,
): { market: MarketId; role: CrowdRole; org: string; n: number } | null {
  const m = /^crowd:([a-z][a-z-]{1,31}):(banker|staff):([\w.-]{1,64}):(\d{1,3})$/.exec(id);
  if (!m || !(MARKET_IDS as readonly string[]).includes(m[1]!)) return null;
  return { market: m[1] as MarketId, role: m[2] as CrowdRole, org: m[3]!, n: Number(m[4]) };
}

/** Their name and gender, the same everywhere. */
export function crowdPerson(id: string): { name: string; gender: 'female' | 'male' } | null {
  const p = parseCrowdId(id);
  const parts = p ? CITY_NAME_PARTS[p.market] : undefined;
  if (!parts) return null;
  const h = hashString(id);
  const gender = h % 2 === 0 ? 'female' : 'male';
  const firsts = parts[gender];
  return {
    name: `${firsts[(h >>> 1) % firsts.length]!} ${parts.last[(h >>> 9) % parts.last.length]!}`,
    gender,
  };
}
