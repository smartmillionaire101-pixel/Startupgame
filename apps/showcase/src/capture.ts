/**
 * Media for the posts. The clip comes first: a short, steady tour of the
 * scenes the character picked (the city, its work, the day), recorded on a
 * phone-sized screen and made into an MP4 the platforms accept, plus a small
 * GIF preview for the approval issue. A still of each scene is taken on the
 * way as a backup picture.
 *
 * The browser signs in with the character's session cookie and taps the
 * bottom bar like a player would.
 */
import { chromium, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Shot } from './brain.js';
import type { Persona } from './personas.js';

export interface Captured {
  /** The clip for posting (MP4, H.264), when ffmpeg could make one. */
  clip?: string;
  /** A small looping preview of the clip (GIF), for the issue. */
  preview?: string;
  /** A still of each scene. */
  shots: Partial<Record<Shot, string>>;
}

const PHONE = { width: 390, height: 844 };
/** Recorded at twice the screen size, so text stays sharp. */
const VIDEO = { width: PHONE.width * 2, height: PHONE.height * 2 };

/** The bottom-bar tab for each scene ("work" is the role's own tab). */
const TAB: Record<Shot, (p: Persona) => string> = {
  city: () => 'City',
  today: () => 'Today',
  work: (p) => p.workTab,
  me: () => 'Me',
};

/** How long each scene holds in the clip, in ms. */
const HOLD: Record<Shot, number> = { city: 6_000, today: 3_500, work: 3_500, me: 3_500 };

async function open(page: Page, name: string) {
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('button', { name: new RegExp(`^${name}(\\s+\\d+)?$`) })
    .click({ timeout: 15_000 });
  await dismissTips(page);
}

/** First-time hints ("Drag to look around… Got it") would sit over the clip: close them. */
async function dismissTips(page: Page) {
  await page.waitForTimeout(600);
  for (const tip of await page.getByRole('button', { name: /^Got it$/ }).all())
    if (await tip.isVisible()) await tip.click({ timeout: 2_000 }).catch(() => undefined);
}

/** Scroll a list screen slowly down and back, so the clip shows more than the top. */
async function glide(page: Page) {
  await page.mouse.move(PHONE.width / 2, PHONE.height / 2);
  for (let i = 0; i < 12; i++) {
    await page.mouse.wheel(0, 60);
    await page.waitForTimeout(90);
  }
  await page.waitForTimeout(900);
  for (let i = 0; i < 12; i++) {
    await page.mouse.wheel(0, -60);
    await page.waitForTimeout(60);
  }
}

/**
 * Turn the recording into the clip and its preview: cut the loading at the
 * start (`fromS` seconds), H.264 MP4 for posting, an 8 fps GIF for the issue.
 * Without ffmpeg there's no clip, only the stills.
 */
function encode(
  webm: string,
  outDir: string,
  role: string,
  fromS: number,
): Pick<Captured, 'clip' | 'preview'> {
  const clip = `${role}-clip.mp4`;
  const preview = `${role}-preview.gif`;
  const ss = fromS.toFixed(2);
  try {
    execFileSync('ffmpeg', [
      '-y',
      '-loglevel',
      'error',
      '-ss',
      ss,
      '-i',
      webm,
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      '20',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      '-an',
      join(outDir, clip),
    ]);
    execFileSync('ffmpeg', [
      '-y',
      '-loglevel',
      'error',
      '-ss',
      ss,
      '-i',
      webm,
      '-vf',
      'fps=8,scale=240:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64[p];[b][p]paletteuse=dither=bayer',
      join(outDir, preview),
    ]);
    return { clip, preview };
  } catch (err) {
    console.error(`No clip for ${role}: ${(err as Error).message}`);
    return {};
  }
}

export async function capture(
  base: string,
  token: string,
  persona: Persona,
  scenes: Shot[],
  outDir: string,
): Promise<Captured> {
  mkdirSync(outDir, { recursive: true });
  const videoDir = join(outDir, `.video-${persona.role}`);
  const browser = await chromium.launch();
  const context = await browser.newContext({
    baseURL: base,
    viewport: PHONE,
    deviceScaleFactor: 2,
    recordVideo: { dir: videoDir, size: VIDEO },
  });
  await context.addCookies([
    { name: 'rw_session', value: token, domain: new URL(base).hostname, path: '/' },
  ]);
  const started = Date.now();
  const page = await context.newPage();
  const out: Captured = { shots: {} };
  let readyS = 0;
  try {
    await page.goto('/');
    await page.getByRole('navigation', { name: 'Main' }).waitFor({ timeout: 30_000 });
    // The game opens in the city; let it draw before the clip starts.
    await page.waitForTimeout(4_000);
    await dismissTips(page);
    readyS = (Date.now() - started) / 1_000;
    // Every clip opens in the city (where the game opens) and ends there.
    const order: Shot[] = ['city', ...scenes.filter((s) => s !== 'city')];
    for (const [i, scene] of order.entries()) {
      if (i > 0) await open(page, TAB[scene](persona));
      await page.waitForTimeout(scene === 'city' ? 1_000 : 1_200);
      const file = `${persona.role}-${scene}.jpg`;
      await page.screenshot({ path: join(outDir, file), type: 'jpeg', quality: 85 });
      out.shots[scene] = file;
      if (scene !== 'city') await glide(page);
      await page.waitForTimeout(HOLD[scene] - (scene === 'city' ? 1_000 : 1_200));
    }
    if (order.length > 1) {
      await open(page, 'City');
      await page.waitForTimeout(2_500);
    }
  } finally {
    await context.close();
    await browser.close();
  }
  const webm = readdirSync(videoDir).find((f) => f.endsWith('.webm'));
  if (webm) Object.assign(out, encode(join(videoDir, webm), outDir, persona.role, readyS));
  rmSync(videoDir, { recursive: true, force: true });
  return out;
}
