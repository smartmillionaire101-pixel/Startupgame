/**
 * Round 7: your team, visible (player feedback: "hires do nothing visible").
 * Small, separate components, one per place a hire shows up:
 *
 *   - DealOwner: on a deal card, who is handling it ("Tunde is handling
 *     this"), with Let them take the talk / Hand to them / Handle it yourself.
 *   - TeamTip: a salesperson's tip in a sales conversation, and Let them take over.
 *   - SitsIn: by the win meter, what the deal's salesperson adds.
 *   - DelegateTalk: let a salesperson take the conversation for you.
 *   - HireBrings: on a hire card, what they'd bring before you hire them.
 *   - TeamMonth: the recap's "Your team this month".
 *
 * The engine decides what each person does (team.ts); this only shows it.
 */
import type { Command, RecapView } from '@runway/engine';
import { pct } from '../format';
import { t, tx } from '../i18n';
import type { Company } from '../store';
import { Button } from '../ui';
import './sales.css';

type DealV = NonNullable<Company['sales']>['deals'][number];
type Talk = NonNullable<DealV['talk']>;
type Brings = NonNullable<Company['teamBrings']>[string];
type TeamWork = NonNullable<RecapView['companies'][number]['team']>[number];
type TalkCmd = Partial<Extract<Command, { type: 'sales.talk' }>>;

const first = (name: string) => name.split(' ')[0]!;

/** "Tunde Bakare" → "TB". */
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

/** A round badge with someone's initials (the avatar of a hire). */
export function TeamAvatar({ name, kind }: { name: string; kind?: string }) {
  return (
    <span className={`team-av${kind ? ` ${kind}` : ''}`} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

const needShort = (n: string) =>
  ({
    fit: t('a product that fits how they work'),
    price: t('a low price'),
    stars: t('a name they trust'),
    reliability: t('something that never breaks'),
  })[n] ?? n;

const skillOf = (s: { skill: number }) => Math.round(s.skill * 100);

/**
 * Who is handling a deal. A salesperson's deal says so (their lead, their
 * skill's lift) with "Let them take the talk" and "Handle it yourself"; your own
 * deal, with salespeople on the team, offers "Hand to …".
 */
export function DealOwner({
  d,
  staff,
  brings,
  busy,
  onAssign,
  onDelegate,
}: {
  d: DealV;
  /** The sales team (id, name, skill). */
  staff: { id: string; name: string; skill: number }[];
  brings?: Company['teamBrings'];
  busy?: boolean;
  onAssign?: (staffId: string | null) => void;
  onDelegate?: (staffId: string) => void;
}) {
  const open = d.monthsLeft !== null;
  if (d.owner) {
    const o = d.owner;
    const lift = brings?.[o.id]?.winLift ?? 0;
    const canTalk = open && !!d.talk?.delegates.some((x) => x.id === o.id);
    const bits = [
      t('skill {n}', { n: skillOf(o) }),
      ...(lift > 0 && open ? [t('+{p} from their skill', { p: pct(lift) })] : []),
    ];
    return (
      <div className="deal-owner" data-deal-owner={o.id}>
        <TeamAvatar name={o.name} />
        <span className="deal-owner-text">
          <b>
            {open
              ? t('{name} is handling this', { name: first(o.name) })
              : t('{name} handled this', { name: first(o.name) })}
          </b>
          <span className="muted">{bits.join(' · ')}</span>
        </span>
        {open && (canTalk || onAssign) && (
          <span className="deal-owner-btns">
            {canTalk && onDelegate && (
              <Button
                size="sm"
                variant="subtle"
                disabled={busy}
                onClick={() => onDelegate(o.id)}
                data-owner-talk
              >
                {t('Let {name} take the talk', { name: first(o.name) })}
              </Button>
            )}
            {onAssign && (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => onAssign(null)}
                data-owner-take
              >
                {t('Handle it yourself')}
              </Button>
            )}
          </span>
        )}
      </div>
    );
  }
  if (!open || !staff.length || !onAssign) return null;
  return (
    <div className="deal-owner mine" data-deal-owner="me">
      <span className="team-av you" aria-hidden="true">
        {t('You')}
      </span>
      <span className="deal-owner-text">
        <b>{t('You’re handling this')}</b>
      </span>
      <span className="deal-owner-btns">
        {staff.map((s) => (
          <Button
            key={s.id}
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => onAssign(s.id)}
            data-hand-to={s.id}
          >
            {t('Hand to {name}', { name: first(s.name) })}
          </Button>
        ))}
      </span>
    </div>
  );
}

/**
 * A salesperson who knows this kind of customer says what to lead with,
 * and can take the conversation over from here.
 */
export function TeamTip({
  d,
  tip,
  talk,
  busy,
  go,
}: {
  d: DealV;
  tip: NonNullable<Talk['tip']>;
  talk: Talk;
  busy: boolean;
  go: (cmd: TalkCmd) => Promise<unknown>;
}) {
  const who = talk.delegates.find((s) => s.id === tip.staffId);
  return (
    <div className="team-tip" data-team-tip={tip.need}>
      <TeamAvatar name={tip.name} />
      <span>
        <b>{first(tip.name)}:</b>{' '}
        {t('“{who} care most about {need}. Lead with that.”', {
          who: tx(d.segment),
          need: needShort(tip.need),
        })}
        <span className="team-handoff">
          {who
            ? t('{name}’s tip (sales skill {n})', { name: first(tip.name), n: skillOf(who) })
            : t('{name}’s tip', { name: first(tip.name) })}
          {who && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => void go({ dealId: d.id, action: 'delegate', staffId: who.id })}
              data-take-over={who.id}
            >
              {t('Let {name} take over', { name: first(who.name) })}
            </Button>
          )}
        </span>
      </span>
    </div>
  );
}

/** By the win meter: the deal's salesperson sits in, and what they add. */
export function SitsIn({ d, brings }: { d: DealV; brings?: Company['teamBrings'] }) {
  if (!d.owner) return null;
  const lift = brings?.[d.owner.id]?.winLift ?? 0;
  if (lift <= 0) return null;
  return (
    <div className="deal-owner sits-in" data-sits-in={d.owner.id}>
      <TeamAvatar name={d.owner.name} />
      <span>
        {t('{name} sits in:', { name: first(d.owner.name) })}{' '}
        <b>{t('+{p} win chance', { p: pct(lift) })}</b>
      </span>
    </div>
  );
}

/** Let a salesperson take the conversation (their skill, not your hours). */
export function DelegateTalk({
  d,
  talk,
  busy,
  go,
}: {
  d: DealV;
  talk: Talk;
  busy: boolean;
  go: (cmd: TalkCmd) => Promise<unknown>;
}) {
  if (!talk.delegates.length) return null;
  return (
    <div className="team-delegate" data-delegate>
      {talk.delegates.map((s) => (
        <Button
          key={s.id}
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => void go({ dealId: d.id, action: 'delegate', staffId: s.id })}
        >
          {t('Let {name} take it (skill {n})', { name: first(s.name), n: skillOf(s) })}
        </Button>
      ))}
      <span className="small muted">
        {t('Their skill decides it: a weaker salesperson can lose a deal you’d have won.')}
      </span>
    </div>
  );
}

/**
 * What someone would bring, before you hire them: a box "What X will
 * bring" with a line per job (their sector, leads, the chance they add, the
 * roadmap work, demos, warm leads and the pitch).
 */
export function HireBrings({
  b,
  name,
  skill,
  hired,
}: {
  b: Brings | null | undefined;
  /** On your team already: "What X brings". */
  hired?: boolean;
  /** Their name, for the heading (without it: "What they’ll bring"). */
  name?: string;
  /** Their skill as you know it, and whether it's been checked. */
  skill?: { n: number; checked: boolean };
}) {
  if (!b) return null;
  const lines: { icon: string; text: string; tag?: string }[] = [];
  const sector = b.expertiseName ? tx(b.expertiseName) : '';
  if (b.leadsPerMonth > 0)
    lines.push(
      b.ownSector
        ? {
            icon: '🎯',
            text:
              b.leadsPerMonth === 1
                ? t('Finds you a lead a month from {sector}, and runs discovery on it', { sector })
                : t('Finds you {n} leads a month from {sector}, and runs discovery on them', {
                    n: b.leadsPerMonth,
                    sector,
                  }),
            tag: t('knows {sector}', { sector }),
          }
        : {
            icon: '🎯',
            text:
              b.leadsPerMonth === 1
                ? t('Brings a lead a month (knows {sector}, not your market)', { sector })
                : t('Brings {n} leads a month (knows {sector}, not your market)', {
                    n: b.leadsPerMonth,
                    sector,
                  }),
          },
    );
  if (b.winLift > 0)
    lines.push({
      icon: '📈',
      text: skill
        ? t('+{p} win chance on their deals at skill {n}; can take a sales talk themselves', {
            p: pct(b.winLift),
            n: skill.n,
          })
        : t('+{p} win chance on their deals; can take a sales talk themselves', {
            p: pct(b.winLift),
          }),
    });
  if (b.leadsPerMonth > 0)
    lines.push({ icon: '💡', text: t('Gives you tips in your own sales conversations') });
  if (b.roadmapWeeks > 0)
    lines.push({
      icon: '🛠️',
      text: t('About {n} person-weeks of roadmap work a month', { n: b.roadmapWeeks }),
    });
  if (b.demoLift > 0)
    lines.push({
      icon: '🖥️',
      text: t('Joins your demos: +{p} demo score', { p: pct(b.demoLift) }),
    });
  if (b.buildLift > 0)
    lines.push({
      icon: '⚡',
      text: t('The whole team builds {p} faster', { p: pct(b.buildLift) }),
    });
  if (b.warmLift > 0)
    lines.push({
      icon: '🤝',
      text: t('Warmer leads from their contacts (+{p} trust)', { p: pct(b.warmLift) }),
    });
  if (b.pitchLift > 0)
    lines.push({ icon: '💼', text: t('A better pitch to investors, and warm intros') });
  if (!lines.length && sector)
    lines.push({ icon: '🧭', text: t('Knows {sector} from their last job', { sector }) });
  if (!lines.length) return null;
  const title = !name
    ? t('What they’ll bring')
    : hired
      ? t('What {name} brings', { name: first(name) })
      : t('What {name} will bring', { name: first(name) });
  return (
    <div className="hire-brings" data-brings>
      <h4>{title}</h4>
      <ul aria-label={title}>
        {lines.map((l) => (
          <li key={l.text}>
            <span aria-hidden="true">{l.icon}</span>
            <span>
              {l.text}
              {l.tag && <span className="hire-sector">{l.tag}</span>}
            </span>
          </li>
        ))}
      </ul>
      <div className="hire-grow">
        {skill && !skill.checked
          ? t(
              'Gets better each month on the job. This is what their CV claims: an interview checks it.',
            )
          : t('Gets better each month on the job.')}
      </div>
    </div>
  );
}

/** What one person did this month, a line per thing. */
function workLines(p: TeamWork): string[] {
  const out: string[] = [];
  const n = (x: number | undefined, one: string, many: string) => {
    if (x) out.push(x === 1 ? t(one) : t(many, { n: x }));
  };
  n(p.leads, 'Found a lead', 'Found {n} leads');
  n(p.discovered, 'Ran a discovery meeting', 'Ran {n} discovery meetings');
  n(p.won, 'Signed a deal', 'Signed {n} deals');
  n(p.demos, 'Joined a demo', 'Joined {n} demos');
  if (p.roadmapWeeks) out.push(t('Put {n} person-weeks into the roadmap', { n: p.roadmapWeeks }));
  n(p.warm, 'Warmed up a lead', 'Warmed up {n} leads');
  if (!out.length) out.push(t('Kept things running'));
  return out;
}

const kindOf = (p: TeamWork) =>
  p.title ? 'cof' : p.role === 'engineer' || p.role === 'product' ? 'eng' : '';

/** The recap's "Your team this month": a line per person on what they did, and their skill. */
export function TeamMonth({ team }: { team: TeamWork[] | null }) {
  if (!team?.length) return null;
  return (
    <div className="recap-team" data-recap-team={team.length}>
      {team.map((p) => (
        <div key={p.staffId} className={`team-person ${kindOf(p)}`} data-team-member={p.staffId}>
          <TeamAvatar name={p.name} />
          <div>
            <b>{p.name}</b>
            {p.title ? <span className="small muted"> · {tx(p.title)}</span> : null}
            <ul className="team-did">
              {workLines(p).map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </div>
          {p.skillTo > p.skillFrom ? (
            <span className="team-skill">
              {t('skill {from} → {to}', {
                from: Math.round(p.skillFrom * 100),
                to: Math.round(p.skillTo * 100),
              })}
            </span>
          ) : (
            <span className="team-skill flat">
              {t('skill {n}', { n: Math.round(p.skillTo * 100) })}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
