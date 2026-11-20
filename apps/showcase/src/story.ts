/**
 * Story clips: one real moment of play, recorded as it happens in the game's
 * own screens, with the story told in captions and every choice shown as a
 * tap. The captions, tap rings and end card are drawn into the page itself
 * (so they're as sharp as the game) and are never part of the game.
 */
import type { Locator, Page } from '@playwright/test';

/** Where a caption sits: over the city or a sheet's top, the middle, or the bottom. */
export type CaptionAt = 'top' | 'middle' | 'bottom';

const OVERLAY_CSS = `
#sc-cap{position:fixed;left:7%;right:7%;z-index:2147483646;display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;pointer-events:none;transition:opacity .25s ease}
#sc-cap.top{top:15%}#sc-cap.middle{top:40%}#sc-cap.bottom{bottom:14%}
#sc-cap span{font:800 22px/1.15 "Bricolage Grotesque","Inter",system-ui,sans-serif;color:#fff;background:rgba(10,18,15,.86);padding:6px 12px;border-radius:9px;opacity:0;transform:translateY(8px);animation:sc-in .35s ease forwards}
#sc-cap span:first-child{font-size:25px}
#sc-cap span:nth-child(2){animation-delay:.45s}#sc-cap span:nth-child(3){animation-delay:.9s}
@keyframes sc-in{to{opacity:1;transform:none}}
.sc-tap{position:fixed;z-index:2147483647;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;border:4px solid #ffcf3f;box-shadow:0 0 0 8px rgba(255,207,63,.35);pointer-events:none;animation:sc-tap .7s ease-out forwards}
@keyframes sc-tap{0%{transform:scale(1.6);opacity:0}40%{transform:scale(1);opacity:1}100%{transform:scale(.85);opacity:.9}}
#sc-end{position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:14px;padding:0 10%;text-align:center;background:linear-gradient(160deg,rgba(9,61,51,.93),rgba(8,22,18,.96));color:#fff;opacity:0;animation:sc-fade .5s ease forwards}
#sc-end b{font:800 34px/1.1 "Bricolage Grotesque","Inter",system-ui,sans-serif}
#sc-end p{margin:0;font:500 19px/1.35 "Inter",system-ui,sans-serif;opacity:.92}
#sc-end i{font-style:normal;margin-top:18px;padding:12px 22px;border-radius:999px;background:#ffcf3f;color:#14201b;font:800 19px/1 "Inter",system-ui,sans-serif}
#sc-end small{font:500 13px/1 "Inter",system-ui,sans-serif;opacity:.7;margin-top:6px}
@keyframes sc-fade{to{opacity:1}}
`;

/**
 * One-time help a returning player has already seen (the map's gesture card,
 * the landing page): marked seen before the page
 * loads, so none of it covers the clip. Pass to `context.addInitScript`.
 */
export function quietStart() {
  for (const key of ['runway.gestureHint', 'runway.landingSeen'])
    try {
      localStorage.setItem(key, '1');
    } catch {
      /* storage blocked: the hints may show */
    }
}

/**
 * Browser flags for recording: the 3D city draws in software on a machine
 * with no GPU, and these make it about five times smoother (15 fps instead of
 * 3), so the clip moves and taps answer at once.
 */
export const RECORDING_ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-gpu-rasterization',
  '--ignore-gpu-blocklist',
];

export class Story {
  constructor(readonly page: Page) {}

  /** Add the overlay styles (call after each full page load). */
  async prepare() {
    await this.page.addStyleTag({ content: OVERLAY_CSS });
  }

  /** Show caption lines (they appear one after another), replacing any before. */
  async caption(lines: string[], at: CaptionAt = 'top') {
    await this.page.evaluate(
      ({ lines, at }) => {
        document.getElementById('sc-cap')?.remove();
        const box = document.createElement('div');
        box.id = 'sc-cap';
        box.className = at;
        for (const line of lines) {
          const s = document.createElement('span');
          s.textContent = line;
          box.append(s);
        }
        document.body.append(box);
      },
      { lines, at },
    );
  }

  async clearCaption() {
    await this.page.evaluate(() => document.getElementById('sc-cap')?.remove());
  }

  /** Tap like a player: a ring lands on the control, a beat, then the click. */
  async tap(locator: Locator, beforeMs = 650) {
    // The one a player can see (screens keep hidden copies of some buttons).
    const target = locator.filter({ visible: true }).first();
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    if (box)
      await this.page.evaluate(
        ({ x, y }) => {
          const ring = document.createElement('i');
          ring.className = 'sc-tap';
          ring.style.left = `${x}px`;
          ring.style.top = `${y}px`;
          document.body.append(ring);
          setTimeout(() => ring.remove(), 1400);
        },
        { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      );
    await this.page.waitForTimeout(beforeMs);
    // Some controls ride on the moving 3D map and never hold still: if it
    // can't be tapped normally (checked without tapping), tap it anyway.
    const steady = await target
      .click({ trial: true, timeout: 1_000 })
      .then(() => true)
      .catch(() => false);
    await target.click(steady ? {} : { force: true });
  }

  /** The closing card: the open question and the invitation to play. */
  async endCard(
    title: string,
    lines: string[],
    cta = 'Play Runway',
    small = 'AI character · Runway game',
  ) {
    await this.clearCaption();
    await this.page.evaluate(
      ({ title, lines, cta, small }) => {
        const end = document.createElement('div');
        end.id = 'sc-end';
        const b = document.createElement('b');
        b.textContent = title;
        end.append(b);
        for (const l of lines) {
          const p = document.createElement('p');
          p.textContent = l;
          end.append(p);
        }
        const i = document.createElement('i');
        i.textContent = cta;
        const s = document.createElement('small');
        s.textContent = small;
        end.append(i, s);
        document.body.append(end);
      },
      { title, lines, cta, small },
    );
  }

  hold(ms: number) {
    return this.page.waitForTimeout(ms);
  }

  /** Bring an element to the middle of the screen with a smooth scroll. */
  async reveal(target: Locator, settleMs = 900) {
    await target
      .first()
      .evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }))
      .catch(() => undefined);
    await this.page.waitForTimeout(settleMs);
  }

  /** Scroll the open sheet (or page) smoothly by `px`. */
  async glide(px: number, steps = 14) {
    const vp = this.page.viewportSize();
    await this.page.mouse.move((vp?.width ?? 390) / 2, (vp?.height ?? 844) * 0.6);
    for (let i = 0; i < steps; i++) {
      await this.page.mouse.wheel(0, px / steps);
      await this.page.waitForTimeout(70);
    }
  }
}
