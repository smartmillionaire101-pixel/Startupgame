/**
 * Deal craft (investor blueprint §5.2 "Pipeline", §6.2–6.6, §10.6, Phase 8):
 * the pipeline by stage with pass reasons and a watchlist, claim checks,
 * reference calls and red flags, founder support, scouting, your reputation
 * (founder trust, stars, reviews) and the monthly recap. Founders review
 * the investors who backed them.
 */
import type { PlayerView } from '@runway/engine';
import { useState } from 'react';
import { money } from '../format';
import { t, tx } from '../i18n';
import { useView } from '../store';
import { Button, Card, Empty, Pill, Stat } from '../ui';
import './investor.css';

type DealCraft = NonNullable<PlayerView['dealCraft']>;
type Entry = DealCraft['pipeline'][number];

const craftOf = (view: PlayerView): DealCraft | null =>
  (view as { dealCraft?: DealCraft | null }).dealCraft ?? null;

export function stageText(s: string): string {
  switch (s) {
    case 'sourced':
      return t('sourced');
    case 'screened':
      return t('screened');
    case 'first-call':
      return t('first call');
    case 'deep':
      return t('deep diligence');
    case 'term-sheet':
      return t('term sheet');
    case 'negotiation':
      return t('negotiation');
    case 'closed':
      return t('closed');
    default:
      return t('passed');
  }
}

function reasonText(r: string): string {
  switch (r) {
    case 'team':
      return t('Team');
    case 'market':
      return t('Market');
    case 'traction':
      return t('Traction');
    case 'price':
      return t('Price');
    case 'fit':
      return t('Fit');
    default:
      return t('Timing');
  }
}

function flagText(f: string): string {
  switch (f) {
    case 'fake-revenue':
      return t('Fake revenue confirmed by the regulator');
    case 'related-party-revenue':
      return t('Revenue from related parties');
    case 'key-person-left':
      return t('A key person left recently');
    case 'board-fight':
      return t('A vote to remove the CEO is open');
    case 'runway-under-3-months':
      return t('Under three months of money left');
    default:
      return t('A loan in default');
  }
}

function claimText(r: string | null): string {
  return r === 'accurate'
    ? t('checks out')
    : r === 'slightly-off'
      ? t('a little generous')
      : r === 'false'
        ? t('false')
        : '';
}

function EntryRow({ e, supported }: { e: Entry; supported: boolean }) {
  const { send } = useView();
  const [reason, setReason] = useState('traction');
  const [open, setOpen] = useState(false);
  const live = e.stage !== 'passed' && e.stage !== 'closed';
  return (
    <div className="inv-row" data-pipeline={e.stage}>
      <div className="grow">
        <strong>{e.name}</strong> <Pill>{stageText(e.stage)}</Pill>{' '}
        {e.hot && <Pill tone="warn">{t('Hot round')}</Pill>}
        {e.raising && !e.hot && <Pill tone="info">{t('Raising')}</Pill>}
        {e.watch && <Pill>{t('Watching')}</Pill>}
        <span className="small muted"> {e.stars.toFixed(1)}★</span>
        {e.passReason && (
          <div className="small muted">{t('Passed: {why}', { why: reasonText(e.passReason) })}</div>
        )}
        {open && (
          <div className="inv-form">
            {e.claims.length > 0 && (
              <ul className="list small">
                {e.claims.map((c) => (
                  <li key={c.questionId}>
                    {tx(c.text)} {t('They said {n}.', { n: c.claimed.toLocaleString() })}{' '}
                    {c.result ? (
                      <Pill
                        tone={
                          c.result === 'false' ? 'bad' : c.result === 'accurate' ? 'good' : 'warn'
                        }
                      >
                        {claimText(c.result)}
                      </Pill>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={e.diligence < 1}
                        onClick={() =>
                          void send(
                            {
                              type: 'diligence.claim',
                              companyId: e.companyId,
                              questionId: c.questionId,
                            },
                            (r: { message: string }) => tx(r.message),
                          )
                        }
                      >
                        {t('Check it (2h)')}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {e.references ? (
              <ul className="list small">
                {e.references.signals.map((s, i) => (
                  <li key={i}>{tx(s)}</li>
                ))}
              </ul>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  void send(
                    { type: 'diligence.references', companyId: e.companyId },
                    t('References done.'),
                  )
                }
              >
                {t('Reference calls (6h, less with a warm contact)')}
              </Button>
            )}
            {e.redFlags && (
              <div className="small">
                {e.redFlags.length === 0 ? (
                  <span className="good">{t('No red flags found.')}</span>
                ) : (
                  e.redFlags.map((f) => (
                    <div key={f} className="bad">
                      ⚑ {flagText(f)}
                    </div>
                  ))
                )}
              </div>
            )}
            {e.stage === 'closed' && (
              <div className="row">
                {(['customers', 'hires', 'investors'] as const).map((k) => (
                  <Button
                    key={k}
                    size="sm"
                    variant="subtle"
                    disabled={supported}
                    onClick={() =>
                      void send(
                        { type: 'invest.support', companyId: e.companyId, kind: k },
                        (r: { message: string }) => tx(r.message),
                      )
                    }
                  >
                    {k === 'customers'
                      ? t('Intro to customers (4h)')
                      : k === 'hires'
                        ? t('Intro to hires (4h)')
                        : t('Intro to investors (4h)')}
                  </Button>
                ))}
              </div>
            )}
            {live && (
              <div className="row">
                <select
                  aria-label={t('Reason to pass')}
                  value={reason}
                  onChange={(ev) => setReason(ev.target.value)}
                >
                  {['team', 'market', 'traction', 'price', 'fit', 'timing'].map((r) => (
                    <option key={r} value={r}>
                      {reasonText(r)}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    void send(
                      { type: 'pipeline.pass', companyId: e.companyId, reason: reason as never },
                      t('Passed, with a note to the founder.'),
                    )
                  }
                >
                  {t('Pass')}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="row">
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            void send(
              { type: 'pipeline.watch', companyId: e.companyId, on: !e.watch },
              e.watch ? t('Unwatched.') : t('Watching.'),
            )
          }
        >
          {e.watch ? t('Unwatch') : t('Watch')}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>
          {open ? t('Less') : t('More')}
        </Button>
      </div>
    </div>
  );
}

export function PipelineScreen() {
  const { view, send } = useView();
  const d = craftOf(view);
  if (!d) return null;
  const r = d.reputation;
  const recap = d.recap;
  const cur = view.market.currency;
  return (
    <div className="stack">
      <Card title={t('This month')} sub={t('Your investor recap')}>
        <div className="inv-grid">
          <Stat label={t('Income')} value={money(recap.cash.income, cur)} />
          <Stat label={t('Fund cash')} value={money(recap.fundCash, cur)} />
          <Stat label={t('Votes due')} value={recap.decisions.votes.length} />
          <Stat
            label={t('Offers waiting')}
            value={recap.decisions.offers.length + recap.decisions.prorata}
          />
          <Stat
            label={t('At risk')}
            value={recap.atRisk.length}
            tone={recap.atRisk.length ? 'warn' : undefined}
          />
          <Stat label={t('New pitches')} value={recap.newPitches} />
        </div>
        {recap.marks.length > 0 && (
          <ul className="list small">
            {recap.marks.map((m) => (
              <li key={m.companyId}>
                {t('{name}: mark {change}', {
                  name: m.name,
                  change: `${m.change >= 0 ? '+' : ''}${money(m.change, cur)}`,
                })}
              </li>
            ))}
          </ul>
        )}
        {recap.atRisk.length > 0 && (
          <p className="small warn">
            {t('Short of money: {names}. A bridge, a sale, or let it fail?', {
              names: recap.atRisk.map((x) => x.name).join(', '),
            })}
          </p>
        )}
      </Card>
      <Card title={t('Your reputation')} sub={t('Founders choose investors too')}>
        <div className="inv-grid">
          <Stat
            label={t('Founder trust')}
            value={`${Math.round(r.founderTrust * 100)}%`}
            hint={t('Fair terms, fast answers, real help')}
          />
          <Stat label={t('Stars')} value={`${r.stars.toFixed(1)}★`} />
          <Stat
            label={t('Reviews')}
            value={r.reviews.average === null ? '—' : `${r.reviews.average.toFixed(1)}★`}
            hint={t('{n} reviews', { n: r.reviews.count })}
          />
        </div>
        {r.reviews.latest.map((x) => (
          <p key={x.id} className="small">
            {'★'.repeat(x.rating)}
            {'☆'.repeat(5 - x.rating)} {x.founderName} ({x.companyName}): “{x.text}”
          </p>
        ))}
        <p className="inv-note">
          {t(
            'Answer pitches within the month: leaving one unanswered costs founder trust. Tough terms win ownership and cost trust too.',
          )}
        </p>
      </Card>
      {d.pitchesToMe.length > 0 && (
        <Card title={t('Pitches waiting for your answer')} tone="warn">
          {d.pitchesToMe.map((p) => (
            <div key={p.pitchId} className="inv-row">
              <span className="grow">
                {p.companyName}{' '}
                <span className="small muted">
                  {t('asking {amount}', { amount: money(p.ask, cur) })}
                </span>
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  void send(
                    { type: 'pipeline.pass', companyId: p.companyId, reason: 'timing' },
                    t('Passed, with a note to the founder.'),
                  )
                }
              >
                {t('Pass politely')}
              </Button>
            </div>
          ))}
          <p className="inv-note">{t('Or open them in Deal offers to send terms.')}</p>
        </Card>
      )}
      <Card
        title={t('Pipeline')}
        sub={t('From sourced to closed or passed')}
        action={
          <Button
            size="sm"
            variant="subtle"
            onClick={() =>
              void send({ type: 'invest.scout' }, (x: { message: string }) => tx(x.message))
            }
          >
            {t('Scout (6h)')}
          </Button>
        }
      >
        {d.pipeline.length === 0 ? (
          <Empty>
            {t('Nothing in your pipeline yet. Shortlist companies from Deal offers, or scout.')}
          </Empty>
        ) : (
          d.pipeline.map((e) => (
            <EntryRow
              key={e.companyId}
              e={e}
              supported={d.supportedThisMonth.includes(e.companyId)}
            />
          ))
        )}
      </Card>
    </div>
  );
}

/** Founders rate the investors who backed them (§6.6). */
export function ReviewInvestors() {
  const { view, send } = useView();
  const list = ((view as { reviewable?: typeof view.reviewable }).reviewable ?? []).filter(
    (x) => !x.reviewed,
  );
  const [rating, setRating] = useState<Record<string, number>>({});
  const [text, setText] = useState<Record<string, string>>({});
  if (list.length === 0) return null;
  return (
    <Card title={t('Review your investors')} sub={t('Other founders read these')}>
      {list.map((x) => {
        const k = `${x.investorId}:${x.companyId}`;
        return (
          <div key={k} className="inv-row">
            <span className="grow">
              {x.name} <span className="small muted">({x.companyName})</span>
            </span>
            <select
              aria-label={t('Rating')}
              value={rating[k] ?? 4}
              onChange={(e) => setRating((r) => ({ ...r, [k]: Number(e.target.value) }))}
            >
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {'★'.repeat(n)}
                </option>
              ))}
            </select>
            <input
              aria-label={t('A line about them')}
              placeholder={t('A line about them')}
              maxLength={200}
              value={text[k] ?? ''}
              onChange={(e) => setText((r) => ({ ...r, [k]: e.target.value }))}
            />
            <Button
              size="sm"
              onClick={() =>
                void send(
                  {
                    type: 'review.investor',
                    investorId: x.investorId,
                    companyId: x.companyId,
                    rating: rating[k] ?? 4,
                    text: text[k] ?? '',
                  },
                  t('Review posted.'),
                )
              }
            >
              {t('Post')}
            </Button>
          </div>
        );
      })}
    </Card>
  );
}
