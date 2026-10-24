/**
 * The product roadmap (blueprint §6.3, FR-006): pick features, order them,
 * watch them progress month by month, then release. Customer feedback and
 * support incidents arrive in an inbox with a one-tap "Add to roadmap".
 */
import { useState } from 'react';
import { money } from '../format';
import { t, tx } from '../i18n';
import { useView, type Company as CompanyT } from '../store';
import { Bar, Button, Card, Confirm, Fold, Pill, Sheet } from '../ui';
import './roadmap.css';

type RoadmapT = CompanyT['roadmap'];
type ProjectT = RoadmapT['projects'][number];
type FeatureT = RoadmapT['catalogue'][number];
type EffectKind = FeatureT['effect']['kind'];

const effectLabel = (k: EffectKind) =>
  ({
    fit: t('Better fit'),
    quality: t('Higher quality'),
    conversion: t('More sign-ups pay'),
    pricing: t('Pricing power'),
    retention: t('Fewer customers leave'),
    efficiency: t('Cheaper to run'),
    stability: t('Pays down tech debt'),
  })[k];

const effectHelp = (k: EffectKind) =>
  ({
    fit: t('More people find it does what they need.'),
    quality: t('It works better, so it feels more reliable.'),
    conversion: t('More people who try it become paying customers.'),
    pricing: t('Customers value it more, so your price feels fairer.'),
    retention: t('Customers stay longer.'),
    efficiency: t('Each customer costs less to serve.'),
    stability: t('Fixes bugs and shortcuts that make the product break.'),
  })[k];

const skillLabel = (s: string) =>
  ({ eng: t('Engineering'), design: t('Design'), data: t('Data') })[s] ?? s;

const riskLabel = (r: number) =>
  r >= 0.3 ? t('High risk') : r >= 0.15 ? t('Some risk') : t('Low risk');

function EffectChip({ kind }: { kind: EffectKind }) {
  return (
    <span className={`rm-effect rm-effect-${kind}`} title={effectHelp(kind)}>
      {effectLabel(kind)}
    </span>
  );
}

function eta(p: ProjectT, capacity: number) {
  if (p.ready) return t('Ready to release');
  if (p.contractorPending) return t('Contractors finish it at month end');
  if (p.blockedBy) return t('Waiting for {name} to ship', { name: tx(p.blockedBy) });
  if (p.etaMonths === null || capacity <= 0)
    return t('No one is building yet: log build hours or hire engineers');
  return p.etaMonths <= 1
    ? t('About 1 month left')
    : t('About {n} months left', { n: p.etaMonths });
}

export function Roadmap({ c }: { c: CompanyT }) {
  const { send, view } = useView();
  const r = c.roadmap;
  const [adding, setAdding] = useState(false);
  const [party, setParty] = useState<{ name: string; defects: number } | null>(null);
  const cur = c.currency;
  const now = r.projects.filter((p) => p.status === 'in_progress');
  const backlog = r.projects.filter((p) => p.status === 'planned');
  const shipped = r.projects.filter((p) => p.status === 'released');
  const open = [...now, ...backlog];
  // The queue order is the order of open projects in the roadmap.
  const order = r.projects.filter((p) => p.status !== 'released').map((p) => p.id);

  const add = (f: { featureId: string; name: string }) =>
    send({ type: 'roadmap.add', companyId: c.id, featureId: f.featureId }, () =>
      t('{name} added to your roadmap.', { name: tx(f.name) }),
    );
  const release = async (p: ProjectT) => {
    const res = await send<{ defects: number }>(
      { type: 'roadmap.release', companyId: c.id, projectId: p.id },
      () => t('{name} is live.', { name: tx(p.name) }),
    );
    if (res) setParty({ name: p.name, defects: res.defects });
  };

  const projectCard = (p: ProjectT) => {
    const i = order.indexOf(p.id);
    return (
      <li key={p.id} className={`rm-project${p.ready ? ' rm-ready' : ''}`}>
        <div className="rm-project-head">
          <strong>{tx(p.name)}</strong>
          <EffectChip kind={p.effect.kind} />
        </div>
        {p.status !== 'released' ? (
          <>
            <Bar
              label={t('{name} progress', { name: tx(p.name) })}
              value={p.pct / 100}
              tone={p.ready ? 'good' : undefined}
            />
            <p className="small muted">
              {t('{done} of {total} person-weeks', {
                done: Math.floor(p.progress * 10) / 10,
                total: p.effortWeeks,
              })}
              {' · '}
              {eta(p, r.capacityWeeks)}
            </p>
            {p.missingSkill && !p.ready && (
              <p className="small warn">
                {p.skill === 'design'
                  ? t('No product designer on the team: this goes 25% slower.')
                  : t('No engineer on the team: data work goes 25% slower.')}
              </p>
            )}
            <div className="rm-actions">
              {p.ready && (
                <Button onClick={() => void release(p)}>
                  {t('Release {name}', { name: tx(p.name) })}
                </Button>
              )}
              {!p.ready && (
                <>
                  <Button
                    variant="subtle"
                    size="sm"
                    disabled={i <= 0}
                    aria-label={t('Move {name} up', { name: tx(p.name) })}
                    onClick={() =>
                      void send({
                        type: 'roadmap.prioritise',
                        companyId: c.id,
                        projectId: p.id,
                        dir: 'up',
                      })
                    }
                  >
                    ↑
                  </Button>
                  <Button
                    variant="subtle"
                    size="sm"
                    disabled={i >= order.length - 1}
                    aria-label={t('Move {name} down', { name: tx(p.name) })}
                    onClick={() =>
                      void send({
                        type: 'roadmap.prioritise',
                        companyId: c.id,
                        projectId: p.id,
                        dir: 'down',
                      })
                    }
                  >
                    ↓
                  </Button>
                </>
              )}
              {!p.ready && !p.blockedBy && !p.contractorPending && p.contractFee > 0 && (
                <Confirm
                  variant="primary"
                  label={t('Hire contractors')}
                  confirmLabel={t('Pay {fee} to finish by month end', {
                    fee: money(p.contractFee, cur),
                  })}
                  onConfirm={() =>
                    void send({ type: 'roadmap.contract', companyId: c.id, projectId: p.id }, () =>
                      t('Contractors hired. It will be finished at month end.'),
                    )
                  }
                />
              )}
              {!p.ready && (
                <Confirm
                  label={t('Remove')}
                  confirmLabel={
                    p.progress > 0 ? t('Remove and lose the work done') : t('Yes, remove it')
                  }
                  onConfirm={() =>
                    void send({ type: 'roadmap.remove', companyId: c.id, projectId: p.id })
                  }
                />
              )}
            </div>
          </>
        ) : (
          <p className="small muted">
            {p.defectsShipped > 0
              ? t('Shipped with {n} bugs.', { n: p.defectsShipped })
              : t('Shipped clean.')}
          </p>
        )}
      </li>
    );
  };

  return (
    <>
      <Card
        title={t('Product roadmap')}
        action={<Button onClick={() => setAdding(true)}>{t('Add a feature')}</Button>}
      >
        <p className="small muted">
          {t(
            'Pick features to build. Each month your engineers and your own build hours work on the top one first: {pct}% of their time goes to the roadmap, the rest keeps polishing the product.',
            { pct: Math.round(r.share * 100) },
          )}
        </p>
        <p className="small">
          {r.capacityWeeks > 0
            ? t('This month: about {n} person-weeks of work.', { n: r.capacityWeeks })
            : t('No one is building yet. Log build hours on the Product tab or hire engineers.')}
        </p>
        {r.defects > 0 && (
          <p className="small bad">
            {t('{n} known bugs are live. They wear quality down every month until a bug bash.', {
              n: r.defects,
            })}
          </p>
        )}
      </Card>

      <Fold title={t('What is tech debt?')} id="rm-debt">
        <p className="small">
          {t(
            'Tech debt is the shortcuts in your code. Shipping in Fast mode adds more of them, and a few bugs. Too much tech debt makes the product break, and customers leave.',
          )}
        </p>
        <p className="small">
          {t(
            'Quality mode builds slower but ships almost no debt. A bug bash or a security audit pays it down.',
          )}
        </p>
        <Bar
          label={t('Tech debt')}
          value={c.product.techDebt}
          tone={c.product.techDebt > 0.5 ? 'bad' : 'warn'}
        />
      </Fold>

      {r.feedback.length > 0 && (
        <Card title={t('Customer feedback')} sub={t('What customers asked for this month')}>
          <ul className="rm-list" aria-label={t('Customer feedback')}>
            {r.feedback.map((f) => (
              <li key={f.id} className={`rm-feedback rm-feedback-${f.kind}`}>
                {f.kind === 'incident' ? (
                  <p>
                    <Pill tone="bad">{t('Support')}</Pill>{' '}
                    {t('{n} bugs reached customers. Support tickets are piling up.', {
                      n: f.count ?? 0,
                    })}
                  </p>
                ) : (
                  <p>
                    “{tx(f.ask)}”{f.from && <span className="small muted"> · {tx(f.from)}</span>}
                  </p>
                )}
                <div className="rm-actions">
                  {f.onRoadmap ? (
                    <span className="small muted">{t('On your roadmap')}</span>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => void add(f)}
                      aria-label={t('Add {name} to roadmap', { name: tx(f.name) })}
                    >
                      {t('Add {name} to roadmap', { name: tx(f.name) })}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      void send({ type: 'roadmap.dismiss', companyId: c.id, feedbackId: f.id })
                    }
                  >
                    {t('Dismiss')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <section className="rm-lanes">
        <Card title={t('Now')} sub={t('Being built')}>
          {now.length ? (
            <ul className="rm-list">{now.map(projectCard)}</ul>
          ) : (
            <p className="small muted">
              {open.length
                ? t('Nothing started yet. Work begins at month end.')
                : t('Add a feature to start.')}
            </p>
          )}
        </Card>
        <Card title={t('Backlog')} sub={t('Next up, in order')}>
          {backlog.length ? (
            <ul className="rm-list">{backlog.map(projectCard)}</ul>
          ) : (
            <p className="small muted">{t('Empty.')}</p>
          )}
        </Card>
        <Card title={t('Shipped')}>
          {shipped.length ? (
            <ul className="rm-list">{shipped.map(projectCard)}</ul>
          ) : (
            <p className="small muted">{t('Nothing released yet.')}</p>
          )}
        </Card>
      </section>

      {adding && (
        <Sheet title={t('Add a feature')} onClose={() => setAdding(false)}>
          <p className="small muted">
            {t('The cost is paid now for tools and licences. The work is done by your team.')}
          </p>
          <ul className="rm-list" aria-label={t('Features you can build')}>
            {r.catalogue.map((f) => (
              <li key={f.featureId} className="rm-project">
                <div className="rm-project-head">
                  <strong>{tx(f.name)}</strong>
                  <EffectChip kind={f.effect.kind} />
                </div>
                <p className="small">{tx(f.blurb)}</p>
                <p className="small muted">
                  {t('{n} person-weeks', { n: f.effortWeeks })} · {skillLabel(f.skill)} ·{' '}
                  {riskLabel(f.risk)}
                  {f.requires && <> · {t('Needs {name} first', { name: tx(f.requires) })}</>}
                </p>
                <Button
                  size="sm"
                  disabled={c.cash < f.cost}
                  onClick={async () => {
                    if (await add(f)) setAdding(false);
                  }}
                  aria-label={t('Add {name} to roadmap', { name: tx(f.name) })}
                >
                  {f.cost > 0 ? t('Add for {cost}', { cost: money(f.cost, cur) }) : t('Add (free)')}
                </Button>
              </li>
            ))}
          </ul>
          {view.me.hours.left < 10 && (
            <p className="small muted">
              {t('Tip: log build hours next month to speed things up.')}
            </p>
          )}
        </Sheet>
      )}

      {party && (
        <div className="rm-party" role="status" onClick={() => setParty(null)}>
          <div className="rm-party-card">
            <div className="rm-confetti" aria-hidden="true">
              {Array.from({ length: 14 }, (_, i) => (
                <span key={i} style={{ ['--i' as string]: i }} />
              ))}
            </div>
            <h2>{t('{name} is live!', { name: tx(party.name) })}</h2>
            <p className="small">
              {party.defects > 0
                ? t('It shipped with {n} bugs. Customers will report them.', { n: party.defects })
                : t('It shipped clean. Customers will notice next month.')}
            </p>
            <Button onClick={() => setParty(null)}>{t('Nice')}</Button>
          </div>
        </div>
      )}
    </>
  );
}
