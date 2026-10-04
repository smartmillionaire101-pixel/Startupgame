/**
 * The monthly story (Wave 1): why the month went the way it did.
 *
 * Built at settlement from the month's actual numbers — new customers by
 * channel, churn and its main cause, price changes, hires and departures,
 * cost lines that moved, loan repayments, star changes and the news behind
 * them — then ranked by impact (3–6 items) with 1–3 suggested next moves.
 * Pure and deterministic: no randomness, only the settled world.
 */
import { STAFF_ROLES } from './data/markets.js';
import {
  cloudCost,
  marketingSpend,
  officeRent,
  payrollThisMonth,
  projectedBurn,
} from './company.js';
import { reliability } from './customers.js';
import { getMarket, lastPnl, totalCustomers } from './helpers.js';
import { account } from './ledger.js';
import { formatMoney } from './money.js';
import { isOverloaded, outputOf } from './staff.js';
import type {
  ChurnCause,
  Company,
  CompanyStory,
  MonthlyPnl,
  Staff,
  StoryAction,
  StoryBase,
  StoryItem,
  World,
} from './types.js';

export const STORY_MIN_ITEMS = 3;
export const STORY_MAX_ITEMS = 6;
export const STORY_MAX_NEXT = 3;
/** A new (or lost) customer is weighed as this many months of revenue when ranking. */
export const CUSTOMER_MONTHS = 6;

/** End-of-month snapshot the next story compares against. */
export function storySnapshot(world: World, c: Company): StoryBase {
  void world;
  return {
    month: getMarket(world, c.market).month,
    price: c.price,
    marketingBudget: c.marketingBudget,
    staffIds: c.staff.map((s) => s.id),
    output: Math.round(outputOf(c, [...STAFF_ROLES]) * 100) / 100,
    morale: avgMorale(c),
  };
}

const avgMorale = (c: Company) =>
  c.staff.length ? Math.round(c.staff.reduce((a, s) => a + s.morale, 0) / c.staff.length) : 0;

const pct = (x: number) => `${Math.round(Math.abs(x) * 100)}%`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

interface Candidate {
  item: StoryItem;
  impact: number;
  /** Short reason for the headline ("marketing brought in 40 customers"). */
  short?: string;
}

const COST_LABEL: Record<string, string> = {
  payroll: 'Payroll',
  founderSalary: 'Founder pay',
  office: 'Rent',
  marketing: 'Marketing spend',
  cloud: 'Cloud and processing',
};

export function buildStory(
  world: World,
  c: Company,
  month: number,
  prev: StoryBase,
  departures: Staff[],
): CompanyStory {
  const m = getMarket(world, c.market);
  const fmt = (v: number) => formatMoney(v, m.data.currency);
  const pnl = lastPnl(c);
  const prevPnl: MonthlyPnl | undefined = c.finance.history[c.finance.history.length - 2];
  const price = Math.max(1, c.price);
  const out: Candidate[] = [];

  // --- New customers by channel.
  const ch = { marketing: 0, outreach: 0, wordOfMouth: 0, pipeline: 0 };
  let churned = 0;
  const churnBy: Record<ChurnCause, number> = {
    reliability: 0,
    price: 0,
    competition: 0,
    normal: 0,
  };
  let priceSeg: { name: string; budget: number } | null = null;
  for (const [key, pos] of Object.entries(c.segments)) {
    const k = pos.channels ?? { marketing: 0, outreach: pos.won, wordOfMouth: 0, pipeline: 0 };
    ch.marketing += k.marketing;
    ch.outreach += k.outreach;
    ch.wordOfMouth += k.wordOfMouth;
    ch.pipeline += k.pipeline;
    churned += pos.churned;
    const cause = pos.churnCause ?? 'normal';
    churnBy[cause] += pos.churned;
    const seg = m.segments[key];
    if (cause === 'price' && seg && pos.churned > 0)
      priceSeg = { name: seg.name, budget: seg.budget };
  }
  if (ch.marketing > 0) {
    const changed = c.marketingBudget !== prev.marketingBudget;
    out.push({
      item: {
        tone: 'good',
        text: `${plural(ch.marketing, 'new customer')} came from marketing.`,
        cause: changed
          ? `You ${c.marketingBudget > prev.marketingBudget ? 'raised' : 'cut'} marketing to ${fmt(c.marketingBudget)} a month.`
          : `Marketing budget of ${fmt(c.marketingBudget)} a month.`,
        metric: 'customers',
        delta: ch.marketing,
      },
      impact: ch.marketing * price * CUSTOMER_MONTHS,
      short:
        changed && c.marketingBudget > prev.marketingBudget
          ? 'the marketing push worked'
          : `marketing brought in ${plural(ch.marketing, 'customer')}`,
    });
  }
  if (ch.wordOfMouth > 0)
    out.push({
      item: {
        tone: 'good',
        text: `${plural(ch.wordOfMouth, 'customer')} came by word of mouth.`,
        cause: `Happy customers told friends (reliability ${pct(reliability(c))}).`,
        metric: 'customers',
        delta: ch.wordOfMouth,
      },
      impact: ch.wordOfMouth * price * CUSTOMER_MONTHS,
      short: 'word of mouth is spreading',
    });
  if (ch.outreach > 0) {
    const sellers = c.staff.filter((s) => s.role === 'sales').length;
    out.push({
      item: {
        tone: 'good',
        text: `${plural(ch.outreach, 'customer')} signed up from direct selling.`,
        cause:
          sellers > 0
            ? `Your ${plural(sellers, 'salesperson', 'salespeople')} and you.`
            : 'Your own outreach as founder.',
        metric: 'customers',
        delta: ch.outreach,
      },
      impact: ch.outreach * price * CUSTOMER_MONTHS,
      short: 'your own selling paid off',
    });
  }
  if (ch.pipeline > 0)
    out.push({
      item: {
        tone: 'good',
        text: `${plural(ch.pipeline, 'business deal')} closed.`,
        cause: 'Your B2B sales pipeline came through.',
        metric: 'customers',
        delta: ch.pipeline,
      },
      impact: ch.pipeline * price * CUSTOMER_MONTHS,
      short: 'business deals closed',
    });

  // --- Churn and its main cause.
  if (churned > 0) {
    const main = (Object.entries(churnBy) as [ChurnCause, number][]).sort(
      (a, b) => b[1] - a[1],
    )[0]![0];
    const rival = c.targetSegments.map((k) => m.segments[k]?.incumbentName).find(Boolean);
    const cause = c.hibernation
      ? 'Hibernating: nobody is selling or improving the product.'
      : main === 'reliability'
        ? `Reliability is only ${pct(reliability(c))}: outages and slow support.`
        : main === 'price' && priceSeg
          ? `Your price of ${fmt(c.price)} is above what ${priceSeg.name.toLowerCase()} will pay (${fmt(priceSeg.budget)}).`
          : main === 'competition'
            ? `${rival ?? 'Rivals'} offer${rival ? 's' : ''} a better deal.`
            : 'Normal churn for this market.';
    out.push({
      item: {
        tone: 'bad',
        text: `${plural(churned, 'customer')} left.`,
        cause,
        metric: 'customers',
        delta: -churned,
      },
      impact: churned * price * CUSTOMER_MONTHS * (main === 'normal' ? 0.8 : 1.3),
      short:
        main === 'reliability'
          ? 'outages drove customers away'
          : main === 'price'
            ? 'customers balked at the price'
            : main === 'competition'
              ? 'rivals won customers over'
              : 'customers drifted away',
    });
  }

  // --- Price changes.
  if (c.price !== prev.price) {
    const up = c.price > prev.price;
    out.push({
      item: {
        tone: 'neutral',
        text: `Price ${up ? 'up' : 'down'} from ${fmt(prev.price)} to ${fmt(c.price)}.`,
        cause: up
          ? 'Your decision: more per customer, but some will balk.'
          : 'Your decision: easier to win customers, less per customer.',
        metric: 'revenue',
        delta: c.price - prev.price,
      },
      impact: Math.abs(c.price - prev.price) * Math.max(1, totalCustomers(c)),
      short: up ? 'the price rise' : 'the price cut',
    });
  }

  // --- People: hires, departures, layoffs, output and morale.
  const nowIds = new Set(c.staff.map((s) => s.id));
  const before = new Set(prev.staffIds);
  const hired = c.staff.filter((s) => !before.has(s.id));
  const quitIds = new Set(departures.map((s) => s.id));
  const letGo = prev.staffIds.filter((id) => !nowIds.has(id) && !quitIds.has(id)).length;
  const output = outputOf(c, [...STAFF_ROLES]);
  const outDelta = prev.output > 0 ? output / prev.output - 1 : output > 0 ? 1 : 0;
  if (hired.length > 0) {
    const names = hired.map((s) => `${s.name} (${s.role})`).join(', ');
    out.push({
      item: {
        tone: 'good',
        text: `You hired ${names}.`,
        cause: `Team output ${outDelta >= 0 ? 'up' : 'down'} ${pct(outDelta)}; payroll up ${fmt(hired.reduce((a, s) => a + s.salary, 0))}.`,
        metric: 'product',
        delta: Math.round(outDelta * 100),
      },
      impact: hired.reduce((a, s) => a + s.salary, 0),
      short: 'new hires',
    });
  }
  if (departures.length > 0) {
    const pay = departures.reduce((a, s) => a + s.salary, 0);
    out.push({
      item: {
        tone: 'bad',
        text: `${departures.map((s) => s.name).join(', ')} quit.`,
        cause:
          c.finance.unpaidPayroll > 0
            ? 'Staff were not paid in full.'
            : c.hibernation
              ? 'Furlough pay pushed them out.'
              : 'Low morale: pay below market, overwork or fear for the company.',
        metric: 'morale',
        delta: -departures.length,
      },
      impact: pay * 2,
      short: departures.length > 1 ? 'people left' : 'a key person left',
    });
  }
  if (letGo > 0)
    out.push({
      item: {
        tone: 'neutral',
        text: `${plural(letGo, 'person', 'people')} let go.`,
        cause: 'Your layoff decision: lower payroll, lower output.',
        metric: 'burn',
        delta: -letGo,
      },
      impact: Math.abs(outDelta) * Math.max(1, pnl?.payroll ?? 0),
    });
  const morale = avgMorale(c);
  if (c.staff.length > 0 && prev.staffIds.length > 0 && morale - prev.morale <= -8)
    out.push({
      item: {
        tone: 'bad',
        text: `Team morale fell to ${morale}/100.`,
        cause:
          c.finance.unpaidPayroll > 0
            ? 'Staff were not paid in full.'
            : c.hibernation
              ? 'Furlough on reduced pay.'
              : isOverloaded(c)
                ? 'Too many people for the managers you have.'
                : 'Pay below market or fear the cash is running out.',
        metric: 'morale',
        delta: morale - prev.morale,
      },
      impact: (prev.morale - morale) * 0.02 * Math.max(1, pnl?.payroll ?? 0),
      short: 'morale slipped',
    });

  // --- Cost lines that moved.
  if (pnl && prevPnl) {
    const costs = pnl.payroll + pnl.founderSalary + pnl.office + pnl.marketing + pnl.cloud;
    const moves = (['payroll', 'founderSalary', 'office', 'marketing', 'cloud'] as const)
      .map((k) => ({ k, d: pnl[k] - prevPnl[k] }))
      .filter((x) => x.d !== 0 && Math.abs(x.d) >= costs * 0.05)
      .sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
    const top = moves[0];
    if (top) {
      const up = top.d > 0;
      const intended: Record<typeof top.k, number> = {
        payroll: payrollThisMonth(c),
        founderSalary: c.founderSalary * c.founderIds.length,
        office: officeRent(m, c),
        marketing: marketingSpend(c),
        cloud: cloudCost(m, c),
      };
      const short =
        top.k === 'payroll' ? c.finance.unpaidPayroll > 0 : pnl[top.k] < intended[top.k] * 0.98;
      const cause = short
        ? 'Cash ran short, so only part of it was paid.'
        : top.k === 'payroll'
          ? c.hibernation
            ? 'Hibernation: staff on furlough pay.'
            : up
              ? 'New hires or raises.'
              : 'Fewer people on the payroll.'
          : top.k === 'marketing'
            ? c.hibernation
              ? 'Hibernation paused marketing.'
              : c.marketingBudget !== prev.marketingBudget
                ? `You set marketing to ${fmt(c.marketingBudget)} a month.`
                : up
                  ? 'Cash came in, so the full budget was spent.'
                  : 'Your marketing budget.'
            : top.k === 'office'
              ? c.officeDownsized && !up
                ? 'You moved to a smaller office.'
                : up
                  ? 'Desks for a bigger team.'
                  : 'Fewer desks.'
              : top.k === 'cloud'
                ? up
                  ? 'More customers to serve, priced in dollars.'
                  : 'Fewer customers to serve.'
                : 'Your founder pay decision.';
      out.push({
        item: {
          tone: short || up ? 'bad' : 'good',
          text: `${COST_LABEL[top.k]} ${up ? 'rose' : 'fell'} by ${fmt(Math.abs(top.d))}.`,
          cause,
          metric: 'burn',
          delta: top.d,
        },
        impact: Math.abs(top.d),
        short: short
          ? 'cash ran short'
          : up
            ? `${COST_LABEL[top.k]!.toLowerCase()} rose`
            : 'costs came down',
      });
    }
  }

  // --- Loans.
  if (pnl && pnl.interest > 0)
    out.push({
      item: {
        tone: 'neutral',
        text: `Loan repayments took ${fmt(pnl.interest)}.`,
        cause: `${plural(c.finance.loans.length, 'loan')} still outstanding.`,
        metric: 'cash',
        delta: -pnl.interest,
      },
      impact: pnl.interest * 0.5,
    });

  // --- Stars and the news behind them.
  const h = c.stars.history;
  const starDelta =
    h.length >= 2 ? Math.round((h[h.length - 1]! - h[h.length - 2]!) * 100) / 100 : 0;
  if (Math.abs(starDelta) >= 0.05) {
    const story = m.news.find(
      (n) =>
        n.month === month &&
        n.subject.kind === 'company' &&
        n.subject.id === c.id &&
        n.starDelta !== 0,
    );
    out.push({
      item: {
        tone: starDelta > 0 ? 'good' : 'bad',
        text: `Stars ${starDelta > 0 ? 'up' : 'down'} ${Math.abs(starDelta).toFixed(2)} to ${c.stars.value.toFixed(1)}.`,
        cause: story
          ? `“${story.headline}” (${story.outletName}).`
          : starDelta > 0
            ? 'Your results are pulling your rating up.'
            : 'Your results are pulling your rating down.',
        metric: 'stars',
        delta: starDelta,
      },
      impact: Math.abs(starDelta) * Math.max(price * 10, pnl?.revenue ?? 0),
      short: starDelta > 0 ? 'your rating rose' : 'your rating fell',
    });
  }

  // --- Hibernation and the payroll crisis.
  if (c.hibernation)
    out.push({
      item: {
        tone: 'neutral',
        text: 'Hibernating: staff on furlough pay, product frozen.',
        cause: 'Your decision to cut burn and buy time.',
        metric: 'burn',
      },
      impact: (pnl?.payroll ?? 0) * 0.5 + 1,
      short: 'hibernation is buying time',
    });
  if (c.finance.unpaidPayroll > 0)
    out.push({
      item: {
        tone: 'bad',
        text:
          c.distress?.level === 'critical'
            ? 'One more missed payroll ends the company.'
            : `Staff are owed ${fmt(c.finance.unpaidPayroll)} in unpaid wages.`,
        cause: 'Cash ran out before payroll.',
        metric: 'cash',
        delta: -c.finance.unpaidPayroll,
      },
      impact: Number.MAX_SAFE_INTEGER,
      short: 'payroll was missed',
    });

  // --- Rank, trim and pad.
  out.sort((a, b) => b.impact - a.impact);
  const top = out.slice(0, STORY_MAX_ITEMS);
  const cash = account(world, c.account).balance;
  const pads: StoryItem[] = [
    {
      tone: 'neutral',
      text: `${plural(totalCustomers(c), 'paying customer')} now.`,
      cause: 'Where your customer base stands.',
      metric: 'customers',
    },
    {
      tone: pnl && pnl.net >= 0 ? 'good' : 'neutral',
      text:
        pnl && pnl.net >= 0
          ? `Cash grew by ${fmt(pnl.net)}.`
          : `Burn was ${fmt(Math.max(0, -(pnl?.net ?? 0)))} this month.`,
      cause: pnl && pnl.net >= 0 ? 'Revenue covered your costs.' : 'Costs were above revenue.',
      metric: 'burn',
      delta: pnl?.net ?? 0,
    },
    {
      tone: 'neutral',
      text: `Product fit is ${pct(c.product.fit)}, quality ${pct(c.product.quality)}.`,
      cause: c.hibernation
        ? 'Product work is frozen.'
        : 'Building and customer discovery move these.',
      metric: 'product',
    },
    {
      tone: 'neutral',
      text: `Cash at month end: ${fmt(cash)}.`,
      cause: 'After every bill was paid.',
      metric: 'cash',
    },
  ];
  const items = top.map((x) => x.item);
  for (const p of pads) {
    if (items.length >= STORY_MIN_ITEMS) break;
    if (!items.some((i) => i.metric === p.metric)) items.push(p);
  }
  for (const p of pads) {
    if (items.length >= STORY_MIN_ITEMS) break;
    if (!items.includes(p)) items.push(p);
  }

  return {
    month,
    headline: headline(c, pnl, prevPnl, top, fmt),
    items,
    next: nextMoves(world, c, ch, churnBy, priceSeg, departures.length > 0, fmt),
  };
}

function headline(
  c: Company,
  pnl: MonthlyPnl | undefined,
  prevPnl: MonthlyPnl | undefined,
  ranked: Candidate[],
  fmt: (v: number) => string,
): string {
  if (c.distress?.level === 'critical') return `${c.name} is one missed payroll from closing`;
  const rev = pnl?.revenue ?? 0;
  const prevRev = prevPnl?.revenue ?? 0;
  // Revenue moves are explained by customers and price first, then anything else.
  const revenueFirst = [
    ...ranked.filter((x) => x.item.metric === 'customers' || x.item.metric === 'revenue'),
    ...ranked,
  ];
  const good = revenueFirst.find(
    (x) => (x.item.tone === 'good' || x.item.metric === 'revenue') && x.short,
  )?.short;
  const bad = revenueFirst.find(
    (x) => (x.item.tone === 'bad' || x.item.metric === 'revenue') && x.short,
  )?.short;
  const any = revenueFirst.find((x) => x.short)?.short;
  if (rev === 0)
    return c.hibernation
      ? 'Hibernating: burn is down, the product is on hold'
      : `Still pre-revenue: product fit at ${pct(c.product.fit)}`;
  if (prevRev === 0) return `First revenue: ${fmt(rev)} this month${good ? `, as ${good}` : ''}`;
  const change = rev / prevRev - 1;
  if (change >= 0.02) return `Revenue up ${pct(change)}${good ? `: ${good}` : ''}`;
  if (change <= -0.02) return `Revenue down ${pct(change)}${bad ? `: ${bad}` : ''}`;
  return `Revenue flat at ${fmt(rev)}${any ? `: ${any}` : ''}`;
}

function nextMoves(
  world: World,
  c: Company,
  ch: { marketing: number; outreach: number; wordOfMouth: number; pipeline: number },
  churnBy: Record<ChurnCause, number>,
  priceSeg: { name: string; budget: number } | null,
  departures: boolean,
  fmt: (v: number) => string,
): StoryAction[] {
  const m = getMarket(world, c.market);
  const companyId = c.id;
  const level = c.distress?.level ?? null;
  const spend = marketingSpend(c);
  const burn = projectedBurn(world, c);
  const cash = account(world, c.account).balance;
  const monthsLeft = burn > 0 ? cash / burn : Infinity;
  const revenue = lastPnl(c)?.revenue ?? 0;
  const moves: StoryAction[] = [];
  const add = (a: StoryAction) => {
    if (moves.length < STORY_MAX_NEXT && !moves.some((x) => x.label === a.label)) moves.push(a);
  };

  if (level === 'danger' || level === 'critical')
    add({
      label: 'Open the rescue plan',
      why:
        level === 'critical'
          ? 'One more missed payroll ends the company.'
          : 'Cash is running out. Act this month.',
      place: 'office',
    });
  if (level && spend > 0)
    add({
      label: 'Pause marketing',
      why: `Saves ${fmt(spend)} a month while cash is tight.`,
      place: 'office',
      command: { type: 'company.cutCosts', companyId, marketing: 0 },
    });
  const churnTotal = Object.values(churnBy).reduce((a, b) => a + b, 0);
  if (churnBy.reliability > churnTotal / 2 && c.product.buildMode !== 'quality' && !c.hibernation)
    add({
      label: 'Switch to quality mode',
      why: 'Outages are costing you customers.',
      place: 'office',
      command: { type: 'company.strategy', companyId, buildMode: 'quality' },
    });
  if (
    priceSeg &&
    churnBy.price > churnTotal / 3 &&
    priceSeg.budget > 0 &&
    priceSeg.budget < c.price
  )
    add({
      label: `Lower your price to ${fmt(priceSeg.budget)}`,
      why: `${priceSeg.name} won’t pay ${fmt(c.price)}.`,
      place: 'office',
      command: { type: 'company.strategy', companyId, price: priceSeg.budget },
    });
  if (
    !level &&
    spend > 0 &&
    ch.marketing > 0 &&
    ch.marketing * c.price * 8 > spend &&
    monthsLeft > 9
  ) {
    const more = Math.round((c.marketingBudget * 1.5) / 100) * 100;
    add({
      label: `Raise marketing to ${fmt(more)}`,
      why: `${fmt(spend)} brought in ${plural(ch.marketing, 'customer')} who pay back fast.`,
      place: 'office',
      command: { type: 'company.strategy', companyId, marketingBudget: more },
    });
  }
  const target = c.targetSegments[0];
  const seg = target ? m.segments[target] : undefined;
  if (totalCustomers(c) === 0 && seg && (c.product.discovery[seg.key] ?? 0) < 0.5)
    add({
      label: `Talk to ${seg.name.toLowerCase()} at the market`,
      why: 'Learn what they need before building more.',
      place: 'market',
      command: { type: 'company.discovery', companyId, segmentKey: seg.key },
    });
  if (monthsLeft < 9 && revenue > 0)
    add({
      label: 'Ask a lender for working capital',
      why: 'Revenue can back a loan; it buys time.',
      place: 'bank',
    });
  if (monthsLeft < 9 && !c.bannedFromRaising)
    add({
      label: 'Pitch investors',
      why: 'Raising takes months. Start before cash runs low.',
      place: 'investors',
    });
  if (isOverloaded(c))
    add({
      label: 'Hire a senior manager',
      why: 'Too many people per manager hurts morale.',
      place: 'hub',
    });
  if (departures)
    add({
      label: 'Check pay against the market',
      why: 'People are leaving. Raises cost less than replacing them.',
      place: 'office',
    });
  if (moves.length === 0)
    add(
      totalCustomers(c) > 0
        ? { label: 'Hire to grow', why: 'More people serve and win more customers.', place: 'hub' }
        : {
            label: 'Build the product',
            why: 'Fit and quality win the first customers.',
            place: 'office',
            command: { type: 'company.build', companyId, hours: 40 },
          },
    );
  return moves;
}
