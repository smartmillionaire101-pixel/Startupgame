/**
 * City places (data/places.ts), switched on by `PLACES_NOTE`.
 *
 * Every city's prominent buildings are named places with a purpose. Who may
 * go in depends on the place:
 *
 * - Public institutions are open to everyone in town.
 * - Members' places open when any one of their gates holds (a role, a
 *   company, a lifestyle tier, a reputation, an investor career level, a
 *   job), and say why not and what opens them.
 * - Government offices see residents by appointment. `place.book` books the
 *   next free slot on the game clock (office hours, a few hours to a day
 *   ahead, drawn on its own RNG label) and sends an inbox note. You can go
 *   in from that time until a game month later, when it lapses.
 *
 * Inside, `place.use` does something modest with existing systems:
 * compliance filings (company.ts `comply`, in person at half the hours), a
 * fund manager licence (LP credibility, read by `lp.pitch`), an investment
 * incentive paid by the state through the ledger, a business visa (flights
 * to that city stop counting against the monthly limit), network, skills,
 * health and needs. Fees go to the city's tax or supplier accounts.
 *
 * The feedback round (`feedbackOn`) adds more to each place (`PlaceSpec.more`):
 * a public consultation, a policy-rate briefing, the Chamber's members'
 * directory and the Embassy's trade attaché (sales leads), watching a case
 * at the High Court, the Tax Office's filing check and clinic, visiting
 * investor delegations, peer feedback, the members' club's angels, LP
 * meetings, a doctor when you're unwell, a careers fair (graduates for an
 * open role) and a guest lecture. Worlds without the note see none of them.
 *
 * The game clock: a market's month is `m.month`, and the time inside it is
 * how far the real clock is through the current period (`m.settledAt`,
 * `m.monthMs`), as 30 days of 24 hours. An extra month from the dev tools
 * moves the clock a whole month on.
 */
import { LEGACY_MONTH_MS, periodOf, periodStart } from './clock.js';
import { comply } from './company.js';
import { type MarketId } from './data/markets.js';
import {
  CITY_PLACES,
  PLACE_ROLES,
  PLACE_SPECS,
  PLACES,
  SERVICE_SPECS,
  type PlaceGate,
  type PlaceRole,
  type PlaceService,
} from './data/places.js';
import { rulesFor, type RuleCard } from './data/rules.js';
import { LIFESTYLE_TIERS, SKILLS, type Skill } from './data/characters.js';
import { ensure, fail } from './errors.js';
import { col, getMarket, locationOf, notify, spendHours } from './helpers.js';
import { account, payExact, transfer } from './ledger.js';
import { applyBars, barsApply, healthOf } from './lifebars.js';
import { scale } from './money.js';
import { bumpNeed } from './needs.js';
import { COURT_CASES, CONSULTATIONS, TAX_QA } from './data/errands.js';
import {
  addNetwork,
  addSkill,
  foundedIn,
  investorsToMeet,
  learnFromCustomers,
  meetInvestors,
  salesLeadsFor,
} from './errands.js';
import { HIRING, sourceCandidates } from './hiring.js';
import { bankersOn, feedbackOn } from './releases.js';
import { deriveRng } from './rng.js';
import { WORK } from './work.js';
import type {
  Company,
  MarketState,
  PlaceAppointment,
  Player,
  PlayerPlaces,
  World,
} from './types.js';

// ---------------------------------------------------------------- The game clock

export const DAY_MIN = 24 * 60;
export const MONTH_MIN = 30 * DAY_MIN;

/** Game minutes since the market opened: whole months, plus how far into this one. */
export function gameMinute(m: MarketState, now: number): number {
  const monthMs = m.monthMs ?? LEGACY_MONTH_MS;
  // The period the market last settled into (a market opens mid-period: its
  // `settledAt` is the opening time, so the clock starts at that period's start).
  const start = periodStart(periodOf(m.settledAt ?? now, monthMs), monthMs);
  const into = Math.min(Math.max((now - start) / monthMs, 0), 1 - 1e-9);
  // Dev tools can run a test world's clock ahead, up to the month's last minute.
  const min = Math.min(Math.floor(into * MONTH_MIN) + (m.devClockMin ?? 0), MONTH_MIN - 1);
  return m.month * MONTH_MIN + min;
}

/** A game minute as the client shows it (market month, day 1–30, hour, minute). */
export function whenOf(min: number) {
  const inMonth = ((min % MONTH_MIN) + MONTH_MIN) % MONTH_MIN;
  return {
    month: Math.floor(min / MONTH_MIN),
    day: Math.floor(inMonth / DAY_MIN) + 1,
    hour: Math.floor((inMonth % DAY_MIN) / 60),
    minute: inMonth % 60,
  };
}
export type GameWhen = ReturnType<typeof whenOf>;

const label = (w: GameWhen) =>
  `day ${w.day} of month ${(w.month % 12) + 1}, ${String(w.hour).padStart(2, '0')}:${String(w.minute).padStart(2, '0')}`;

// ---------------------------------------------------------------- Places

export const placeId = (market: MarketId, role: PlaceRole) => `${market}:${role}`;

export interface CityPlace {
  id: string;
  market: MarketId;
  role: PlaceRole;
  name: string;
  district: string;
  street?: string;
}

/** A city's places, in role order. */
export function cityPlaces(market: MarketId): CityPlace[] {
  const rows = CITY_PLACES[market];
  if (!rows) return [];
  return PLACE_ROLES.map((role) => {
    const [name, district, street] = rows[role];
    return {
      id: placeId(market, role),
      market,
      role,
      name,
      district,
      ...(street ? { street } : {}),
    };
  });
}

export function findPlace(id: string): CityPlace | null {
  const [market, role] = id.split(':') as [MarketId, PlaceRole];
  if (!CITY_PLACES[market] || !PLACE_SPECS[role]) return null;
  return cityPlaces(market).find((p) => p.role === role) ?? null;
}

function placesOf(p: Player): PlayerPlaces {
  return (p.places ??= { appointments: [], booked: 0, used: {} });
}

/** The highest investor career level reached (0 = none). */
const careerLevel = (p: Player): number =>
  Math.max(0, ...Object.keys(p.career?.reached ?? {}).map(Number));

/** Your active companies (as a founder), in this city. */
function companiesIn(world: World, p: Player, market: MarketId): Company[] {
  return p.companyIds
    .map((id) => world.companies[id])
    .filter(
      (c): c is Company =>
        !!c && c.status === 'active' && c.market === market && c.founderIds.includes(p.id),
    );
}

function gateHolds(world: World, p: Player, g: PlaceGate): boolean {
  switch (g.kind) {
    case 'role':
      return g.roles.includes(p.role);
    case 'company':
      return p.companyIds.some((id) => world.companies[id]?.status === 'active');
    case 'lifestyle':
      return p.lifestyleTier >= g.min;
    case 'stars':
      return p.stars.value >= g.min;
    case 'rung':
      return careerLevel(p) >= g.min;
    case 'job':
      return !!p.job?.profession && g.professions.includes(p.job.profession);
  }
}

export type AppointmentStatus = 'booked' | 'due' | 'lapsed';

function appointmentStatus(a: PlaceAppointment, nowMin: number): AppointmentStatus {
  if (nowMin < a.at) return 'booked';
  return nowMin < a.at + MONTH_MIN ? 'due' : 'lapsed';
}

/** Your appointment at a place that hasn't lapsed (booked or due), if any. */
function liveAppointment(p: Player, place: CityPlace, nowMin: number) {
  return (p.places?.appointments ?? []).find(
    (a) => a.placeId === place.id && appointmentStatus(a, nowMin) !== 'lapsed',
  );
}

/**
 * May you go in now? `why` (when not) is a code the client words:
 * away (not in this city), members (a gate: `refusal` / `unlock`),
 * resident (government sees residents), appointment (book one),
 * early (your appointment is later).
 */
export function placeAccess(world: World, p: Player, place: CityPlace, now: number) {
  const spec = PLACE_SPECS[place.role];
  const m = getMarket(world, place.market);
  const nowMin = gameMinute(m, now);
  if (locationOf(p) !== place.market) return { ok: false, why: 'away' as const };
  if (
    spec.access === 'members' &&
    !(spec.gates ?? []).some((g) => gateHolds(world, p, g)) &&
    // Bankers note: bankers go to the Founders' Hub to meet founders (bankwork.ts).
    !(place.role === 'tech-hub' && p.role === 'banker' && bankersOn(world))
  )
    return { ok: false, why: 'members' as const };
  if (spec.access === 'appointment') {
    if (p.market !== place.market) return { ok: false, why: 'resident' as const };
    const appt = liveAppointment(p, place, nowMin);
    if (!appt) return { ok: false, why: 'appointment' as const };
    if (appointmentStatus(appt, nowMin) === 'booked')
      return { ok: false, why: 'early' as const, at: appt.at };
  }
  return { ok: true as const, why: null };
}

// ---------------------------------------------------------------- Booking

/** The slot for a new appointment: office hours, a few hours to a day ahead. */
function slotFor(world: World, p: Player, place: CityPlace, nowMin: number): number {
  const rng = deriveRng(world.seed, 'places', 'appointment', p.id, place.id, placesOf(p).booked);
  const [lo, hi] = PLACES.leadHours;
  let at = Math.ceil((nowMin + rng.int(lo, hi) * 60) / 60) * 60;
  const hour = Math.floor((at % DAY_MIN) / 60);
  const dayStart = at - (at % DAY_MIN);
  if (hour < PLACES.officeOpen) at = dayStart + PLACES.officeOpen * 60;
  else if (hour >= PLACES.officeClose)
    at = dayStart + DAY_MIN + (PLACES.officeOpen + rng.int(0, 2)) * 60;
  return at;
}

export function bookAppointment(world: World, p: Player, id: string, now: number) {
  const place = findPlace(id);
  ensure(place, 'place.missing', 'That place isn’t in town.');
  const spec = PLACE_SPECS[place.role];
  ensure(spec.access === 'appointment', 'place.walkin', 'No appointment needed: just go in.');
  ensure(
    p.market === place.market,
    'place.resident',
    'Government offices see residents of the city by appointment.',
  );
  const m = getMarket(world, place.market);
  const nowMin = gameMinute(m, now);
  const mine = placesOf(p);
  const existing = liveAppointment(p, place, nowMin);
  ensure(!existing, 'place.booked', 'You already have an appointment there.');
  ensure(
    mine.appointments.filter((a) => appointmentStatus(a, nowMin) === 'booked').length <
      PLACES.maxBooked,
    'place.limit',
    `You have ${PLACES.maxBooked} appointments booked. Go to one first.`,
  );
  const at = slotFor(world, p, place, nowMin);
  mine.booked += 1;
  const appt: PlaceAppointment = { placeId: place.id, market: place.market, at, bookedAt: nowMin };
  mine.appointments = [
    appt,
    ...mine.appointments.filter((a) => appointmentStatus(a, nowMin) !== 'lapsed'),
  ].slice(0, 8);
  const when = whenOf(at);
  notify(world, p.id, {
    month: m.month,
    kind: 'meeting',
    text: `Appointment confirmed at ${place.name}: ${label(when)}. Go in person from then; it lapses after a month.`,
  });
  return {
    appointment: { placeId: place.id, at, when },
    message: `Booked: ${place.name}, ${label(when)}.`,
  };
}

// ---------------------------------------------------------------- Services

/** The compliance rules a filing service covers, for a company. */
function rulesOf(service: PlaceService, c: Company): RuleCard[] {
  const end = (id: string, ...suffixes: string[]) => suffixes.some((s) => id.endsWith(`.${s}`));
  const rules = rulesFor(c.market, c.industry);
  switch (service) {
    case 'tax-registration':
      return rules.filter((r) => end(r.id, 'tax-registration'));
    case 'notarise':
      return rules.filter((r) => end(r.id, 'founder-agreements'));
    case 'payments-licence':
      return rules.filter((r) => end(r.id, 'payments-licence', 'emi-licence'));
    case 'one-stop':
      return rules.filter((r) => end(r.id, 'data-protection', 'employment'));
    default:
      return [];
  }
}
const FILINGS: ReadonlySet<PlaceService> = new Set([
  'tax-registration',
  'notarise',
  'payments-licence',
  'one-stop',
]);

/** What a place does: its services, and from the feedback note what `more` it has. */
export const servicesOf = (world: World, role: PlaceRole): readonly PlaceService[] => {
  const spec = PLACE_SPECS[role];
  return feedbackOn(world) && spec.more ? [...spec.services, ...spec.more] : spec.services;
};

/** The open role a careers fair fills: your company's first with CVs still to read. */
function fairRole(c: Company) {
  return (
    (c.hiring?.roles ?? []).find((r) => r.status === 'open' && r.sourced < HIRING.maxSources) ??
    null
  );
}

const usedKey = (place: CityPlace, s: PlaceService, extra?: string) =>
  `${place.id}:${s}${extra ? `:${extra}` : ''}`;

/** A visa still good this home month. */
export function hasVisa(world: World, p: Player, to: MarketId): boolean {
  const issued = p.places?.visas?.[to];
  return issued !== undefined && getMarket(world, p.market).month - issued < PLACES.visaMonths;
}

export interface ServiceArgs {
  companyId?: string;
  to?: MarketId;
  /** A public consultation: your vote. */
  vote?: 'for' | 'against';
}

/** What a service would do for you here and now, or why it can't (no side effects). */
function serviceCheck(
  world: World,
  p: Player,
  place: CityPlace,
  service: PlaceService,
  args: ServiceArgs = {},
): {
  ok: boolean;
  reason: string | null;
  hours: number;
  /** The fee: yours (personal), or the company's for a filing. */
  fee: number;
  company: Company | null;
  rule: RuleCard | null;
} {
  const spec = SERVICE_SPECS[service];
  const m = getMarket(world, place.market);
  const home = getMarket(world, p.market);
  const mine = p.places;
  let fee = spec.feeCol ? scale(col(m), spec.feeCol) : 0;
  let hours: number = spec.hours;
  let company: Company | null = null;
  let rule: RuleCard | null = null;
  const out = (reason: string | null) => ({ ok: !reason, reason, hours, fee, company, rule });

  if (FILINGS.has(service) || service === 'incentive' || service === 'careers-fair') {
    const list = companiesIn(world, p, place.market);
    company = (args.companyId ? list.find((c) => c.id === args.companyId) : list[0]) ?? null;
    if (!company) return out('You need a company in this city.');
  }
  if (FILINGS.has(service)) {
    const rules = rulesOf(service, company!);
    if (!rules.length) return out('That filing doesn’t apply to your company.');
    rule = rules.find((r) => !company!.compliance[r.id]) ?? null;
    if (!rule) return out('Already filed.');
    // In person: half the rule's hours. Its cost comes from the company (`comply`).
    hours = Math.ceil(rule.hours / 2);
    fee = scale(col(m), rule.costCol);
    if (account(world, company!.account).balance < fee)
      return out('Your company can’t pay the filing fee.');
  }
  if (spec.once === 'month' && mine?.used[usedKey(place, service)] === home.month)
    return out('Done this month. Come back next month.');
  if (service === 'fund-licence') {
    if (!p.investor) return out('For investors who manage money.');
    if (mine?.used[usedKey(place, service)] !== undefined) return out('You hold the licence.');
  }
  if (service === 'incentive' && mine?.used[usedKey(place, service, company!.id)] !== undefined)
    return out('Your company has had its incentive.');
  if (service === 'careers-fair' && !fairRole(company!))
    return out('Open a role on the Hiring screen first.');
  if (service === 'lp-meetings' && !p.investor) return out('For investors who manage money.');
  if (service === 'sick-care' && healthOf(p) >= PLACES.more.unwell)
    return out('You’re well. Come in when you’re unwell.');
  if (service === 'visa') {
    if (!args.to) return out('Pick where you want a visa for.');
    if (args.to === p.market || !world.markets[args.to]) return out('Pick another open city.');
    if (hasVisa(world, p, args.to)) return out('You hold a visa for there.');
  }
  if (p.hours.available - p.hours.used < hours) return out('Not enough hours left this month.');
  const purse = account(world, p.accounts.local);
  if (fee && !FILINGS.has(service) && purse.currency === m.data.currency && purse.balance < fee)
    return out('Not enough money.');
  return out(null);
}

const network = (p: Player, n: number) => {
  p.network = Math.max(p.network, Math.min(100, p.network + n));
  return n;
};
const skillUp = (p: Player, s: Skill) => {
  const before = p.skills[s] ?? 0;
  if (before < WORK.skillCap) p.skills[s] = Math.min(WORK.skillCap, before + PLACES.skill);
  return (p.skills[s] ?? 0) - before;
};

/** Do something at a place you're inside (`place.use`). */
export function useService(
  world: World,
  p: Player,
  id: string,
  service: PlaceService,
  args: ServiceArgs,
  now: number,
) {
  const place = findPlace(id);
  ensure(place, 'place.missing', 'That place isn’t in town.');
  const spec = PLACE_SPECS[place.role];
  ensure(
    servicesOf(world, place.role).includes(service),
    'place.service',
    'They don’t do that here.',
  );
  const access = placeAccess(world, p, place, now);
  if (!access.ok)
    switch (access.why) {
      case 'away':
        return fail('place.away', `${place.name} is in another city.`);
      case 'members':
        return fail('place.members', spec.refusal ?? 'Members only.');
      case 'resident':
        return fail('place.resident', 'Government offices see residents of the city.');
      case 'appointment':
        return fail('place.appointment', 'By appointment only. Book one first.');
      case 'early':
        return fail(
          'place.early',
          `Your appointment is at ${label(whenOf(access.at!))}. Come back then.`,
        );
    }
  const check = serviceCheck(world, p, place, service, args);
  ensure(check.ok, 'place.service', check.reason ?? 'Not now.');
  const m = getMarket(world, place.market);
  const home = getMarket(world, p.market);
  const sspec = SERVICE_SPECS[service];
  if (check.hours) spendHours(p, check.hours, sspec.label);
  const ext =
    service === 'club-dinner' ||
    service === 'check-up' ||
    service === 'meet-members' ||
    service === 'sick-care'
      ? 'suppliers'
      : 'tax';
  if (check.fee && !FILINGS.has(service))
    payExact(
      world,
      p.accounts.local,
      m.ext[ext],
      check.fee,
      `${sspec.label}: ${place.name}`,
      m.month,
    );
  const mine = placesOf(p);
  mine.used[usedKey(place, service)] = home.month;
  // Going in to a government office keeps the appointment (more filings can follow).
  const nowMin = gameMinute(m, now);
  const appt = liveAppointment(p, place, nowMin);
  if (appt) appt.attended = true;
  const fx: Record<string, number> = {};
  const extra: Record<string, unknown> = {};
  let message: string;
  switch (service) {
    case 'tax-registration':
    case 'notarise':
    case 'payments-licence':
    case 'one-stop': {
      comply(world, check.company!, check.rule!.id, m.month);
      message = `Filed in person: ${check.rule!.title} for ${check.company!.name}.`;
      break;
    }
    case 'fund-licence': {
      const inv = p.investor!;
      inv.lpCredibility = Math.min(1, inv.lpCredibility + PLACES.licenceCredibility);
      fx.lpCredibility = PLACES.licenceCredibility;
      message = 'Licensed: you can tell LPs you are a licensed fund manager.';
      break;
    }
    case 'incentive': {
      const c = check.company!;
      const amount = scale(col(m), PLACES.incentiveCol);
      transfer(world, m.ext.tax, c.account, amount, `Investment incentive: ${place.name}`, m.month);
      mine.used[usedKey(place, service, c.id)] = home.month;
      fx.cash = amount;
      message = `${c.name} received an investment incentive.`;
      break;
    }
    case 'visa': {
      (mine.visas ??= {})[args.to!] = home.month;
      message = `Business visa issued for ${getMarket(world, args.to!).data.name}: flights there don’t count against your monthly limit for a year.`;
      break;
    }
    case 'roundtable':
    case 'mixer':
    case 'demo-night':
    case 'principals':
    case 'club-dinner': {
      fx.network = network(p, PLACES.network[service]);
      if (service === 'principals') fx.investing = skillUp(p, 'investing');
      if (service === 'club-dinner') {
        fx.social = bumpNeed(p, 'social', PLACES.dinner.social);
        fx.fun = bumpNeed(p, 'fun', PLACES.dinner.fun);
      }
      message = `${sspec.label} at ${place.name}: you met people worth knowing.`;
      break;
    }
    case 'mentor':
      fx.product = skillUp(p, 'product');
      message = 'Your mentor went through your product, line by line.';
      break;
    case 'floor-briefing':
      fx.investing = skillUp(p, 'investing');
      message = 'A morning on the trading floor: you read the market better.';
      break;
    case 'evening-class': {
      const weakest = [...SKILLS].sort((a, b) => (p.skills[a] ?? 0) - (p.skills[b] ?? 0))[0]!;
      fx[weakest] = skillUp(p, weakest);
      message = 'An evening class: your weakest skill is a little stronger.';
      break;
    }
    case 'check-up': {
      if (barsApply(world, p)) Object.assign(fx, applyBars(p, PLACES.checkUp));
      message = 'A clean bill of health.';
      break;
    }
    default: {
      const more = moreService(world, p, place, service, args);
      Object.assign(fx, more.fx);
      Object.assign(extra, more.out);
      message = more.message;
    }
  }
  return {
    message,
    service,
    placeId: place.id,
    effects: fx,
    hours: check.hours,
    fee: check.fee,
    ...extra,
  };
}

/**
 * The feedback round's services (`PlaceSpec.more`). Draws come from the
 * 'places' RNG label keyed by the service, the player and the month, so
 * nothing else's draws shift.
 */
function moreService(
  world: World,
  p: Player,
  place: CityPlace,
  service: PlaceService,
  args: ServiceArgs,
): { fx: Record<string, number>; out: Record<string, unknown>; message: string } {
  const m = getMarket(world, place.market);
  const month = m.month;
  const rng = deriveRng(world.seed, 'places', service, p.id, place.id, month);
  const company = foundedIn(world, p, place.market)[0];
  const fx: Record<string, number> = {};
  const out: Record<string, unknown> = {};
  const M = PLACES.more;
  switch (service) {
    case 'consultation': {
      const c = CONSULTATIONS[month % CONSULTATIONS.length]!;
      const vote = args.vote ?? 'for';
      // How the city's other voices split (seeded), and where your vote leaves it.
      const forPct = Math.round(rng.range(30, 70));
      fx.network = addNetwork(p, M.network);
      out.consultation = { id: c.id, proposal: c.proposal, vote, forPct };
      return { fx, out, message: `You voted ${vote} the proposal: ${c.proposal}` };
    }
    case 'rate-briefing': {
      fx.finance = addSkill(p, 'finance', PLACES.skill);
      out.rateBps = m.data.baseRateBps;
      return { fx, out, message: `The policy rate is ${(m.data.baseRateBps / 100).toFixed(2)}%.` };
    }
    case 'directory':
    case 'trade-attache': {
      const leads = company
        ? salesLeadsFor(
            world,
            company,
            rng,
            service === 'directory' ? rng.int(...M.directoryLeads) : 1,
            service === 'trade-attache' ? M.exportBudget : 1,
          )
        : [];
      fx.network = addNetwork(p, M.network);
      out.leads = leads;
      return {
        fx,
        out,
        message: leads.length
          ? `New leads: ${leads.map((l) => l.name).join(', ')}.`
          : 'You met people worth knowing.',
      };
    }
    case 'watch-case': {
      const c = rng.pick(COURT_CASES);
      fx.negotiation = addSkill(p, 'negotiation', PLACES.skill);
      out.case = c;
      return { fx, out, message: `${c.title}. ${c.ruling}` };
    }
    case 'filing-check': {
      const registered = company
        ? rulesFor(company.market, company.industry)
            .filter((r) => r.id.endsWith('.tax-registration'))
            .every((r) => company.compliance[r.id])
        : null;
      const last = company?.finance.history[company.finance.history.length - 1];
      out.check = {
        company: company?.name ?? null,
        registered,
        taxPaid: last?.tax ?? null,
        rate: m.data.tax.corporate,
      };
      if (barsApply(world, p)) Object.assign(fx, applyBars(p, { stress: M.checkStress }));
      return { fx, out, message: 'Your filings are checked.' };
    }
    case 'tax-clinic': {
      const qa = rng.pick(TAX_QA);
      fx.finance = addSkill(p, 'finance', PLACES.skill);
      out.qa = qa;
      return { fx, out, message: `${qa.q} ${qa.a}` };
    }
    case 'delegation':
    case 'meet-members': {
      const met = meetInvestors(
        world,
        p,
        investorsToMeet(world, place.market, {
          angels: service === 'meet-members',
          visiting: service === 'delegation',
        }),
        M.meet,
        M.warmth,
        month,
        rng,
      );
      fx.network = addNetwork(p, M.network);
      out.met = met;
      return {
        fx,
        out,
        message: met.length
          ? `You met ${met.map((x) => `${x.name} (${x.org})`).join(' and ')}.`
          : 'Nobody new this time.',
      };
    }
    case 'peer-feedback': {
      const learned = company ? learnFromCustomers(world, company, M.peerDiscovery) : null;
      fx.product = addSkill(p, 'product', 1);
      out.learned = learned ? { company: company!.name, ...learned } : null;
      return { fx, out, message: 'Other founders went through what you’re building.' };
    }
    case 'lp-meetings': {
      const inv = p.investor!;
      const before = inv.lpCredibility;
      inv.lpCredibility = Math.min(1, before + M.lpCredibility);
      fx.lpCredibility = Math.round((inv.lpCredibility - before) * 1000) / 1000;
      fx.network = addNetwork(p, 2);
      return { fx, out, message: 'You met the family offices’ LPs.' };
    }
    case 'sick-care': {
      if (barsApply(world, p))
        Object.assign(fx, applyBars(p, { health: M.care.health, stress: M.care.stress }));
      const e = p.energy;
      p.energy = Math.min(100, e + M.care.energy);
      fx.energy = Math.round(p.energy - e);
      return { fx, out, message: 'The doctor saw you: rest, and you’ll be fine.' };
    }
    case 'careers-fair': {
      const c = foundedIn(world, p, place.market)[0]!;
      const role = fairRole(c)!;
      const r = sourceCandidates(world, c, p, role.id, month);
      out.candidates = r.candidateIds.length;
      out.role = role.role;
      return { fx, out, message: `${r.candidateIds.length} graduates applied.` };
    }
    case 'guest-lecture':
    default: {
      fx.leadership = addSkill(p, 'leadership', PLACES.skill);
      fx.network = addNetwork(p, M.network);
      return { fx, out, message: 'A guest lecture by a founder who built something big.' };
    }
  }
}

// ---------------------------------------------------------------- The view

const LIFESTYLE_NAME = (tier: number) => LIFESTYLE_TIERS.find((t) => t.tier === tier)?.name ?? '';

/** The places of a city as a player sees them (`market.cityPlaces`). */
export function cityPlacesView(world: World, p: Player, m: MarketState, now: number) {
  const nowMin = gameMinute(m, now);
  return {
    now: whenOf(nowMin),
    places: cityPlaces(m.id).map((place) => {
      const spec = PLACE_SPECS[place.role];
      const access = placeAccess(world, p, place, now);
      const appt = liveAppointment(p, place, nowMin);
      const booking =
        spec.access === 'appointment'
          ? p.market !== place.market
            ? { ok: false, reason: 'Government offices see residents of the city.' }
            : appt
              ? { ok: false, reason: 'You already have an appointment there.' }
              : { ok: true, reason: null }
          : null;
      return {
        ...place,
        label: spec.label,
        purpose: spec.purpose,
        access: spec.access,
        open: access.ok,
        why: access.ok ? null : access.why,
        refusal: spec.refusal ?? null,
        unlock: spec.unlock ?? null,
        /** Members' gates, for the client's own wording. */
        gates: (spec.gates ?? []).map((g) =>
          g.kind === 'lifestyle' ? { ...g, name: LIFESTYLE_NAME(g.min) } : g,
        ),
        appointment: appt
          ? {
              status: appointmentStatus(appt, nowMin),
              at: whenOf(appt.at),
              attended: !!appt.attended,
            }
          : null,
        book: booking,
        services: servicesOf(world, place.role).map((s) => {
          const c = serviceCheck(world, p, place, s);
          return {
            id: s,
            label: SERVICE_SPECS[s].label,
            hours: c.hours,
            fee: c.fee,
            /** A filing's cost is the company's; every other fee is yours. */
            paidBy: FILINGS.has(s) ? ('company' as const) : ('you' as const),
            ok: s === 'visa' ? true : c.ok,
            reason: s === 'visa' ? null : c.reason,
            rule: c.rule ? c.rule.title : null,
            company: c.company ? { id: c.company.id, name: c.company.name } : null,
            ...(s === 'visa'
              ? {
                  options: Object.values(world.markets)
                    .filter((x) => x.id !== p.market)
                    .map((x) => ({
                      id: x.id,
                      name: x.data.name,
                      held: hasVisa(world, p, x.id),
                    })),
                }
              : {}),
          };
        }),
      };
    }),
  };
}
