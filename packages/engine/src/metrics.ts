/**
 * Playtest metrics (blueprint §10.4, §14.2; Phase 9): aggregate numbers for
 * balancing, read from the world as it is. Nothing is tracked or stored for
 * this: every figure comes from milestones, companies, decisions and
 * ambitions the game keeps anyway. Only counts and medians come out, never a
 * player's id or name, and AI players are left out.
 *
 * Used for design, not retention: tutorial completion, time to first
 * customer, chapter progression, cash crises and failure, decisions left to
 * their default, ambitions chosen and reached, use of the optional life systems.
 */
import { AMBITION_IDS, ambitionMilestone } from './ambitions.js';
import { CHAPTERS, chapterMilestone } from './journey.js';
import { propertiesOf } from './property.js';
import type { Company, Player, World } from './types.js';

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};

const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 1000) / 10 : null);

export function playtestMetrics(world: World) {
  const humans = Object.values(world.players).filter((p) => !p.ai);
  const founders = humans.filter((p) => p.role === 'founder' || p.companyIds.length > 0);
  const companyOf = (id: string) => world.companies[id];
  const firstCompany = (p: Player): Company | undefined =>
    p.companyIds.map(companyOf).find((c): c is Company => !!c);

  // --- The guided first session (Founder Journey 6): started from a café idea.
  const guided = founders.filter((p) => firstCompany(p)?.starterIdea !== undefined);
  const guidedSale = guided.filter((p) => {
    const c = firstCompany(p)!;
    return (
      (c.salesAccounts?.length ?? 0) > 0 || p.milestones['founder.first-customer'] !== undefined
    );
  });

  // --- Time to first customer, in game months from founding the first company.
  const toFirst: number[] = [];
  for (const p of founders) {
    const at = p.milestones['founder.first-customer'];
    const c = firstCompany(p);
    if (at !== undefined && c) toFirst.push(Math.max(0, at - c.foundedMonth));
  }

  // --- Chapters: how many founders have finished exactly n of them.
  const chapters = Array.from({ length: CHAPTERS.length + 1 }, () => 0);
  for (const p of founders) {
    let n = 0;
    for (let i = 1; i <= CHAPTERS.length; i++)
      if (p.milestones[chapterMilestone(i)] !== undefined) n = i;
    chapters[n]! += 1;
  }

  // --- Companies human players founded: failure, cash crises.
  const human = new Set(humans.map((p) => p.id));
  const theirs = Object.values(world.companies).filter(
    (c) => !c.ai && c.founderIds.some((f) => human.has(f)),
  );
  const status = (s: Company['status']) => theirs.filter((c) => c.status === s).length;
  const distress = { watch: 0, danger: 0, critical: 0 } as Record<string, number>;
  for (const c of theirs)
    if (c.status === 'active' && c.distress)
      distress[c.distress.level] = (distress[c.distress.level] ?? 0) + 1;

  // --- Decisions: answered, left to their default, still open.
  const decisions = { chosen: 0, defaulted: 0, open: 0 };
  for (const p of humans) for (const e of p.decisions?.events ?? []) decisions[e.status] += 1;

  // --- Ambitions: chosen now, and reached.
  const ambitions = Object.fromEntries(
    AMBITION_IDS.map((id) => [
      id,
      {
        chosen: humans.filter((p) => p.ambition?.id === id).length,
        reached: humans.filter((p) => p.milestones[ambitionMilestone(id)] !== undefined).length,
      },
    ]),
  );

  // --- The optional life systems (§10.4 "use of optional life systems").
  const owners = new Set(Object.values(propertiesOf(world)).map((x) => x.ownerId));
  const life = {
    withContacts: humans.filter((p) => (p.contacts?.length ?? 0) > 0).length,
    ownAHome: humans.filter((p) => owners.has(p.id)).length,
  };

  return {
    players: {
      humans: humans.length,
      founders: founders.length,
      investors: humans.filter((p) => p.role === 'investor').length,
      bankers: humans.filter((p) => p.role === 'banker').length,
    },
    firstSession: {
      guided: guided.length,
      firstSale: guidedSale.length,
      firstSalePct: pct(guidedSale.length, guided.length),
    },
    firstCustomer: {
      reached: toFirst.length,
      reachedPct: pct(toFirst.length, founders.length),
      medianMonths: median(toFirst),
    },
    /** Index n: founders who have finished exactly n chapters. */
    chapters,
    companies: {
      total: theirs.length,
      active: status('active'),
      shutdown: status('shutdown'),
      acquired: status('acquired'),
      failurePct: pct(status('shutdown'), theirs.length),
      inDistress: distress,
    },
    decisions: {
      ...decisions,
      defaultedPct: pct(decisions.defaulted, decisions.chosen + decisions.defaulted),
    },
    ambitions,
    life: {
      ...life,
      withContactsPct: pct(life.withContacts, humans.length),
      ownAHomePct: pct(life.ownAHome, humans.length),
    },
  };
}

export type PlaytestMetrics = ReturnType<typeof playtestMetrics>;
