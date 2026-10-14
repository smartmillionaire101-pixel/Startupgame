/**
 * The product roadmap (blueprint §6.3, FR-006): features as projects with
 * effort, skill, cost, dependencies and risk. The founder picks and orders
 * them; engineers, product staff and the founder's own build hours do the
 * work at month end; a release changes the product metrics the customer
 * simulation already reads (fit, quality, tech debt, cost to serve).
 *
 * Optional state: a company has a roadmap only once its founder adds a
 * feature. Without one (or with nothing left to build) product work runs
 * exactly as before, so old command logs replay to the same world. With
 * active projects the roadmap takes a share of the same engineering
 * capacity that otherwise polishes the product, so nothing is counted twice.
 *
 * No world ids are taken (projects are numbered per company, notes have
 * fixed ids), money moves only through the ledger, and dice come from
 * streams derived for this purpose alone.
 */
import { BUG_BASH, featureById, featuresFor, type FeatureDef } from './data/roadmap.js';
import { ensure, fail } from './errors.js';
import { col, getMarket, INBOX_LIMIT, totalCustomers } from './helpers.js';
import { transfer } from './ledger.js';
import { clamp01 } from './math.js';
import { scale } from './money.js';
import { deriveRng } from './rng.js';
import { bandSalary, outputOf } from './staff.js';
import type { BuildMode, Company, Id, Player, ProductProject, Roadmap, World } from './types.js';

export const ROADMAP = {
  /** Share of engineering output that goes to the roadmap while something is being built. */
  share: 0.7,
  /** Person-weeks in one unit of monthly output (a full-time person-month). */
  weeksPerOutput: 4.33,
  /** Build mode: speed of roadmap work, tech debt and bugs added on release. */
  speed: { fast: 1.25, balanced: 1, quality: 0.8 } as Record<BuildMode, number>,
  debt: { fast: 0.6, balanced: 0.25, quality: 0.05 } as Record<BuildMode, number>,
  defects: { fast: 1.5, balanced: 0.7, quality: 0.2 } as Record<BuildMode, number>,
  /** Missing skill on the team (no designer for design work, no engineer for data work). */
  missingSkill: 0.75,
  /** Contractors cost this many times a mid-level engineer's weekly pay. */
  contractorPremium: 1.5,
  /** Extra tech debt when contractors worked on a feature (they know less of your code). */
  contractorDebt: 0.02,
  /** Quality lost per bug shipped, and per bug per month while it stays live. */
  defectQuality: 0.01,
  defectMonthly: 0.003,
  maxProjects: 12,
  maxFeedback: 6,
} as const;

export const FIRST_RELEASE = 'founder.first-release';

const def = (p: ProductProject): FeatureDef => featureById(p.featureId)!;
const released = (c: Company, featureId: string) =>
  !!c.roadmap?.projects.some((p) => p.featureId === featureId && p.status === 'released');
const isReady = (p: ProductProject) => p.status !== 'released' && p.progress >= def(p).effortWeeks;

/** The feature this project waits for, if its dependency isn't released yet. */
export function blockedBy(c: Company, p: ProductProject): FeatureDef | null {
  const req = def(p).requires;
  return req && !released(c, req) ? (featureById(req) ?? null) : null;
}

/** Projects that can take work now, in priority order. */
export function workable(c: Company): ProductProject[] {
  return (c.roadmap?.projects ?? []).filter(
    (p) => p.status !== 'released' && !isReady(p) && !blockedBy(c, p),
  );
}

/** Share of engineering output the roadmap takes this month (0 = product work as before). */
export function roadmapShare(c: Company): number {
  return workable(c).length > 0 ? ROADMAP.share : 0;
}

/** How fast this team does work needing a skill. */
export function skillMult(c: Company, f: FeatureDef): number {
  if (f.skill === 'design')
    return c.staff.some((s) => s.role === 'product') ? 1 : ROADMAP.missingSkill;
  if (f.skill === 'data')
    return c.staff.some((s) => s.role === 'engineer') ? 1 : ROADMAP.missingSkill;
  return 1;
}

/** Fixed-id inbox note (no world id taken). */
function note(
  world: World,
  playerId: Id,
  id: string,
  month: number,
  kind: 'system' | 'milestone',
  text: string,
) {
  const p = world.players[playerId];
  if (!p || p.ai) return;
  const list = (world.inbox[playerId] ??= []);
  if (list.some((x) => x.id === id)) return;
  list.unshift({ id: id as Id, month, kind, text, read: false });
  if (list.length > INBOX_LIMIT) list.length = INBOX_LIMIT;
}

/**
 * Month end: `output` is the roadmap's share of engineering output (person-
 * months). Work goes to the top workable project; what's left over flows to
 * the next. Contractor weeks bought earlier land now.
 */
export function advanceRoadmap(world: World, c: Company, output: number, month: number) {
  const r = c.roadmap;
  if (!r) return;
  const mode = c.product.buildMode;
  for (const p of r.projects) {
    if (p.status === 'released' || !p.contractorWeeks) continue;
    if (blockedBy(c, p)) continue;
    p.progress = Math.min(def(p).effortWeeks, p.progress + p.contractorWeeks);
    p.contractorWeeks = 0;
    if (p.status === 'planned') {
      p.status = 'in_progress';
      p.startedMonth = month;
    }
  }
  // Person-weeks of the team's own work, before skill and build-mode speed.
  let weeks = output * ROADMAP.weeksPerOutput;
  for (const p of workable(c)) {
    if (weeks <= 1e-9) break;
    const f = def(p);
    const rate = ROADMAP.speed[mode] * skillMult(c, f);
    const need = f.effortWeeks - p.progress;
    const done = Math.min(need, weeks * rate);
    p.progress = Math.round((p.progress + done) * 1000) / 1000;
    if (need - done < 0.001) p.progress = f.effortWeeks;
    weeks -= done / rate;
    if (p.status === 'planned') {
      p.status = 'in_progress';
      p.startedMonth = month;
    }
  }
  for (const p of r.projects)
    if (isReady(p))
      for (const fid of c.founderIds)
        note(
          world,
          fid,
          `in_rm_${c.id}_${p.id}`,
          month,
          'system',
          `${def(p).name} is ready to release.`,
        );
}

/**
 * Month end, after product work: live bugs wear quality down and raise a
 * support incident; customers suggest 0–2 features (own dice stream).
 */
export function roadmapFeedback(world: World, c: Company, month: number) {
  const r = c.roadmap;
  if (!r || c.ai) return;
  const p = c.product;
  if (r.defects > 0) {
    p.quality = clamp01(p.quality - ROADMAP.defectMonthly * r.defects);
    r.feedback = r.feedback.filter((x) => x.kind !== 'incident');
    r.feedback.unshift({
      id: `fb${month}_bugs`,
      month,
      kind: 'incident',
      featureId: BUG_BASH,
      from: '',
      count: r.defects,
    });
  }
  const rng = deriveRng(world.seed, 'roadmap.feedback', c.id, month);
  const customers = totalCustomers(c);
  const n = rng.int(0, customers > 0 ? 2 : 1);
  const m = getMarket(world, c.market);
  for (let k = 0; k < n; k++) {
    const taken = new Set([
      ...r.projects.map((x) => x.featureId),
      ...r.feedback.map((x) => x.featureId),
      BUG_BASH,
    ]);
    const options = featuresFor(c.industry).filter((f) => !taken.has(f.id));
    if (!options.length) break;
    const f = rng.pick(options);
    const segKey = c.targetSegments.length ? rng.pick(c.targetSegments) : '';
    r.feedback.unshift({
      id: `fb${month}_${k}`,
      month,
      kind: 'idea',
      featureId: f.id,
      from: m.segments[segKey]?.name ?? '',
    });
  }
  if (r.feedback.length > ROADMAP.maxFeedback) r.feedback.length = ROADMAP.maxFeedback;
}

// ---------------------------------------------------------------- commands

function ensureRoadmap(c: Company): Roadmap {
  return (c.roadmap ??= { projects: [], feedback: [], defects: 0, nextId: 1 });
}

function projectOf(c: Company, projectId: string): ProductProject {
  const p = c.roadmap?.projects.find((x) => x.id === projectId);
  ensure(p, 'roadmap.project', 'That feature isn’t on your roadmap.');
  return p;
}

/** Up-front cost of a feature (tools and licences), local minor units. */
export function featureCost(world: World, c: Company, f: FeatureDef): number {
  return scale(col(getMarket(world, c.market)), f.costCol);
}

/** What contractors charge per person-week here: a mid-level engineer's week, plus a premium. */
export function contractorWeekRate(world: World, c: Company): number {
  const monthly = bandSalary(world, c.market, 'engineer', 'mid');
  return Math.round(((monthly / ROADMAP.weeksPerOutput) * ROADMAP.contractorPremium) / 100) * 100;
}

/** Cost to hand a project's remaining work to contractors. */
export function contractFee(world: World, c: Company, p: ProductProject): number {
  const left = Math.max(0, def(p).effortWeeks - p.progress - (p.contractorWeeks ?? 0));
  return Math.round(Math.ceil(left) * contractorWeekRate(world, c));
}

export function addFeature(
  world: World,
  c: Company,
  featureId: string,
  month: number,
): { message: string; projectId: Id; cost: number } {
  const f = featureById(featureId);
  ensure(
    f && featuresFor(c.industry).includes(f),
    'roadmap.feature',
    'That feature doesn’t fit your product.',
  );
  ensure(!c.hibernation, 'roadmap.hibernating', 'The product is frozen while you hibernate.');
  const r = ensureRoadmap(c);
  ensure(
    !r.projects.some((p) => p.featureId === featureId && p.status !== 'released'),
    'roadmap.duplicate',
    'That feature is already on your roadmap.',
  );
  ensure(
    featureId === BUG_BASH ||
      !r.projects.some((p) => p.featureId === featureId && p.status === 'released'),
    'roadmap.shipped',
    'You’ve already shipped that feature.',
  );
  ensure(
    r.projects.filter((p) => p.status !== 'released').length < ROADMAP.maxProjects,
    'roadmap.full',
    'Your roadmap is full. Ship or remove something first.',
  );
  const cost = featureCost(world, c, f);
  const m = getMarket(world, c.market);
  transfer(world, c.account, m.ext.suppliers, cost, `Roadmap: ${f.name}`, month);
  const id = `rp${r.nextId++}` as Id;
  r.projects.push({ id, featureId, status: 'planned', progress: 0, addedMonth: month });
  r.feedback = r.feedback.filter((x) => x.featureId !== featureId);
  return { message: `${f.name} added to your roadmap.`, projectId: id, cost };
}

/** Move a project up or down among those not yet released (the top one gets the work). */
export function prioritise(c: Company, projectId: string, dir: 'up' | 'down' | 'top') {
  const r = c.roadmap!;
  const p = projectOf(c, projectId);
  ensure(p.status !== 'released', 'roadmap.released', 'That feature has shipped.');
  const open = r.projects.filter((x) => x.status !== 'released');
  const i = open.indexOf(p);
  const j =
    dir === 'top' ? 0 : dir === 'up' ? Math.max(0, i - 1) : Math.min(open.length - 1, i + 1);
  open.splice(i, 1);
  open.splice(j, 0, p);
  r.projects = [...r.projects.filter((x) => x.status === 'released'), ...open];
  return { order: open.map((x) => x.id) };
}

export function removeProject(c: Company, projectId: string) {
  const r = c.roadmap!;
  const p = projectOf(c, projectId);
  ensure(p.status !== 'released', 'roadmap.released', 'That feature has shipped.');
  r.projects = r.projects.filter((x) => x !== p);
  return { message: `${def(p).name} removed from your roadmap.` };
}

export function dismissFeedback(c: Company, feedbackId: string) {
  const r = c.roadmap;
  ensure(
    r?.feedback.some((x) => x.id === feedbackId),
    'roadmap.feedback',
    'Already dealt with.',
  );
  r!.feedback = r!.feedback.filter((x) => x.id !== feedbackId);
  return null;
}

/** Pay contractors to do the remaining work; it lands at month end. */
export function contractProject(world: World, c: Company, projectId: string, month: number) {
  const p = projectOf(c, projectId);
  ensure(!c.hibernation, 'roadmap.hibernating', 'The product is frozen while you hibernate.');
  ensure(p.status !== 'released', 'roadmap.released', 'That feature has shipped.');
  ensure(!isReady(p), 'roadmap.ready', 'It’s finished. Release it.');
  const waits = blockedBy(c, p);
  if (waits) fail('roadmap.blocked', `Ship ${waits.name} first.`);
  ensure(!p.contractorWeeks, 'roadmap.contracted', 'Contractors are already on it.');
  const fee = contractFee(world, c, p);
  const left = Math.ceil(def(p).effortWeeks - p.progress);
  const m = getMarket(world, c.market);
  transfer(world, c.account, m.ext.suppliers, fee, `Contractors: ${def(p).name}`, month);
  p.contractorWeeks = left;
  p.contracted = true;
  return { message: `Contractors hired. ${def(p).name} will be finished at month end.`, fee };
}

/** Ship a finished feature: its effect, plus tech debt and bugs by build mode and risk. */
export function releaseProject(world: World, c: Company, projectId: string, month: number) {
  const r = c.roadmap!;
  const p = projectOf(c, projectId);
  ensure(p.status !== 'released', 'roadmap.released', 'Already released.');
  const f = def(p);
  ensure(isReady(p), 'roadmap.unfinished', 'It isn’t finished yet.');
  const mode = c.product.buildMode;
  const rng = deriveRng(world.seed, 'roadmap.release', c.id, p.id);
  const expected = f.risk * (f.effortWeeks / 3) * ROADMAP.defects[mode];
  const defects = Math.floor(expected + rng.next());
  const debt =
    (f.effortWeeks / 40) * ROADMAP.debt[mode] * (0.5 + f.risk) +
    (p.contracted ? ROADMAP.contractorDebt : 0);
  const pr = c.product;
  const before = { fit: pr.fit, quality: pr.quality, techDebt: pr.techDebt };
  const s = f.effect.size;
  const up = (v: number, k: number) => clamp01(v + k * (1 - v));
  let fixed = 0;
  switch (f.effect.kind) {
    case 'fit':
      pr.fit = up(pr.fit, s);
      break;
    case 'quality':
      pr.quality = up(pr.quality, s);
      break;
    case 'conversion':
      pr.fit = up(pr.fit, s / 2);
      pr.quality = up(pr.quality, s / 2);
      break;
    case 'pricing':
      pr.fit = up(pr.fit, s * 0.8);
      break;
    case 'retention':
      pr.quality = up(pr.quality, s * 0.7);
      pr.techDebt = clamp01(pr.techDebt - s * 0.3);
      break;
    case 'efficiency':
      c.cogsUsdPerCustomer = Math.round(c.cogsUsdPerCustomer * (1 - s));
      pr.techDebt = clamp01(pr.techDebt - s * 0.2);
      break;
    case 'stability':
      pr.techDebt = clamp01(pr.techDebt - s);
      fixed = f.id === BUG_BASH ? r.defects : Math.floor(r.defects / 2);
      r.defects -= fixed;
      pr.quality = clamp01(pr.quality + fixed * ROADMAP.defectQuality);
      if (r.defects === 0) r.feedback = r.feedback.filter((x) => x.kind !== 'incident');
      break;
  }
  pr.techDebt = clamp01(pr.techDebt + debt);
  pr.quality = clamp01(pr.quality - defects * ROADMAP.defectQuality);
  r.defects += defects;
  p.status = 'released';
  p.releasedMonth = month;
  p.defects = defects;
  p.debtAdded = Math.round(debt * 1000) / 1000;
  delete p.contractorWeeks;
  // Released features sit after the open ones, newest first among themselves.
  r.projects = [
    ...r.projects.filter((x) => x.status !== 'released'),
    p,
    ...r.projects.filter((x) => x.status === 'released' && x !== p),
  ];
  for (const fid of c.founderIds) {
    const founder = world.players[fid] as Player | undefined;
    if (!founder || founder.ai || founder.milestones[FIRST_RELEASE] !== undefined) continue;
    founder.milestones[FIRST_RELEASE] = month;
    note(world, fid, 'in_first_release', month, 'milestone', 'Milestone: First release');
  }
  return {
    message: `${f.name} is live.`,
    defects,
    fixed,
    change: {
      fit: pr.fit - before.fit,
      quality: pr.quality - before.quality,
      techDebt: pr.techDebt - before.techDebt,
    },
  };
}

// ---------------------------------------------------------------- view

/** Person-weeks the team would put into the roadmap this month at today's settings. */
export function monthlyCapacityWeeks(world: World, c: Company): number {
  const founder = world.players[c.founderIds[0]!];
  const founderBuild = founder ? (c.buildHours / 160) * (founder.skills.product / 60) : 0;
  const output = outputOf(c, ['engineer']) + outputOf(c, ['product']) * 0.6 + founderBuild;
  return output * ROADMAP.share * ROADMAP.weeksPerOutput * ROADMAP.speed[c.product.buildMode];
}

export function roadmapView(world: World, c: Company) {
  const r = c.roadmap;
  const capacity = monthlyCapacityWeeks(world, c);
  const projects = r?.projects ?? [];
  // ETA: walk the queue in order, sharing this month's capacity.
  let queue = 0;
  const eta = new Map<string, number | null>();
  for (const p of projects) {
    if (p.status === 'released') continue;
    const f = def(p);
    const left = Math.max(0, f.effortWeeks - p.progress - (p.contractorWeeks ?? 0));
    if (left === 0) {
      eta.set(p.id, isReady(p) ? 0 : 1);
      continue;
    }
    if (blockedBy(c, p) || capacity <= 0) {
      eta.set(p.id, null);
      continue;
    }
    queue += left / skillMult(c, f);
    eta.set(p.id, Math.max(1, Math.ceil(queue / capacity)));
  }
  const view = (f: FeatureDef) => ({
    featureId: f.id,
    name: f.name,
    blurb: f.blurb,
    skill: f.skill,
    effortWeeks: f.effortWeeks,
    cost: featureCost(world, c, f),
    risk: f.risk,
    effect: f.effect,
    requires: f.requires ? (featureById(f.requires)?.name ?? null) : null,
  });
  const open = new Set(projects.filter((p) => p.status !== 'released').map((p) => p.featureId));
  const shipped = new Set(projects.filter((p) => p.status === 'released').map((p) => p.featureId));
  return {
    started: !!r,
    capacityWeeks: Math.round(capacity * 10) / 10,
    share: ROADMAP.share,
    buildMode: c.product.buildMode,
    defects: r?.defects ?? 0,
    contractorWeekRate: contractorWeekRate(world, c),
    projects: projects.map((p) => {
      const f = def(p);
      const waits = blockedBy(c, p);
      return {
        ...view(f),
        id: p.id,
        status: p.status,
        progress: p.progress,
        pct: Math.min(100, Math.round((p.progress / f.effortWeeks) * 100)),
        ready: isReady(p),
        blockedBy: waits?.name ?? null,
        etaMonths: p.status === 'released' ? null : (eta.get(p.id) ?? null),
        contracted: !!p.contracted,
        contractorPending: (p.contractorWeeks ?? 0) > 0,
        contractFee: p.status === 'released' || isReady(p) ? 0 : contractFee(world, c, p),
        missingSkill: skillMult(c, f) < 1,
        releasedMonth: p.releasedMonth ?? null,
        defectsShipped: p.defects ?? 0,
        debtAdded: p.debtAdded ?? 0,
      };
    }),
    feedback: (r?.feedback ?? []).map((x) => {
      const f = featureById(x.featureId)!;
      return {
        ...x,
        name: f.name,
        ask: f.ask,
        onRoadmap: open.has(x.featureId),
      };
    }),
    catalogue: featuresFor(c.industry)
      .filter((f) => !open.has(f.id) && (f.id === BUG_BASH || !shipped.has(f.id)))
      .map(view),
  };
}
