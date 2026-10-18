/**
 * Phase 6a: a head-and-shoulders portrait of a look, as plain shapes.
 *
 * `portraitShapes` is the one description → drawing mapping for faces: a pure
 * function from an `AvatarLook` (../city/art.tsx, the same look the map
 * figure and the 3D people are built from) to a list of SVG shapes in a
 * 100 × 100 box, back to front. `<Portrait>` (./Portrait.tsx) only renders
 * the list, so the creator, the Me screen, person cards, chat and contacts
 * all draw one person the same way, and tests can read the drawing.
 */
import { shade, type AvatarLook } from '../city/art';

export type Shape =
  | { el: 'path'; part: string; d: string; fill: string; stroke?: string; sw?: number; o?: number }
  | {
      el: 'ellipse';
      part: string;
      cx: number;
      cy: number;
      rx: number;
      ry: number;
      fill: string;
      o?: number;
    }
  | {
      el: 'rect';
      part: string;
      x: number;
      y: number;
      w: number;
      h: number;
      r: number;
      fill: string;
      stroke?: string;
      sw?: number;
      o?: number;
    };

/** The head's half-width and half-height by face shape (centred at 50, 46). */
const FACE = {
  oval: { rx: 16.5, ry: 20 },
  round: { rx: 18.5, ry: 19 },
  square: { rx: 17.5, ry: 19 },
  long: { rx: 15.5, ry: 21.5 },
} as const;

const CX = 50;
const CY = 46;

const ellipse = (
  part: string,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  fill: string,
  o?: number,
): Shape => ({
  el: 'ellipse',
  part,
  cx,
  cy,
  rx,
  ry,
  fill,
  ...(o === undefined ? {} : { o }),
});
const path = (
  part: string,
  d: string,
  fill: string,
  extra: { stroke?: string; sw?: number; o?: number } = {},
): Shape => ({
  el: 'path',
  part,
  d,
  fill,
  ...extra,
});

/** Shapes for a portrait of this look, back to front. */
export function portraitShapes(look: AvatarLook): Shape[] {
  const out: Shape[] = [];
  const { skin, hair: hc, hairStyle } = look;
  const face = FACE[look.face ?? 'oval'];
  const top = look.top;
  const topStyle = look.topStyle ?? 'tee';
  const headwear = look.headwear ?? (look.accessory === 'cap' ? 'cap' : 'none');
  const glasses = look.glasses ?? (look.accessory === 'glasses' ? 'round' : 'none');
  const facial = look.facialHair ?? 'none';
  const covered = headwear === 'headwrap' || headwear === 'gele';
  const hatted = headwear === 'cap' || headwear === 'beanie';
  const L = CX - face.rx;
  const R = CX + face.rx;
  const T = CY - face.ry;

  // ---- Hair behind the head and shoulders.
  if (!covered) {
    if (hairStyle === 'afro' && !hatted)
      out.push(ellipse('hair', CX, CY - 8, face.rx + 13, face.ry + 9, hc));
    if (hairStyle === 'long')
      out.push(
        path(
          'hair',
          `M ${L - 4} ${CY - 6} Q ${L - 6} ${CY + 30} ${L - 2} ${CY + 42} L ${R + 2} ${CY + 42} Q ${R + 6} ${CY + 30} ${R + 4} ${CY - 6} Z`,
          hc,
        ),
      );
    if (hairStyle === 'locs' || hairStyle === 'braids') {
      const n = hairStyle === 'locs' ? 5 : 3;
      for (let i = 0; i < n; i++)
        for (const side of [-1, 1]) {
          const x = CX + side * (face.rx + 1 - i * 2.6);
          out.push({
            el: 'rect',
            part: 'hair',
            x: x - 2.2,
            y: CY - 10 + i,
            w: 4.4,
            h: hairStyle === 'locs' ? 44 - i * 3 : 40,
            r: 2.2,
            fill: hairStyle === 'braids' ? shade(hc, -0.1) : hc,
          });
        }
    }
    if (hairStyle === 'bun' && !hatted) out.push(ellipse('hair', CX, T - 6, 9, 8, hc));
    if (hairStyle === 'curly' && !hatted)
      for (let i = 0; i < 9; i++) {
        const a = Math.PI * (1.05 + (i / 8) * 0.9);
        out.push(
          ellipse(
            'hair',
            CX + Math.cos(a) * (face.rx + 2),
            CY - 6 + Math.sin(a) * (face.ry + 1),
            6.5,
            6.5,
            hc,
          ),
        );
      }
    if (hairStyle === 'twists' && !hatted)
      for (let i = 0; i < 9; i++) {
        const a = Math.PI * (1.02 + (i / 8) * 0.96);
        const x = CX + Math.cos(a) * (face.rx + 1);
        const y = CY - 6 + Math.sin(a) * (face.ry + 2);
        out.push({
          el: 'rect',
          part: 'hair',
          x: x - 3,
          y: y - 7,
          w: 6,
          h: 11,
          r: 3,
          fill: i % 2 ? hc : shade(hc, 0.08),
        });
      }
  }

  // ---- Shoulders and the top.
  if (topStyle === 'hoodie')
    out.push(path('top', `M 30 82 Q 50 70 70 82 L 70 90 L 30 90 Z`, shade(top, -0.22)));
  out.push(path('top', `M 8 100 Q 10 82 30 78 Q 50 74 70 78 Q 90 82 92 100 Z`, top));
  out.push({
    el: 'rect',
    part: 'neck',
    x: CX - 6.5,
    y: CY + face.ry - 6,
    w: 13,
    h: 16,
    r: 4,
    fill: shade(skin, -0.08),
  });
  if (topStyle === 'tee' || topStyle === 'dress')
    out.push(
      path(
        'neckline',
        `M 40 77 Q 50 ${topStyle === 'dress' ? 92 : 86} 60 77 Z`,
        shade(skin, -0.08),
      ),
    );
  if (topStyle === 'shirt') {
    out.push(path('collar', `M 40 76 L 50 86 L 44 90 Z`, '#f8fafc'));
    out.push(path('collar', `M 60 76 L 50 86 L 56 90 Z`, '#f8fafc'));
    out.push(path('placket', `M 50 86 L 50 100`, 'none', { stroke: shade(top, -0.3), sw: 1 }));
  }
  if (topStyle === 'blazer') {
    out.push(path('shirt', `M 41 77 L 59 77 L 50 100 Z`, '#f8fafc'));
    out.push(path('lapel', `M 41 77 L 50 100 L 38 88 Z`, shade(top, -0.18)));
    out.push(path('lapel', `M 59 77 L 50 100 L 62 88 Z`, shade(top, -0.18)));
  }
  if (topStyle === 'hoodie') {
    out.push(
      path('strings', `M 45 84 L 44 96 M 55 84 L 56 96`, 'none', { stroke: '#f8fafc', sw: 1.4 }),
    );
  }
  if (topStyle === 'kaftan') {
    out.push(path('neckline', `M 41 77 L 50 90 L 59 77 Z`, shade(skin, -0.08)));
    out.push(path('embroidery', `M 39 77 L 50 93 L 61 77`, 'none', { stroke: '#fbbf24', sw: 2.4 }));
  }
  if (look.accessory === 'tie')
    out.push(path('tie', `M 50 86 L 53 90 L 50 100 L 47 90 Z`, '#b91c1c'));
  if (look.accessory === 'scarf')
    out.push(path('scarf', `M 36 78 Q 50 88 64 78 L 62 84 Q 50 92 38 84 Z`, '#f59e0b'));
  if (look.accessory === 'lanyard')
    out.push(path('lanyard', `M 42 78 L 50 96 L 58 78`, 'none', { stroke: '#f59e0b', sw: 1.4 }));

  // ---- The head.
  out.push(ellipse('ear', L + 0.5, CY + 2, 3.2, 4.5, shade(skin, -0.06)));
  out.push(ellipse('ear', R - 0.5, CY + 2, 3.2, 4.5, shade(skin, -0.06)));
  if (look.face === 'square')
    out.push({
      el: 'rect',
      part: 'face',
      x: L,
      y: T,
      w: face.rx * 2,
      h: face.ry * 2,
      r: 9,
      fill: skin,
    });
  else out.push(ellipse('face', CX, CY, face.rx, face.ry, skin));
  if (look.gender === 'female' && !covered) {
    out.push(ellipse('earring', L + 0.5, CY + 7.5, 1.6, 1.6, '#fbbf24'));
    out.push(ellipse('earring', R - 0.5, CY + 7.5, 1.6, 1.6, '#fbbf24'));
  }

  // ---- Hair over the head: the hairline, by style.
  if (!covered && !hatted) {
    const cap = (depth: number, color = hc, o?: number) =>
      out.push(
        path(
          'hair',
          `M ${L - 0.5} ${CY - 2} Q ${L - 1} ${T - 2} ${CX} ${T - 2.5} Q ${R + 1} ${T - 2} ${R + 0.5} ${CY - 2} Q ${R - 2} ${T + depth} ${CX} ${T + depth} Q ${L + 2} ${T + depth} ${L - 0.5} ${CY - 2} Z`,
          color,
          o === undefined ? {} : { o },
        ),
      );
    switch (hairStyle) {
      case 'bald':
        out.push(ellipse('shine', CX - 6, T + 6, 5, 2.5, '#ffffff', 0.22));
        break;
      case 'buzz':
        cap(7, hc, 0.85);
        break;
      case 'short':
        cap(10);
        out.push(
          path(
            'hair',
            `M ${CX - 10} ${T + 1} Q ${CX + 4} ${T - 6} ${R} ${T + 9} Q ${CX + 2} ${T + 4} ${CX - 10} ${T + 1} Z`,
            shade(hc, 0.1),
          ),
        );
        break;
      case 'afro':
      case 'curly':
      case 'twists':
        cap(9);
        break;
      case 'braids':
        cap(9);
        for (const dx of [-8, -3, 2, 7])
          out.push(
            path(
              'cornrow',
              `M ${CX + dx} ${T + 7} Q ${CX + dx * 0.6} ${T} ${CX + dx * 0.4} ${T - 2}`,
              'none',
              { stroke: shade(hc, 0.25), sw: 0.9 },
            ),
          );
        break;
      case 'locs':
        cap(10);
        break;
      case 'bun':
        cap(9);
        break;
      case 'long':
        cap(11);
        break;
    }
  }

  // ---- The face.
  const brow = covered || hairStyle === 'bald' ? shade(skin, -0.35) : hc;
  out.push(
    path('brow', `M ${CX - 11} ${CY - 6} Q ${CX - 7} ${CY - 8.5} ${CX - 3} ${CY - 6.5}`, 'none', {
      stroke: brow,
      sw: 1.8,
    }),
  );
  out.push(
    path('brow', `M ${CX + 3} ${CY - 6.5} Q ${CX + 7} ${CY - 8.5} ${CX + 11} ${CY - 6}`, 'none', {
      stroke: brow,
      sw: 1.8,
    }),
  );
  out.push(ellipse('eye', CX - 7, CY - 1, 1.9, 2.2, '#111827'));
  out.push(ellipse('eye', CX + 7, CY - 1, 1.9, 2.2, '#111827'));
  out.push(
    path('nose', `M ${CX - 2.5} ${CY + 6} Q ${CX} ${CY + 8} ${CX + 2.5} ${CY + 6}`, 'none', {
      stroke: shade(skin, -0.25),
      sw: 1.2,
    }),
  );
  out.push(
    path('mouth', `M ${CX - 5} ${CY + 11.5} Q ${CX} ${CY + 15} ${CX + 5} ${CY + 11.5}`, 'none', {
      stroke: '#7c2d12',
      sw: 1.4,
    }),
  );

  // ---- Facial hair.
  const jaw = `M ${L + 1} ${CY + 1} Q ${L + 1} ${CY + face.ry + 4} ${CX} ${CY + face.ry + 4} Q ${R - 1} ${CY + face.ry + 4} ${R - 1} ${CY + 1}`;
  if (facial === 'beard')
    out.push(
      path(
        'beard',
        `${jaw} L ${R - 4} ${CY + 3} Q ${CX + 6} ${CY + 8} ${CX} ${CY + 9} Q ${CX - 6} ${CY + 8} ${L + 4} ${CY + 3} Z M ${CX - 6} ${CY + 12.5} Q ${CX} ${CY + 17} ${CX + 6} ${CY + 12.5} Q ${CX} ${CY + 14} ${CX - 6} ${CY + 12.5} Z`,
        hc,
      ),
    );
  if (facial === 'stubble')
    out.push(path('stubble', `${jaw} Q ${CX} ${CY + 12} ${L + 1} ${CY + 1} Z`, hc, { o: 0.28 }));
  if (facial === 'goatee') out.push(ellipse('goatee', CX, CY + face.ry - 1, 4.5, 4, hc));
  if (facial === 'moustache' || facial === 'goatee' || facial === 'beard')
    out.push(
      path(
        'moustache',
        `M ${CX - 7} ${CY + 11} Q ${CX} ${CY + 6.5} ${CX + 7} ${CY + 11} Q ${CX} ${CY + 9.5} ${CX - 7} ${CY + 11} Z`,
        hc,
      ),
    );

  // ---- Glasses.
  if (glasses === 'round' || glasses === 'square') {
    const lens = (x: number): Shape =>
      glasses === 'round'
        ? {
            el: 'ellipse',
            part: 'glasses',
            cx: x,
            cy: CY - 1,
            rx: 5.5,
            ry: 5.5,
            fill: '#e0f2fe',
            o: 0.25,
          }
        : {
            el: 'rect',
            part: 'glasses',
            x: x - 6,
            y: CY - 5.5,
            w: 12,
            h: 9,
            r: 2,
            fill: '#e0f2fe',
            o: 0.25,
          };
    out.push(lens(CX - 7.5), lens(CX + 7.5));
    const ring = (x: number): Shape =>
      glasses === 'round'
        ? {
            el: 'path',
            part: 'frame',
            d: `M ${x - 5.5} ${CY - 1} a 5.5 5.5 0 1 0 11 0 a 5.5 5.5 0 1 0 -11 0`,
            fill: 'none',
            stroke: '#111827',
            sw: 1.4,
          }
        : {
            el: 'rect',
            part: 'frame',
            x: x - 6,
            y: CY - 5.5,
            w: 12,
            h: 9,
            r: 2,
            fill: 'none',
            stroke: '#111827',
            sw: 1.4,
          };
    out.push(ring(CX - 7.5), ring(CX + 7.5));
    out.push(
      path('frame', `M ${CX - 2} ${CY - 2} Q ${CX} ${CY - 3.5} ${CX + 2} ${CY - 2}`, 'none', {
        stroke: '#111827',
        sw: 1.4,
      }),
    );
  }
  if (glasses === 'shades') {
    out.push(
      path(
        'glasses',
        `M ${CX - 14} ${CY - 5} L ${CX - 1.5} ${CY - 5} L ${CX - 2.5} ${CY + 2} Q ${CX - 8} ${CY + 5} ${CX - 13} ${CY + 2} Z M ${CX + 1.5} ${CY - 5} L ${CX + 14} ${CY - 5} L ${CX + 13} ${CY + 2} Q ${CX + 8} ${CY + 5} ${CX + 2.5} ${CY + 2} Z`,
        '#0f172a',
      ),
    );
    out.push(
      path('frame', `M ${CX - 1.5} ${CY - 4} L ${CX + 1.5} ${CY - 4}`, 'none', {
        stroke: '#0f172a',
        sw: 1.6,
      }),
    );
  }

  // ---- Headwear, in a shade of the top (a matching gele and buba).
  if (headwear === 'cap') {
    const c = shade(top, -0.3);
    out.push(
      path(
        'headwear',
        `M ${L - 1} ${CY - 6} Q ${L - 1} ${T - 5} ${CX} ${T - 5} Q ${R + 1} ${T - 5} ${R + 1} ${CY - 6} Z`,
        c,
      ),
    );
    out.push(
      path(
        'headwear',
        `M ${CX - 4} ${CY - 7} Q ${R + 12} ${CY - 10} ${R + 13} ${CY - 5} Q ${CX + 8} ${CY - 3} ${CX - 4} ${CY - 5} Z`,
        shade(c, -0.2),
      ),
    );
  }
  if (headwear === 'beanie') {
    out.push(
      path(
        'headwear',
        `M ${L - 1.5} ${CY - 6} Q ${L - 2} ${T - 8} ${CX} ${T - 8} Q ${R + 2} ${T - 8} ${R + 1.5} ${CY - 6} Z`,
        top,
      ),
    );
    out.push({
      el: 'rect',
      part: 'headwear',
      x: L - 2.5,
      y: CY - 11,
      w: face.rx * 2 + 5,
      h: 6,
      r: 3,
      fill: shade(top, -0.2),
    });
  }
  if (headwear === 'headwrap' || headwear === 'gele') {
    out.push(
      path(
        'headwear',
        `M ${L - 2} ${CY - 2} Q ${L - 4} ${T - 9} ${CX} ${T - 9} Q ${R + 4} ${T - 9} ${R + 2} ${CY - 2} Q ${CX} ${CY - 9} ${L - 2} ${CY - 2} Z`,
        top,
      ),
    );
    if (headwear === 'headwrap')
      out.push(ellipse('headwear', CX + 8, T - 8, 6, 5, shade(top, -0.15)));
    else {
      out.push(
        path(
          'headwear',
          `M ${CX - 30} ${T - 2} Q ${CX - 22} ${T - 30} ${CX} ${T - 26} Q ${CX + 22} ${T - 30} ${CX + 30} ${T - 2} Q ${CX + 12} ${T - 10} ${CX} ${T - 4} Q ${CX - 12} ${T - 10} ${CX - 30} ${T - 2} Z`,
          shade(top, 0.12),
        ),
      );
      out.push(
        path(
          'pleats',
          `M ${CX - 18} ${T - 18} L ${CX - 6} ${T - 5} M ${CX + 18} ${T - 18} L ${CX + 6} ${T - 5} M ${CX} ${T - 25} L ${CX} ${T - 5}`,
          'none',
          { stroke: shade(top, -0.2), sw: 1.2 },
        ),
      );
    }
  }
  return out;
}
