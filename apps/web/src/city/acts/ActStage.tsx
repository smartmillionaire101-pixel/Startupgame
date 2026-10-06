/**
 * Wave 8 §B: plays one act script inside a room's SVG. You walk in from the
 * door to the station, take the pose, the script's props and people play
 * their loop, then the scene holds on its last frame (the new haircut, the
 * empty plate) under the result card.
 *
 * React renders the stage once; named nodes (`data-n`) are collected when it
 * mounts and one requestAnimationFrame loop writes their attributes. The
 * loop pauses while the tab is hidden. Reduced motion: three stills
 * (arrived, the moment, done), cross-faded.
 */
import { useEffect, useMemo, useRef } from 'react';
import { t } from '../../i18n';
import { AvatarFigure } from '../art';
import { ENTRANCE } from '../rooms';
import './acts.css';
import { LyingFigure, SeatedFigure, roomScale } from './figure';
import { clamp01, lerp, type ActCtx, type ActScript, type YouFrame } from './types';

const SETTLE = 280;
const OUTRO = 500;

/** How long a script runs: the walk in, the loop and a beat at the end. */
export function timeline(s: ActScript) {
  const d = Math.hypot(s.station.x - ENTRANCE.x, s.station.y - ENTRANCE.y);
  const walk = Math.round(Math.max(700, Math.min(1700, (d / 120) * 1000)));
  return { walk, loopAt: walk + SETTLE, total: walk + SETTLE + s.loopMs + OUTRO };
}

/** Show or hide a node (only touching the DOM when it changes). */
const display = (el: SVGElement | undefined, on: boolean) => {
  const want = on ? '' : 'none';
  if (el && el.style.display !== want) el.style.display = want;
};
const walkingCls = (el: SVGElement | undefined, on: boolean) => {
  if (el && el.classList.contains('is-walking') !== on) el.classList.toggle('is-walking', on);
};

/** One frame at time `time` (ms since you walked in). Returns the caption step. */
function drawFrame(
  script: ActScript,
  n: (name: string) => SVGElement | undefined,
  time: number,
): number {
  const tl = timeline(script);
  const st = script.station;
  const sEnd = script.scale ?? roomScale(st.y);
  const ms = time - tl.loopAt;
  const k = clamp01(ms / script.loopMs);
  let x: number;
  let y: number;
  let s: number;
  let f: YouFrame;
  const arrived = time >= tl.walk;
  if (!arrived) {
    const u = time / tl.walk;
    x = lerp(ENTRANCE.x, st.x, u);
    y = lerp(ENTRANCE.y, st.y, u);
    s = lerp(roomScale(ENTRANCE.y), sEnd, u);
    f = { walking: true, flip: st.x < ENTRANCE.x };
    script.tick?.(n, ms, 0);
  } else {
    x = st.x;
    y = st.y;
    s = sEnd;
    f = { flip: st.flip, ...(script.tick?.(n, ms, k) ?? {}) };
  }
  // Stand while walking; then the pose (sitting, lying, a mic in hand).
  const stand = n('you-stand');
  const posed = n('you-posed');
  const fresh = n('you-new');
  const usePosed = arrived && !!posed;
  const swapped = script.swapAt !== undefined && arrived && k >= script.swapAt;
  display(stand, !usePosed);
  walkingCls(stand, !!f.walking);
  display(posed, usePosed && !swapped);
  walkingCls(posed, !!f.walking);
  display(fresh, usePosed && swapped);
  const sx = (f.flip ? -s : s).toFixed(3);
  n('you')?.setAttribute(
    'transform',
    `translate(${(x + (f.dx ?? 0)).toFixed(1)} ${(y + (f.dy ?? 0)).toFixed(1)})${f.rot ? ` rotate(${f.rot.toFixed(1)})` : ''} scale(${sx} ${(s * (f.sy ?? 1)).toFixed(3)})`,
  );
  let step = -1;
  if (arrived) script.steps.forEach(([at], i) => k >= at && (step = i));
  return step;
}

export interface ActStageProps {
  script: ActScript;
  ctx: ActCtx;
  /** Jump to the last frame and stop (Skip, or the scene has played). */
  ended: boolean;
  onEnd: () => void;
  reduced: boolean;
}

export function ActStage({ script, ctx, ended, onEnd, reduced }: ActStageProps) {
  const root = useRef<SVGGElement>(null);
  const onEndRef = useRef(onEnd);
  useEffect(() => {
    onEndRef.current = onEnd;
  }, [onEnd]);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const map = new Map<string, SVGElement>();
    el.querySelectorAll<SVGElement>('[data-n]').forEach((x) => map.set(x.dataset.n!, x));
    const n = (name: string) => map.get(name);
    // The caption line lives in the HUD over the room.
    const caption = el.closest('.place-room')?.querySelector<HTMLElement>('[data-act-step]');
    let lastStep = -2;
    const frame = (time: number) => {
      const step = drawFrame(script, n, time);
      if (step !== lastStep && caption) {
        lastStep = step;
        caption.textContent = step >= 0 ? t(script.steps[step]![1]) : t('On your way…');
      }
    };
    const tl = timeline(script);
    if (ended) {
      frame(tl.total);
      return;
    }
    if (reduced) {
      const stills = [tl.loopAt + script.loopMs * 0.12, tl.loopAt + script.loopMs * 0.62, tl.total];
      let i = 0;
      let id = 0;
      const next = () => {
        if (i >= stills.length) return onEndRef.current();
        frame(stills[i]!);
        el.animate?.([{ opacity: 0.2 }, { opacity: 1 }], { duration: 380, easing: 'ease-out' });
        i++;
        id = window.setTimeout(next, 1300);
      };
      next();
      return () => window.clearTimeout(id);
    }
    let raf = 0;
    let t0 = -1;
    let hiddenAt = 0;
    let done = false;
    const step = (now: number) => {
      if (t0 < 0) t0 = now;
      const time = now - t0;
      frame(Math.min(time, tl.total));
      if (time >= tl.total) {
        if (!done) {
          done = true;
          onEndRef.current();
        }
        return;
      }
      raf = requestAnimationFrame(step);
    };
    const onVis = () => {
      if (document.hidden) {
        hiddenAt = performance.now();
        cancelAnimationFrame(raf);
      } else if (!done) {
        if (hiddenAt && t0 >= 0) t0 += performance.now() - hiddenAt;
        hiddenAt = 0;
        raf = requestAnimationFrame(step);
      }
    };
    frame(0);
    raf = requestAnimationFrame(step);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [ended, reduced, script]);

  const st = script.station;
  const hairChange = script.swapAt !== undefined;
  const posedNeeded = script.pose !== 'stand' || !!script.poseClass || !!script.hold || hairChange;
  const posedFig = (look: ActCtx['look']) =>
    script.pose === 'sit' ? (
      <SeatedFigure look={look} />
    ) : script.pose === 'lie' ? (
      <LyingFigure look={look} />
    ) : (
      <AvatarFigure look={look} />
    );
  const dim = script.dim ?? 0.35;
  // Drawn once per act (the props don't change while it plays).
  const back = useMemo(() => script.back?.(ctx), [script, ctx]);
  const front = useMemo(() => script.front?.(ctx), [script, ctx]);
  const hold = useMemo(() => script.hold?.(ctx), [script, ctx]);
  return (
    <g
      className="act-stage"
      ref={root}
      data-act-script={script.id}
      data-act-variant={ctx.variant}
      pointerEvents="none"
    >
      <defs>
        <radialGradient id="act-vignette" cx={(st.x + 200) / 760} cy={0.6} r="0.75">
          <stop offset="0" stopColor="#0b1020" stopOpacity={dim * 0.15} />
          <stop offset="0.6" stopColor="#0b1020" stopOpacity={dim * 0.75} />
          <stop offset="1" stopColor="#0b1020" stopOpacity={dim} />
        </radialGradient>
      </defs>
      <rect x="-200" y="-80" width="760" height="330" fill="url(#act-vignette)" />
      {back}
      <g data-n="you" className="act-you" data-act-you="">
        <g data-n="you-stand" className="city-avatar">
          <AvatarFigure look={ctx.look} />
        </g>
        {posedNeeded && (
          <g
            data-n="you-posed"
            className={`act-posed city-avatar ${script.poseClass ?? ''}`}
            style={{ display: 'none' }}
            data-look={ctx.look.hairStyle}
          >
            {posedFig(ctx.look)}
            {hold}
          </g>
        )}
        {hairChange && (
          <g
            data-n="you-new"
            className={`act-posed city-avatar ${script.poseClass ?? ''}`}
            style={{ display: 'none' }}
            data-look={ctx.newLook.hairStyle}
            data-new-look=""
          >
            {posedFig(ctx.newLook)}
          </g>
        )}
      </g>
      {front}
    </g>
  );
}
