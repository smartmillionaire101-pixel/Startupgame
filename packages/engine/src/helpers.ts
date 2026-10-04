/** Small accessors shared by the systems. All take the (draft) world. */
import { ensure, fail } from './errors.js';
import { newId } from './ids.js';
import { major } from './money.js';
import { valueIn } from './ledger.js';
import type { MarketId } from './data/markets.js';
import type {
  Company,
  Fund,
  Id,
  InboxItem,
  MarketState,
  NewsItem,
  Player,
  Stage,
  World,
} from './types.js';
import { STAGES } from './types.js';

export const INBOX_LIMIT = 60;

/**
 * Where payouts to non-player cap-table holders go: banks that seized
 * shares, the central bank (shares lost on relocation), or the outside
 * world (AI staff and others).
 */
/** The account a cap-table holder is paid into: players, funds, parent companies, or the outside world. */
export function holderAccount(world: World, m: MarketState, holderId: string): Id {
  const p = world.players[holderId];
  if (p) return p.accounts.local;
  const f = world.funds[holderId];
  if (f) return f.account;
  const c = world.companies[holderId];
  if (c) return c.account;
  // A player bank holding warrants or seized collateral.
  if (holderId.startsWith('pbank:')) {
    const b = world.banks[holderId.slice(6)];
    if (b && b.status !== 'failed') return b.account;
  }
  return externalHolderAccount(m, holderId);
}

export function externalHolderAccount(m: MarketState, holderId: string): Id {
  if (holderId.startsWith('bank:')) return m.ext.bank;
  if (holderId.startsWith('cb:')) return m.ext.tax;
  return m.ext.payroll;
}
export const NEWS_LIMIT = 120;

export function getPlayer(world: World, id: Id): Player {
  const p = world.players[id];
  if (!p) fail('player.missing', 'Player not found.');
  return p;
}

export function getCompany(world: World, id: Id): Company {
  const c = world.companies[id];
  if (!c) fail('company.missing', 'Company not found.');
  return c;
}

export function getFund(world: World, id: Id): Fund {
  const f = world.funds[id];
  if (!f) fail('fund.missing', 'Fund not found.');
  return f;
}

export function getMarket(world: World, id: MarketId): MarketState {
  const m = world.markets[id];
  if (!m) fail('market.missing', 'Market not found.');
  return m;
}

/** A founder's active company that the actor is allowed to run. */
export function ownCompany(world: World, actorId: Id, companyId: Id): Company {
  const c = getCompany(world, companyId);
  ensure(
    c.founderIds.includes(actorId),
    'company.forbidden',
    'You are not a founder of this company.',
  );
  ensure(c.status === 'active', 'company.closed', 'This company is no longer operating.');
  return c;
}

/** Monthly cost of living in minor units. */
export const col = (m: MarketState): number => major(m.data.costOfLiving);

/** Convert a USD major amount to the market's local minor units at today's rate. */
export const usdToLocal = (world: World, m: MarketState, usdMajor: number): number =>
  valueIn(world, major(usdMajor), 'USD', m.data.currency);

export const localToUsdMajor = (world: World, m: MarketState, localMinor: number): number =>
  valueIn(world, localMinor, m.data.currency, 'USD') / 100;

export function spendHours(player: Player, hours: number, what: string) {
  const left = player.hours.available - player.hours.used;
  ensure(
    left >= hours,
    'hours.short',
    `${what} needs ${hours}h; you have ${Math.max(0, Math.floor(left))}h left this month.`,
  );
  player.hours.used += hours;
}

export const hoursLeft = (p: Player) => Math.max(0, p.hours.available - p.hours.used);

export function notify(world: World, playerId: Id, item: Omit<InboxItem, 'id' | 'read'>) {
  const p = world.players[playerId];
  if (!p || p.ai) return;
  const list = (world.inbox[playerId] ??= []);
  list.unshift({ ...item, id: newId(world, 'in'), read: false });
  if (list.length > INBOX_LIMIT) list.length = INBOX_LIMIT;
}

export function publish(world: World, item: Omit<NewsItem, 'id'>): NewsItem {
  const m = getMarket(world, item.market);
  const full = { ...item, id: newId(world, 'news') };
  m.news.unshift(full);
  if (m.news.length > NEWS_LIMIT) m.news.length = NEWS_LIMIT;
  return full;
}

export function nextStage(last: Stage | null): Stage {
  if (last === null) return 'pre-seed';
  const i = STAGES.indexOf(last);
  return STAGES[Math.min(i + 1, STAGES.length - 1)] as Stage;
}

export function marketMonth(world: World, market: MarketId): number {
  return getMarket(world, market).month;
}

export function adjustTrust(a: Player | undefined, otherId: Id, delta: number) {
  if (!a) return;
  a.trust[otherId] = Math.max(-1, Math.min(1, (a.trust[otherId] ?? 0) + delta));
}

export function achieve(world: World, player: Player, key: string, label: string, month: number) {
  if (player.milestones[key] !== undefined) return;
  player.milestones[key] = month;
  notify(world, player.id, { month, kind: 'milestone', text: `Milestone: ${label}` });
}

export const totalCustomers = (c: Company): number =>
  Object.values(c.segments).reduce((a, s) => a + s.paying, 0);

export const lastPnl = (c: Company) => c.finance.history[c.finance.history.length - 1];

/** Average monthly burn over the last three months (positive number = burning). */
export function burn(c: Company): number {
  const h = c.finance.history.slice(-3);
  if (h.length === 0)
    return c.founderSalary + c.marketingBudget + c.staff.reduce((a, s) => a + s.salary, 0);
  return Math.max(0, -Math.round(h.reduce((a, p) => a + p.net, 0) / h.length));
}
