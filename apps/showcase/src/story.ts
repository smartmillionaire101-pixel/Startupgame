/**
 * Story clips: one real moment of play, recorded in the game's own screens,
 * watched the way you'd watch someone play: a fingertip moves to each button
 * and presses it, with music underneath. No text over the game.
 *
 * - Full screen: 9:16 at 1080 × 1920, the shape short-video apps fill.
 * - Seamless: filmed frame by frame. The page's clock only moves when the
 *   recorder says so; each frame moves it exactly 1/30 s (timers, animation
 *   frames, CSS animations, the 3D city), then the screen is captured. The
 *   machine can be as slow as it likes; the clip still plays at an even 30 fps.
 * - Music: an original loop (music/compose.py) under the whole clip, faded in
 *   and out.
 *
 * The fingertip and end card are drawn into the page while it records; they
 * are never part of the game.
 */
import { chromium, type Browser, type Locator, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The background music (made by music/compose.py). */
export const MUSIC = fileURLToPath(new URL('../music/upbeat.m4a', import.meta.url));

export const FPS = 30;
const FRAME_MS = 1000 / FPS;

/** A phone screen in 9:16, drawn at 3× for a 1080 × 1920 video. */
const SCREEN = { width: 360, height: 640 };
const SCALE = 3;

const OVERLAY_CSS = `
#sc-touch{position:fixed;z-index:2147483647;left:0;top:0;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;background:rgba(40,44,42,.38);border:2.5px solid rgba(255,255,255,.95);box-shadow:0 0 0 1px rgba(0,0,0,.25),0 4px 12px rgba(0,0,0,.3);pointer-events:none;opacity:0;transition:opacity .25s ease,transform .12s ease}
#sc-touch.on{opacity:1}#sc-touch.press{transform:scale(.78);background:rgba(40,44,42,.55)}
.sc-ripple{position:fixed;z-index:2147483646;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:2.5px solid rgba(40,44,42,.55);pointer-events:none;animation:sc-ripple .45s ease-out forwards}
@keyframes sc-ripple{from{transform:scale(.6);opacity:.9}to{transform:scale(2.2);opacity:0}}
#sc-end{position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:16px;text-align:center;background:linear-gradient(160deg,#0b5446,#07201a);color:#fff;opacity:0;animation:sc-fade .6s ease forwards}
#sc-end b{font:800 44px/1 "Inter",system-ui,sans-serif;letter-spacing:-.02em}
#sc-end img{width:96px;height:96px;border-radius:22px;box-shadow:0 10px 30px rgba(0,0,0,.35);transform:scale(.6);opacity:0;animation:sc-pop .55s cubic-bezier(.2,1.4,.4,1) .15s forwards}
@keyframes sc-pop{to{transform:none;opacity:1}}
#sc-end i{font-style:normal;padding:13px 26px;border-radius:999px;background:#ffcf3f;color:#14201b;font:800 19px/1 "Inter",system-ui,sans-serif}
#sc-end small{position:absolute;bottom:7%;font:500 12px/1 "Inter",system-ui,sans-serif;opacity:.65}
@keyframes sc-fade{to{opacity:1}}
`;

/**
 * Runs in the page before the game: one-time help marked seen, and the page's
 * clock put under the recorder's control.
 *
 * performance.now, Date, requestAnimationFrame, setTimeout and setInterval all
 * follow a virtual clock that only moves when `__scStep(ms)` is called: it runs
 * the timers that fall due, then one animation frame, and moves every CSS
 * animation and transition on by the same amount.
 */
function controlledClock() {
  for (const key of ['runway.gestureHint', 'runway.landingSeen'])
    try {
      localStorage.setItem(key, '1');
    } catch {
      /* storage blocked: the hints may show */
    }
  const realNow = performance.now.bind(performance);
  const origin = realNow();
  const dateOrigin = Date.now();
  let vt = origin;
  performance.now = () => vt;
  const RealDate = Date;
  const dateNow = () => dateOrigin + (vt - origin);
  class VirtualDate extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(dateNow());
      else super(...(args as [number]));
    }
    static override now() {
      return dateNow();
    }
  }
  (window as unknown as { Date: DateConstructor }).Date = VirtualDate as unknown as DateConstructor;

  type Timer = { id: number; at: number; fn: () => void; every?: number };
  let nextId = 1;
  const timers = new Map<number, Timer>();
  const call = (fn: TimerHandler, args: unknown[]) => () =>
    typeof fn === 'function' ? (fn as (...a: unknown[]) => void)(...args) : undefined;
  window.setTimeout = ((fn: TimerHandler, ms = 0, ...args: unknown[]) => {
    const id = nextId++;
    timers.set(id, { id, at: vt + Math.max(0, Number(ms) || 0), fn: call(fn, args) });
    return id;
  }) as typeof setTimeout;
  window.setInterval = ((fn: TimerHandler, ms = 0, ...args: unknown[]) => {
    const id = nextId++;
    const every = Math.max(1, Number(ms) || 0);
    timers.set(id, { id, at: vt + every, fn: call(fn, args), every });
    return id;
  }) as typeof setInterval;
  window.clearTimeout = window.clearInterval = ((id?: number) => {
    if (id !== undefined) timers.delete(id);
  }) as typeof clearTimeout;

  let frames = new Map<number, FrameRequestCallback>();
  window.requestAnimationFrame = (cb) => {
    const id = nextId++;
    frames.set(id, cb);
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    frames.delete(id);
  };

  (window as unknown as { __scStep: (ms: number) => void }).__scStep = (ms: number) => {
    const end = vt + ms;
    // Timers that fall due within this step, in time order (a timer may add more).
    for (let guard = 0; guard < 10_000; guard++) {
      let due: Timer | undefined;
      for (const t of timers.values()) if (t.at <= end && (!due || t.at < due.at)) due = t;
      if (!due) break;
      vt = Math.max(vt, due.at);
      if (due.every) due.at += due.every;
      else timers.delete(due.id);
      try {
        due.fn();
      } catch (err) {
        console.error(err);
      }
    }
    vt = end;
    // CSS animations and transitions: held still, moved on by exactly this step.
    for (const a of document.getAnimations()) {
      try {
        if (a.playState === 'running') a.pause();
        if (a.playState === 'paused') a.currentTime = Number(a.currentTime ?? 0) + ms;
      } catch {
        /* finished or detached */
      }
    }
    // One animation frame (the 3D city draws here).
    const run = frames;
    frames = new Map();
    for (const cb of run.values())
      try {
        cb(vt);
      } catch (err) {
        console.error(err);
      }
  };
}

/** Browser flags: the 3D city draws in software (no GPU); these make it faster. */
const RECORDING_ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-gpu-rasterization',
  '--ignore-gpu-blocklist',
];

export class Story {
  private frame = 0;
  /** Where the fingertip is (null until the first tap). */
  private finger: { x: number; y: number } | null = null;
  private framesDir: string;

  private constructor(
    readonly page: Page,
    private browser: Browser,
    private outDir: string,
    private name: string,
  ) {
    this.framesDir = join(outDir, `.frames-${name}`);
    rmSync(this.framesDir, { recursive: true, force: true });
    mkdirSync(this.framesDir, { recursive: true });
  }

  /** Open the game as a character (its session token), ready to record. */
  static async open(opts: { base: string; token: string; outDir: string; name: string }) {
    mkdirSync(opts.outDir, { recursive: true });
    const browser = await chromium.launch({ args: RECORDING_ARGS });
    const context = await browser.newContext({
      baseURL: opts.base,
      viewport: SCREEN,
      deviceScaleFactor: SCALE,
    });
    // As source text: a bundler's helpers (e.g. __name) don't exist in the page.
    await context.addInitScript({
      content: `var __name = (f) => f; (${controlledClock.toString()})();`,
    });
    await context.addCookies([
      { name: 'rw_session', value: opts.token, domain: new URL(opts.base).hostname, path: '/' },
    ]);
    const page = await context.newPage();
    return new Story(page, browser, opts.outDir, opts.name);
  }

  /** Load the game (not filmed) and let the city draw; the clip starts after. */
  async begin() {
    await this.page.goto('/');
    // The page's timers only run when its clock moves: step it while it loads.
    const nav = this.page.getByRole('navigation', { name: 'Main' });
    for (let i = 0; !(await nav.isVisible().catch(() => false)); i++) {
      if (i > FPS * 120) throw new Error('The game did not load.');
      await this.step();
      if (i % 10 === 0) await this.page.waitForTimeout(50); // let the network answer
    }
    await this.page.addStyleTag({ content: OVERLAY_CSS });
    for (let i = 0; i < FPS * 3; i++) await this.step();
  }

  /** Seconds into the clip. */
  now() {
    return this.frame / FPS;
  }

  /** Move the page on one frame (without filming it). */
  private async step() {
    await this.page.evaluate(
      (ms) => (window as unknown as { __scStep: (m: number) => void }).__scStep(ms),
      FRAME_MS,
    );
  }

  /** Move on one frame and film it. */
  async shoot() {
    await this.step();
    await this.page.screenshot({
      path: join(this.framesDir, `${String(this.frame++).padStart(5, '0')}.jpg`),
      type: 'jpeg',
      quality: 90,
    });
  }

  /** Film this long. */
  async hold(ms: number) {
    for (let i = Math.round(ms / FRAME_MS); i > 0; i--) await this.shoot();
  }

  /** Film until the control shows (as a player would wait), up to `maxMs` of clip time. */
  async until(locator: Locator, maxMs = 15_000) {
    const target = locator.filter({ visible: true }).first();
    for (let t = 0; t < maxMs; t += FRAME_MS) {
      if (await target.isVisible().catch(() => false)) return;
      await this.shoot();
    }
    throw new Error(`Waited ${maxMs / 1000}s of clip time for ${locator}.`);
  }

  /**
   * Tap like a player: a pause to take in the screen, the fingertip glides to
   * the control (resting at its right end, so its label stays readable),
   * presses, and lifts off. The next tap starts from where this one was.
   */
  async tap(locator: Locator, opts: { lookMs?: number; moveMs?: number } = {}) {
    const { lookMs = 500, moveMs = 450 } = opts;
    // The one a player can see (screens keep hidden copies of some buttons).
    const target = locator.filter({ visible: true }).first();
    await target.scrollIntoViewIfNeeded();
    await this.hold(lookMs);
    const box = await target.boundingBox();
    if (box) {
      // Towards the right end of the button (where its arrow usually is), so
      // the fingertip never sits on the words.
      const to = {
        x: box.x + box.width - Math.min(28, box.width * 0.25),
        y: box.y + box.height / 2,
      };
      const from = this.finger ?? { x: to.x + 40, y: Math.min(to.y + 160, 600) };
      await this.page.evaluate(({ x, y }) => {
        let dot = document.getElementById('sc-touch');
        if (!dot) {
          dot = document.createElement('i');
          dot.id = 'sc-touch';
          document.body.append(dot);
        }
        dot.style.left = `${x}px`;
        dot.style.top = `${y}px`;
        dot.classList.add('on');
      }, from);
      const n = Math.max(1, Math.round(moveMs / FRAME_MS));
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
        await this.page.evaluate(
          ({ x, y }) => {
            const dot = document.getElementById('sc-touch');
            if (dot) {
              dot.style.left = `${x}px`;
              dot.style.top = `${y}px`;
            }
          },
          { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e },
        );
        await this.shoot();
      }
      this.finger = to;
      await this.page.evaluate(({ x, y }) => {
        document.getElementById('sc-touch')?.classList.add('press');
        const ripple = document.createElement('i');
        ripple.className = 'sc-ripple';
        ripple.style.left = `${x}px`;
        ripple.style.top = `${y}px`;
        document.body.append(ripple);
        setTimeout(() => ripple.remove(), 500);
      }, to);
      await this.hold(130);
    }
    // Time stands still between frames, so nothing is moving now; force
    // covers controls the 3D map keeps re-placing.
    await target.click({ force: true });
    // Release, and lift the finger off the glass a moment later.
    await this.page.evaluate(() => {
      const dot = document.getElementById('sc-touch');
      dot?.classList.remove('press');
      setTimeout(() => dot?.classList.remove('on'), 350);
    });
  }

  /** Take the fingertip off the screen (it fades out). */
  async lift() {
    await this.page.evaluate(() => document.getElementById('sc-touch')?.classList.remove('on'));
    this.finger = null;
  }

  /** Bring an element to the middle of the screen, scrolling smoothly over `ms`. */
  async reveal(target: Locator, ms = 900, settleMs = 400) {
    // How far its scrolling parent has to move to centre it.
    const plan = await target
      .first()
      .evaluate((el) => {
        let box: HTMLElement | null = el.parentElement;
        while (
          box &&
          !(
            box.scrollHeight > box.clientHeight + 4 &&
            /auto|scroll/.test(getComputedStyle(box).overflowY)
          )
        )
          box = box.parentElement;
        const scroller = box ?? document.scrollingElement ?? document.documentElement;
        const r = el.getBoundingClientRect();
        const s = scroller.getBoundingClientRect();
        const from = scroller.scrollTop;
        const to = Math.max(0, from + (r.top - s.top) - (scroller.clientHeight - r.height) / 2);
        scroller.setAttribute('data-sc-scroller', '');
        return { from, to };
      })
      .catch(() => null);
    if (plan) {
      const n = Math.max(1, Math.round(ms / FRAME_MS));
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
        await this.page.evaluate(
          (y) => {
            const el = document.querySelector('[data-sc-scroller]') as HTMLElement | null;
            if (el) el.scrollTop = y;
          },
          plan.from + (plan.to - plan.from) * eased,
        );
        await this.shoot();
      }
      await this.page.evaluate(() =>
        document.querySelector('[data-sc-scroller]')?.removeAttribute('data-sc-scroller'),
      );
    }
    await this.hold(settleMs);
  }

  /** The closing card: the game's logo and name, and the invitation to play. */
  async endCard(cta = 'Play free', small = 'AI character · Runway game') {
    await this.page.evaluate(
      ({ cta, small }) => {
        const end = document.createElement('div');
        end.id = 'sc-end';
        // The game's own logo (the same file the app uses), above its name.
        const logo = document.createElement('img');
        logo.src = '/icon.svg';
        logo.alt = '';
        const b = document.createElement('b');
        b.textContent = 'Runway';
        const i = document.createElement('i');
        i.textContent = cta;
        const s = document.createElement('small');
        s.textContent = small;
        end.append(logo, b, i, s);
        document.body.append(end);
      },
      { cta, small },
    );
  }

  /** Make the clip: the frames at 30 fps, with the music faded in and out under them. */
  async finish(music = MUSIC): Promise<string> {
    await this.browser.close();
    const clip = `${this.name}-clip.mp4`;
    const seconds = this.now();
    const fadeOut = Math.max(0, seconds - 2.5).toFixed(2);
    execFileSync('ffmpeg', [
      '-y',
      '-loglevel',
      'error',
      '-framerate',
      String(FPS),
      '-i',
      join(this.framesDir, '%05d.jpg'),
      '-stream_loop',
      '-1',
      '-i',
      music,
      '-filter_complex',
      `[1:a]afade=t=in:d=1,afade=t=out:st=${fadeOut}:d=2.5,volume=0.8[a]`,
      '-map',
      '0:v',
      '-map',
      '[a]',
      '-t',
      seconds.toFixed(3),
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      '19',
      '-pix_fmt',
      'yuv420p',
      '-r',
      String(FPS),
      '-c:a',
      'aac',
      '-b:a',
      '160k',
      '-movflags',
      '+faststart',
      join(this.outDir, clip),
    ]);
    rmSync(this.framesDir, { recursive: true, force: true });
    return clip;
  }
}
