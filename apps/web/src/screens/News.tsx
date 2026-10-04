import { useEffect, useState } from 'react';
import { api } from '../api';
import { t, tx } from '../i18n';
import { useGame, useView } from '../store';
import { Button, Card, Empty, Pill, Sparkline } from '../ui';

type Tab = 'digest' | 'feed' | 'stories';
type Article = ReturnType<typeof useView>['view']['news'][number];

const checkLabel = (r: string) =>
  ({
    accurate: t('accurate'),
    'slightly-off': t('slightly-off'),
    false: t('false'),
    future: t('future'),
  })[r] ?? r;

const outletLabel = (o: string) =>
  ({
    national: t('national'),
    tech: t('tech'),
    tabloid: t('tabloid'),
    trade: t('trade'),
    regional: t('regional'),
    global: t('global'),
  })[o] ?? o;

const statusLabel = (st: string) =>
  ({
    invited: t('invited'),
    angle: t('angle'),
    questions: t('questions'),
    preview: t('preview'),
    published: t('published'),
    declined: t('declined'),
    pulled: t('pulled'),
  })[st] ?? st;

export function NewsScreen() {
  const { view } = useView();
  const open = view.media.filter((m) =>
    ['invited', 'questions', 'preview'].includes(m.status),
  ).length;
  const [tab, setTab] = useState<Tab>(open ? 'stories' : 'digest');
  return (
    <>
      <h1>{t('News')}</h1>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'digest'} onClick={() => setTab('digest')}>
          {t('Top 5')}
        </button>
        <button role="tab" aria-selected={tab === 'feed'} onClick={() => setTab('feed')}>
          {t('Feed')}
        </button>
        <button role="tab" aria-selected={tab === 'stories'} onClick={() => setTab('stories')}>
          {t('My stories')}
          {open ? ` (${open})` : ''}
        </button>
      </div>
      {tab === 'digest' && <Digest />}
      {tab === 'feed' &&
        (view.news.length ? (
          view.news.map((n) => <ArticleCard key={n.id} a={n} />)
        ) : (
          <Empty>{t('Quiet month.')}</Empty>
        ))}
      {tab === 'stories' && <Stories />}
    </>
  );
}

/** Reads the public digest endpoint so the service worker can serve it offline. */
function Digest() {
  const { view } = useView();
  const { status } = useGame();
  const [digest, setDigest] = useState<{ note: string; headlines: Article[] } | null>(null);
  useEffect(() => {
    void api
      .digest(view.market.id)
      .then(setDigest)
      .catch(() => setDigest({ note: view.market.economicNote, headlines: view.digest }));
  }, [view.market.id, view.worldVersion, view.digest, view.market.economicNote]);
  const items = digest?.headlines ?? view.digest;
  return (
    <>
      <Card title={t('{market} daily digest', { market: view.market.name })}>
        <p className="small muted">{tx(digest?.note ?? view.market.economicNote)}</p>
        {status === 'offline' && <Pill tone="warn">{t('Offline copy')}</Pill>}
      </Card>
      {items.length ? (
        items.map((n) => <ArticleCard key={n.id} a={n} />)
      ) : (
        <Empty>{t('No headlines yet this month.')}</Empty>
      )}
    </>
  );
}

function ArticleCard({ a }: { a: Article }) {
  return (
    <Card>
      <div className="article">
        <div className="spread small muted">
          <span>
            {a.outletName} · {t('month {n}', { n: a.month })}
          </span>
          {a.verified && <span className="verified">✓ {t('Verified')}</span>}
        </div>
        <div className="headline">{tx(a.headline)}</div>
        <p>{tx(a.body)}</p>
        <div className="spread">
          {a.starDelta !== 0 ? (
            <Pill tone={a.starDelta > 0 ? 'good' : 'bad'}>
              {t('Stars {delta}', { delta: (a.starDelta > 0 ? '+' : '') + a.starDelta })}
            </Pill>
          ) : (
            <span />
          )}
          {a.chart && <Sparkline values={a.chart.values} label={tx(a.chart.label)} />}
        </div>
      </div>
    </Card>
  );
}

/** Reporter outreach (§10): accept, pick an angle, three questions, fact check, preview, publish. */
function Stories() {
  const { view, send } = useView();
  const [answers, setAnswers] = useState<Record<string, Record<string, string>>>({});
  const company = view.companies.find((c) => c.status === 'active');
  const active = view.media.filter((m) => ['invited', 'questions', 'preview'].includes(m.status));
  const past = view.media.filter((m) => !['invited', 'questions', 'preview'].includes(m.status));
  return (
    <>
      {active.length === 0 && (
        <Empty>{t('No reporters waiting. Grow, raise, or pitch a story below.')}</Empty>
      )}
      {active.map((m) => (
        <Card
          key={m.id}
          title={`${m.outletName} · ${m.reporter}`}
          action={
            <Pill tone="info">
              {m.status === 'invited'
                ? t('Invite')
                : m.status === 'questions'
                  ? t('Interview')
                  : t('Preview')}
            </Pill>
          }
        >
          {m.status === 'invited' && (
            <>
              <p>“{tx(m.invite)}”</p>
              <p className="small muted">{t('Pick an angle. Declining costs nothing.')}</p>
              <div className="row">
                {m.angles.map((angle) => (
                  <Button
                    key={angle}
                    variant="subtle"
                    onClick={() => void send({ type: 'media.accept', inviteId: m.id, angle })}
                  >
                    {tx(angle)}
                  </Button>
                ))}
                <Button
                  variant="ghost"
                  onClick={() =>
                    void send({ type: 'media.decline', inviteId: m.id }, t('Declined.'))
                  }
                >
                  {t('Decline')}
                </Button>
              </div>
            </>
          )}
          {(m.status === 'questions' || m.status === 'preview') && (
            <>
              {m.questions.map((q) => (
                <div key={q.id} className="field">
                  <div className="item-title">{tx(q.text)}</div>
                  <div className="chips" style={{ marginTop: '0.3rem' }}>
                    {q.options.map((o) => {
                      const chosen = (answers[m.id]?.[q.id] ?? m.answers[q.id]) === o.id;
                      return (
                        <button
                          key={o.id}
                          className="chip"
                          aria-pressed={chosen}
                          onClick={() =>
                            setAnswers((a) => ({
                              ...a,
                              [m.id]: { ...m.answers, ...a[m.id], [q.id]: o.id },
                            }))
                          }
                        >
                          {tx(o.label)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              <Button
                variant={m.status === 'preview' ? 'subtle' : 'primary'}
                disabled={m.questions.some((q) => !(answers[m.id]?.[q.id] ?? m.answers[q.id]))}
                onClick={() =>
                  void send({
                    type: 'media.answer',
                    inviteId: m.id,
                    answers: { ...m.answers, ...answers[m.id] },
                  })
                }
              >
                {m.status === 'preview' ? t('Change answers') : t('Send answers (1h)')}
              </Button>
            </>
          )}
          {m.status === 'preview' && m.draft && (
            <Card tone={m.checks.some((c) => c.result === 'false') ? 'warn' : 'good'}>
              <div className="small muted">
                {t('Fact check: {list}', {
                  list: m.checks.map((c) => `${c.questionId} ${checkLabel(c.result)}`).join(' · '),
                })}
              </div>
              <div className="headline" style={{ marginTop: '0.4rem' }}>
                {tx(m.draft.headline)}
              </div>
              <p>{tx(m.draft.body)}</p>
              {m.checks.some((c) => c.result === 'false') ? (
                <>
                  <p className="small warn">
                    {t(
                      'A claim is clearly false. Correct it, pull out, or insist: the true figure runs with a note and your stars drop.',
                    )}
                  </p>
                  <div className="row">
                    <Button
                      variant="danger"
                      onClick={() =>
                        void send(
                          { type: 'media.publish', inviteId: m.id, insist: true },
                          (r: { alert: string }) => tx(r.alert),
                        )
                      }
                    >
                      {t('Insist')}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() =>
                        void send({ type: 'media.pull', inviteId: m.id }, t('Pulled out.'))
                      }
                    >
                      {t('Pull out')}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="row">
                  <Button
                    onClick={() =>
                      void send(
                        { type: 'media.publish', inviteId: m.id, insist: false },
                        (r: { alert: string }) => tx(r.alert),
                      )
                    }
                  >
                    {t('Approve')}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      void send({ type: 'media.pull', inviteId: m.id }, t('Pulled out.'))
                    }
                  >
                    {t('Pull out')}
                  </Button>
                </div>
              )}
              <p className="small muted">{t('You can approve or pull out, not rewrite.')}</p>
            </Card>
          )}
        </Card>
      ))}
      <Card title={t('Pitch a story')}>
        <p className="small muted">
          {t('The reporter decides. One pitch per outlet every few months.')}
        </p>
        <ul className="list">
          {view.market.outlets.map((o) => (
            <li key={o.id} className="spread">
              <div>
                <div className="item-title">{o.name}</div>
                <div className="small muted">
                  {outletLabel(o.type)} · {o.reporter}
                </div>
              </div>
              <Button
                variant="subtle"
                onClick={() =>
                  void send(
                    {
                      type: 'media.pitch',
                      outletId: o.id,
                      ...(company ? { companyId: company.id } : {}),
                    },
                    (r: { accepted: boolean; reason?: string }) =>
                      r.accepted
                        ? t('They’re interested. Check My stories.')
                        : r.reason
                          ? tx(r.reason)
                          : t('Not for now.'),
                  )
                }
              >
                {t('Pitch (2h)')}
              </Button>
            </li>
          ))}
        </ul>
      </Card>
      {past.length > 0 && (
        <details>
          <summary className="small muted">{t('Past stories ({n})', { n: past.length })}</summary>
          <ul className="list small">
            {past.map((m) => (
              <li key={m.id}>
                {m.outletName}: {statusLabel(m.status)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
