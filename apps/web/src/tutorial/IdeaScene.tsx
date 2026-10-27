/**
 * Founder Journey 6: the café scene (blueprint §3 "Coffee shop", §6.1,
 * FR-004). A contact (the owner of a café in town, an AI character) tells
 * you what problems they hear about; you pick one of four ideas, each shown
 * with its attributes as simple bars (demand, competition, how hard it is to
 * build, how much cash it needs, and how well it fits your background), name
 * the company and start it with `company.found { ideaId }`.
 */
import { useEffect, useRef, useState } from 'react';
import { STARTER_IDEAS, founderFit, ideaEdge, type StarterIdea, type Skills } from '@runway/engine';
import { api } from '../api';
import { money } from '../format';
import { t, tx } from '../i18n';
import { useView } from '../store';
import { Bar, Button, Field } from '../ui';
import { AvatarFigure, avatarLook } from '../city/art';
import { genderOf } from '../city/life';
import { RoomBack } from '../city/RoomArt';
import { cafeContact } from './Coach';

const modelLabel = (m: string) =>
  ({
    subscription: t('Subscription'),
    transaction: t('Transaction'),
    usage: t('Usage'),
    marketplace: t('Marketplace'),
    'one-off': t('One Off'),
    services: t('Services'),
  })[m] ?? m;

const industryLabel = (i: string) =>
  ({
    fintech: t('Fintech'),
    ecommerce: t('E-commerce'),
    logistics: t('Logistics'),
    healthtech: t('Health'),
    edtech: t('Education'),
    saas: t('Business software'),
    agritech: t('Agriculture'),
  })[i] ?? i;

export default function IdeaScene({ onClose }: { onClose: () => void }) {
  const { view, send, busy } = useView();
  const contact = cafeContact(view);
  const [pick, setPick] = useState<StarterIdea | null>(null);
  const [name, setName] = useState('');
  const [check, setCheck] = useState<{ ok: boolean; reason?: string } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, [pick]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const skills = view.me.skills as Skills;
  const cost = Math.round(view.market.costOfLiving * 0.3);
  const verify = (v: string) => {
    setName(v);
    setCheck(null);
    if (v.trim().length >= 3)
      void api
        .checkName(v, view.market.id, 'company')
        .then(setCheck)
        .catch(() => setCheck(null));
  };
  const start = async () => {
    if (!pick) return;
    const r = await send(
      {
        type: 'company.found',
        company: {
          name: name.trim(),
          idea: pick.pitch,
          industry: pick.industry,
          revenueModel: pick.revenueModel,
          incorporation: 'local',
          ideaId: pick.id,
        },
      },
      // Founder setup: the café picks the idea and the name; registering and funding follow.
      view.setupOn
        ? t('{name}: the name is yours. Next, register it.', { name: name.trim() })
        : t('{name} is open for business.', { name: name.trim() }),
    );
    if (r) onClose();
  };
  const npc = avatarLook('f-corporate', `npc:${contact.id ?? 'cafe'}`);
  const me = avatarLook(view.me.background?.id, view.me.id, genderOf(view.me));
  return (
    <div
      className="idea-scene"
      role="dialog"
      aria-modal="true"
      aria-labelledby="idea-title"
      ref={ref}
      tabIndex={-1}
    >
      <div className="idea-room" aria-hidden="true">
        <svg viewBox="0 -80 360 320" preserveAspectRatio="xMidYMax slice">
          <RoomBack kind="cafe" tint="#b45309" sign={contact.cafe.toUpperCase().slice(0, 22)} />
          <g transform="translate(130 225) scale(2.4)">
            <AvatarFigure look={me} />
          </g>
          <g transform="translate(225 225) scale(2.4) scale(-1 1)">
            <AvatarFigure look={npc} />
          </g>
        </svg>
      </div>
      <div className="idea-panel">
        <div className="spread">
          <h2 id="idea-title">{t('At the café')}</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            {t('Leave')}
          </button>
        </div>
        {!pick ? (
          <>
            <p className="idea-say">
              <strong>{contact.name}</strong>{' '}
              {t(
                '“So you want to start a business? Everyone who sits here tells me their problems. Pick one worth solving.”',
              )}
            </p>
            <p className="small muted">
              {t(
                'No idea is a sure winner: more demand often means more rivals. A good fit with your background makes selling easier.',
              )}
            </p>
            <ul className="idea-list" aria-label={t('Ideas')}>
              {STARTER_IDEAS.map((idea) => {
                const fit = founderFit(idea, skills);
                const edge = ideaEdge(idea, fit);
                const a = idea.attributes;
                return (
                  <li key={idea.id} className="idea-card" data-idea={idea.id}>
                    <strong>{tx(idea.title)}</strong>
                    <q className="small">{tx(idea.problem)}</q>
                    <span className="small muted">
                      {t('{industry} · earns by {model}', {
                        industry: industryLabel(idea.industry),
                        model: modelLabel(idea.revenueModel).toLowerCase(),
                      })}
                    </span>
                    <div className="idea-bars">
                      <Bar value={a.demand} label={t('Demand')} tone="good" />
                      <Bar value={a.competition} label={t('Rivals')} tone="bad" />
                      <Bar value={a.buildDifficulty} label={t('Hard to build')} tone="warn" />
                      <Bar value={a.capitalIntensity} label={t('Cash needed')} tone="warn" />
                      <Bar
                        value={fit}
                        label={t('Fit with you')}
                        tone={fit >= 0.5 ? 'good' : 'warn'}
                      />
                    </div>
                    <span className="small">
                      {edge >= 0.02
                        ? t('Selling should be a little easier than usual.')
                        : edge <= -0.02
                          ? t('Selling will be a little harder than usual.')
                          : t('Selling should be about average.')}
                    </span>
                    <Button size="sm" onClick={() => setPick(idea)}>
                      {t('Choose this idea')}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <div className="stack" data-idea-chosen={pick.id}>
            <p className="idea-say">
              <strong>{contact.name}</strong>{' '}
              {t('“{title}? I’d pay for that. What will you call it?”', {
                title: tx(pick.title),
              })}
            </p>
            <Field
              label={t('Company name')}
              hint={
                check && !check.ok ? (
                  <span className="bad">{tx(check.reason ?? '')}</span>
                ) : undefined
              }
            >
              {(id) => (
                <input
                  id={id}
                  value={name}
                  maxLength={32}
                  autoComplete="off"
                  onChange={(e) => verify(e.target.value)}
                />
              )}
            </Field>
            <p className="small muted">
              {/* Founder setup: starting only reserves the name; the fee and the
                  money in are steps of their own, when you take them. */}
              {view.setupOn
                ? t(
                    'Starting it reserves the name: nothing is paid yet. Next you register it (a local fee of about {amount}) and choose how much of your savings to put in.',
                    { amount: money(cost, view.market.currency) },
                  )
                : t(
                    'Starting it moves a little of your savings into the company’s own business account and pays a local registration fee of about {amount}.',
                    { amount: money(cost, view.market.currency) },
                  )}
            </p>
            <div className="row">
              <Button disabled={busy || !check?.ok} onClick={() => void start()}>
                {t('Start {name}', { name: name.trim() || t('the company') })}
              </Button>
              <Button variant="ghost" onClick={() => setPick(null)}>
                {t('Pick another idea')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
