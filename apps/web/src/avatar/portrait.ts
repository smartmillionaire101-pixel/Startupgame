/**
 * Phase 6a: a head-and-shoulders portrait of a look, as plain shapes.
 *
 * `portraitShapes` is the one description → drawing mapping for faces: a pure
 * function from an `AvatarLook` (../city/art.tsx, the same look the map
 * figure and the 3D people are built from) to a list of SVG shapes in a
 * 100 × 100 box, back to front. `<Portrait>` (./Portrait.tsx) only renders
 * the list, so the creator, the Me screen, person cards, chat and contacts
 * all draw one person the same way, and tests can read the drawing.
 *
 * The style is the flat profile-picture look people know from social apps:
 * a soft background, shoulders, a face with a real jaw, brows, nose and ears,
 * hair with a hairline (never a hat unless one is chosen), and facial hair
 * that follows the jaw below the cheeks.
 */
import { mix, shade, type AvatarLook } from '../city/art';
import { facialHairColour as darkOn } from './tone';
import { SCARF_COLOUR, SILVER, necklaceColour } from './worn';

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

/**
 * The head by face shape: half-width, chin, how low the jaw starts to curve
 * in and how wide the chin is. The crown is at about y 28, the eyes at 49.
 */
const FACE = {
  oval: { hw: 18, chin: 73, jaw: 13, k: 10 },
  round: { hw: 19, chin: 71, jaw: 12, k: 12 },
  square: { hw: 18.5, chin: 72, jaw: 10, k: 13 },
  long: { hw: 16.5, chin: 75, jaw: 16, k: 9 },
} as const;

const CX = 50;
const EYE_Y = 49;
const INK = '#1f2937';

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
const rect = (
  part: string,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string,
): Shape => ({ el: 'rect', part, x, y, w, h, r, fill });

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Hair is drawn for a head 18 wide; this fits every "x,y" pair to the face's width. */
const fit = (hw: number) => (d: string) =>
  d.replace(
    /(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g,
    (_, x: string, y: string) => `${r1(CX + (Number(x) - CX) * (hw / 18))},${y}`,
  );

/** Shapes for a portrait of this look, back to front. */
export function portraitShapes(look: AvatarLook): Shape[] {
  const out: Shape[] = [];
  const { skin, hair: hc, hairStyle } = look;
  const female = look.gender === 'female';
  const f = FACE[look.face ?? 'oval'];
  const X = fit(f.hw);
  const L = CX - f.hw;
  const R = CX + f.hw;
  const top = look.top;
  const topStyle = look.topStyle ?? 'tee';
  const headwear = look.headwear ?? (look.accessory === 'cap' ? 'cap' : 'none');
  const glasses = look.glasses ?? (look.accessory === 'glasses' ? 'round' : 'none');
  const facial = look.facialHair ?? 'none';
  const covered = headwear === 'headwrap' || headwear === 'gele';
  const hatted = headwear === 'cap' || headwear === 'beanie';
  const skinDk = shade(skin, -0.14);
  const hi = shade(hc, 0.18);
  const hair = (d: string, fill = hc, extra: { stroke?: string; sw?: number; o?: number } = {}) =>
    out.push(path('hair', X(d), fill, extra));

  // ---- A soft background in the colour of the top, like a profile picture.
  out.push(rect('bg', 0, 0, 100, 100, 0, mix(top, '#ffffff', 0.82)));

  // ---- Hair behind the head and shoulders.
  if (!covered) {
    switch (hairStyle) {
      case 'long':
        if (female)
          hair('M29,44 C27,22 73,22 71,44 L73,82 C66,86 60,84 58,80 L42,80 C40,84 34,86 27,82 Z');
        else
          hair('M30,44 C29,23 71,23 70,44 L71,66 C66,69 62,67 60,64 L40,64 C38,67 34,69 29,66 Z');
        break;
      case 'curly':
        if (female) {
          hair(
            'M28,44 C26,21 74,21 72,44 C76,56 70,62 74,72 C70,80 64,80 60,76 L40,76 C36,80 30,80 26,72 C30,62 24,56 28,44 Z',
          );
          for (const [x, y] of [
            [27, 58],
            [73, 58],
            [28, 70],
            [72, 70],
          ] as const)
            out.push(ellipse('hair', r1(CX + (x - CX) * (f.hw / 18)), y, 4.5, 4.5, hc));
        }
        break;
      case 'afro':
        if (!hatted) {
          const r = female ? 23 : 20;
          out.push(ellipse('hair', CX, 40, r * (f.hw / 18), r - 1, hc));
          for (let i = 0; i < 16; i++) {
            const a = (Math.PI * 2 * i) / 16;
            out.push(
              ellipse(
                'hair',
                r1(CX + Math.cos(a) * (r - 1) * (f.hw / 18)),
                r1(40 + Math.sin(a) * (r - 2)),
                5,
                5,
                hc,
              ),
            );
          }
        }
        break;
      case 'braids':
        hair(
          female
            ? 'M29,44 C28,22 72,22 71,44 L71,88 L63,88 L63,60 L37,60 L37,88 L29,88 Z'
            : 'M30,44 C29,23 71,23 70,44 L70,70 L64,70 L64,58 L36,58 L36,70 L30,70 Z',
        );
        for (const x of [31, 35, 65, 69])
          for (const y of female ? [64, 70, 76, 82] : [60, 65])
            hair(`M${x - 2},${y} L${x + 2},${y + 3}`, 'none', { stroke: hi, sw: 1.2 });
        break;
      case 'locs':
        for (const x of [30, 34, 38, 62, 66, 70]) {
          const len = (female ? 40 : 30) - Math.abs(x < 50 ? x - 30 : 70 - x);
          out.push(rect('hair', r1(CX + (x - CX) * (f.hw / 18) - 2.2), 40, 4.5, len, 2.2, hc));
        }
        break;
      case 'twists':
        if (female)
          for (const x of [30, 34, 66, 70])
            out.push(
              rect('hair', r1(CX + (x - CX) * (f.hw / 18) - 2.5), 42, 5, 22, 2.5, shade(hc, 0.06)),
            );
        break;
      case 'bun':
        if (!hatted) {
          out.push(ellipse('hair', CX, 22, 8, 7, hc));
          hair('M44,21 C47,18 53,18 56,21', 'none', { stroke: hi, sw: 1.2 });
        }
        break;
    }
  }

  // ---- Shoulders and the top.
  const body = 'M14,100 C14,86 26,80 40,78 L60,78 C74,80 86,86 86,100 Z';
  out.push(path('top', body, top));
  if (topStyle === 'tee' || topStyle === 'dress')
    out.push(
      path(
        'neckline',
        topStyle === 'dress' ? 'M42,78 C45,88 55,88 58,78 Z' : 'M43,78 C45,83 55,83 57,78 Z',
        skinDk,
      ),
    );
  if (topStyle === 'shirt') {
    out.push(path('collar', 'M42,78 L50,88 L45,90 L39,80 Z', '#f8fafc'));
    out.push(path('collar', 'M58,78 L50,88 L55,90 L61,80 Z', '#f8fafc'));
    out.push(path('placket', 'M50,88 L50,100', 'none', { stroke: shade(top, -0.3), sw: 1 }));
  }
  if (topStyle === 'blazer') {
    out.push(path('shirt', 'M43,78 L57,78 L50,94 Z', '#f8fafc'));
    out.push(path('lapel', 'M40,78 L50,96 L46,100 L36,82 Z', shade(top, -0.2)));
    out.push(path('lapel', 'M60,78 L50,96 L54,100 L64,82 Z', shade(top, -0.2)));
  }
  if (topStyle === 'hoodie') {
    out.push(
      path('hood', 'M38,78 C40,87 60,87 62,78', 'none', { stroke: shade(top, -0.22), sw: 3 }),
    );
    out.push(
      path('strings', 'M46,86 L45,96 M54,86 L55,96', 'none', { stroke: '#f8fafc', sw: 1.2 }),
    );
  }
  if (topStyle === 'kaftan') {
    out.push(path('neckline', 'M42,78 L50,90 L58,78 Z', skinDk));
    out.push(path('embroidery', 'M40,78 L50,93 L60,78', 'none', { stroke: '#fbbf24', sw: 2.2 }));
  }
  if (look.accessory === 'tie') out.push(path('tie', 'M50,86 L53,90 L50,100 L47,90 Z', '#b91c1c'));
  if (look.accessory === 'scarf')
    out.push(path('scarf', 'M37,78 Q50,88 63,78 L61,84 Q50,92 39,84 Z', '#f59e0b'));
  if (look.accessory === 'lanyard')
    out.push(path('lanyard', 'M43,78 L50,96 L57,78', 'none', { stroke: '#f59e0b', sw: 1.4 }));

  // ---- Neck, ears and the head.
  out.push(path('neck', 'M43,64 L57,64 L57,80 C54,83 46,83 43,80 Z', skinDk));
  out.push(ellipse('ear', r1(L + 0.5), 51, 3.5, 5, skinDk));
  out.push(ellipse('ear', r1(R - 0.5), 51, 3.5, 5, skinDk));
  if (look.earrings === 'studs') {
    out.push(ellipse('earring', r1(L + 0.5), 57, 1.5, 1.5, SILVER));
    out.push(ellipse('earring', r1(R - 0.5), 57, 1.5, 1.5, SILVER));
  } else if (female && !covered) {
    out.push(ellipse('earring', r1(L + 0.5), 57, 1.6, 1.6, '#fbbf24'));
    out.push(ellipse('earring', r1(R - 0.5), 57, 1.6, 1.6, '#fbbf24'));
  }
  // From the wardrobe: a necklace on the neck, a silk scarf round it.
  if (look.necklace && look.necklace !== 'none') {
    const c = necklaceColour(look.necklace);
    out.push(path('necklace', 'M42,74 Q50,88 58,74', 'none', { stroke: c, sw: 1.4 }));
    out.push(ellipse('necklace', 50, 84, 2, 2.2, c));
  }
  if (look.scarf === 'silk')
    out.push(path('scarf', 'M36,78 Q50,90 64,78 L62,85 Q50,95 38,85 Z', SCARF_COLOUR));
  const crown = 26;
  out.push(
    path(
      'face',
      `M${L},44 C${L},${crown} ${R},${crown} ${R},44 L${R},51 C${R},${51 + f.jaw} ${CX + f.k},${f.chin} ${CX},${f.chin} C${CX - f.k},${f.chin} ${L},${51 + f.jaw} ${L},51 Z`,
      skin,
    ),
  );

  // ---- Facial hair, along the jaw (below the cheeks, round the mouth).
  const fh = darkOn(skin, hc);
  const jaw = `M${L},50 C${L},${52 + f.jaw} ${CX - f.k},${f.chin + 1} ${CX},${f.chin + 1} C${CX + f.k},${f.chin + 1} ${R},${52 + f.jaw} ${R},50 C${R - 2},58 ${R - 6},61 57,61 C55,58 45,58 43,61 C${L + 6},61 ${L + 2},58 ${L},50 Z`;
  const tash =
    'M42,61 C45,58 48,59 50,60 C52,59 55,58 58,61 C55,62 52,61 50,61 C48,61 45,62 42,61 Z';
  if (facial === 'beard') {
    out.push(path('beard', jaw, fh));
    out.push(path('lips', 'M44,62 Q50,60 56,62 Q50,66 44,62 Z', shade(skin, -0.25)));
  }
  if (facial === 'stubble') out.push(path('stubble', jaw, fh, { o: 0.32 }));
  if (facial === 'goatee')
    out.push(path('goatee', `M44,66 C46,${f.chin} 54,${f.chin} 56,66 C54,68 46,68 44,66 Z`, fh));
  if (facial === 'moustache' || facial === 'goatee') out.push(path('moustache', tash, fh));

  // ---- The face: brows, eyes, nose, cheeks and a smile.
  const brow = covered || hairStyle === 'bald' ? shade(skin, -0.45) : darkOn(skin, hc);
  out.push(path('brow', 'M39,44 Q43,41.5 46,43.5', 'none', { stroke: brow, sw: 1.8 }));
  out.push(path('brow', 'M54,43.5 Q57,41.5 61,44', 'none', { stroke: brow, sw: 1.8 }));
  for (const x of [42.5, 57.5]) {
    out.push(ellipse('eye', x, EYE_Y, 2, 2.4, INK));
    out.push(ellipse('eye-shine', x + 0.7, EYE_Y - 0.8, 0.6, 0.6, '#ffffff'));
  }
  out.push(
    path('nose', 'M50,50 Q48.5,55 50.5,56', 'none', { stroke: shade(skin, -0.28), sw: 1.3 }),
  );
  out.push(ellipse('cheek', 39, 56, 3, 1.6, '#f87171', 0.18));
  out.push(ellipse('cheek', 61, 56, 3, 1.6, '#f87171', 0.18));
  if (facial !== 'beard')
    out.push(
      path('mouth', 'M45,61 Q50,65 55,61', 'none', {
        stroke: female ? '#9f1239' : shade(skin, -0.38),
        sw: 1.6,
      }),
    );

  // ---- Hair over the head: the hairline, by style.
  if (!covered && !hatted) {
    switch (hairStyle) {
      case 'bald':
        out.push(ellipse('shine', CX - 6, 32, 5, 2.5, '#ffffff', 0.22));
        break;
      case 'buzz':
        hair(
          'M32.5,45 C31,26 69,26 67.5,45 C66.5,41 65,38 63,37 C58,35.5 42,35.5 37,37 C35,38 33.5,41 32.5,45 Z',
          hc,
          { o: 0.85 },
        );
        break;
      case 'short':
        if (female) hair('M31,45 C29,25 71,24 69,44 C66,38 58,32 46,36 C40,38 35,40 33,46 Z');
        else {
          hair('M32,44 C30,24 70,24 68,42 C64,36 52,32 40,36 C36,38 33,40 32,44 Z');
          hair('M41,33 C48,30 58,30 64,35', 'none', { stroke: hi, sw: 1.4 });
        }
        break;
      case 'curly':
        if (female) {
          hair('M31,46 C29,24 71,24 69,46 C64,36 56,33 48,34 C42,35 36,38 33,46 Z');
          for (const x of [38, 46, 54, 62])
            out.push(ellipse('hair', r1(CX + (x - CX) * (f.hw / 18)), 31, 5, 4.5, hc));
        } else {
          for (const [i, x] of [36, 42, 48, 54, 60, 64].entries())
            out.push(ellipse('hair', r1(CX + (x - CX) * (f.hw / 18)), 31 + (i % 2) * 2, 6, 6, hc));
          hair('M32,42 C32,32 68,32 68,42 C62,37 38,37 32,42 Z');
        }
        break;
      case 'afro':
        hair('M32,44 C33,32 67,32 68,44 C64,39 58,37 50,37 C42,37 36,39 32,44 Z');
        break;
      case 'twists':
        hair('M32,44 C31,27 69,27 68,44 C64,38 36,38 32,44 Z');
        for (const [i, x] of [36, 41, 46, 51, 56, 61, 65].entries())
          out.push(
            rect(
              'hair',
              r1(CX + (x - CX) * (f.hw / 18) - 2.5),
              24 + (i % 2) * 2,
              5,
              10,
              2.5,
              i % 2 ? hc : shade(hc, 0.08),
            ),
          );
        break;
      case 'braids':
        hair('M31,46 C30,25 70,25 69,46 C65,37 58,34 50,34 C42,34 35,37 31,46 Z');
        for (const x of [38, 44, 50, 56, 62])
          out.push(
            path('cornrow', X(`M${x},28 L${x},38`), 'none', { stroke: shade(hc, 0.25), sw: 1 }),
          );
        break;
      case 'locs':
        hair('M31,46 C30,24 70,24 69,46 C64,36 36,36 31,46 Z');
        for (const x of [38, 44, 50, 56, 62])
          hair(`M${x},30 L${x - 2},40`, 'none', { stroke: shade(hc, 0.22), sw: 1.2 });
        break;
      case 'bun':
        hair('M31,46 C30,25 70,25 69,46 C65,38 58,35 50,35 C42,35 35,38 31,46 Z');
        hair('M50,27 L50,35', 'none', { stroke: shade(hc, 0.22), sw: 1 });
        break;
      case 'long':
        hair('M31,46 C29,24 71,24 69,46 C64,36 56,33 48,34 C42,35 36,38 33,46 Z');
        hair('M48,34 C54,32 62,34 66,40', 'none', { stroke: hi, sw: 1.5 });
        break;
    }
  }

  // ---- Glasses.
  if (glasses === 'round' || glasses === 'square') {
    for (const x of [42.5, 57.5])
      out.push(
        glasses === 'round'
          ? {
              el: 'ellipse',
              part: 'glasses',
              cx: x,
              cy: EYE_Y,
              rx: 5,
              ry: 5,
              fill: '#e0f2fe',
              o: 0.25,
            }
          : {
              el: 'rect',
              part: 'glasses',
              x: x - 5,
              y: EYE_Y - 4,
              w: 10,
              h: 8,
              r: 3,
              fill: '#e0f2fe',
              o: 0.25,
            },
      );
    for (const x of [42.5, 57.5])
      out.push(
        glasses === 'round'
          ? {
              el: 'path',
              part: 'frame',
              d: `M ${x - 5} ${EYE_Y} a 5 5 0 1 0 10 0 a 5 5 0 1 0 -10 0`,
              fill: 'none',
              stroke: '#111827',
              sw: 1.3,
            }
          : {
              el: 'rect',
              part: 'frame',
              x: x - 5,
              y: EYE_Y - 4,
              w: 10,
              h: 8,
              r: 3,
              fill: 'none',
              stroke: '#111827',
              sw: 1.3,
            },
      );
    out.push(
      path('frame', `M47.5,${EYE_Y - 0.5} L52.5,${EYE_Y - 0.5}`, 'none', {
        stroke: '#111827',
        sw: 1.3,
      }),
    );
  }
  if (glasses === 'shades') {
    out.push(
      path(
        'glasses',
        `M36.5,45 L48,45 L47,51 Q42,54 37.5,51 Z M52,45 L63.5,45 L62.5,51 Q58,54 53,51 Z`,
        '#0f172a',
      ),
    );
    out.push(path('frame', 'M48,46 L52,46', 'none', { stroke: '#0f172a', sw: 1.6 }));
  }

  // ---- Headwear, only when chosen, in a shade of the top (a matching gele and buba).
  if (headwear === 'cap') {
    const c = shade(top, -0.3);
    out.push(path('headwear', X('M31,42 C31,22 69,22 69,42 Z'), c));
    out.push(path('headwear', X('M46,41 C60,38 80,38 82,43 C72,45 58,44 46,43 Z'), shade(c, -0.2)));
  }
  if (headwear === 'beanie') {
    out.push(path('headwear', X('M30.5,42 C30,20 70,20 69.5,42 Z'), top));
    out.push(rect('headwear', r1(L - 2), 37, r1(f.hw * 2 + 4), 6, 3, shade(top, -0.2)));
  }
  if (covered) {
    out.push(path('headwear', X('M30,46 C27,20 73,20 70,46 C64,38 36,38 30,46 Z'), top));
    if (headwear === 'headwrap') out.push(ellipse('headwear', 58, 22, 6, 5, shade(top, -0.15)));
    else {
      out.push(
        path(
          'headwear',
          'M20,32 C26,6 44,10 50,12 C56,10 74,6 80,32 C66,22 58,26 50,30 C42,26 34,22 20,32 Z',
          shade(top, 0.12),
        ),
      );
      out.push(
        path('pleats', 'M32,18 L44,28 M68,18 L56,28 M50,12 L50,29', 'none', {
          stroke: shade(top, -0.2),
          sw: 1.2,
        }),
      );
    }
  }
  return out;
}
