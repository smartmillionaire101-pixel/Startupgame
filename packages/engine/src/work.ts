/**
 * The jobs rework: professional careers (data/professions.ts).
 *
 * Every city has a bank, an investment firm, a tech company, an engineering
 * firm, a consultancy, a law firm and a hospital (local businesses with a
 * stable landmark key, opened once the jobs release note is logged). Each
 * has a ladder. You apply (`job.apply`, a couple of hours), which books an
 * interview there; you go to the employer and answer three questions
 * (`job.interview`, a few hours), and the answer comes straight away: hired,
 * or turned down with the reason. The decision is a score from your months
 * of experience in the field, your best matching skill, your reputation and
 * your answers, plus a small seeded jitter, after hard checks (levels 2–4) on months and
 * skill. A turn-down means waiting a month before applying there again; an
 * interview you never go to expires.
 *
 * Pay comes from the city's payroll (like institution careers), taxed as
 * income, at month end. Each month in a job adds a month of experience in its
 * field (a dropout learns half as fast again) and a little skill; after six
 * months at a level you can ask for a promotion (another interview).
 *
 * Experience is seeded lazily from your background (`HEAD_STARTS`). Worlds
 * without the jobs note never reach any of this.
 */
import type { Skill } from './data/characters.js';
import {
  EMPLOYERS,
  LEVEL_HOURS,
  LEVEL_MONTHS,
  PROFESSION_IDS,
  WORK_FIELDS,
  headStartOf,
  professionById,
  professionOfKind,
  type Profession,
  type WorkField,
} from './data/professions.js';
import type { MarketId } from './data/markets.js';
import { ensure, fail } from './errors.js';
import {
  businessesOf,
  ensureBusinesses,
  isOpen,
  JOB_HOURS,
  myJobView,
  openBusiness,
} from './economy.js';
import { col, getMarket, hoursLeft, locationOf, notify, spendHours } from './helpers.js';
import { newId } from './ids.js';
import { transfer, withTx } from './ledger.js';
import { clamp, clamp01 } from './math.js';
import { formatMoney, scale } from './money.js';
import { jobsOn } from './releases.js';
import { deriveRng } from './rng.js';
import type {
  Id,
  JobApplication,
  JobWhy,
  LocalBusiness,
  MarketState,
  Player,
  PlayerWork,
  World,
} from './types.js';

export const WORK = {
  /** Hours an application takes (the form, the CV). */
  applyHours: 2,
  /** Hours the interview takes, there in person. */
  interviewHours: 3,
  /** The score (0–1) an interview has to reach. */
  hireBar: 0.48,
  /** ± this much seeded luck on the score (entry roles: more, the interview decides). */
  jitter: 0.08,
  entryJitter: 0.12,
  /** Entry roles are where people learn: a little easier to get. */
  entryBonus: 0.06,
  /** Average answer quality mapped to the answer score: below lo counts 0, above hi in full. */
  answerBand: [0.25, 0.6] as readonly [number, number],
  /** Months before you can apply again where you were turned down. */
  cooldownMonths: 1,
  /** The interview can be attended this month and up to this many months after. */
  interviewMonths: 1,
  /** Months at a level before a promotion can be asked for. */
  promotionMonths: 6,
  /** Interviews booked at once. */
  maxBooked: 3,
  /** Applications kept (newest first). */
  keep: 12,
  /** Skills grow with the job up to here. */
  skillCap: 85,
} as const;

export const FIELD_LABEL: Record<WorkField, string> = {
  finance: 'finance',
  tech: 'tech',
  engineering: 'engineering',
  consulting: 'consulting',
  legal: 'law',
  health: 'health care',
  service: 'service jobs',
};

export const SKILL_LABEL: Record<Skill, string> = {
  product: 'Product',
  sales: 'Sales',
  fundraising: 'Fundraising',
  finance: 'Finance',
  hiring: 'Hiring',
  leadership: 'Leadership',
  negotiation: 'Negotiation',
  publicSpeaking: 'Public speaking',
  investing: 'Investing',
  risk: 'Risk',
};

// ---------------------------------------------------------------- Accessors

export const employerKey = (p: Profession) => `employer-${p.id}`;
export const professionOf = (b: Pick<LocalBusiness, 'kind'>) => professionOfKind(b.kind);
export const isEmployer = (b: Pick<LocalBusiness, 'kind'>) => !!professionOfKind(b.kind);

/** Your experience and applications (seeded from your background when never stored). */
export function workOf(p: Player): PlayerWork {
  return p.work ?? { exp: { ...headStartOf(p.backgroundId).exp }, applications: [] };
}

function ensureWork(p: Player): PlayerWork {
  return (p.work ??= workOf(p));
}

/** Experience gained per month worked (a dropout learns faster). */
export const learnRate = (p: Player) => headStartOf(p.backgroundId).learn ?? 1;

export const proHours = (level: number) =>
  LEVEL_HOURS[clamp(Math.round(level), 1, LEVEL_HOURS.length) - 1]!;

/** Hours your job takes each month (a part-time job: 40). */
export const jobHours = (p: Player): number =>
  p.job?.profession ? proHours(p.job.level ?? 1) : JOB_HOURS;

/** Monthly gross pay for a level (take-home `payCol`, grossed up for the city's income tax). */
export function proPay(m: MarketState, prof: Profession, level: number): number {
  const l = prof.levels[level - 1];
  if (!l) return 0;
  return scale(col(m), l.payCol / Math.max(0.2, 1 - m.data.tax.personalIncome));
}

/** Your best skill among the ones the profession hires on. */
export function bestSkill(p: Player, prof: Profession): { skill: Skill; value: number } {
  let best = { skill: prof.skills[0]!, value: -1 };
  for (const s of prof.skills) {
    const v = Math.round(p.skills[s] ?? 0);
    if (v > best.value) best = { skill: s, value: v };
  }
  return best;
}

const floorMonths = (n: number | undefined) => Math.floor((n ?? 0) + 1e-9);

/**
 * Why you can't be hired at this level yet (null: you meet the bar on
 * paper): the months in the field, then the profession's main skill (a
 * background's head start counts as good enough up to its level). Entry
 * roles (level 1) have no bar: the interview decides.
 */
export function levelGate(p: Player, prof: Profession, level: number): JobWhy | null {
  if (level <= 1) return null;
  const work = workOf(p);
  const need = LEVEL_MONTHS[level - 1] ?? 0;
  const have = floorMonths(work.exp[prof.field]);
  if (have < need) return { code: 'months', field: prof.field, need, have };
  const min = prof.skillMin[level - 1] ?? 0;
  const main = prof.skills[0]!;
  const value = Math.round(p.skills[main] ?? 0);
  const head = headStartOf(p.backgroundId).levels[prof.id] ?? 0;
  if (value < min && head < level) return { code: 'skill', skill: main, need: min, have: value };
  return null;
}

/** A promotion also needs time in your current role. */
function promotionGate(p: Player): JobWhy | null {
  const months = floorMonths(p.job?.months);
  return months < WORK.promotionMonths
    ? { code: 'tenure', need: WORK.promotionMonths, have: months }
    : null;
}

export function whyText(w: JobWhy): string {
  switch (w.code) {
    case 'months':
      return `Needs ${w.need} months in ${FIELD_LABEL[w.field]} — you have ${w.have}.`;
    case 'skill':
      return `${SKILL_LABEL[w.skill]} skill ${w.have}, they look for ${w.need}.`;
    case 'tenure':
      return `Needs ${w.need} months in your current role — you have ${w.have}.`;
    case 'interview':
      return `The interview didn’t convince them: ${w.score}%, they hire from ${w.need}%. Weakest answer: “${w.question}”`;
    case 'hired':
      return `${w.strong === false ? 'Good' : 'Strong'} interview — offer: ${w.label}.`;
    case 'expired':
      return 'You missed the interview.';
  }
}

// ---------------------------------------------------------------- Employers

/**
 * Open the city's professional employers that aren't open yet (jobs worlds
 * only). Own RNG stream, keyed so each opens once; they never close (see
 * settleEconomy).
 */
export function ensureEmployers(world: World, marketId: MarketId, month: number) {
  if (!jobsOn(world)) return;
  const m = world.markets[marketId];
  if (!m) return;
  ensureBusinesses(world, marketId);
  const all = Object.values(businessesOf(m));
  const rng = deriveRng(world.seed, 'work', 'employers', marketId, month);
  for (const seed of EMPLOYERS[marketId] ?? []) {
    const prof = professionById(seed.profession);
    if (!prof) continue;
    const key = employerKey(prof);
    if (all.some((b) => b.landmark === key && isOpen(b))) continue;
    const b = openBusiness(world, m, -1, rng, month, true, {
      name: seed.name,
      kind: prof.kind,
      district: seed.district,
      street: seed.street ?? null,
      owner: seed.owner,
    });
    if (b) {
      b.landmark = key;
      b.seed = -2;
    }
  }
}

/** True when a jobs world has a city whose professional employers aren't all open (an old world). */
export function missingEmployers(world: World): boolean {
  if (!jobsOn(world)) return false;
  return Object.entries(world.markets).some(([id, m]) => {
    const all = Object.values(businessesOf(m));
    return (EMPLOYERS[id as MarketId] ?? []).some((seed) => {
      const prof = professionById(seed.profession);
      return prof && !all.some((b) => b.landmark === employerKey(prof) && isOpen(b));
    });
  });
}

function employerOf(world: World, me: Player, businessId: Id) {
  const m = getMarket(world, me.market);
  const b = m.businesses?.[businessId];
  const prof = b ? professionOf(b) : undefined;
  ensure(b && prof && isOpen(b), 'job.employer', 'That employer isn’t hiring here.');
  return { m, b: b!, prof: prof! };
}

function pushApplication(work: PlayerWork, a: JobApplication) {
  work.applications.unshift(a);
  if (work.applications.length > WORK.keep) work.applications.length = WORK.keep;
}

// ---------------------------------------------------------------- Applying

/** `job.apply`: apply for a level at an employer in your home city (a promotion at your own). */
export function applyForJob(world: World, me: Player, businessId: Id, level: number) {
  ensure(jobsOn(world), 'job.release', 'Professional jobs aren’t open yet.');
  ensure(!me.ai, 'job.ai', 'Only players apply for jobs.');
  ensure(locationOf(me) === me.market, 'job.away', 'You can apply for jobs in your home city.');
  const { m, b, prof } = employerOf(world, me, businessId);
  const rung = prof.levels[level - 1];
  ensure(rung, 'job.level', 'That role isn’t on their ladder.');
  ensure(!me.allocator?.career, 'job.career', 'You already have a job at an institution.');
  const here = me.job?.businessId === b.id && me.job.profession ? me.job : undefined;
  const promotion = !!here && level === (here.level ?? 1) + 1;
  if (here && !promotion)
    fail(
      'job.here',
      level <= (here.level ?? 1)
        ? `You already work at ${b.name}.`
        : 'Ask for one step up at a time.',
    );
  const work = ensureWork(me);
  const until = work.cooldown?.[b.id];
  if (until !== undefined && m.month < until)
    fail('job.cooldown', `${b.name} turned you down recently. Try again next month.`);
  const booked = work.applications.filter((a) => a.status === 'booked');
  ensure(
    !booked.some((a) => a.businessId === b.id),
    'job.applied',
    `You already have an interview booked at ${b.name}.`,
  );
  ensure(
    booked.length < WORK.maxBooked,
    'job.booked',
    `You have ${WORK.maxBooked} interviews booked already. Go to one first.`,
  );
  spendHours(me, WORK.applyHours, 'An application');
  const a: JobApplication = {
    id: newId(world, 'app'),
    businessId: b.id,
    profession: prof.id,
    level,
    ...(promotion ? { promotion: true } : {}),
    status: 'booked',
    appliedMonth: m.month,
    expiresMonth: m.month + WORK.interviewMonths,
  };
  pushApplication(work, a);
  return {
    application: a,
    message: promotion
      ? `Promotion review booked at ${b.name}: go in for the interview by the end of next month.`
      : `Interview booked at ${b.name} for ${rung.label}: go there by the end of next month.`,
  };
}

// ---------------------------------------------------------------- The interview

/** The score of one answer: how much they like the approach, and how well you'd carry it out. */
const answerScore = (p: Player, fit: number, skill: Skill) =>
  fit * (0.8 + clamp(p.skills[skill] ?? 0, 0, 100) / 500);

/** `job.interview`: at the employer, answer their three questions; the decision comes at once. */
export function attendInterview(
  world: World,
  me: Player,
  applicationId: Id,
  answers: readonly number[],
) {
  ensure(jobsOn(world), 'job.release', 'Professional jobs aren’t open yet.');
  const work = ensureWork(me);
  const a = work.applications.find((x) => x.id === applicationId);
  ensure(a, 'job.application', 'No such application.');
  ensure(a.status === 'booked', 'job.decided', 'That interview is over.');
  ensure(locationOf(me) === me.market, 'job.away', 'The interview is in your home city.');
  const { m, b, prof } = employerOf(world, me, a.businessId);
  if (m.month > a.expiresMonth) {
    a.status = 'expired';
    a.why = { code: 'expired' };
    a.reason = whyText(a.why);
    fail('job.expired', 'That interview slot has passed. Apply again.');
  }
  ensure(
    answers.length === prof.questions.length &&
      answers.every(
        (n, i) => Number.isInteger(n) && n >= 0 && n < prof.questions[i]!.options.length,
      ),
    'job.answers',
    'Answer each question.',
  );
  spendHours(me, WORK.interviewHours, 'The interview');
  const rung = prof.levels[a.level - 1]!;
  const month = m.month;

  // Hard checks first: the months and the skill, then (a promotion) time in the role.
  let why: JobWhy | null = levelGate(me, prof, a.level);
  if (!why && a.promotion) why = promotionGate(me);
  let score = 0;
  if (!why) {
    const need = LEVEL_MONTHS[a.level - 1] ?? 0;
    const have = workOf(me).exp[prof.field] ?? 0;
    // The skill they look for at this level (entry: the old bar, now only scored).
    const min = prof.skillMin[a.level - 1] ?? 0;
    const best = bestSkill(me, prof);
    const [lo, hi] = WORK.answerBand;
    const entry = a.level === 1;
    const scores = answers.map((n, i) => {
      const opt = prof.questions[i]!.options[n]!;
      return answerScore(me, opt.fit, opt.skill);
    });
    const answered = scores.reduce((s, x) => s + x, 0) / scores.length;
    const perf = a.promotion ? (work.perf ?? 0.5) : 0.5;
    const rng = deriveRng(world.seed, 'work.interview', a.id);
    const jitter = entry ? WORK.entryJitter : WORK.jitter;
    score =
      0.12 +
      0.1 * clamp01((have - need) / 24) +
      0.15 * clamp01(0.5 + (best.value - min) / 40) +
      0.06 * clamp01(me.stars.value / 3) +
      0.3 * clamp01((answered - lo) / (hi - lo)) +
      (a.promotion ? 0.1 * (perf - 0.5) : 0) +
      (entry ? WORK.entryBonus : 0) +
      rng.range(-jitter, jitter);
    score = Math.round(score * 100) / 100;
    if (score < WORK.hireBar) {
      const weakest = scores.indexOf(Math.min(...scores));
      why = {
        code: 'interview',
        score: Math.round(score * 100),
        need: Math.round(WORK.hireBar * 100),
        question: prof.questions[weakest]!.text,
      };
    }
  }

  a.decidedMonth = month;
  a.score = score;
  if (why) {
    a.status = 'rejected';
    a.why = why;
    a.reason = whyText(why);
    (work.cooldown ??= {})[b.id] = month + WORK.cooldownMonths;
    notify(world, me.id, {
      month,
      kind: 'warning',
      text: `${b.name} turned you down for ${rung.label}: ${a.reason}`,
    });
    return {
      hired: false,
      application: a,
      reason: a.reason,
      message: `${b.name}: not this time. ${a.reason}`,
    };
  }

  // Hired: one job at a time, so this one replaces any other.
  const before = me.job;
  const oldHours = before ? jobHours(me) : 0;
  const left =
    before && before.businessId !== b.id
      ? (world.markets[me.market]?.businesses?.[before.businessId]?.name ?? 'your old job')
      : null;
  me.job = {
    businessId: b.id,
    role: rung.role,
    since: a.promotion && before ? before.since : month,
    profession: prof.id,
    level: a.level,
    months: 0,
  };
  if (!a.promotion) work.perf = 0.5;
  // This month: the extra hours the new role takes on top of what's already been given.
  me.hours.used = Math.min(
    me.hours.available,
    me.hours.used + Math.max(0, proHours(a.level) - oldHours),
  );
  a.status = 'hired';
  a.why = {
    code: 'hired',
    role: rung.role,
    label: rung.label,
    strong: score >= WORK.hireBar + 0.08,
  };
  a.reason = whyText(a.why);
  const pay = proPay(m, prof, a.level);
  const fmt = (v: number) => formatMoney(v, m.data.currency);
  notify(world, me.id, {
    month,
    kind: 'milestone',
    text: a.promotion
      ? `Promoted at ${b.name}: you’re now ${rung.label}, ${fmt(pay)} a month before tax.`
      : `${b.name} hired you as ${rung.label}: ${fmt(pay)} a month before tax, ${proHours(a.level)}h a month.`,
  });
  return {
    hired: true,
    application: a,
    reason: a.reason,
    job: anyJobView(world, me),
    message: `${a.reason} ${a.promotion ? 'You’re promoted' : `You start at ${b.name}`}: ${fmt(pay)} a month before tax, ${proHours(a.level)}h a month.${left ? ` You left ${left}.` : ''}`,
  };
}

// ---------------------------------------------------------------- Month end

/** Month end, a professional job: payroll pays (income tax withheld); experience and skill grow. */
export function payProJob(world: World, p: Player, month: number) {
  const job = p.job;
  if (!job?.profession) return;
  const m = getMarket(world, p.market);
  const b = m.businesses?.[job.businessId];
  const prof = professionById(job.profession);
  if (!b || !prof || !isOpen(b) || b.market !== p.market) {
    notify(world, p.id, { month, kind: 'warning', text: 'Your job has ended.' });
    delete p.job;
    return;
  }
  const level = job.level ?? 1;
  const rung = prof.levels[level - 1];
  const gross = proPay(m, prof, level);
  const tax = Math.round(gross * m.data.tax.personalIncome);
  withTx(world, { kind: 'salary' }, () => {
    transfer(
      world,
      m.ext.payroll,
      p.accounts.local,
      gross,
      `Salary: ${rung?.label ?? 'Staff'} at ${b.name}`,
      month,
    );
    transfer(world, p.accounts.local, m.ext.tax, tax, `Income tax: ${b.name}`, month);
  });
  // A month of experience in the field (faster for fast learners) and a little skill.
  const work = ensureWork(p);
  work.exp[prof.field] = Math.round(((work.exp[prof.field] ?? 0) + learnRate(p)) * 10) / 10;
  job.months = (job.months ?? 0) + 1;
  const [first, second] = prof.skills;
  const grow = (s: Skill | undefined) => {
    if (s && (p.skills[s] ?? 0) < WORK.skillCap)
      p.skills[s] = Math.min(WORK.skillCap, (p.skills[s] ?? 0) + 1);
  };
  grow(first);
  if (job.months % 2 === 0) grow(second);
  // How the month went: rested and skilled people do better.
  const skill = bestSkill(p, prof).value;
  const month01 = clamp01(0.3 + p.energy / 200 + skill / 250 - (p.burnout ? 0.2 : 0));
  work.perf = Math.round((0.7 * (work.perf ?? 0.5) + 0.3 * month01) * 100) / 100;
}

/** Month end (jobs worlds): interviews nobody went to expire; part-time jobs count as service experience. */
export function settleWork(world: World, p: Player, month: number) {
  if (!jobsOn(world) || p.ai) return;
  if (p.job && !p.job.profession) {
    const work = ensureWork(p);
    work.exp.service = Math.round(((work.exp.service ?? 0) + learnRate(p)) * 10) / 10;
  }
  const work = p.work;
  if (!work) return;
  for (const a of work.applications) {
    // `month` is the month just starting: the one that ended is month - 1.
    if (a.status !== 'booked' || month - 1 < a.expiresMonth) continue;
    a.status = 'expired';
    a.decidedMonth = month;
    a.why = { code: 'expired' };
    a.reason = whyText(a.why);
    const b = world.markets[p.market]?.businesses?.[a.businessId];
    notify(world, p.id, {
      month,
      kind: 'warning',
      text: `You missed your interview at ${b?.name ?? 'the employer'}. Apply again when you can go.`,
    });
  }
}

// ---------------------------------------------------------------- Views

/** `view.me.job` for either kind of job. */
export function anyJobView(world: World, p: Player) {
  const job = p.job;
  if (!job?.profession) return myJobView(world, p);
  const m = world.markets[p.market];
  const b = m?.businesses?.[job.businessId];
  const prof = professionById(job.profession);
  const rung = prof?.levels[(job.level ?? 1) - 1];
  if (!m || !b || !prof || !rung) return null;
  return {
    businessId: b.id,
    businessName: b.name,
    role: rung.role,
    label: rung.label,
    monthlyPay: proPay(m, prof, job.level ?? 1),
    hours: proHours(job.level ?? 1),
    profession: prof.id,
    level: job.level ?? 1,
  };
}

/** `view.work`: the jobs rework (null in worlds without the release note). */
export function workView(world: World, p: Player) {
  if (!jobsOn(world) || p.ai) return null;
  const m = getMarket(world, p.market);
  const work = workOf(p);
  const head = headStartOf(p.backgroundId);
  const month = m.month;
  const employers = Object.values(businessesOf(m))
    .filter((b) => isOpen(b) && isEmployer(b))
    .sort(
      (x, y) =>
        PROFESSION_IDS.indexOf(professionOf(x)!.id) - PROFESSION_IDS.indexOf(professionOf(y)!.id) ||
        (x.id < y.id ? -1 : 1),
    );
  const job = p.job?.profession ? p.job : undefined;
  const booked = (bid: Id) =>
    work.applications.find((a) => a.businessId === bid && a.status === 'booked');
  const cooldown = (bid: Id) => {
    const until = work.cooldown?.[bid];
    return until !== undefined && month < until ? until : null;
  };
  const views = employers.map((b) => {
    const prof = professionOf(b)!;
    const mine = job?.businessId === b.id ? (job.level ?? 1) : 0;
    return {
      businessId: b.id,
      name: b.name,
      district: b.district,
      street: b.gen?.street ?? null,
      profession: prof.id,
      label: prof.label,
      field: prof.field,
      skills: prof.skills,
      headStart: head.levels[prof.id] ?? 0,
      cooldownUntil: cooldown(b.id),
      booked: booked(b.id)?.id ?? null,
      levels: prof.levels.map((l) => {
        const gate =
          mine && l.level === mine + 1
            ? (levelGate(p, prof, l.level) ?? promotionGate(p))
            : levelGate(p, prof, l.level);
        return {
          level: l.level,
          role: l.role,
          label: l.label,
          monthlyPay: proPay(m, prof, l.level),
          hours: proHours(l.level),
          months: LEVEL_MONTHS[l.level - 1] ?? 0,
          skillMin: prof.skillMin[l.level - 1] ?? 0,
          status: (mine && l.level === mine
            ? 'current'
            : mine && l.level < mine
              ? 'below'
              : gate
                ? gate.code
                : 'eligible') as 'current' | 'below' | 'eligible' | JobWhy['code'],
          why: mine && l.level <= mine ? null : gate,
          reason: mine && l.level <= mine ? null : gate ? whyText(gate) : null,
          promotion: !!mine && l.level === mine + 1,
        };
      }),
    };
  });
  const byId = new Map(employers.map((b) => [b.id, b]));
  const prof = job ? professionById(job.profession!) : undefined;
  const nextRung = job && prof ? prof.levels[job.level ?? 1] : undefined;
  const nextGate =
    job && prof && nextRung ? (levelGate(p, prof, nextRung.level) ?? promotionGate(p)) : null;
  return {
    applyHours: WORK.applyHours,
    interviewHours: WORK.interviewHours,
    hoursLeft: hoursLeft(p),
    learnRate: learnRate(p),
    exp: Object.fromEntries(WORK_FIELDS.map((f) => [f, floorMonths(work.exp[f])])) as Record<
      WorkField,
      number
    >,
    job:
      job && prof
        ? {
            businessId: job.businessId,
            employer: byId.get(job.businessId)?.name ?? '',
            profession: prof.id,
            professionLabel: prof.label,
            field: prof.field,
            level: job.level ?? 1,
            levels: prof.levels.length,
            label: prof.levels[(job.level ?? 1) - 1]?.label ?? '',
            months: job.months ?? 0,
            since: job.since,
            monthlyPay: proPay(m, prof, job.level ?? 1),
            hours: proHours(job.level ?? 1),
            perf: work.perf ?? 0.5,
            next: nextRung
              ? {
                  level: nextRung.level,
                  label: nextRung.label,
                  monthlyPay: proPay(m, prof, nextRung.level),
                  hours: proHours(nextRung.level),
                  why: nextGate,
                  reason: nextGate ? whyText(nextGate) : null,
                  booked: booked(job.businessId)?.id ?? null,
                }
              : null,
          }
        : null,
    employers: views,
    applications: work.applications.map((a) => {
      const pr = professionById(a.profession);
      const b = world.markets[p.market]?.businesses?.[a.businessId];
      return {
        ...a,
        employer: b?.name ?? '',
        label: pr?.levels[a.level - 1]?.label ?? '',
        professionLabel: pr?.label ?? '',
        canAttend: a.status === 'booked' && month <= a.expiresMonth,
        questions:
          a.status === 'booked' && pr
            ? pr.questions.map((qq) => ({
                id: qq.id,
                text: qq.text,
                options: qq.options.map((op) => op.text),
              }))
            : [],
      };
    }),
  };
}
