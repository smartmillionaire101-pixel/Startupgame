/**
 * Wave 12 §A: set a game up. Who you play (AI players, how sharp, and friends
 * to invite), the entry stake (up to what your lifestyle allows; the winner
 * takes the whole pot), and for a quiz: the packs, how many questions, and
 * at home your own questions (then you're the quizmaster).
 */
import { useMemo, useState } from 'react';
import type { GameKind } from '@runway/engine';
import { money } from '../format';
import { t, tx } from '../i18n';
import { useView } from '../store';
import { contactsOf } from '../city/people';
import { visitingOf } from '../phone/friends';
import { Sheet } from '../ui';
import { openGame, type NewGameRequest } from './open';
import { KIND_ICON, kindName, packName } from './labels';

const PACKS = ['general', 'business', 'sport', 'music', 'city'] as const;
type Pack = (typeof PACKS)[number];

interface Draft {
  q: string;
  right: string;
  wrong: [string, string, string];
}
const blank = (): Draft => ({ q: '', right: '', wrong: ['', '', ''] });

export function NewGame({ req, onClose }: { req: NewGameRequest; onClose: () => void }) {
  const { view, send, busy } = useView();
  const kind: GameKind = req.kind;
  const quiz = kind === 'quiz';
  const solo = !quiz;
  const limit = view.games?.stakeLimit ?? null;
  const cur = limit?.currency ?? view.market.currency;
  const max = limit?.max ?? 0;
  const visiting = visitingOf(view);
  const friends = useMemo(() => {
    const list = contactsOf(view)
      .filter((c) => c.kind === 'player' && c.refId && c.refId !== view.me.id)
      .map((c) => ({ id: c.refId, name: c.name }));
    if (visiting && !list.some((f) => f.id === visiting.host.id))
      list.unshift({ id: visiting.host.id, name: visiting.host.name });
    for (const id of req.invite ?? [])
      if (!list.some((f) => f.id === id)) list.unshift({ id, name: t('Your guest') });
    return list.filter((f, i) => list.findIndex((x) => x.id === f.id) === i).slice(0, 30);
  }, [view, visiting, req.invite]);

  const [vs, setVs] = useState<'ai' | 'friends'>(
    solo && (req.invite?.length || (visiting && req.where === 'home')) ? 'friends' : 'ai',
  );
  const [ai, setAi] = useState(quiz ? (req.where === 'venue' ? 3 : 2) : 1);
  const [skill, setSkill] = useState(2);
  const [invite, setInvite] = useState<string[]>(
    req.invite ?? (visiting && req.where === 'home' ? [visiting.host.id] : []),
  );
  const [stake, setStake] = useState(() => Math.min(max, Math.round(max / 4)));
  const [packs, setPacks] = useState<Pack[]>([]);
  const [count, setCount] = useState(6);
  const [own, setOwn] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([blank(), blank(), blank()]);

  const title = quiz
    ? req.where === 'home'
      ? t('Host a quiz night')
      : t('Quiz night at {place}', { place: req.venueName ?? '' })
    : req.where === 'home'
      ? t('{game} at home', { game: kindName(kind) })
      : t('{game} at {place}', { game: kindName(kind), place: req.venueName ?? '' });

  const filled = drafts.filter(
    (d) => d.q.trim() && d.right.trim() && d.wrong.every((w) => w.trim()),
  );
  const customOk = !own || filled.length >= 3;
  const opponentsOk = solo
    ? vs === 'ai'
      ? true
      : invite.length === 1
    : ai + invite.length >= (own ? 2 : 1);
  const toggle = (id: string) =>
    setInvite((list) =>
      list.includes(id) ? list.filter((x) => x !== id) : solo ? [id] : [...list, id].slice(0, 7),
    );

  const create = async () => {
    const r = await send<{ gameId: string; message?: string }>(
      {
        type: 'game.create',
        kind,
        where: req.where,
        ...(req.businessId ? { businessId: req.businessId } : {}),
        stake: Math.max(0, Math.min(max, Math.round(stake))),
        ai: solo ? (vs === 'ai' ? 1 : 0) : ai,
        aiSkill: skill,
        ...(vs === 'friends' || quiz ? (invite.length ? { invite } : {}) : {}),
        ...(quiz
          ? {
              quiz: {
                ...(packs.length ? { packs } : {}),
                count: own ? Math.max(3, filled.length) : count,
                ...(own
                  ? {
                      custom: filled.map((d) => ({
                        q: d.q.trim(),
                        options: [d.right.trim(), ...d.wrong.map((w) => w.trim())] as [
                          string,
                          string,
                          string,
                          string,
                        ],
                      })),
                    }
                  : {}),
              },
            }
          : {}),
      },
      (res) => (res?.message ? tx(res.message) : null),
    );
    if (r?.gameId) openGame(r.gameId);
  };

  const steps = [0, 0.25, 0.5, 1].map((f) => Math.round(max * f));
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="gm-setup" data-game-setup={kind}>
        <p className="gm-setup-lead">
          <span aria-hidden="true">{KIND_ICON[kind]}</span>{' '}
          {quiz
            ? t('Timed questions, everyone on their own phone. Fastest right answers win the pot.')
            : kind === 'pool'
              ? t('Eight-ball: aim, pick your power, pot your group, then the black.')
              : kind === 'football'
                ? t('A penalty shootout: pick your spot, then guess their dive.')
                : t('Nine darts each. Highest total takes the pot.')}
        </p>

        <fieldset className="gm-field">
          <legend>{t('Who plays')}</legend>
          {solo && (
            <div className="segmented" role="radiogroup" aria-label={t('Opponent')}>
              <button
                type="button"
                role="radio"
                aria-checked={vs === 'ai'}
                className={vs === 'ai' ? 'on' : ''}
                onClick={() => setVs('ai')}
              >
                {t('An AI player')}
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={vs === 'friends'}
                className={vs === 'friends' ? 'on' : ''}
                onClick={() => setVs('friends')}
              >
                {t('A friend')}
              </button>
            </div>
          )}
          {quiz && (
            <label className="gm-stepper">
              <span>{t('AI players')}</span>
              <span className="gm-step-ctl">
                <button
                  type="button"
                  aria-label={t('Fewer AI players')}
                  onClick={() => setAi(Math.max(0, ai - 1))}
                >
                  −
                </button>
                <b aria-live="polite" data-ai-count={ai}>
                  {ai}
                </b>
                <button
                  type="button"
                  aria-label={t('More AI players')}
                  onClick={() => setAi(Math.min(5, ai + 1))}
                >
                  +
                </button>
              </span>
            </label>
          )}
          {(quiz ? ai > 0 : vs === 'ai') && (
            <div className="segmented" role="radiogroup" aria-label={t('How good')}>
              {[
                [1, t('Easy')],
                [2, t('Fair')],
                [3, t('Sharp')],
              ].map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={skill === v}
                  className={skill === v ? 'on' : ''}
                  onClick={() => setSkill(v as number)}
                >
                  {l}
                </button>
              ))}
            </div>
          )}
          {(quiz || vs === 'friends') && (
            <div className="gm-invite" role="group" aria-label={t('Invite friends')}>
              {friends.length === 0 ? (
                <p className="small muted">
                  {t('Save players you meet as contacts to invite them.')}
                </p>
              ) : (
                friends.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={`chip-btn${invite.includes(f.id) ? ' on' : ''}`}
                    aria-pressed={invite.includes(f.id)}
                    data-invite={f.id}
                    onClick={() => toggle(f.id)}
                  >
                    {f.name}
                  </button>
                ))
              )}
            </div>
          )}
        </fieldset>

        <fieldset className="gm-field">
          <legend>{t('Stake per player')}</legend>
          <div className="gm-stake">
            <b className="gm-stake-amt" data-stake={stake}>
              {stake ? money(stake, cur) : t('Friendly (no stake)')}
            </b>
            <input
              type="range"
              min={0}
              max={Math.max(1, max)}
              step={Math.max(1, Math.round(max / 40))}
              value={stake}
              aria-label={t('Stake')}
              onChange={(e) => setStake(Number(e.target.value))}
            />
            <div className="chip-row">
              {steps.map((v, i) => (
                <button
                  key={i}
                  type="button"
                  className={`chip-btn${stake === v ? ' on' : ''}`}
                  onClick={() => setStake(v)}
                >
                  {i === 0 ? t('Friendly') : money(v, cur)}
                </button>
              ))}
            </div>
            <span className="small muted">
              {t(
                'Your lifestyle lets you stake up to {max}. Stakes are held until the end; the winner takes the pot.',
                {
                  max: money(max, cur),
                },
              )}
            </span>
          </div>
        </fieldset>

        {quiz && (
          <fieldset className="gm-field">
            <legend>{t('The questions')}</legend>
            {req.where === 'home' && (
              <div className="segmented" role="radiogroup" aria-label={t('Questions')}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={!own}
                  className={!own ? 'on' : ''}
                  onClick={() => setOwn(false)}
                >
                  {t('From the packs')}
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={own}
                  className={own ? 'on' : ''}
                  onClick={() => setOwn(true)}
                >
                  {t('Write my own')}
                </button>
              </div>
            )}
            {!own ? (
              <>
                <div className="chip-row" role="group" aria-label={t('Packs')}>
                  {PACKS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={`chip-btn${packs.includes(p) ? ' on' : ''}`}
                      aria-pressed={packs.includes(p)}
                      onClick={() =>
                        setPacks((l) => (l.includes(p) ? l.filter((x) => x !== p) : [...l, p]))
                      }
                    >
                      {packName(p)}
                    </button>
                  ))}
                </div>
                <span className="small muted">
                  {packs.length ? '' : t('No pack picked: a bit of everything.')}
                </span>
                <label className="gm-stepper">
                  <span>{t('Questions')}</span>
                  <span className="gm-step-ctl">
                    <button
                      type="button"
                      aria-label={t('Fewer questions')}
                      onClick={() => setCount(Math.max(3, count - 1))}
                    >
                      −
                    </button>
                    <b>{count}</b>
                    <button
                      type="button"
                      aria-label={t('More questions')}
                      onClick={() => setCount(Math.min(12, count + 1))}
                    >
                      +
                    </button>
                  </span>
                </label>
              </>
            ) : (
              <div className="gm-drafts">
                <p className="small muted">
                  {t(
                    'You know the answers, so you’re the quizmaster: your friends play for the pot.',
                  )}
                </p>
                {drafts.map((d, i) => (
                  <div className="gm-draft" key={i} data-draft={i}>
                    <label>
                      <span>{t('Question {n}', { n: i + 1 })}</span>
                      <input
                        value={d.q}
                        maxLength={140}
                        onChange={(e) =>
                          setDrafts((l) =>
                            l.map((x, k) => (k === i ? { ...x, q: e.target.value } : x)),
                          )
                        }
                      />
                    </label>
                    <label className="gm-right">
                      <span>{t('Right answer')}</span>
                      <input
                        value={d.right}
                        maxLength={48}
                        onChange={(e) =>
                          setDrafts((l) =>
                            l.map((x, k) => (k === i ? { ...x, right: e.target.value } : x)),
                          )
                        }
                      />
                    </label>
                    {d.wrong.map((w, j) => (
                      <label key={j} className="gm-wrong">
                        <span>{t('Wrong answer {n}', { n: j + 1 })}</span>
                        <input
                          value={w}
                          maxLength={48}
                          onChange={(e) =>
                            setDrafts((l) =>
                              l.map((x, k) =>
                                k === i
                                  ? {
                                      ...x,
                                      wrong: x.wrong.map((y, m) =>
                                        m === j ? e.target.value : y,
                                      ) as Draft['wrong'],
                                    }
                                  : x,
                              ),
                            )
                          }
                        />
                      </label>
                    ))}
                    {drafts.length > 3 && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setDrafts((l) => l.filter((_, k) => k !== i))}
                      >
                        {t('Remove')}
                      </button>
                    )}
                  </div>
                ))}
                {drafts.length < 12 && (
                  <button
                    type="button"
                    className="btn btn-subtle btn-sm"
                    onClick={() => setDrafts((l) => [...l, blank()])}
                  >
                    {t('Add a question')}
                  </button>
                )}
              </div>
            )}
          </fieldset>
        )}

        <button
          type="button"
          className="btn btn-primary btn-lg gm-go"
          disabled={busy || !customOk || !opponentsOk}
          onClick={() => void create()}
        >
          {quiz && own ? t('Set up my quiz') : t('Set it up')}
        </button>
        {!opponentsOk && (
          <span className="small muted">
            {solo
              ? t('Pick a friend, or play an AI player.')
              : t('Add AI players or invite friends.')}
          </span>
        )}
        {own && !customOk && (
          <span className="small muted">
            {t('Write at least three questions with four answers each.')}
          </span>
        )}
      </div>
    </Sheet>
  );
}
