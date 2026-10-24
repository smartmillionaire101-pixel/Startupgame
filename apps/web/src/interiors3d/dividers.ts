/**
 * Walls and dividers you put up at home (shop note; the engine's
 * data/catalog.ts WALLS): a full wall, a half wall, a glass divider, a
 * sliding door or screen and a bookshelf divider, in the finish you bought.
 * Drawn like the house's own inner walls (./house.ts: the same cut-away
 * height, so you still see into every room from above), each its own look.
 *
 * A model runs along +x from its start, `len` metres, centred on z = 0.
 * Also `refinish`: a bought finish on a furniture model (its wood or its
 * upholstery takes the colour).
 */
import * as THREE from 'three';
import { Kit, mat } from './kit';

/** The house's inner walls (./house.ts INNER_H, THICK). */
const INNER_H = 1.25;
const THICK = 0.16;

export type DividerKind = 'full' | 'half' | 'glass' | 'sliding' | 'bookshelf';

const BOOKS = ['#b91c1c', '#1d4ed8', '#15803d', '#ca8a04', '#7c3aed', '#0f766e', '#f8fafc'];

/** A divider model: `len` metres along +x from x = 0. */
export function buildDivider(kind: DividerKind, len: number, swatch: string): THREE.Group {
  const k = new Kit();
  const mid = len / 2;
  const cap = '#f4f1ea';
  switch (kind) {
    case 'full':
      k.box(len + THICK, INNER_H, THICK, swatch, mid, 0, 0, { rough: 0.85 });
      k.box(len + THICK + 0.03, 0.05, THICK + 0.03, cap, mid, INNER_H, 0);
      k.box(len + THICK + 0.01, 0.08, THICK + 0.02, '#e7e1d6', mid, 0, 0, { noShadow: true });
      break;
    case 'half':
      k.box(len + THICK, 0.78, THICK, swatch, mid, 0, 0, { rough: 0.85 });
      k.box(len + THICK + 0.06, 0.05, THICK + 0.1, '#c99a66', mid, 0.78, 0, { round: 0.01 });
      break;
    case 'glass': {
      const frame = swatch === '#22262a' ? '#22262a' : '#9aa3a8';
      k.box(len, 0.06, 0.08, frame, mid, 0, 0, { metal: 0.6, rough: 0.35 });
      k.box(len, 0.05, 0.08, frame, mid, INNER_H + 0.1, 0, { metal: 0.6, rough: 0.35 });
      for (let i = 0; i <= Math.round(len); i++)
        k.box(0.05, INNER_H + 0.15, 0.08, frame, Math.min(len - 0.025, Math.max(0.025, i)), 0, 0, {
          metal: 0.6,
          rough: 0.35,
        });
      k.box(
        len - 0.04,
        INNER_H + 0.04,
        0.025,
        swatch === '#e8eef0' ? '#eef3f5' : '#cfe8f0',
        mid,
        0.06,
        0,
        {
          opacity: swatch === '#e8eef0' ? 0.8 : 0.32,
          rough: 0.05,
          noShadow: true,
        },
      );
      break;
    }
    case 'sliding': {
      // A ceiling-style track and panels, one slid aside (the gap you walk through).
      k.box(len, 0.06, 0.12, '#3f3a35', mid, INNER_H + 0.12, 0, { metal: 0.4, rough: 0.4 });
      const panel = Math.max(0.5, len / 2);
      const glass = swatch === '#cfe8f0';
      const draw = (x0: number, z: number) => {
        k.box(
          panel - 0.02,
          INNER_H + 0.1,
          0.04,
          glass ? '#cfe8f0' : swatch,
          x0 + panel / 2,
          0.02,
          z,
          {
            ...(glass ? { opacity: 0.35, noShadow: true } : { rough: 0.6 }),
          },
        );
        // Its frame and a few slats.
        k.box(0.04, INNER_H + 0.12, 0.05, '#3f3a35', x0 + 0.02, 0, z);
        k.box(0.04, INNER_H + 0.12, 0.05, '#3f3a35', x0 + panel - 0.02, 0, z);
        if (!glass)
          for (let i = 1; i < 4; i++)
            k.box(panel - 0.06, 0.02, 0.05, '#3f3a35', x0 + panel / 2, (INNER_H * i) / 4, z);
      };
      draw(0, -0.04);
      if (len > 1) draw(Math.max(0, len - panel * 2 + 0.2), 0.04);
      break;
    }
    case 'bookshelf': {
      const h = 1.2;
      const d = 0.34;
      k.box(0.04, h, d, swatch, 0.02, 0, 0);
      k.box(0.04, h, d, swatch, len - 0.02, 0, 0);
      for (let i = 0; i <= Math.round(len); i++)
        if (i > 0 && i < Math.round(len)) k.box(0.03, h, d, swatch, i, 0, 0);
      for (let s = 0; s < 4; s++) {
        const y = 0.04 + s * 0.38;
        k.box(len, 0.03, d, swatch, mid, y - 0.03, 0);
        if (s === 3) break;
        // Books on both faces of every shelf.
        let x = 0.08;
        let n = s * 3 + Math.round(len * 7);
        while (x < len - 0.1) {
          const w = 0.035 + ((n * 37) % 5) * 0.008;
          const bh = 0.22 + ((n * 13) % 4) * 0.025;
          if ((n * 7) % 9 !== 0)
            k.box(w, bh, d - 0.06, BOOKS[n % BOOKS.length]!, x + w / 2, y, 0, { rough: 0.8 });
          x += w + 0.006;
          n++;
        }
      }
      k.box(len, 0.03, d, swatch, mid, h - 0.03, 0);
      break;
    }
  }
  const g = k.build();
  g.userData.divider = kind;
  return g;
}

const isWoody = (c: THREE.Color) => {
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  return hsl.h > 0.02 && hsl.h < 0.13 && hsl.s > 0.2 && hsl.l > 0.12 && hsl.l < 0.75;
};

/**
 * A bought finish on a model: its wood (warm browns) takes the finish, and
 * when it has none, its biggest part does (a sofa's fabric). Materials are
 * shared, so each recoloured part gets its own (cached) material.
 */
export function refinish(group: THREE.Object3D, swatch: string) {
  const target = new THREE.Color(swatch);
  const meshes: THREE.Mesh[] = [];
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && (m.material as THREE.MeshStandardMaterial)?.isMeshStandardMaterial)
      meshes.push(m);
  });
  let woody = meshes.filter((m) => isWoody((m.material as THREE.MeshStandardMaterial).color));
  if (!woody.length) {
    const size = (m: THREE.Mesh) => m.geometry.getAttribute('position')?.count ?? 0;
    const big = [...meshes].sort((a, b) => size(b) - size(a))[0];
    woody = big ? [big] : [];
  }
  for (const m of woody) {
    const was = m.material as THREE.MeshStandardMaterial;
    const c = was.color.clone().lerp(target, 0.85);
    m.material = mat(`#${c.getHexString()}`, { rough: was.roughness, metal: was.metalness });
  }
}
