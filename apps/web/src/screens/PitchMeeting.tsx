/**
 * Round 7 #13: the investor pitch meeting (pitchmeeting.ts). A scene with
 * the investor across the table, then the turns like the sales
 * conversation: what you open with (a customer's story "from your interview
 * notes" when you have one), his questions built from your real numbers
 * (each answer tagged "true: …" or "he'll check this in diligence"), and the
 * ask against his pricing band. The side column: the fund, what he cares
 * about, your real numbers (he has them), his interest now and the
 * co-founder bonus. The result: a term sheet with what moved him, in points,
 * and Accept / Counter (once) / Walk away.
 *
 * A player investor sees the same meeting as a deal card: what was said,
 * checked against the numbers the pitch shared, and answers it themselves.
 */
import { useState } from 'react';
import type { Command } from '@runway/engine';
import { Portrait } from '../avatar/Portrait';
import { amountInput, money, parseAmount, pct } from '../format';
import { useLang, t, tx } from '../i18n';
import { useView } from '../store';
import { Button, Card, Field, Sheet, Stat } from '../ui';
import { ScoreRing, markIcon } from './Interview';
import './convo.css';
import './sales.css';
import './pitch.css';

type PitchV = ReturnType<typeof useView>['view']['pitches'][number];
type MeetingV = NonNullable<PitchV['meeting']>;
type Facts = NonNullable<MeetingV['facts']>;

const LETTERS = ['A', 'B', 'C', 'D'];

const slideName = (x: string) =>
  ({
    problem: t('Problem'),
    product: t('Product'),
    traction: t('Traction'),
    team: t('Team'),
    market: t('Market'),
    financials: t('Financials'),
    vision: t('Vision'),
    ask: t('Ask'),
  })[x] ?? x;

const careName = (x: string) =>
  ({ team: t('Team'), traction: t('Traction'), market: t('Market'), deck: t('The deck') })[x] ?? x;

const topicName = (q: string) =>
  ({
    traction: t('customers'),
    runway: t('the money'),
    competition: t('the competition'),
  })[q] ?? q;

const first = (name: string) => name.split(' ')[0] ?? name;

/** The words of everything said, from the company's real numbers. */
function useWords(m: MeetingV, cur: string) {
  const lang = useLang();
  const f = m.facts;
  const he = first(m.investor.name);
  const pain = f?.pain ? (lang === 'fr' ? f.pain.fr : f.pain.en) : '';
  const runway = (x: Facts) =>
    x.runway === null ? t('never runs out') : t('{n} months', { n: Math.round(x.runway) });
  const opener = (id: string) =>
    !f
      ? ''
      : ({
          story: t('{name}’s story: “{pain}”', { name: f.painBy ?? '', pain }),
          traction:
            f.customers === 1
              ? t('Your traction: one paying customer, and how you won it.')
              : t('Your traction: {n} paying customers, and how you won them.', {
                  n: f.customers,
                }),
          problem: t('The problem, in one line, and who has it.'),
          market: t('“The market for this is worth billions.”'),
          tour: t('A walk through every feature in the app.'),
        }[id] ?? id);
  const openerReaction = (id: string, points: number) =>
    id === 'story'
      ? t('“That’s a real problem, and you clearly went and asked. Go on.”')
      : id === 'traction'
        ? t('“People are paying already. Go on.”')
        : points > 0 && id === 'problem'
          ? t('“Clear enough. Who pays for it?”')
          : id === 'market'
            ? t('“Every deck says that. What about yours?”')
            : t('“I’ve seen a lot of features. Why does anyone need it?”');
  const question = (id: string) => {
    if (!f) return '';
    if (id === 'traction')
      return f.customers === 0
        ? t(
            '“You have no paying customers yet and {runway} of money. Why will they pay for this?”',
            {
              runway: runway(f),
            },
          )
        : f.customers === 1
          ? t('“You have one paying customer and {revenue} revenue last month. What’s working?”', {
              revenue: money(f.revenue, cur),
            })
          : t('“You have {n} paying customers and {revenue} revenue last month. What’s working?”', {
              n: f.customers,
              revenue: money(f.revenue, cur),
            });
    if (id === 'runway')
      return f.runway === null
        ? t('“You earn more than you spend. What is this money for?”')
        : t('“Your money lasts {n} months. What if this round takes longer?”', {
            n: Math.round(f.runway),
          });
    return f.rival
      ? t('“{rival} does something like this. Why do you win?”', { rival: f.rival })
      : t('“Who else does this, and why do you win?”');
  };
  const answer = (q: MeetingV['questions'][number], a: string) => {
    if (!f) return '';
    if (a === 'vague')
      return (
        {
          traction: t('“We’re focused on the product right now.”'),
          runway: t('“Enough to hit our next milestones.”'),
          competition: t('“We don’t worry about competition.”'),
        }[q.id] ?? ''
      );
    if (a === 'stretch')
      return (
        {
          traction:
            f.customers === 0
              ? t('“About ten customers are about to sign.”')
              : t('“Close to {n} customers now.”', { n: q.stretchCustomers }),
          runway: t('“{n} months: there’s no rush.”', {
            n: Math.round(f.runway ?? 0) + 9,
          }),
          competition: t('“Nobody else does what we do.”'),
        }[q.id] ?? ''
      );
    switch (`${q.id}:${q.basis}`) {
      case 'traction:customers':
        return f.topAccount
          ? t('“{n} paying customers. {account} pays us {amount} a month.”', {
              n: f.customers,
              account: f.topAccount,
              amount: money(f.topAccountMonthly, cur),
            })
          : f.customers === 1
            ? t('“One paying customer, and growing.”')
            : t('“{n} paying customers, and growing.”', { n: f.customers });
      case 'traction:pipeline':
        return t(
          '“{deal} saw a demo: {amount} a month is on the table. {n} deals in the pipeline.”',
          {
            deal: f.topDeal ?? '',
            amount: money(f.topDealValue, cur),
            n: f.pipeline,
          },
        );
      case 'traction:interviews':
        return t('“None yet. {n} people we interviewed told us what this costs them.”', {
          n: f.interviews,
        });
      case 'traction:none':
        return t('“None yet. Our first sales calls are this month.”');
      case 'runway:profitable':
        return t('“We earn more than we spend: this round is to grow faster.”');
      case 'runway:runway':
        return t('“{n} months. This round is what takes us past it.”', {
          n: Math.round(f.runway ?? 0),
        });
      case 'competition:notes':
        return t('“What we heard in {n} interviews: {pain}”', { n: f.interviews, pain });
      case 'competition:rival':
        return t('“{rival} has more money; we’re closer to the customer.”', {
          rival: f.rival ?? '',
        });
      default:
        return t('“Spreadsheets and phone calls, mostly. That’s what we replace.”');
    }
  };
  const tag = (q: MeetingV['questions'][number], kind: string | null) =>
    kind === 'check'
      ? t('{name} will check this in diligence', { name: he })
      : kind === 'true'
        ? ((
            {
              'traction:customers': t('true: your customers'),
              'traction:pipeline': t('true: your pipeline'),
              'traction:interviews': t('true: your interview notes'),
              'competition:notes': t('true: your interview notes'),
              'competition:rival': t('true: your market'),
              'competition:plain': t('true: your market'),
              'runway:runway': t('true: your bank balance'),
              'runway:profitable': t('true: your numbers'),
            } as Record<string, string>
          )[`${q.id}:${q.basis}`] ?? t('true: your numbers'))
        : null;
  const reaction = (a: string) =>
    a === 'true'
      ? t('“Good. That’s what I’ll find when I look.”')
      : a === 'stretch'
        ? t('“Impressive. We’ll check, of course.”')
        : t('“That doesn’t answer it.”');
  const where = (w: string) =>
    ({
      below: t('You’re below it.'),
      inside: t('You’re inside it.'),
      above: t('You’re just above.'),
      far: t('You’re well above.'),
    })[w] ?? '';
  const askReaction = (w: string, pre: number) =>
    w === 'inside'
      ? t('“That’s a fair number for where you are.”')
      : w === 'below'
        ? t('“That’s modest. I won’t argue.”')
        : w === 'far'
          ? t('“That’s a big swing for this stage.”')
          : (f?.revenue ?? 0) === 0
            ? t(
                '“{pre} is rich with no revenue. Show me one paying customer and we can talk about that number.”',
                { pre: money(pre, cur) },
              )
            : t('“That’s a little above where I price teams like yours.”');
  const movedLabel = (id: string, slides: string[]) => {
    const [kind, q, a] = id.split(':');
    const band = { lo: money(m.band[0], cur), hi: money(m.band[1], cur) };
    if (kind === 'opener')
      return (
        {
          story: t('Opened with {name}’s story, from your interview notes', {
            name: f?.painBy ?? '',
          }),
          traction: t('Opened with your traction'),
          problem: t('Opened with the problem'),
          market: t('Opened with the market size'),
          tour: t('Opened with a feature tour'),
        }[q!] ?? id
      );
    if (kind === 'answer' || kind === 'cofounder-answer') {
      if (a === 'stretch') return t('Stretched the truth on {topic}', { topic: topicName(q!) });
      if (a === 'vague') return t('Dodged the question on {topic}', { topic: topicName(q!) });
      if (kind === 'cofounder-answer')
        return t('{name} answered the competition question', { name: m.cofounder?.name ?? '' });
      const basis = m.questions.find((x) => x.id === q)?.basis;
      if (q === 'traction')
        return basis === 'pipeline'
          ? t('Honest about customers: named {deal}', { deal: f?.topDeal ?? '' })
          : basis === 'customers'
            ? t('Honest about customers: {n} paying', { n: f?.customers ?? 0 })
            : basis === 'interviews'
              ? t('Honest about customers: backed by your interviews')
              : t('Honest about customers: none yet');
      if (q === 'runway') return t('Straight about the money');
      return t('Knew the competition');
    }
    if (kind === 'caught') return t('Caught in diligence: {topic}', { topic: topicName(q!) });
    if (kind === 'deck')
      return t('Your deck: {slides}', { slides: slides.map(slideName).join(', ') });
    if (kind === 'cofounder') return t('{name} in the room', { name: m.cofounder?.name ?? '' });
    if (kind === 'intro') return t('Introduced by {name}', { name: m.intro?.name ?? '' });
    if (id === 'worry:customers')
      return t('No paying customer yet: {name}’s biggest worry', { name: he });
    if (id === 'worry:runway') return t('Under three months of money');
    if (kind === 'ask')
      return (
        {
          inside: t('Asked inside {name}’s range ({lo}–{hi})', { name: he, ...band }),
          below: t('Asked below {name}’s range ({lo}–{hi})', { name: he, ...band }),
          above: t('Asked above {name}’s range ({lo}–{hi})', { name: he, ...band }),
          far: t('Asked far above {name}’s range ({lo}–{hi})', { name: he, ...band }),
        }[q!] ?? id
      );
    return id;
  };
  return {
    he,
    runway,
    opener,
    openerReaction,
    question,
    answer,
    tag,
    reaction,
    where,
    askReaction,
    movedLabel,
  };
}

/** The meeting, for the founder who pitched or the player investor pitched. */
export function PitchMeetingSheet({ pitchId, onClose }: { pitchId: string; onClose: () => void }) {
  const { view } = useView();
  const p = view.pitches.find((x) => x.id === pitchId);
  const m = p?.meeting;
  if (!p || !m) return null;
  const founder = p.founderId === view.me.id;
  const cur =
    view.companies.find((c) => c.id === p.companyId)?.currency ??
    view.directory.find((c) => c.id === p.companyId)?.currency ??
    view.market.currency;
  const title =
    m.step === 'result'
      ? founder
        ? t('Pitch meeting · result')
        : t('{company} pitched you', { company: p.companyName })
      : m.step === 'ask'
        ? t('Pitch meeting · the ask')
        : t('Pitch meeting · {company}', { company: p.companyName });
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="convo pm" data-pitch-step={m.step} data-pitch-id={p.id}>
        <p className="pm-sub small muted">
          {founder
            ? t('with {name} · your deck: {slides}', {
                name: m.investor.name,
                slides: m.slides.map(slideName).join(', '),
              })
            : t('{company}’s deck: {slides}', {
                company: p.companyName,
                slides: m.slides.map(slideName).join(', '),
              })}
        </p>
        <div className="pm-grid">
          <div className="pm-main">
            {founder ? (
              m.left ? (
                <Card title={t('You left the meeting')} className="pm-left">
                  <p className="small muted">
                    {t('It ended there, with no verdict: you can pitch them again.')}
                  </p>
                </Card>
              ) : m.step === 'result' ? (
                <ResultCard p={p} m={m} cur={cur} onClose={onClose} />
              ) : (
                <>
                  <Scene p={p} m={m} />
                  <Turns p={p} m={m} cur={cur} />
                  <LeaveMeeting pitchId={p.id} />
                </>
              )
            ) : (
              <>
                <Scene p={p} m={m} />
                <Turns p={p} m={m} cur={cur} readOnly />
                <ReplyCard p={p} m={m} cur={cur} onClose={onClose} />
              </>
            )}
          </div>
          <Side p={p} m={m} cur={cur} founder={founder} />
        </div>
      </div>
    </Sheet>
  );
}

function LeaveMeeting({ pitchId }: { pitchId: string }) {
  const { send, busy } = useView();
  return (
    <div className="pm-actions pm-leave">
      <Button
        variant="ghost"
        size="sm"
        disabled={busy}
        data-pitch-leave
        onClick={() => void send({ type: 'pitch.meet', pitchId, action: 'leave' } as Command)}
      >
        {t('Leave the meeting')}
      </Button>
      <span className="small muted">
        {t('It ends here, with no verdict: you can pitch them again.')}
      </span>
    </div>
  );
}

function Scene({ p, m }: { p: PitchV; m: MeetingV }) {
  const { view } = useView();
  const you = m.cofounder
    ? t('You + {name}', { name: first(m.cofounder.name) })
    : p.founderId === view.me.id
      ? t('You')
      : p.companyName;
  return (
    <div
      className="pm-scene"
      role="img"
      aria-label={t('A meeting room: {you} across the table from {name}', {
        you,
        name: m.investor.name,
      })}
    >
      <span className="pm-cap">
        {t('{company} · {minutes} min', { company: p.companyName, minutes: m.minutes })}
      </span>
      <span className="pm-deck" aria-hidden="true">
        {m.slides.map((s) => (
          <span key={s}>{slideName(s)}</span>
        ))}
      </span>
      <div className="pm-people" aria-hidden="true">
        <figure>
          <Portrait id={p.founderId} size={84} />
          <figcaption>{you}</figcaption>
        </figure>
        <figure>
          <Portrait id={m.investor.portraitId} bg="b-finance" size={84} />
          <figcaption>{m.investor.name}</figcaption>
        </figure>
      </div>
    </div>
  );
}

function Dots({ n, of }: { n: number; of: number }) {
  return (
    <span className="round-dots" aria-hidden="true">
      {Array.from({ length: of }, (_, i) => (
        <i key={i} className={i < n ? 'done' : i === n ? 'now' : ''} />
      ))}
    </span>
  );
}

function Turns({
  p,
  m,
  cur,
  readOnly,
}: {
  p: PitchV;
  m: MeetingV;
  cur: string;
  readOnly?: boolean;
}) {
  const { send, busy } = useView();
  const w = useWords(m, cur);
  const go = (cmd: Record<string, unknown>) =>
    void send({ type: 'pitch.meet', pitchId: p.id, ...cmd } as Command);
  const steps = 2 + m.questions.length;
  const asked = m.questions.filter((q) => q.asked);
  const done = (m.opener ? 1 : 0) + m.questions.filter((q) => q.answer).length + (m.ask ? 1 : 0);
  return (
    <>
      <Card title={t('1 · Open with')} action={<Dots n={Math.min(done, 1)} of={steps} />}>
        <ul className="convo-opts" data-turn="opener">
          {m.openers
            .filter((o) => !readOnly || o.id === m.opener?.id)
            .map((o, i) => (
              <li key={o.id}>
                <button
                  type="button"
                  className={`convo-opt${m.opener ? (m.opener.id === o.id ? ' is-on' : ' is-off') : ''}`}
                  data-opener={o.id}
                  disabled={busy || !!m.opener || readOnly}
                  onClick={() => go({ action: 'open', option: o.id })}
                >
                  <span className="convo-letter">{LETTERS[i]}</span>
                  <span>
                    {w.opener(o.id)}
                    {o.notes && <span className="pm-from">{t('from your interview notes')}</span>}
                  </span>
                </button>
              </li>
            ))}
        </ul>
        {m.opener && (
          <p className="bubble them" data-reaction="opener">
            {w.he}: {w.openerReaction(m.opener.id, m.opener.points)}
          </p>
        )}
      </Card>
      {m.opener &&
        asked.map((q, qi) => (
          <Card
            key={q.id}
            title={t('{n} · {name} asks', { n: qi + 2, name: w.he })}
            action={<Dots n={qi + 1 + (q.answer ? 1 : 0)} of={steps} />}
          >
            <p className="bubble them pm-q" data-question={q.id}>
              {w.question(q.id)} <span className="pm-from num">{t('from your numbers')}</span>
            </p>
            {q.cofounder ? (
              <p className="bubble me" data-cofounder-answer>
                {t('{name} takes this one:', { name: m.cofounder?.name ?? '' })}{' '}
                {w.answer(q, 'true')}
              </p>
            ) : (
              <ul className="convo-opts" data-turn={`q-${q.id}`}>
                {q.options
                  .filter((o) => !readOnly || o.id === q.answer?.id)
                  .map((o, i) => {
                    const tag = w.tag(q, o.tag);
                    return (
                      <li key={o.id}>
                        <button
                          type="button"
                          className={`convo-opt${q.answer ? (q.answer.id === o.id ? ' is-on' : ' is-off') : ''}`}
                          data-answer={o.id}
                          disabled={busy || !!q.answer || readOnly}
                          onClick={() => go({ action: 'answer', questionId: q.id, option: o.id })}
                        >
                          <span className="convo-letter">{LETTERS[i]}</span>
                          <span>
                            {w.answer(q, o.id)}
                            {tag && (
                              <span className={`pm-from ${o.tag === 'true' ? 'num' : 'check'}`}>
                                {tag}
                              </span>
                            )}
                            {readOnly && q.answer && (
                              <span
                                className={`pm-from ${q.answer.checked === 'matches' ? 'num' : 'check'}`}
                                data-checked={q.answer.checked}
                              >
                                {q.answer.checked === 'matches'
                                  ? t('matches their numbers')
                                  : q.answer.checked === 'off'
                                    ? t('doesn’t match their numbers')
                                    : t('no real answer')}
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
              </ul>
            )}
            {q.answer && !readOnly && !q.cofounder && (
              <p className="bubble them" data-reaction={q.id}>
                {w.he}: {w.reaction(q.answer.id)}
              </p>
            )}
          </Card>
        ))}
      {m.step === 'ask' || m.ask ? <AskCard p={p} m={m} cur={cur} readOnly={readOnly} /> : null}
    </>
  );
}

/**
 * The share an amount buys at a pre-money: one decimal, two under 1%, and
 * "<0.1%" for a sliver (a tiny ask read "0%").
 */
export const pctOf = (amount: number, pre: number) => {
  const x = amount / Math.max(1, pre + amount);
  if (x <= 0) return pct(0);
  if (x < 0.001) return `<${pct(0.001, 1)}`;
  return pct(x, x < 0.01 ? 2 : 1);
};

function AskCard({
  p,
  m,
  cur,
  readOnly,
}: {
  p: PitchV;
  m: MeetingV;
  cur: string;
  readOnly?: boolean;
}) {
  const { send, busy } = useView();
  const w = useWords(m, cur);
  const shown = m.ask ?? m.askOptions[0]!;
  const top = Math.max(m.band[1] * 1.6, ...m.askOptions.map((o) => o.preMoney));
  const at = (x: number) => `${Math.min(100, (x / top) * 100)}%`;
  const where = m.ask?.where ?? m.askOptions[0]!.where;
  return (
    <Card
      title={t('{n} · The ask', { n: 2 + m.questions.length })}
      action={
        <Dots
          n={m.ask ? 3 + m.questions.length : 1 + m.questions.length}
          of={2 + m.questions.length}
        />
      }
    >
      <div className="pm-ask" data-ask={m.ask?.option ?? ''}>
        <div className="pm-ask-row">
          <div className="pm-box">
            <small>{t('You ask for')}</small>
            <b>{money(shown.amount, cur)}</b>
          </div>
          <div className="pm-box">
            <small>{t('For')}</small>
            <b data-ask-pct>{pctOf(shown.amount, shown.preMoney)}</b>
          </div>
          <div className="pm-box">
            <small>{t('Valuation')}</small>
            <b>{t('{amount} pre', { amount: money(shown.preMoney, cur) })}</b>
          </div>
        </div>
        <div className="pm-dial" aria-hidden="true">
          <i style={{ left: at(m.band[0]), width: `calc(${at(m.band[1])} - ${at(m.band[0])})` }} />
          <em style={{ left: at(shown.preMoney) }} />
        </div>
        <p className="small good" data-band={`${m.band[0]}-${m.band[1]}`}>
          {m.investor.kind === 'player'
            ? t('Where investors price a team like yours: {lo}–{hi} pre.', {
                lo: money(m.band[0], cur),
                hi: money(m.band[1], cur),
              })
            : t('Where {name} prices a team like yours: {lo}–{hi} pre.', {
                name: w.he,
                lo: money(m.band[0], cur),
                hi: money(m.band[1], cur),
              })}{' '}
          {w.where(where)}
        </p>
        {!m.ask && !readOnly && (
          <ul className="convo-opts" data-turn="ask">
            {m.askOptions.map((o, i) => (
              <li key={o.id}>
                <button
                  type="button"
                  className="convo-opt"
                  data-ask-option={o.id}
                  disabled={busy}
                  onClick={() =>
                    void send({
                      type: 'pitch.meet',
                      pitchId: p.id,
                      action: 'ask',
                      option: o.id,
                    } as Command)
                  }
                >
                  <span className="convo-letter">{LETTERS[i]}</span>
                  <span>
                    {
                      {
                        yours: t('Ask {amount} at {pre} (your number)', {
                          amount: money(o.amount, cur),
                          pre: money(o.preMoney, cur),
                        }),
                        inside:
                          m.investor.kind === 'player'
                            ? t('Ask {amount} at {pre} (inside the usual range)', {
                                amount: money(o.amount, cur),
                                pre: money(o.preMoney, cur),
                              })
                            : t('Ask {amount} at {pre} (inside {name}’s range)', {
                                amount: money(o.amount, cur),
                                pre: money(o.preMoney, cur),
                                name: w.he,
                              }),
                        swing: t('Ask {amount} at {pre} (a big swing)', {
                          amount: money(o.amount, cur),
                          pre: money(o.preMoney, cur),
                        }),
                      }[o.id]
                    }
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {m.ask && !readOnly && m.investor.kind === 'fund' && (
          <p className="bubble them" data-reaction="ask">
            {w.he}: {w.askReaction(m.ask.where, m.ask.preMoney)}
          </p>
        )}
      </div>
    </Card>
  );
}

function Side({ p, m, cur, founder }: { p: PitchV; m: MeetingV; cur: string; founder: boolean }) {
  const w = useWords(m, cur);
  const f = m.facts;
  const inv = m.investor;
  const top = Math.max(...m.cares.map((c) => c.weight));
  const interest = m.interest;
  const tone = interest === null ? '' : interest >= 60 ? 'good' : interest >= 40 ? 'warn' : 'bad';
  return (
    <aside className="pm-side" aria-label={t('About {name}', { name: inv.name })}>
      <Card
        title={inv.firm ?? inv.name}
        sub={
          inv.check
            ? t('cheques {min}–{max}', {
                min: money(inv.check[0], cur),
                max: money(inv.check[1], cur),
              })
            : t('Player investor')
        }
      >
        <div className="convo-person">
          <Portrait id={inv.portraitId} bg="b-finance" size={60} />
          <div>
            <strong>{inv.firm ? t('{name}, partner', { name: inv.name }) : inv.name}</strong>
            {inv.backed > 0 && (
              <div className="small muted">
                {t('Backed {n} companies like yours', { n: inv.backed })}
              </div>
            )}
          </div>
        </div>
        {founder && (
          <>
            <h3 className="small">{t('What {name} cares about', { name: w.he })}</h3>
            <div className="weights" data-cares>
              {m.cares.map((c) => (
                <div key={c.id} className={`w${c.weight === top ? ' theirs' : ''}`}>
                  <span>
                    {careName(c.id)}
                    {c.weight === top ? ' ★' : ''}
                  </span>
                  <span className="t">
                    <span style={{ width: `${c.weight}%` }} />
                  </span>
                  <b>{c.weight}%</b>
                </div>
              ))}
            </div>
          </>
        )}
        {f && (
          <>
            <h3 className="small">
              {founder ? t('Your real numbers (they have them)') : t('Their real numbers')}
            </h3>
            <dl className="convo-known" data-facts>
              <dt>{t('Paying customers')}</dt>
              <dd data-fact="customers">{f.customers}</dd>
              <dt>{t('Pipeline')}</dt>
              <dd>
                {t('{n} deals · {amount}/mo', {
                  n: f.pipeline,
                  amount: money(f.pipelineValue, cur),
                })}
              </dd>
              <dt>{t('Bank · runway')}</dt>
              <dd data-fact="runway">
                {money(f.cash, cur)} · {w.runway(f)}
              </dd>
              <dt>{t('Interviews done')}</dt>
              <dd>
                {f.interviewScore === null
                  ? f.interviews
                  : t('{n} (score {s})', { n: f.interviews, s: f.interviewScore })}
              </dd>
            </dl>
          </>
        )}
      </Card>
      {founder && (interest !== null || m.cofounder) && (
        <Card className="pm-interest">
          {interest !== null && (
            <div
              className={`sales-meter tone-${tone}`}
              role="meter"
              aria-label={t('{name}’s interest now', { name: w.he })}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={interest}
              data-interest={interest}
            >
              <span className="small">{t('{name}’s interest now', { name: w.he })}</span>
              <span className="sales-meter-track">
                <span className="sales-meter-fill" style={{ width: `${interest}%` }} />
              </span>
              <span className="sales-meter-n">{interest}%</span>
            </div>
          )}
          {m.interestBefore !== null && interest !== null && m.step !== 'result' && (
            <p className="small muted">
              {m.ask
                ? t('Your ask moved it from {n}%.', { n: m.interestBefore })
                : m.questions.some((q) => q.answer && !q.cofounder)
                  ? t('Your last answer moved it from {n}%.', { n: m.interestBefore })
                  : t('Your opener moved it from {n}%.', { n: m.interestBefore })}
            </p>
          )}
          {m.cofounder && (
            <p className="pm-cofounder" data-cofounder-bonus={m.cofounder.points}>
              <span aria-hidden="true">🤝</span>
              <span>
                {t(
                  '{name} (business co-founder) is in the room: +{n} to the pitch, and takes the competition question.',
                  { name: m.cofounder.name, n: m.cofounder.points },
                )}
              </span>
            </p>
          )}
          {m.intro && (
            <p className="pm-cofounder" data-intro-bonus={m.intro.points}>
              <span aria-hidden="true">📇</span>
              <span>
                {t('{name} introduced you to {investor}: +{n} interest from the start.', {
                  name: m.intro.name,
                  investor: w.he,
                  n: m.intro.points,
                })}
              </span>
            </p>
          )}
        </Card>
      )}
      {!founder && p.status !== 'meeting' && m.cofounder && (
        <p className="small muted">
          {t('{name} (business co-founder) was in the room.', { name: m.cofounder.name })}
        </p>
      )}
    </aside>
  );
}

const grade = (s: number) =>
  s >= 80
    ? t('A strong pitch')
    : s >= 60
      ? t('A good pitch')
      : s >= 40
        ? t('A mixed pitch')
        : t('A weak pitch');

function ResultCard({
  p,
  m,
  cur,
  onClose,
}: {
  p: PitchV;
  m: MeetingV;
  cur: string;
  onClose: () => void;
}) {
  const { send, busy, view } = useView();
  const w = useWords(m, cur);
  const r = m.result!;
  const terms = r.terms;
  const firm = m.investor.firm ?? m.investor.name;
  const act = (action: 'accept' | 'counter' | 'walk') =>
    void send({ type: 'pitch.meet', pitchId: p.id, action } as Command);
  const head =
    terms && r.closed !== 'walked'
      ? t('Term sheet from {firm}', { firm })
      : r.outcome === 'caught'
        ? t('Caught in diligence')
        : r.outcome === 'partners'
          ? t('{name} wants you to meet the partners', { name: w.he })
          : r.outcome === 'sent' && !r.reply
            ? t('Sent to {name}', { name: m.investor.name })
            : r.closed === 'walked'
              ? t('You walked away')
              : t('{name} passed', { name: w.he });
  const good = !!terms && r.closed !== 'walked';
  return (
    <Card
      title={head}
      tone={good ? 'good' : r.outcome === 'sent' || r.outcome === 'partners' ? undefined : 'bad'}
      action={
        <Button variant="ghost" size="sm" onClick={onClose}>
          {t('Close')}
        </Button>
      }
    >
      <div className="convo-score" data-pitch-result={r.outcome} data-pitch-score={r.score}>
        <ScoreRing score={r.score} />
        <div>
          <strong>
            {r.score} / 100 · {grade(r.score)}
          </strong>
          {r.interest !== null && (
            <div className="small muted" data-interest-at-ask={r.interest}>
              {t('Interest when you asked: {n}%', { n: r.interest })}
            </div>
          )}
        </div>
      </div>
      {terms && (
        <div className="pm-terms" data-terms-pre={terms.preMoney}>
          <Stat label={t('They invest')} value={money(terms.amount, cur)} tone="money" />
          <Stat
            label={t('At')}
            value={t('{amount} pre', { amount: money(terms.preMoney, cur) })}
            hint={
              terms.askedPre !== null && terms.askedPre !== terms.preMoney
                ? t('you asked {amount}', { amount: money(terms.askedPre, cur) })
                : undefined
            }
          />
          <Stat label={t('You give')} value={pctOf(terms.amount, terms.preMoney)} />
        </div>
      )}
      {r.outcome === 'caught' && (
        <p className="small">
          {t(
            'Your numbers didn’t match what {name} found. No more meetings with them for a while.',
            {
              name: w.he,
            },
          )}
        </p>
      )}
      {r.outcome === 'sent' && !r.reply && (
        <p className="small" data-pitch-sent>
          {t(
            '{name} has your deck and your answers, and answers it themselves: accept, counter or pass.',
            { name: m.investor.name },
          )}
        </p>
      )}
      {r.reply?.action === 'decline' && <p className="small">{tx(p.reason ?? '')}</p>}
      {r.reply && r.reply.action !== 'decline' && (
        <p className="small" data-reply={r.reply.action}>
          {r.reply.action === 'accept'
            ? t('{name} accepted your ask.', { name: m.investor.name })
            : t('{name} came back with a counter.', { name: m.investor.name })}
        </p>
      )}
      {r.moved.length > 0 && (
        <>
          <h3 className="small">
            {good
              ? t('What moved {name}', { name: w.he })
              : t('What held {name} back', { name: w.he })}
          </h3>
          <ul className="pm-moved" data-moved={r.moved.length}>
            {r.moved.map((x) => (
              <li key={x.id} data-moved-id={x.id} data-points={x.points}>
                <span className={x.points > 0 ? 'good' : x.id.startsWith('ask:') ? 'warn' : 'bad'}>
                  {x.points > 0
                    ? markIcon('good')
                    : x.id.startsWith('ask:')
                      ? '≈'
                      : markIcon('bad')}
                </span>
                <span>{w.movedLabel(x.id, m.slides)}</span>
                <b className={x.points > 0 ? 'p' : 'n'}>
                  {x.points > 0 ? `+${x.points}` : x.points}
                </b>
              </li>
            ))}
          </ul>
        </>
      )}
      {r.counter && (
        <p className="small" data-counter-reply={r.counter.reply}>
          {
            {
              agreed: t('{name} agreed at {pre}. Deal done.', {
                name: w.he,
                pre: money(r.counter.preMoney, cur),
              }),
              met: t('{name} met you part way: {pre}. Accept it, or walk away.', {
                name: w.he,
                pre: money(terms?.preMoney ?? r.counter.preMoney, cur),
              }),
              walked: t('{name} walked away: you were too far apart.', { name: w.he }),
              waiting: t('You countered at {pre}: waiting for {name}.', {
                name: w.he,
                pre: money(r.counter.preMoney, cur),
              }),
            }[r.counter.reply]
          }
        </p>
      )}
      {r.closed === 'accepted' && (
        <p className="small good" data-pitch-closed="accepted">
          {terms?.dealStatus === 'accepted'
            ? t('Signed: {amount} is in your company’s account.', {
                amount: money(terms.amount, cur),
              })
            : t('Accepted: it goes to a board vote first.')}
        </p>
      )}
      {r.closed === 'walked' && (
        <p className="small" data-pitch-closed="walked">
          {t('You walked away from the term sheet.')}
        </p>
      )}
      {r.outcome === 'partners' && p.status === 'partner-meeting' && (
        <div className="pm-actions">
          <Button
            disabled={busy || view.me.hours.left < 6}
            onClick={() => void send({ type: 'pitch.partners', pitchId: p.id })}
          >
            {t('Meet the partners (6h)')}
          </Button>
        </div>
      )}
      {terms?.awaitingYou && !r.closed && (
        <div className="pm-actions">
          <Button disabled={busy} onClick={() => act('accept')} data-pitch-accept>
            {t('Accept the term sheet')}
          </Button>
          {r.canCounter && r.counterTo !== null && (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => act('counter')}
              data-pitch-counter
            >
              {t('Counter at {pre}', { pre: money(r.counterTo, cur) })}
            </Button>
          )}
          <Button variant="ghost" disabled={busy} onClick={() => act('walk')} data-pitch-walk>
            {t('Walk away')}
          </Button>
        </div>
      )}
      {terms?.awaitingYou && !r.closed && !r.counter && (
        <p className="small muted">{t('You can counter once: then it’s accept or walk away.')}</p>
      )}
    </Card>
  );
}

const PASS = ['traction', 'team', 'market', 'price', 'fit', 'timing'] as const;
const passLabel = (x: string) =>
  ({
    traction: t('More traction first'),
    team: t('The team isn’t complete'),
    market: t('The market is too small'),
    price: t('The price is too high'),
    fit: t('Outside what I invest in'),
    timing: t('The timing isn’t right'),
  })[x] ?? x;

/** A player investor answers the pitch: accept the ask, counter it, or pass with a reason. */
function ReplyCard({
  p,
  m,
  cur,
  onClose,
}: {
  p: PitchV;
  m: MeetingV;
  cur: string;
  onClose: () => void;
}) {
  const { send, busy } = useView();
  const ask = m.ask;
  const [mode, setMode] = useState<'counter' | 'pass' | null>(null);
  const [amount, setAmount] = useState(amountInput(ask?.amount ?? p.ask));
  const [pre, setPre] = useState(amountInput(ask?.preMoney ?? 0));
  const [reason, setReason] = useState<string>('traction');
  if (!ask) return null;
  const reply = async (cmd: Record<string, unknown>, ok: string) => {
    const r = await send({ type: 'pitch.reply', pitchId: p.id, ...cmd } as Command, ok);
    if (r) onClose();
  };
  return (
    <Card title={t('Your answer')} tone={m.canReply ? 'warn' : undefined}>
      <p className="small" data-pitch-ask={`${ask.amount}@${ask.preMoney}`}>
        {t('They ask {amount} at {pre} pre ({pct}).', {
          amount: money(ask.amount, cur),
          pre: money(ask.preMoney, cur),
          pct: pctOf(ask.amount, ask.preMoney),
        })}
      </p>
      {!m.canReply ? (
        <p className="small muted">{p.reason ? tx(p.reason) : t('You’ve answered this pitch.')}</p>
      ) : (
        <>
          <div className="pm-actions">
            <Button
              disabled={busy}
              data-reply-accept
              onClick={() => void reply({ action: 'accept' }, t('Term sheet sent at their ask.'))}
            >
              {t('Accept their ask')}
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setMode('counter')}
              data-reply-counter
            >
              {t('Counter')}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setMode('pass')} data-reply-pass>
              {t('Pass')}
            </Button>
          </div>
          {mode === 'counter' && (
            <div className="grid2">
              <Field label={t('Amount ({cur})', { cur })}>
                {(id) => (
                  <input id={id} value={amount} onChange={(e) => setAmount(e.target.value)} />
                )}
              </Field>
              <Field label={t('Valuation, pre-money ({cur})', { cur })}>
                {(id) => <input id={id} value={pre} onChange={(e) => setPre(e.target.value)} />}
              </Field>
              <Button
                disabled={busy || !parseAmount(amount) || !parseAmount(pre)}
                onClick={() =>
                  void reply(
                    {
                      action: 'counter',
                      amount: parseAmount(amount) ?? 0,
                      preMoney: parseAmount(pre) ?? 0,
                    },
                    t('Counter sent.'),
                  )
                }
              >
                {t('Send the counter')}
              </Button>
            </div>
          )}
          {mode === 'pass' && (
            <div className="grid2">
              <Field label={t('Why you pass')}>
                {(id) => (
                  <select id={id} value={reason} onChange={(e) => setReason(e.target.value)}>
                    {PASS.map((x) => (
                      <option key={x} value={x}>
                        {passLabel(x)}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Button
                variant="danger"
                disabled={busy}
                onClick={() =>
                  void reply(
                    { action: 'decline', reason },
                    t('Passed, with a note to the founder.'),
                  )
                }
              >
                {t('Pass with this note')}
              </Button>
            </div>
          )}
          <p className="small muted">
            {t('Answer within the month: founders remember who never replied.')}
          </p>
        </>
      )}
    </Card>
  );
}

/** A meeting still going, or a term sheet from one waiting on you (or a partner meeting). */
export const isLiveMeeting = (p: PitchV) =>
  !!p.meeting &&
  !p.meeting.left &&
  (p.meeting.step !== 'result' ||
    (!!p.meeting.result?.terms?.awaitingYou && !p.meeting.result.closed) ||
    p.status === 'partner-meeting');

/**
 * Pick a meeting back up (the Money screen, the fund's office), or leave it.
 * The caller opens the sheet, so it stays up when the meeting ends.
 */
export function MeetingResume({ p, onOpen }: { p: PitchV; onOpen: () => void }) {
  const { send, busy } = useView();
  const m = p.meeting!;
  const midway = m.step !== 'result';
  return (
    <>
      <Card
        title={t('Your pitch meeting with {name}', { name: m.investor.name })}
        sub={m.investor.firm ?? undefined}
        tone="good"
        className="pm-resume"
      >
        <p className="small muted">
          {midway
            ? t('You left the meeting mid-way: pick up where you were.')
            : t('A term sheet is waiting for your answer.')}
        </p>
        <div className="pm-actions">
          <Button size="sm" onClick={onOpen} data-meeting-resume>
            {midway ? t('Continue') : t('See the term sheet')}
          </Button>
          {midway && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              data-meeting-leave
              onClick={() =>
                void send(
                  { type: 'pitch.meet', pitchId: p.id, action: 'leave' } as Command,
                  t('You left the meeting. You can pitch them again.'),
                )
              }
            >
              {t('Leave the meeting')}
            </Button>
          )}
        </div>
      </Card>
    </>
  );
}
