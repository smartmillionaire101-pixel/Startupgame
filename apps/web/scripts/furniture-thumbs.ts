/**
 * Renders the catalogue's pictures into public/thumbs/ (committed): every
 * furniture item (21 slots × 3 tiers) from the game's own 3D models
 * (src/shop/thumbs3d.ts → src/interiors3d/furniture.ts buildModel), and a
 * swatch of every floor finish from the 3D floor textures (kit.ts
 * floorTexture). Buy mode, the furniture shops and the Shop app show these;
 * a finish or paint you pick is still drawn live.
 *
 * Run after changing a model or adding an item:
 *   npm run thumbs -w @runway/web
 * (headless Chromium with software WebGL; test/thumbs.test.ts checks every
 * item has its picture.)
 */
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FLOOR_FINISHES, FURNITURE } from '@runway/engine';

const here = dirname(fileURLToPath(import.meta.url));
const web = resolve(here, '..');
const out = join(web, 'public', 'thumbs');
const SWATCH = 96;

const entry = `
import { renderThumb } from './src/shop/thumbs3d';
import { floorTexture } from './src/interiors3d/kit';
window.shot = (slot, tier) =>
  renderThumb({ kind: 'furniture', id: slot, tier }, 'image/webp', 0.86);
window.floor = (kind, size) => {
  const img = floorTexture(kind).image;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  c.getContext('2d').drawImage(img, 0, 0, size, size);
  return c.toDataURL('image/webp', 0.8);
};
window.ready = true;
`;

async function main() {
  const bundle = await build({
    stdin: { contents: entry, resolveDir: web, loader: 'ts' },
    bundle: true,
    write: false,
    format: 'iife',
    target: 'es2022',
    logLevel: 'warning',
  });
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.error(e.message));
    await page.setContent('<!doctype html><body style="margin:0"></body>');
    await page.addScriptTag({ content: bundle.outputFiles[0]!.text });
    await page.waitForFunction(() => (window as unknown as { ready?: boolean }).ready);
    const save = (path: string, url: string | null) => {
      if (!url?.startsWith('data:image/webp')) throw new Error(`No WebP picture for ${path}`);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, Buffer.from(url.split(',')[1]!, 'base64'));
      return statSync(path).size;
    };
    let bytes = 0;
    for (const f of FURNITURE) {
      const url = await page.evaluate(
        ([slot, tier]) =>
          (window as unknown as { shot: (s: string, t: number) => string | null }).shot(
            slot as string,
            tier as number,
          ),
        [f.slot, f.tier] as const,
      );
      bytes += save(join(out, 'furniture', `${f.id}.webp`), url);
    }
    for (const fl of FLOOR_FINISHES) {
      const url = await page.evaluate(
        ([kind, size]) =>
          (window as unknown as { floor: (k: string, n: number) => string }).floor(
            kind as string,
            size as number,
          ),
        [fl.id, SWATCH] as const,
      );
      bytes += save(join(out, 'floor', `${fl.id}.webp`), url);
    }
    console.log(
      `${FURNITURE.length} furniture pictures and ${FLOOR_FINISHES.length} floors: ${Math.round(bytes / 1024)} KB`,
    );
  } finally {
    await browser.close();
  }
}

void main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
