/**
 * Round 7: hires do their job (player feedback: "hires — salesperson,
 * co-founders, engineers — do nothing visible"). Gameplay-note worlds only
 * (releases.ts GAMEPLAY_NOTE); before it, staff work exactly as they did.
 *
 *   - Everyone has a sector they know from their last job: a customer
 *     segment (`expertise`, "healthtech.clinics": hospitals and clinics).
 *   - A salesperson brings leads from their sector each month (one, two when
 *     skilled), runs discovery on the deals they own, lifts those deals' win
 *     chance by their skill (sales.ts winChance), gives you a tip in a sales
 *     conversation, and can take the conversation for you (salestalk.ts).
 *   - A technical co-founder joins demos (sales.ts) and lifts the team's
 *     build output; engineers ship roadmap work faster (company.ts).
 *   - A business co-founder's contacts make new leads warmer (sales.ts) and
 *     add to an investor's score of a pitch, with a warm intro (fundraising).
 *   - Everyone gets better with the months on the job.
 *
 * What each person did is kept for the recap ("Your team this month"), and
 * what a candidate would bring is shown before you hire (`bringsOf`).
 *
 * Determinism: a person's sector comes from `deriveRng(seed, 'expertise',
 * id)`; leads from `deriveRng(seed, 'sales', 'team', company, staff, month)`.
 * No money moves here.
 */
import { SEGMENT_BUYERS } from './data/buyers.js';
import { SEGMENT_TEMPLATES } from './data/industries.js';
import type { Seniority, StaffRole } from './data/markets.js';
import { TEAM, businessCofounderOf, ctoOf, expertiseOf } from './cofounders.js';
import { businessesOf, isOpen } from './economy.js';
import { getMarket } from './helpers.js';
import { clamp, clamp01 } from './math.js';
import { gameplayOn } from './releases.js';
import { deriveRng } from './rng.js';
import { ROADMAP } from './roadmap.js';
import { SALES, hasDealRoom, isOpenDeal, makeLead } from './sales.js';
import { SENIORITY_OUTPUT } from './staff.js';
import type { Company, SalesDeal, SalesNeed, Staff, TeamWork, World } from './types.js';

const round2 = (x: number) => Math.round(x * 100) / 100;

/** A staff member's sector: set at hire, else read from their id. */
export const staffExpertise = (world: World, c: Company, s: Staff): string =>
  s.expertise ?? expertiseOf(world, s.id, c.industry);

/** Does a sector belong to the company's industry ("healthtech.clinics" for healthtech)? */
const inIndustry = (c: Company, segmentKey: string) => segmentKey.startsWith(`${c.industry}.`);

/** Leads a salesperson brings a month. */
const leadsFor = (skill: number) => (skill >= TEAM.leadsSkill ? 2 : 1);

/** Person-weeks one person adds to the roadmap a month (morale at hire, the usual share). */
function roadmapWeeksOf(role: StaffRole, seniority: Seniority, skill: number): number {
  const share = role === 'engineer' ? 1 : role === 'product' ? 0.6 : 0;
  const boost = role === 'engineer' ? 1 + TEAM.engineerBuild : 1;
  const output = skill * SENIORITY_OUTPUT[seniority] * (0.5 + 70 / 200) * share * boost;
  return round2(output * ROADMAP.share * ROADMAP.weeksPerOutput);
}

/** What a person would bring to this company (a candidate before you hire, or a hire). */
export function bringsOf(
  world: World,
  c: Company,
  p: {
    id: string;
    role: StaffRole;
    seniority: Seniority;
    skill: number;
    cofounder?: 'cto' | 'operator' | 'growth';
  },
  expertise?: string,
) {
  const sector = expertise ?? expertiseOf(world, p.id, c.industry);
  const m = getMarket(world, c.market);
  const ownSector = inIndustry(c, sector);
  const sales = p.role === 'sales';
  return {
    /** The segment they know, and whether it's one your company sells to. */
    expertise: sector,
    expertiseName:
      m.segments[sector]?.name ?? SEGMENT_TEMPLATES.find((s) => s.key === sector)?.name ?? '',
    ownSector,
    /** A salesperson: leads a month (from their sector when it's yours), and the chance they add. */
    leadsPerMonth: sales ? leadsFor(p.skill) : 0,
    winLift: sales ? round2(TEAM.ownerChance * p.skill) : 0,
    /** Engineers and product people: roadmap person-weeks a month. */
    roadmapWeeks: roadmapWeeksOf(p.role, p.seniority, p.skill),
    /** A technical co-founder: demo lift and build boost. */
    demoLift: p.cofounder === 'cto' ? round2(TEAM.ctoDemo * p.skill) : 0,
    buildLift: p.cofounder === 'cto' ? round2(TEAM.ctoBuild * p.skill) : 0,
    /** A business co-founder: warmer leads and a better pitch. */
    warmLift: p.cofounder && p.cofounder !== 'cto' ? round2(TEAM.warmTrust * p.skill) : 0,
    pitchLift: p.cofounder && p.cofounder !== 'cto' ? round2(TEAM.pitchScore * p.skill) : 0,
  };
}

export type Brings = ReturnType<typeof bringsOf>;

/** How much faster the team builds this month (gameplay note; 1 before it). */
export function buildBoost(world: World, c: Company): number {
  if (!gameplayOn(world)) return 1;
  const cto = ctoOf(c);
  return 1 + (cto ? TEAM.ctoBuild * cto.skill : 0);
}

/**
 * A salesperson's tip in a conversation (gameplay note): someone who knows
 * this segment says what this kind of customer cares about most: right
 * about this one as often as they're skilled.
 */
export function salesTip(world: World, c: Company, d: SalesDeal) {
  if (!gameplayOn(world) || !d.talk) return null;
  const sales = c.staff.filter((s) => s.role === 'sales');
  if (!sales.length) return null;
  const key = d.customer.segmentKey;
  // The owner first, then someone from this segment, then from the industry.
  const who =
    sales.find((s) => s.id === d.owner) ??
    sales.find((s) => staffExpertise(world, c, s) === key) ??
    sales.find((s) => inIndustry(c, staffExpertise(world, c, s)));
  if (!who) return null;
  const rng = deriveRng(world.seed, 'sales', 'tip', d.id, d.talk.n, who.id);
  const seg = getMarket(world, c.market).segments[key];
  const top = (['fit', 'price', 'stars', 'reliability'] as SalesNeed[])
    .slice()
    .sort((a, b) => (seg?.needs[b] ?? 0) - (seg?.needs[a] ?? 0))[0]!;
  const right = rng.chance(0.4 + 0.55 * who.skill);
  return { staffId: who.id, name: who.name, need: right ? d.customer.need : top };
}

/** Sales staff who can take a conversation for you. */
export const salesStaff = (c: Company): Staff[] => c.staff.filter((s) => s.role === 'sales');

/**
 * Month end (gameplay note): salespeople bring leads and run discovery on
 * their deals, everyone gets better, and what each did is kept for the recap.
 * Runs after the product and the pipeline have settled.
 */
export function settleTeam(world: World, c: Company, month: number) {
  if (!gameplayOn(world) || c.ai || !c.staff.length) return;
  const m = getMarket(world, c.market);
  const log = c.teamMonth?.month === month ? c.teamMonth : { month, people: [] as TeamWork[] };
  const entry = (s: Staff): TeamWork => {
    let e = log.people.find((x) => x.staffId === s.id);
    if (!e) {
      e = {
        staffId: s.id,
        name: s.name,
        role: s.role,
        ...(s.cofounder ? { title: s.cofounder.title } : {}),
        skillFrom: round2(s.skill),
        skillTo: round2(s.skill),
      };
      log.people.push(e);
    }
    return e;
  };
  const deals = (c.deals ??= []);
  // Businesses already in the pipeline, won or buying from you are nobody's new lead.
  const taken = new Set(
    [
      ...deals.filter((d) => isOpenDeal(d) || d.stage === 'won').map((d) => d.customer.businessId),
      ...(c.salesAccounts ?? []).map((a) => a.businessId),
    ].filter(Boolean),
  );
  for (const s of c.staff.filter((x) => x.role === 'sales')) {
    const e = entry(s);
    const sector = staffExpertise(world, c, s);
    const own = inIndustry(c, sector) && !!m.segments[sector];
    const rng = deriveRng(world.seed, 'sales', 'team', c.id, s.id, month);
    // Leads from their sector (made-up ones in your segments when it isn't yours).
    const kinds = own ? (SEGMENT_BUYERS[sector] ?? []) : [];
    const pool = Object.values(businessesOf(m))
      .filter((b) => isOpen(b) && kinds.includes(b.kind) && !taken.has(b.id))
      .sort((a, b) => (a.id < b.id ? -1 : 1));
    let brought = 0;
    for (let i = 0; i < leadsFor(s.skill) && hasDealRoom(c); i++) {
      const b =
        pool.length && rng.chance(0.7) ? pool.splice(rng.int(0, pool.length - 1), 1)[0] : undefined;
      const customer = makeLead(world, c, m, rng, b, own ? sector : undefined);
      if (!customer) break;
      if (b) taken.add(b.id);
      // They know people there: a warmer start.
      customer.trust = round2(clamp01(customer.trust + 0.1));
      c.salesSeq = (c.salesSeq ?? 0) + 1;
      deals.push({
        id: `${c.id}-d${c.salesSeq}`,
        customer,
        stage: 'lead',
        createdMonth: month,
        deadline: month + clamp(rng.int(SALES.deadline[0], SALES.deadline[1]), 1, 6),
        revealed: false,
        owner: s.id,
      });
      brought++;
    }
    // Discovery on their own deals: what they need and what they can spend.
    let met = 0;
    for (const d of deals) {
      if (met >= TEAM.discoveryPerMonth) break;
      if (d.owner !== s.id || d.revealed || !['lead', 'contacted'].includes(d.stage)) continue;
      d.revealed = true;
      d.stage = 'discovery';
      d.customer.trust = round2(clamp01(d.customer.trust + 0.07));
      const k = d.customer.segmentKey;
      const before = c.product.discovery[k] ?? 0;
      c.product.discovery[k] = Math.round(clamp01(before + 0.05 * (1 - before)) * 1000) / 1000;
      met++;
    }
    e.leads = (e.leads ?? 0) + brought;
    e.discovered = (e.discovered ?? 0) + met;
    // Deals they owned that signed during the month.
    e.won = deals.filter(
      (d) => d.owner === s.id && d.stage === 'won' && d.closedMonth === month - 1,
    ).length;
  }
  const cto = ctoOf(c);
  if (cto) entry(cto).demos = deals.filter((d) => d.demoLift?.month === month - 1).length;
  const biz = businessCofounderOf(c);
  if (biz)
    entry(biz).warm = deals.filter(
      (d) => d.warmBy === biz.id && d.createdMonth === month - 1,
    ).length;
  // Everyone gets better on the job.
  for (const s of c.staff) {
    s.skill = Math.round(clamp01(s.skill + TEAM.skillGrowth * (1 - s.skill)) * 1000) / 1000;
    const e = log.people.find((x) => x.staffId === s.id) ?? entry(s);
    e.skillTo = round2(s.skill);
  }
  c.teamMonth = log;
}

/**
 * The product's month (gameplay note): each engineer's and product person's
 * share of the roadmap's person-weeks, for the recap. `weeks` is the month's
 * roadmap work in person-weeks.
 */
export function logRoadmapWork(world: World, c: Company, weeks: number, month: number) {
  if (!gameplayOn(world) || c.ai || weeks <= 0) return;
  const builders = c.staff.filter((s) => s.role === 'engineer' || s.role === 'product');
  const out = (s: Staff) =>
    s.skill *
    SENIORITY_OUTPUT[s.seniority] *
    (0.5 + s.morale / 200) *
    (s.role === 'engineer' ? 1 : 0.6);
  const total = builders.reduce((a, s) => a + out(s), 0);
  if (total <= 0) return;
  const log = { month, people: [] as TeamWork[] };
  for (const s of builders)
    log.people.push({
      staffId: s.id,
      name: s.name,
      role: s.role,
      ...(s.cofounder ? { title: s.cofounder.title } : {}),
      roadmapWeeks: round2((weeks * out(s)) / total),
      skillFrom: round2(s.skill),
      skillTo: round2(s.skill),
    });
  c.teamMonth = log;
}

/** The recap's "Your team this month" (gameplay note), or null. */
export function teamMonthView(world: World, c: Company, month: number) {
  if (!gameplayOn(world)) return null;
  return c.teamMonth?.month === month ? c.teamMonth.people.map((p) => ({ ...p })) : null;
}

/** For a founder's view: a hire or candidate's sector and what they bring (gameplay note). */
export function teamBringsView(world: World, c: Company) {
  if (!gameplayOn(world)) return null;
  return Object.fromEntries(
    c.staff.map((s) => [
      s.id,
      bringsOf(
        world,
        c,
        {
          id: s.id,
          role: s.role,
          seniority: s.seniority,
          skill: s.skill,
          ...(s.cofounder ? { cofounder: s.cofounder.profile } : {}),
        },
        staffExpertise(world, c, s),
      ),
    ]),
  );
}
