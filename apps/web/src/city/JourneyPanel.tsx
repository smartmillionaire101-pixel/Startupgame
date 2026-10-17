/**
 * The founder journey (blueprint §2.1, §5.3, §9.2): a HUD chip on the City,
 * a sheet with the three objectives (pin or dismiss each) and the seven
 * chapters, and a quiet banner when a chapter completes. The same panel is
 * the phone's Journey app.
 */
import './journey.css';
import { useEffect, useRef } from 'react';
import type { ObjectiveKind } from '@runway/engine';
import { t } from '../i18n';
import { useView } from '../store';
import { Button } from '../ui';
import { useSimple } from '../phone/settings';
import {
  chapterCopy,
  freshChapters,
  journeyOf,
  objectivesFor,
  progressText,
  stepCopy,
  type Journey,
  type JourneyGo,
  type Objective,
} from './journey';

const KIND_LABEL = (k: ObjectiveKind) =>
  k === 'main' ? t('Main') : k === 'opportunity' ? t('Opportunity') : t('Personal');

/**
 * The Journey button on the City HUD: an icon (🚩) with a thin progress ring,
 * grouped with the map's round buttons so nothing floats over the map. Its
 * name says the chapter ("Journey: Chapter 2 · The First Team").
 */
export function JourneyChip({ onOpen }: { onOpen: () => void }) {
  const { view } = useView();
  // Simple mode (Phase 2): the flag says "Journey" beside it.
  const simple = useSimple();
  const j = journeyOf(view);
  if (!j) return null;
  const ch = j.chapters.find((c) => c.status === 'current');
  const doneSteps = ch ? ch.steps.filter((s) => s.done && !s.optional).length : 0;
  const label = ch
    ? t('Chapter {n} · {title}', { n: ch.n, title: chapterCopy(ch.id).title })
    : t('Journey complete');
  const pct = ch ? Math.round((100 * doneSteps) / Math.max(1, ch.need)) : 100;
  return (
    <button
      type="button"
      className={`${simple ? 'hud-places journey-chip-simple' : 'hud-round'} journey-chip`}
      data-testid="journey-chip"
      data-chapter={ch?.n ?? 'done'}
      aria-haspopup="dialog"
      aria-label={t('Journey: {chapter}', { chapter: label })}
      title={label}
      style={{ ['--p' as string]: `${pct}%` }}
      onClick={onOpen}
    >
      <span aria-hidden>🚩</span>
      {simple && (
        <span className="hud-btn-label" aria-hidden="true">
          {t('Journey')}
        </span>
      )}
    </button>
  );
}

function ObjectiveRow({
  o,
  kind,
  pinned,
  onGo,
}: {
  o: Objective | null;
  kind: ObjectiveKind;
  pinned: boolean;
  onGo: (g: JourneyGo) => void;
}) {
  const { send, busy } = useView();
  return (
    <li className={`journey-obj journey-k-${kind}`} data-objective={kind}>
      <span className="journey-obj-kind">{KIND_LABEL(kind)}</span>
      {o ? (
        <div className="journey-obj-body">
          <button
            type="button"
            className="journey-obj-main"
            disabled={!o.go}
            onClick={() => o.go && onGo(o.go)}
          >
            <span className="journey-obj-icon" aria-hidden>
              {o.icon}
            </span>
            <span>
              <b>{o.label}</b>
              {o.why && <span className="journey-why">{o.why}</span>}
            </span>
          </button>
          <span className="journey-obj-actions">
            <button
              type="button"
              className={`journey-mini${pinned ? ' on' : ''}`}
              aria-pressed={pinned}
              disabled={busy}
              title={pinned ? t('Unpin') : t('Pin: keep this one here')}
              aria-label={pinned ? t('Unpin') : t('Pin: keep this one here')}
              onClick={() =>
                void send({ type: 'journey.pin', kind, ...(pinned ? {} : { id: o.id }) })
              }
            >
              📌
            </button>
            <button
              type="button"
              className="journey-mini"
              disabled={busy}
              title={t('Not now: show me another')}
              aria-label={t('Not now: show me another')}
              onClick={() => void send({ type: 'journey.dismiss', kind, id: o.id })}
            >
              ✕
            </button>
          </span>
        </div>
      ) : (
        <span className="journey-why">{t('Nothing for now.')}</span>
      )}
    </li>
  );
}

export function Objectives({ j, onGo }: { j: Journey; onGo: (g: JourneyGo) => void }) {
  const { view } = useView();
  const o = objectivesFor(view);
  return (
    <section className="journey-objectives" aria-label={t('Objectives')}>
      <ul>
        {(['main', 'opportunity', 'personal'] as const).map((k) => (
          <ObjectiveRow
            key={k}
            kind={k}
            o={o[k]}
            pinned={!!o[k] && j.pinned[k] === o[k]!.id}
            onGo={onGo}
          />
        ))}
      </ul>
      <p className="small muted">
        {t('Suggestions, never chores: pin what matters, dismiss what doesn’t.')}
      </p>
    </section>
  );
}

function Bootstrap({ on }: { on: boolean }) {
  const { send, busy } = useView();
  return (
    <div className="journey-bootstrap">
      <p className="small muted">
        {on
          ? t('You chose to bootstrap: growing on your own revenue, no outside money.')
          : t(
              'Bootstrapping: no investors or loans; you keep all the company and grow on revenue. You can change your mind any time.',
            )}
      </p>
      <Button
        size="sm"
        variant={on ? 'ghost' : 'secondary'}
        disabled={busy}
        onClick={() => void send({ type: 'journey.bootstrap', on: !on })}
      >
        {on ? t('Undo bootstrap choice') : t('Choose to bootstrap')}
      </Button>
    </div>
  );
}

function Chapters({ j, onGo }: { j: Journey; onGo: (g: JourneyGo) => void }) {
  return (
    <ol className="journey-chapters">
      {j.chapters.map((c) => {
        const copy = chapterCopy(c.id);
        const open = c.status === 'current';
        return (
          <li key={c.id} className={`journey-ch journey-${c.status}`} data-chapter={c.n}>
            <details open={open}>
              <summary>
                <span className="journey-badge" aria-hidden>
                  {c.status === 'done' ? '✓' : c.n}
                </span>
                <span className="journey-ch-head">
                  <b>{t('Chapter {n}: {title}', { n: c.n, title: copy.title })}</b>
                  <span className="journey-why">
                    {c.status === 'done'
                      ? t('Complete')
                      : c.status === 'current'
                        ? t('You are here')
                        : copy.story}
                  </span>
                </span>
              </summary>
              <p className="journey-story">{copy.story}</p>
              {c.need < c.steps.length && (
                <p className="small muted">
                  {t('Any {n} of these finish the chapter.', {
                    n: c.need,
                  })}
                </p>
              )}
              <ul className="journey-steps">
                {c.steps.map((s) => {
                  const sc = stepCopy(s);
                  const pct = s.progress ? s.progress.have / Math.max(1, s.progress.need) : 0;
                  return (
                    <li
                      key={s.id}
                      className={`journey-step${s.done ? ' done' : ''}`}
                      data-step={s.id}
                      data-done={s.done}
                    >
                      <span className="journey-tick" aria-hidden>
                        {s.done ? '✓' : ''}
                      </span>
                      <span className="journey-step-body">
                        <span className="journey-step-label">
                          {sc.label}
                          {s.optional && c.need >= c.steps.length && (
                            <span className="journey-opt"> · {t('optional')}</span>
                          )}
                          <span className="sr-only">
                            {s.done ? ` (${t('done')})` : ` (${t('to do')})`}
                          </span>
                        </span>
                        {!s.done && sc.why && <span className="journey-why">{sc.why}</span>}
                        {s.progress && !s.done && (
                          <span className="journey-progress">
                            <span className="journey-bar" aria-hidden>
                              <span style={{ width: `${Math.round(pct * 100)}%` }} />
                            </span>
                            <span className="small">{progressText(s.progress)}</span>
                          </span>
                        )}
                        {s.id === 'fundraising.funding' && (!s.done || j.bootstrap !== null) && (
                          <Bootstrap on={j.bootstrap !== null} />
                        )}
                      </span>
                      {!s.done && s.go && (
                        <Button size="sm" variant="subtle" onClick={() => onGo(s.go!)}>
                          {t('Go')}
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </details>
          </li>
        );
      })}
    </ol>
  );
}

/** The whole journey: objectives, then the chapters. */
export function JourneyPanel({ onGo }: { onGo: (g: JourneyGo) => void }) {
  const { view } = useView();
  const j = journeyOf(view);
  if (!j)
    return (
      <p className="journey-none muted" data-testid="journey-none">
        {t(
          'The founder journey follows building a company. Start one any time and your chapters begin.',
        )}
      </p>
    );
  return (
    <div className="journey" data-testid="journey">
      <Objectives j={j} onGo={onGo} />
      <Chapters j={j} onGo={onGo} />
    </div>
  );
}

/**
 * When a chapter completes (once per chapter, per browser): a short toast,
 * never a banner that stays over the map. The Journey button and the
 * phone's Journey app hold the details.
 */
export function JourneyCelebration() {
  const { view, toast } = useView();
  const j = journeyOf(view);
  const doneKey = j
    ? j.chapters
        .filter((c) => c.status === 'done')
        .map((c) => c.n)
        .join(',')
    : '';
  const pending = useRef<number | null>(null);
  useEffect(() => {
    if (!j) return;
    // Kept in a ref: a re-run effect (dev strict mode) finds storage already updated.
    const fresh = freshChapters(j)[0] ?? pending.current;
    if (!fresh) return;
    pending.current = fresh;
    const ch = j.chapters[fresh - 1];
    if (!ch) return;
    // A beat after the view lands, so the toast follows the new state.
    const timer = setTimeout(() => {
      pending.current = null;
      const next = j.chapters.find((c) => c.status === 'current');
      const done = t('Chapter {n} complete: {title}', {
        n: ch.n,
        title: chapterCopy(ch.id).title,
      });
      toast(
        next
          ? `🚩 ${done} · ${t('Next: {title}', { title: chapterCopy(next.id).title })}`
          : `🚩 ${done}`,
        'ok',
      );
    }, 300);
    return () => clearTimeout(timer);
    // Only when the set of finished chapters changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doneKey]);
  return null;
}
