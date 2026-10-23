/**
 * Investor deal flow (deal-flow release): founders who pitched you at
 * events, the investors you talked strategy with and what they taught you,
 * and a fund pitch that LPs judge on its strategy (`fund.raise` with a
 * plan), with their questions, reasons and commitments.
 *
 * A pitch card offers a follow-up meeting (first-call diligence), terms at
 * the founder's ask and valuation (`invest.propose`), or a pass with a
 * reason (`pipeline.pass`): the ordinary deal flow.
 */
import type { PlayerView, Stage } from '@runway/engine';
import { LIFETIME_FEE_YEARS, strategyChecks, type StrategyCheck } from '@runway/engine';
import { useState } from 'react';
import { amountInput, money, parseAmount, pct } from '../format';
import { t, tx } from '../i18n';
import { useView } from '../store';
import { Button, Card, Empty, Field, Pill, Segmented, Stat } from '../ui';
import { stageLabel } from './common';
import { stageText } from './Pipeline';
import './investor.css';

type DealFlowView = NonNullable<PlayerView['investorDealFlow']>;
export type PitchRow = DealFlowView['pitches'][number];
export type TalkRow = DealFlowView['talks'][number];
export type PanelReview = NonNullable<DealFlowView['lastPanel']>;

/** What an event did for an investor (`techevent.attend`, `hangout.*` results). */
export interface EventDealFlow {
  pitches: PitchRow[];
  investors: TalkRow[];
  lessonsLearned: number;
}

export const dealflowOf = (view: PlayerView): DealFlowView | null =>
  (view as { investorDealFlow?: DealFlowView | null }).investorDealFlow ?? null;

function whereText(p: PitchRow['pitch']): string {
  if (p.whereKind === 'referral') return t('Referred by {name}', { name: p.via?.name ?? '' });
  if (p.whereKind === 'hangout') return t('Met at {place}', { place: tx(p.where) });
  return t('Pitched you at {event}', { event: tx(p.where) });
}

const stagesText = (stages: readonly string[]) => stages.map(stageLabel).join(', ');

// ---------------------------------------------------------------- pitches

/** One founder's pitch, with the follow-up, invest and pass actions. */
export function PitchCard({ p: given }: { p: PitchRow }) {
  const { view, send, meta, busy } = useView();
  // The live row (its stage moves with diligence and deals), else the one we were given.
  const p =
    (view && dealflowOf(view)?.pitches.find((x) => x.companyId === given.companyId)) || given;
  const pitch = p.pitch;
  const cur = p.currency;
  const industry = meta?.industries.find((i) => i.id === pitch.industry)?.label ?? pitch.industry;
  const cheque = Math.min(pitch.ask, view?.me.investor?.checkSize || pitch.ask);
  const live = p.status === 'active' && p.stage !== 'passed' && p.stage !== 'closed';
  const [reason, setReason] = useState('traction');
  const invest = () =>
    void send<{ status: string }>(
      {
        type: 'invest.propose',
        companyId: p.companyId,
        instrument: pitch.instrument,
        amount: cheque,
        valuation: pitch.valuation,
        proRata: true,
        boardSeat: false,
        vetoOnSale: false,
      },
      (x) =>
        x.status === 'accepted'
          ? t('Accepted. You’re in.')
          : x.status === 'declined'
            ? t('They walked away.')
            : t('Term sheet sent.'),
    );
  return (
    <div className="inv-row df-pitch" data-pitch={p.companyId} data-stage={p.stage}>
      <div className="grow">
        <strong>{p.name}</strong> <Pill>{stageText(p.stage)}</Pill>{' '}
        {p.hot && <Pill tone="warn">{t('Hot round')}</Pill>}{' '}
        {pitch.via?.coinvest && <Pill tone="info">{t('Co-invest')}</Pill>}{' '}
        {pitch.human && <Pill tone="info">{t('Human founder')}</Pill>}
        <div className="small muted">
          {whereText(pitch)} · {pitch.founderName}
        </div>
        <p className="small df-quote">“{tx(p.idea)}”</p>
        <div className="row small df-facts">
          <Pill>{stageLabel(pitch.stage)}</Pill>
          <Pill>{tx(industry)}</Pill>
          <span>{t('Revenue {amount}/mo', { amount: money(pitch.revenue, cur) })}</span>
          <span>{t('{n} paying customers', { n: pitch.customers })}</span>
          {pitch.growth !== 0 && <span>{t('{pct} a month', { pct: pct(pitch.growth, 0) })}</span>}
          <span>{pitch.team === 1 ? t('A solo founder') : t('{n} people', { n: pitch.team })}</span>
        </div>
        <div className="small">
          {pitch.instrument === 'safe'
            ? t('Raising {ask} on a SAFE capped at {valuation}', {
                ask: money(pitch.ask, cur),
                valuation: money(pitch.valuation, cur),
              })
            : t('Raising {ask} at {valuation} pre-money', {
                ask: money(pitch.ask, cur),
                valuation: money(pitch.valuation, cur),
              })}
        </div>
      </div>
      {live && (
        <div className="row df-actions">
          <Button
            size="sm"
            variant="subtle"
            disabled={busy || p.diligence >= 1}
            data-followup
            onClick={() =>
              void send(
                { type: 'invest.diligence', companyId: p.companyId, depth: 1 },
                t('Follow-up meeting done: their numbers are open to you.'),
              )
            }
          >
            {p.diligence >= 1 ? t('Met again ✓') : t('Follow-up meeting (4h)')}
          </Button>
          <Button size="sm" disabled={busy} data-invest onClick={invest}>
            {t('Invest {amount}', { amount: money(cheque, cur) })}
          </Button>
          <select
            aria-label={t('Reason to pass')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          >
            <option value="traction">{t('Traction')}</option>
            <option value="team">{t('Team')}</option>
            <option value="market">{t('Market')}</option>
            <option value="price">{t('Price')}</option>
            <option value="fit">{t('Fit')}</option>
            <option value="timing">{t('Timing')}</option>
          </select>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() =>
              void send(
                { type: 'pipeline.pass', companyId: p.companyId, reason: reason as never },
                t('Passed, with a note to the founder.'),
              )
            }
          >
            {t('Pass')}
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- investors

/** A conversation with an AI investor: their strategy, a lesson, maybe a referral. */
export function TalkCard({ talk }: { talk: TalkRow }) {
  const { meta } = useView();
  const sectors =
    talk.sectors === 'any'
      ? t('any sector')
      : talk.sectors
          .map((s) => tx(meta?.industries.find((i) => i.id === s)?.label ?? s))
          .join(', ');
  const cheque = {
    lo: money(talk.cheque[0], talk.currency),
    hi: money(talk.cheque[1], talk.currency),
    stages: stagesText(talk.stages),
    sectors,
  };
  return (
    <div className="df-talk" data-talk={talk.fundId}>
      <div>
        <strong>{talk.name}</strong>{' '}
        <span className="small muted">{talk.angel ? t('Angel investor') : talk.org}</span>{' '}
        {talk.learned && <Pill tone="good">{t('New lesson')}</Pill>}
      </div>
      <p className="small df-quote">
        “
        {talk.angel
          ? t('I write {lo}–{hi} cheques from my own money, at {stages}, in {sectors}.', cheque)
          : t('We write {lo}–{hi} cheques at {stages}, in {sectors}, from a {size} fund.', {
              ...cheque,
              size: money(talk.size, talk.currency),
            })}{' '}
        {t(
          'About {n} companies, {reserves} kept for follow-ons, and about {own} ownership at entry.',
          {
            n: talk.companies,
            reserves: pct(talk.reserveRatio, 0),
            own: pct(talk.ownership, 1),
          },
        )}
        ”
      </p>
      <p className="small df-quote">“{tx(talk.lesson)}”</p>
      <p className="small muted">💡 {tx(talk.tip)}</p>
      {talk.referred && (
        <p className="small good" data-referral>
          {talk.coinvest
            ? t('“I’m in {company}, and there’s room for you.” It’s in your pipeline.', {
                company: talk.referred.name,
              })
            : t('“Meet {company}: not for me, but maybe for you.” It’s in your pipeline.', {
                company: talk.referred.name,
              })}
        </p>
      )}
    </div>
  );
}

/** What an event gave an investor: the pitches (with actions) and the conversations. */
export function EventDealFlowResult({ result }: { result: EventDealFlow }) {
  if (!result.pitches.length && !result.investors.length) return null;
  return (
    <div className="df-result" data-dealflow>
      {result.pitches.length > 0 && (
        <>
          <h3 className="cap-h">{t('{n} founders pitched you', { n: result.pitches.length })}</h3>
          {result.pitches.map((p) => (
            <PitchCard key={p.companyId} p={p} />
          ))}
        </>
      )}
      {result.investors.length > 0 && (
        <>
          <h3 className="cap-h">{t('Investors you talked strategy with')}</h3>
          {result.investors.map((x) => (
            <TalkCard key={x.fundId + x.month} talk={x} />
          ))}
        </>
      )}
      <p className="inv-note">{t('Everything is in Portfolio → Pipeline.')}</p>
    </div>
  );
}

/** Portfolio → Pipeline: pitches from events, and what other investors taught you. */
export function EventPitches() {
  const { view } = useView();
  const d = view ? dealflowOf(view) : null;
  if (!d) return null;
  const live = d.pitches.filter((p) => p.stage !== 'passed' && p.stage !== 'closed');
  return (
    <>
      <Card
        title={t('Met at events')}
        sub={t('Founders who pitched you, and deals other investors referred')}
      >
        {live.length === 0 ? (
          <Empty>
            {t(
              'Go to a tech event, a demo day or an investor breakfast (phone → Events): founders will pitch you there.',
            )}
          </Empty>
        ) : (
          live.slice(0, 12).map((p) => <PitchCard key={p.companyId} p={p} />)
        )}
      </Card>
      <Card
        title={t('What other investors taught you')}
        sub={t('{n} of {total} lessons · investing skill {skill}', {
          n: d.lessons.length,
          total: d.lessonsTotal,
          skill: d.skill,
        })}
      >
        {d.lessons.length === 0 ? (
          <Empty>
            {t(
              'Investors at events share how they build a fund. Each new lesson makes you sharper.',
            )}
          </Empty>
        ) : (
          <ul className="list small df-lessons">
            {d.lessons.map((l) => (
              <li key={l.id} data-lesson={l.id}>
                {tx(l.text)} <span className="muted">💡 {tx(l.tip)}</span>
              </li>
            ))}
          </ul>
        )}
        {d.talks.slice(0, 3).map((x) => (
          <TalkCard key={x.fundId + x.month} talk={x} />
        ))}
      </Card>
    </>
  );
}

// ---------------------------------------------------------------- the LP pitch

const LEVEL_TONE = { good: 'good', warn: 'warn', bad: 'bad' } as const;
const levelText = (l: string) =>
  l === 'good' ? t('fine') : l === 'warn' ? t('a stretch') : t('doesn’t add up');

/** A strategy check, in words. */
export function checkText(c: Pick<StrategyCheck, 'id' | 'level' | 'values'>, cur: string): string {
  const v = c.values;
  const good = c.level === 'good';
  switch (c.id) {
    case 'deploy':
      return good
        ? t('{n} companies at your cheque fit the {room} left after fees and reserves.', {
            n: v.companies ?? 0,
            room: money(v.room ?? 0, cur),
          })
        : t(
            '{n} companies need {need} for first cheques, but {room} is left after fees and reserves: room for about {fit}.',
            {
              n: v.companies ?? 0,
              need: money(v.need ?? 0, cur),
              room: money(v.room ?? 0, cur),
              fit: v.fit ?? 0,
            },
          );
    case 'portfolio':
      return good
        ? t('{n} companies: enough shots for this stage ({lo}–{hi}).', {
            n: v.companies ?? 0,
            lo: v.lo ?? 0,
            hi: v.hi ?? 0,
          })
        : t('{n} companies: LPs expect {lo}–{hi} at this stage.', {
            n: v.companies ?? 0,
            lo: v.lo ?? 0,
            hi: v.hi ?? 0,
          });
    case 'reserves':
      return good
        ? t('{pct} kept for follow-ons fits the stage.', { pct: pct(v.reserves ?? 0, 0) })
        : t('{pct} kept for follow-ons: {lo}–{hi} is usual at this stage.', {
            pct: pct(v.reserves ?? 0, 0),
            lo: pct(v.lo ?? 0, 0),
            hi: pct(v.hi ?? 0, 0),
          });
    case 'ownership':
      return good
        ? t(
            'Your cheque buys about {implied} at a typical {post} post-money; you aim for {target}.',
            {
              implied: pct(v.implied ?? 0, 1),
              post: money(v.post ?? 0, cur),
              target: pct(v.target ?? 0, 1),
            },
          )
        : t(
            'Your cheque buys about {implied} at a typical {post} post-money, not the {target} you aim for.',
            {
              implied: pct(v.implied ?? 0, 1),
              post: money(v.post ?? 0, cur),
              target: pct(v.target ?? 0, 1),
            },
          );
    case 'terms':
      return good
        ? t('A {fee} fee and {carry} carry: market terms.', {
            fee: pct(v.fee ?? 0, 1),
            carry: pct(v.carry ?? 0, 0),
          })
        : t('A {fee} fee and {carry} carry: above market for this fund.', {
            fee: pct(v.fee ?? 0, 1),
            carry: pct(v.carry ?? 0, 0),
          });
    case 'focus':
      return good
        ? t('A focused thesis: {n} sectors.', { n: v.sectors ?? 0 })
        : t('{n} sectors and {s} stages: a broad thesis is a hard sell.', {
            n: v.sectors ?? 0,
            s: v.stages ?? 0,
          });
    case 'size':
      return good
        ? t('The fund size is credible for your record.')
        : v.later
          ? t('The fund is {x}× your last one: LPs find that a stretch.', { x: v.multiple ?? 0 })
          : t('The fund is {x}× what you have invested so far: LPs find that a stretch.', {
              x: v.multiple ?? 0,
            });
    default:
      return good
        ? t('A geography you can cover.')
        : t('LPs doubt a first fund can cover that geography.');
  }
}

/** A question an LP asked, and the answer your numbers give. */
function questionText(q: PanelReview['questions'][number]): [string, string] {
  const v = q.values;
  switch (q.id) {
    case 'q-deploy':
      return [
        t('How do {n} companies fit in this fund?', { n: v.companies ?? 0 }),
        t('After fees and reserves there is room for about {fit} first cheques.', {
          fit: v.fit ?? 0,
        }),
      ];
    case 'q-portfolio':
      return [
        t('Is {n} companies the right portfolio for this stage?', { n: v.companies ?? 0 }),
        t('Funds at this stage usually back {lo}–{hi}, so one winner can return the fund.', {
          lo: v.lo ?? 0,
          hi: v.hi ?? 0,
        }),
      ];
    case 'q-reserves':
      return [
        t('What happens when your winners raise again?'),
        t('With {pct} in reserve you can follow on; {lo}–{hi} is usual.', {
          pct: pct(v.reserves ?? 0, 0),
          lo: pct(v.lo ?? 0, 0),
          hi: pct(v.hi ?? 0, 0),
        }),
      ];
    case 'q-ownership':
      return [
        t('Can your cheque buy the ownership you want?'),
        t('About {implied} a cheque at today’s prices, against your {target} target.', {
          implied: pct(v.implied ?? 0, 1),
          target: pct(v.target ?? 0, 1),
        }),
      ];
    case 'q-terms':
      return [
        t('Why these fees and carry for this fund?'),
        t('{fee} and {carry}: most first funds charge 2% and 20%.', {
          fee: pct(v.fee ?? 0, 1),
          carry: pct(v.carry ?? 0, 0),
        }),
      ];
    case 'q-size':
      return [
        t('Why this much money now?'),
        t('It is {x}× what you have shown so far.', { x: v.multiple ?? 0 }),
      ];
    case 'q-geography':
      return [t('How will you cover that geography?'), t('Most first funds stay close to home.')];
    case 'q-dpi':
      return [
        t('Have you returned any cash yet?'),
        t('Not yet: {deals} deals at {tvpi}× on paper.', {
          deals: v.deals ?? 0,
          tvpi: v.tvpi ?? 0,
        }),
      ];
    case 'q-losses':
      return [
        t('What did you learn from your losses?'),
        t('{n} companies lost money; LPs want to hear what you changed.', { n: v.losses ?? 0 }),
      ];
    case 'q-sourcing':
      return [
        t('Where does your deal flow come from?'),
        t('{n} companies in your pipeline, {e} from events and referrals.', {
          n: v.pipeline ?? 0,
          e: v.events ?? 0,
        }),
      ];
    default:
      return [
        t('Why will you win?'),
        t('{deals} deals done; lessons from other investors: {lessons}.', {
          deals: v.deals ?? 0,
          lessons: v.lessons ?? 0,
        }),
      ];
  }
}

/** Why an LP committed or passed, in their words. */
export function reasonText(id: string): string {
  switch (id) {
    case 'later-funds':
      return t('We only back a manager’s second fund or later.');
    case 'bar-deals':
      return t('We want more deals on your record first.');
    case 'bar-stars':
      return t('We back managers with a stronger reputation.');
    case 'pass-track':
      return t('Your track record is too thin for us yet.');
    case 'pass-dpi':
      return t('Not yet: show us cash returned, not paper gains.');
    case 'pass-team':
      return t('We need to know you and your team better.');
    case 'pass-market':
      return t('We’re not convinced there are enough companies to back here.');
    case 'pass-deploy':
      return t(
        'The maths doesn’t work: your companies and cheques don’t fit the fund after fees and reserves.',
      );
    case 'pass-portfolio':
      return t('The portfolio is the wrong size for the stage.');
    case 'pass-reserves':
      return t('Your reserves don’t fit the stage: winners will need follow-on money.');
    case 'pass-ownership':
      return t('Your cheque won’t buy the ownership you’re targeting at that stage.');
    case 'pass-terms':
      return t('Your fees and carry are above market for this fund.');
    case 'pass-focus':
      return t('The thesis is too broad for a fund this size.');
    case 'pass-size':
      return t('The fund is too big for what you’ve shown so far.');
    case 'pass-geography':
      return t('We doubt you can cover that geography yet.');
    case 'commit-track':
      return t('Your track record speaks for itself.');
    case 'commit-strategy':
      return t('The strategy is coherent and the maths adds up.');
    case 'commit-team':
      return t('We back the team.');
    case 'commit-market':
      return t('The market is deep and the timing is right.');
    case 'commit-emerging':
      return t('We back emerging local managers, and your strategy adds up.');
    default:
      return t('The strategy doesn’t hang together yet.');
  }
}

function lpKindText(k: string): string {
  switch (k) {
    case 'pension':
      return t('Pension fund');
    case 'family-office':
      return t('Family office');
    case 'endowment':
      return t('Endowment');
    case 'dfi-fof':
      return t('DFI fund-of-funds');
    default:
      return t('Sovereign fund');
  }
}

/** An LP panel's review: the four parts, the track record, the checks, questions and answers. */
export function LpReview({ review, compact }: { review: PanelReview; compact?: boolean }) {
  const cur = review.currency;
  const tr = review.track;
  return (
    <div className="df-review" data-review={review.ok ? 'ok' : 'no'}>
      {!compact && (
        <div className="inv-grid">
          <Stat label={t('Track record')} value={pct(review.parts.track, 0)} />
          <Stat label={t('Strategy')} value={pct(review.parts.strategy, 0)} />
          <Stat label={t('Team')} value={pct(review.parts.team, 0)} />
          <Stat label={t('Market')} value={pct(review.parts.market, 0)} />
        </div>
      )}
      <p className="small">
        {t('Track record: {deals} deals · TVPI {tvpi}× · DPI {dpi}× · {losses} losses', {
          deals: tr.deals,
          tvpi: tr.tvpi,
          dpi: tr.dpi,
          losses: tr.losses,
        })}{' '}
        <span className="muted">
          {t('({realised} realised, {unrealised} unrealised on {invested} invested)', {
            realised: money(tr.returned, cur),
            unrealised: money(tr.unrealised, cur),
            invested: money(tr.invested, cur),
          })}
        </span>
      </p>
      {!compact && (
        <ul className="list small df-checks">
          {review.checks.map((c) => (
            <li key={c.id} data-check={c.id} data-level={c.level}>
              <Pill tone={LEVEL_TONE[c.level]}>{levelText(c.level)}</Pill>{' '}
              {checkText(c as StrategyCheck, cur)}
            </li>
          ))}
        </ul>
      )}
      <h3 className="cap-h">{t('What they asked')}</h3>
      <ul className="list small df-questions">
        {review.questions.map((q) => {
          const [ask, answer] = questionText(q);
          return (
            <li key={q.id} data-question={q.id}>
              <b>{ask}</b> <span className="muted">{answer}</span>
            </li>
          );
        })}
      </ul>
      <h3 className="cap-h">{t('Their answers')}</h3>
      {review.lps.map((v) => (
        <div key={v.lpId} className="inv-row" data-lp={v.lpId} data-commit={v.commit ? '1' : '0'}>
          <span className="grow">
            {v.name} <span className="small muted">{lpKindText(v.kind)}</span>
            <div className="small">“{reasonText(v.reason)}”</div>
          </span>
          {v.commit ? (
            <Pill tone="good">{t('Commits {amount}', { amount: money(v.amount, cur) })}</Pill>
          ) : (
            <Pill tone="bad">{t('Passes')}</Pill>
          )}
        </div>
      ))}
    </div>
  );
}

/** The strategy fields every fund pitch shares; the checks run live as you type. */
export interface StrategyDraft {
  geography: 'city' | 'country' | 'region';
  avgCheque: string;
  companies: string;
  reserveRatio: string;
  targetOwnership: string;
}

export const draftOf = (d: StrategyDraft, fallbackCheque: number) => ({
  geography: d.geography,
  avgCheque: parseAmount(d.avgCheque) ?? fallbackCheque,
  companies: Math.max(1, Math.min(100, Math.round(Number(d.companies) || 1))),
  reserveRatio: Math.max(0, Math.min(0.8, Number(d.reserveRatio))),
  targetOwnership: Math.max(0.001, Math.min(0.5, (Number(d.targetOwnership) || 0) / 100)),
});

export function StrategyFields({
  draft,
  onChange,
  currency,
  chequeHint,
}: {
  draft: StrategyDraft;
  onChange: (d: StrategyDraft) => void;
  currency: string;
  chequeHint: number;
}) {
  const set = (k: keyof StrategyDraft) => (v: string) => onChange({ ...draft, [k]: v });
  return (
    <>
      <Segmented
        label={t('Geography')}
        value={draft.geography}
        onChange={(v) => onChange({ ...draft, geography: v })}
        options={[
          { value: 'city', label: t('This city') },
          { value: 'country', label: t('The country') },
          { value: 'region', label: t('The region') },
        ]}
      />
      <div className="grid2">
        <Field label={t('Average first cheque ({cur})', { cur: currency })}>
          {(id) => (
            <input
              id={id}
              inputMode="decimal"
              value={draft.avgCheque}
              placeholder={amountInput(chequeHint)}
              onChange={(e) => set('avgCheque')(e.target.value)}
            />
          )}
        </Field>
        <Field label={t('Companies to back')}>
          {(id) => (
            <input
              id={id}
              inputMode="numeric"
              value={draft.companies}
              onChange={(e) => set('companies')(e.target.value)}
            />
          )}
        </Field>
        <Field label={t('Ownership target (%)')}>
          {(id) => (
            <input
              id={id}
              inputMode="decimal"
              value={draft.targetOwnership}
              onChange={(e) => set('targetOwnership')(e.target.value)}
            />
          )}
        </Field>
      </div>
      <Segmented
        label={t('Kept for follow-ons')}
        value={draft.reserveRatio}
        onChange={set('reserveRatio')}
        options={['0', '0.3', '0.4', '0.5', '0.6'].map((v) => ({
          value: v,
          label: pct(Number(v), 0),
        }))}
      />
    </>
  );
}

/** The live checks for a draft strategy (the same arithmetic LPs use). */
export function StrategyChecks({
  plan,
  typicalPost,
  currency,
}: {
  plan: Parameters<typeof strategyChecks>[0];
  typicalPost: Record<Stage, number>;
  currency: string;
}) {
  const checks = strategyChecks(plan, typicalPost);
  return (
    <ul className="list small df-checks" aria-label={t('How LPs will read it')}>
      {checks.map((c) => (
        <li key={c.id} data-check={c.id} data-level={c.level}>
          <Pill tone={LEVEL_TONE[c.level]}>{levelText(c.level)}</Pill> {checkText(c, currency)}
        </li>
      ))}
    </ul>
  );
}

/** A strategy that adds up for this city, to start from. */
function startingDraft(d: DealFlowView): { draft: StrategyDraft; size: number } {
  const cheque = Math.round(d.typicalPost['pre-seed'] * 0.04);
  const fees = 0.02 * LIFETIME_FEE_YEARS;
  const size = Math.round((25 * cheque) / ((1 - fees) * 0.5));
  return {
    draft: {
      geography: 'city',
      avgCheque: amountInput(cheque),
      companies: '25',
      reserveRatio: '0.5',
      targetOwnership: '4',
    },
    size,
  };
}

/** Fund I pitched to the city's AI LPs as a strategy (`fund.raise` with a plan). */
export function FundPitch() {
  const { view, send, meta, busy } = useView();
  const d = view ? dealflowOf(view) : null;
  const start = d ? startingDraft(d) : null;
  const [sectors, setSectors] = useState<string[]>(view?.me.investor?.sectors ?? []);
  const [stages, setStages] = useState<string[]>(['pre-seed']);
  const [draft, setDraft] = useState<StrategyDraft>(
    start?.draft ?? {
      geography: 'city',
      avgCheque: '',
      companies: '25',
      reserveRatio: '0.5',
      targetOwnership: '4',
    },
  );
  const [size, setSize] = useState(start ? amountInput(start.size) : '');
  const [fee, setFee] = useState('0.02');
  const [carry, setCarry] = useState('0.2');
  const [why, setWhy] = useState('');
  if (!view || !d) return null;
  const cur = d.currency;
  const record = view.record;
  const s = draftOf(draft, view.me.investor?.checkSize ?? 0);
  const plan = {
    ...s,
    sectors,
    stages: stages as Stage[],
    size: parseAmount(size) ?? 0,
    feeRate: Number(fee),
    carry: Number(carry),
  };
  const toggle = (list: string[], v: string) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  return (
    <Card title={t('Pitch Fund I to LPs')} sub={t('LPs judge your strategy and your record')}>
      <p className="small muted">
        {t(
          'Track record: {deals} deals · DPI {dpi}x · {writeOffs} write-offs. LPs want at least 3 angel deals.',
          { deals: record.deals, dpi: record.dpi, writeOffs: record.writeOffs },
        )}{' '}
        {t('LPs in this city can put up to about {amount} into a first fund.', {
          amount: money(d.panelCapacity, cur),
        })}
      </p>
      <div className="inv-form" data-fund-pitch>
        <Field label={t('Sectors')}>
          {() => (
            <div className="chips">
              {meta?.industries.map((i) => (
                <button
                  key={i.id}
                  className="chip"
                  aria-pressed={sectors.includes(i.id)}
                  onClick={() => setSectors((x) => toggle(x, i.id))}
                >
                  {tx(i.label)}
                </button>
              ))}
            </div>
          )}
        </Field>
        <Field label={t('Stages')}>
          {() => (
            <div className="chips">
              {['pre-seed', 'seed', 'series-a'].map((x) => (
                <button
                  key={x}
                  className="chip"
                  aria-pressed={stages.includes(x)}
                  onClick={() => setStages((y) => toggle(y, x))}
                >
                  {stageLabel(x)}
                </button>
              ))}
            </div>
          )}
        </Field>
        <Field label={t('Fund size ({cur})', { cur })}>
          {(id) => (
            <input
              id={id}
              inputMode="decimal"
              value={size}
              onChange={(e) => setSize(e.target.value)}
            />
          )}
        </Field>
        <StrategyFields
          draft={draft}
          onChange={setDraft}
          currency={cur}
          chequeHint={view.me.investor?.checkSize ?? 0}
        />
        <Segmented
          label={t('Management fee')}
          value={fee}
          onChange={setFee}
          options={['0.015', '0.02', '0.025', '0.03'].map((v) => ({
            value: v,
            label: pct(Number(v), 1),
          }))}
        />
        <Segmented
          label={t('Carry')}
          value={carry}
          onChange={setCarry}
          options={['0.15', '0.2', '0.25', '0.3'].map((v) => ({
            value: v,
            label: pct(Number(v), 0),
          }))}
        />
        {stages.length > 0 && (
          <StrategyChecks plan={plan} typicalPost={d.typicalPost} currency={cur} />
        )}
        <Field label={t('Why now, and why you’ll win (one line)')}>
          {(id) => (
            <input id={id} value={why} maxLength={200} onChange={(e) => setWhy(e.target.value)} />
          )}
        </Field>
        <Button
          disabled={
            busy || !sectors.length || !stages.length || why.trim().length < 10 || !plan.size
          }
          data-pitch-lps
          onClick={() =>
            void send(
              {
                type: 'fund.raise',
                sectors: sectors as never,
                stages: stages as never,
                checkSize: s.avgCheque,
                why,
                plan: {
                  geography: s.geography,
                  size: plan.size,
                  avgCheque: s.avgCheque,
                  companies: s.companies,
                  reserveRatio: s.reserveRatio,
                  targetOwnership: s.targetOwnership,
                  feeRate: plan.feeRate,
                  carry: plan.carry,
                },
              },
              (r: { ok: boolean; review?: { committed: number } }) =>
                r.ok
                  ? t('Fund I is closed!')
                  : t('Not enough LPs committed yet: read their answers below.'),
            )
          }
        >
          {t('Pitch the LP panel (15h)')}
        </Button>
      </div>
      {d.lastPanel && <PanelVerdict review={d.lastPanel} />}
    </Card>
  );
}

function PanelVerdict({ review }: { review: PanelReview }) {
  const cur = review.currency;
  return (
    <>
      <h3 className="cap-h">
        {review.ok
          ? t('LPs committed {amount}', { amount: money(review.committed, cur) })
          : t('LPs committed {amount} of the {need} a first close needs', {
              amount: money(review.committed, cur),
              need: money(Math.round(review.target / 2), cur),
            })}
      </h3>
      <LpReview review={review} />
    </>
  );
}

/** After Fund I closes: what the LP panel said (their questions and why they committed). */
export function LastPanel() {
  const { view } = useView();
  const review = view ? dealflowOf(view)?.lastPanel : null;
  if (!review?.ok) return null;
  return (
    <Card title={t('What your LPs said')} sub={t('Their questions, and why they committed')}>
      <PanelVerdict review={review} />
    </Card>
  );
}
