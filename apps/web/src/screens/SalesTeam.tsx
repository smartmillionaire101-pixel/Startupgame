/**
 * Round 7: your team, visible (player feedback: "hires do nothing visible").
 * Small, separate components so the mockup can restyle each one:
 *
 *   - DealOwner: whose deal it is, on the Sales board.
 *   - TeamTip: a salesperson's tip in a sales conversation.
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

type DealV = NonNullable<Company['sales']>['deals'][number];
type Talk = NonNullable<DealV['talk']>;
type Brings = NonNullable<Company['teamBrings']>[string];
type TeamWork = NonNullable<RecapView['companies'][number]['team']>[number];

const needShort = (n: string) =>
  ({
    fit: t('a product that fits how they work'),
    price: t('a low price'),
    stars: t('a name they trust'),
    reliability: t('something that never breaks'),
  })[n] ?? n;

/** Whose deal it is (a salesperson brought or took it). */
export function DealOwner({ d }: { d: DealV }) {
  if (!d.owner) return null;
  return (
    <span className="sales-owner small" data-deal-owner={d.owner.id}>
      {t('Owner: {name}', { name: d.owner.name })}
    </span>
  );
}

/** A salesperson who knows this kind of customer says what to lead with. */
export function TeamTip({ d, tip }: { d: DealV; tip: NonNullable<Talk['tip']> }) {
  return (
    <p className="bubble team-tip small" data-team-tip={tip.need}>
      💡{' '}
      {t('{name}: {who} care most about {need}. Lead with that.', {
        name: tip.name.split(' ')[0]!,
        who: tx(d.segment),
        need: needShort(tip.need),
      })}
    </p>
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
  go: (cmd: Partial<Extract<Command, { type: 'sales.talk' }>>) => Promise<unknown>;
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
          {t('Let {name} take it (skill {n})', {
            name: s.name.split(' ')[0]!,
            n: Math.round(s.skill * 100),
          })}
        </Button>
      ))}
    </div>
  );
}

/** What someone would bring, before you hire them. */
export function HireBrings({ b }: { b: Brings | null | undefined }) {
  if (!b) return null;
  const lines: string[] = [];
  if (b.leadsPerMonth > 0)
    lines.push(
      b.ownSector
        ? t('Brings {n} leads a month from {sector}, and runs discovery on them', {
            n: b.leadsPerMonth,
            sector: tx(b.expertiseName),
          })
        : t('Brings {n} leads a month (knows {sector}, not your market)', {
            n: b.leadsPerMonth,
            sector: tx(b.expertiseName),
          }),
    );
  if (b.winLift > 0) lines.push(t('+{p} win chance on their deals', { p: pct(b.winLift) }));
  if (b.roadmapWeeks > 0)
    lines.push(t('About {n} person-weeks of roadmap work a month', { n: b.roadmapWeeks }));
  if (b.demoLift > 0) lines.push(t('Joins your demos: +{p} demo score', { p: pct(b.demoLift) }));
  if (b.buildLift > 0) lines.push(t('The whole team builds {p} faster', { p: pct(b.buildLift) }));
  if (b.warmLift > 0)
    lines.push(t('Warmer leads from their contacts (+{p} trust)', { p: pct(b.warmLift) }));
  if (b.pitchLift > 0) lines.push(t('A better pitch to investors, and warm intros'));
  if (!lines.length && b.expertiseName)
    lines.push(t('Knows {sector} from their last job', { sector: tx(b.expertiseName) }));
  if (!lines.length) return null;
  return (
    <ul className="hire-brings small" aria-label={t('What they’ll bring')} data-brings>
      {lines.map((l) => (
        <li key={l}>{l}</li>
      ))}
    </ul>
  );
}

function workLine(p: TeamWork): string {
  const bits: string[] = [];
  if (p.leads) bits.push(t('brought {n} leads', { n: p.leads }));
  if (p.discovered) bits.push(t('ran {n} discovery meetings', { n: p.discovered }));
  if (p.won) bits.push(t('signed {n} deals', { n: p.won }));
  if (p.demos) bits.push(t('joined {n} demos', { n: p.demos }));
  if (p.roadmapWeeks) bits.push(t('put {n} person-weeks into the roadmap', { n: p.roadmapWeeks }));
  if (p.warm) bits.push(t('warmed up {n} leads', { n: p.warm }));
  if (!bits.length) bits.push(t('kept things running'));
  return bits.join(', ');
}

/** The recap's "Your team this month". */
export function TeamMonth({ team }: { team: TeamWork[] | null }) {
  if (!team?.length) return null;
  return (
    <div className="recap-team" data-recap-team={team.length}>
      <div className="recap-money-name small">{t('Your team this month')}</div>
      <ul className="recap-list">
        {team.map((p) => (
          <li key={p.staffId} data-team-member={p.staffId}>
            <b>{p.name.split(' ')[0]}</b>
            {p.title ? ` (${p.title})` : ''}: {workLine(p)}
            {p.skillTo > p.skillFrom
              ? ' · ' +
                t('skill {from} → {to}', {
                  from: Math.round(p.skillFrom * 100),
                  to: Math.round(p.skillTo * 100),
                })
              : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}
