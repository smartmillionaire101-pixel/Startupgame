/**
 * Wave 10 §C: a pitch competition in 3D (lazy-loaded), on the interiors kit.
 * The event hall's stage with a podium and a big slide screen (the company's
 * name and idea), the founder pitching at the podium, the judges' table in
 * front of the stage with each judge's name (real players and AI investors)
 * and the score cards they raise, the audience behind, and the winner's
 * moment: a spotlight, a trophy, a big cheque and confetti.
 *
 * The 2D scene owns the timeline: `frame()` says which pitch is on, which
 * cards are up and whether the winner is being crowned.
 */
import { useEffect, useRef, type ReactElement } from 'react';
import * as THREE from 'three';
import type { AvatarLook } from '../city/art';
import { makeCharacter, pose, type Character } from './character';
import { buildModel } from './furniture';
import { Particles, fx } from './fx';
import { Kit, disposeTree } from './kit';
import { Stage, gestures } from './stage';
import { BACK, RD, RW, buildVenue } from './venues';

export interface Competition3DEntry {
  id: string;
  company: string;
  idea: string;
  founder: AvatarLook;
  you: boolean;
}

export interface Competition3DJudge {
  id: string;
  name: string;
  org: string;
  ai: boolean;
  look: AvatarLook;
}

export interface Competition3DFrame {
  /** The pitch on stage (index into entries). */
  entry: number;
  /** One per judge: the card's text when raised ('7', '?'), or null when down. */
  cards: (string | null)[];
  /** The winning entry, while crowning; else null. */
  winner: number | null;
  /** The cheque's amount, words ready. */
  prize: string | null;
}

export interface Competition3DProps {
  title: string;
  /** "Pitch {n} of {m}" words for the screen. */
  pitchLabel: (n: number, m: number) => string;
  winnerLabel: string;
  entries: Competition3DEntry[];
  judges: Competition3DJudge[];
  audience: AvatarLook[];
  frame: () => Competition3DFrame;
  onReady: () => void;
}

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (g) draw(g);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function wrap(
  g: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  lh: number,
  lines = 3,
) {
  const words = text.split(/\s+/);
  let line = '';
  let n = 0;
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (g.measureText(next).width > maxW && line) {
      g.fillText(line, x, y + n * lh);
      n++;
      line = w;
      if (n >= lines) return;
    } else line = next;
  }
  if (line && n < lines) g.fillText(line, x, y + n * lh);
}

function slideTexture(
  title: string,
  label: string,
  e: Competition3DEntry | null,
  winner: string | null,
) {
  return canvasTexture(1024, 560, (g) => {
    const grad = g.createLinearGradient(0, 0, 1024, 560);
    grad.addColorStop(0, winner ? '#78350f' : '#1e1b4b');
    grad.addColorStop(1, winner ? '#b45309' : '#4338ca');
    g.fillStyle = grad;
    g.fillRect(0, 0, 1024, 560);
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.font = '600 34px system-ui, sans-serif';
    g.textAlign = 'left';
    g.fillText(title.slice(0, 52), 48, 70);
    g.fillStyle = '#fde68a';
    g.font = '700 30px system-ui, sans-serif';
    g.fillText((winner ?? label).toUpperCase(), 48, 130);
    if (e) {
      g.fillStyle = '#ffffff';
      g.font = '800 96px system-ui, sans-serif';
      g.fillText(e.company.slice(0, 18), 48, 260);
      g.font = '400 40px system-ui, sans-serif';
      g.fillStyle = 'rgba(255,255,255,0.9)';
      wrap(g, e.idea, 48, 330, 920, 52, 3);
    }
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.fillRect(48, 500, 928, 6);
  });
}

function cardTexture(text: string) {
  return canvasTexture(128, 160, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 128, 160);
    g.strokeStyle = '#1e293b';
    g.lineWidth = 6;
    g.strokeRect(3, 3, 122, 154);
    const n = Number(text);
    g.fillStyle = Number.isFinite(n)
      ? n >= 8
        ? '#15803d'
        : n >= 5
          ? '#1d4ed8'
          : '#b91c1c'
      : '#475569';
    g.font = '900 96px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 64, 86);
  });
}

function labelTexture(name: string, org: string, ai: boolean) {
  return canvasTexture(320, 96, (g) => {
    g.fillStyle = ai ? 'rgba(15,23,42,0.85)' : 'rgba(109,40,217,0.92)';
    g.beginPath();
    g.roundRect(4, 4, 312, 88, 18);
    g.fill();
    g.fillStyle = '#ffffff';
    g.font = '700 34px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText(name.slice(0, 18), 160, 44);
    g.font = '400 22px system-ui, sans-serif';
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.fillText(org.slice(0, 26), 160, 76);
  });
}

function chequeTexture(amount: string, company: string) {
  return canvasTexture(512, 220, (g) => {
    g.fillStyle = '#f0fdf4';
    g.fillRect(0, 0, 512, 220);
    g.strokeStyle = '#15803d';
    g.lineWidth = 8;
    g.strokeRect(6, 6, 500, 208);
    g.fillStyle = '#14532d';
    g.font = '600 26px system-ui, sans-serif';
    g.fillText(`PAY ${company.toUpperCase().slice(0, 22)}`, 28, 60);
    g.font = '900 72px system-ui, sans-serif';
    g.fillText(amount, 28, 150);
  });
}

/** Confetti only: not part of the game, but kept off Math.random. */
let seed = 7;
const rnd = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

const CONFETTI = ['#f43f5e', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#fde047'];

export default function Competition3D(props: Competition3DProps): ReactElement | null {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef(props);
  useEffect(() => {
    live.current = props;
  });
  useEffect(() => {
    const canvas = canvasRef.current!;
    const parent = canvas.parentElement!;
    let stage: Stage;
    try {
      stage = new Stage(canvas, {
        target: new THREE.Vector3(0, 1.0, -0.6),
        span: 10.5,
        azimuth: 0.32,
        elevation: 0.42,
        minAzimuth: -0.9,
        maxAzimuth: 0.9,
        minElevation: 0.2,
        maxElevation: 1.1,
        background: '#0b1020',
        shadowSize: 9,
        shadowMap: 1024,
        maxFps: 30,
      });
    } catch {
      return;
    }
    const r = parent.getBoundingClientRect();
    stage.setSize(r.width, r.height);
    const ro = new ResizeObserver(() => {
      const b = parent.getBoundingClientRect();
      stage.setSize(b.width, b.height);
    });
    ro.observe(parent);
    stage.fitCenter = new THREE.Vector3(0, 1.0, -0.4);
    stage.fit = [-RW / 2, RW / 2].flatMap((x) =>
      [BACK + 0.3, RD / 2].map((z) => new THREE.Vector3(x * 0.62, 0, z)),
    );
    const P = live.current;
    const hall = buildVenue({ kind: 'eventhall', tint: '#7c3aed', slots: [], night: true });
    stage.scene.add(hall.root);
    for (const m of hall.screens) m.emissiveIntensity = 0.2;
    stage.hemi.intensity = 0.6;
    stage.sun.intensity = 0.7;
    const STAGE_Y = 0.45;

    // ---- The slide screen and the podium.
    let slideTex = slideTexture(
      P.title,
      P.pitchLabel(1, P.entries.length),
      P.entries[0] ?? null,
      null,
    );
    const slideMat = new THREE.MeshBasicMaterial({ map: slideTex, toneMapped: false });
    const slide = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.4), slideMat);
    slide.position.set(-0.4, 2.0, BACK + 0.5);
    stage.scene.add(slide);
    const k = new Kit();
    k.box(0.7, 1.05, 0.5, '#1f2937', 1.7, STAGE_Y, BACK + 1.25, { round: 0.04 });
    k.box(0.8, 0.06, 0.6, '#6d28d9', 1.7, STAGE_Y + 1.05, BACK + 1.25, { rx: -0.2 });
    k.box(0.5, 0.24, 0.02, '#fde68a', 1.7, STAGE_Y + 0.55, BACK + 1.51, {
      emissive: '#fbbf24',
      emissiveIntensity: 0.6,
    });
    k.cyl(0.015, 0.015, 0.4, '#111827', 1.55, STAGE_Y + 1.05, BACK + 1.1, { rx: 0.4 });
    // The judges' table, draped, in front of the stage.
    const nJ = Math.max(1, P.judges.length);
    const tableW = Math.min(7, 1.15 * nJ + 0.4);
    k.box(tableW, 0.75, 0.75, '#f8fafc', 0, 0, 0.55, { round: 0.03 });
    k.box(tableW + 0.02, 0.32, 0.77, '#6d28d9', 0, 0.42, 0.55);
    root(stage, k.build());
    // Trophy (shown when crowning).
    const tk = new Kit();
    tk.cyl(0.13, 0.08, 0.22, '#fbbf24', 0, 0.12, 0, { metal: 0.8, rough: 0.25, seg: 18 });
    tk.cyl(0.03, 0.05, 0.12, '#fbbf24', 0, 0, 0, { metal: 0.8, rough: 0.25 });
    tk.box(0.16, 0.04, 0.16, '#92400e', 0, -0.04, 0);
    const trophy = tk.build();
    trophy.visible = false;

    // ---- People: the founder pitching, judges, audience.
    const founders: Character[] = P.entries.map((e, i) => {
      const c = makeCharacter(e.founder, `founder:${e.id}:${i}`);
      c.root.visible = false;
      stage.scene.add(c.root);
      return c;
    });
    const judges = P.judges.map((j, i) => {
      const x = -tableW / 2 + 0.6 + i * ((tableW - 1.2) / Math.max(1, nJ - 1));
      const chair = buildModel('cinema-seats', { w: 0.6, d: 0.6, tier: 1, tint: '#1f2937' });
      chair.group.position.set(nJ === 1 ? 0 : x, 0, 1.25);
      chair.group.rotation.y = Math.PI;
      stage.scene.add(chair.group);
      const c = makeCharacter(j.look, `judge:${j.id}`);
      c.root.position.set(nJ === 1 ? 0 : x, 0, 1.2);
      c.root.rotation.y = Math.PI;
      stage.scene.add(c.root);
      const label = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: labelTexture(j.name, j.org, j.ai), depthTest: false }),
      );
      label.scale.set(1.0, 0.3, 1);
      label.position.set(nJ === 1 ? 0 : x, 0.98, 1.0);
      label.renderOrder = 6;
      stage.scene.add(label);
      const card = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: cardTexture('?'), depthTest: false }),
      );
      card.scale.set(0.42, 0.52, 1);
      card.visible = false;
      card.renderOrder = 7;
      stage.scene.add(card);
      return { c, card, label, text: '?', x: nJ === 1 ? 0 : x };
    });
    const audience = P.audience.map((look, n) => {
      const row = Math.floor(n / 7);
      const i = n % 7;
      const seat = buildModel('cinema-seats', { w: 0.6, d: 0.6, tier: 1, tint: '#334155' });
      const pos = new THREE.Vector3(-3.9 + i * 1.3 + (row % 2) * 0.3, 0, 2.15 + row * 0.95);
      seat.group.position.copy(pos);
      seat.group.rotation.y = Math.PI;
      stage.scene.add(seat.group);
      const c = makeCharacter(look, `crowd:${n}`);
      c.root.position.copy(pos);
      c.root.rotation.y = Math.PI;
      stage.scene.add(c.root);
      return c;
    });
    const spot = new THREE.SpotLight('#fff1c4', 34, 14, 0.42, 0.6, 1.2);
    spot.position.set(1.2, 6, 2);
    spot.target.position.set(1.2, 0, BACK + 1.2);
    stage.scene.add(spot, spot.target);
    let cheque: THREE.Mesh | null = null;
    const particles = new Particles();
    stage.scene.add(particles.group);
    let sent = false;
    stage.onFrame = () => {
      if (!sent) {
        sent = true;
        live.current.onReady();
      }
    };
    let shown = -1;
    let crowned = -1;
    const off = stage.add((t, dt) => {
      const L = live.current;
      const f = L.frame();
      const crowning = f.winner !== null;
      const idx = crowning ? f.winner! : Math.max(0, Math.min(L.entries.length - 1, f.entry));
      if (idx !== shown || (crowning ? 1 : 0) !== (crowned >= 0 ? 1 : 0)) {
        shown = idx;
        crowned = crowning ? idx : -1;
        slideTex.dispose();
        slideTex = slideTexture(
          L.title,
          L.pitchLabel(idx + 1, L.entries.length),
          L.entries[idx] ?? null,
          crowning ? L.winnerLabel : null,
        );
        slideMat.map = slideTex;
        slideMat.needsUpdate = true;
        if (cheque) {
          stage.scene.remove(cheque);
          cheque.geometry.dispose();
          cheque = null;
        }
        if (crowning && f.prize) {
          cheque = new THREE.Mesh(
            new THREE.PlaneGeometry(1.5, 0.64),
            new THREE.MeshBasicMaterial({
              map: chequeTexture(f.prize, L.entries[idx]?.company ?? ''),
              toneMapped: false,
            }),
          );
          cheque.position.set(0.3, STAGE_Y + 1.25, BACK + 1.45);
          stage.scene.add(cheque);
        }
      }
      founders.forEach((c, i) => {
        c.root.visible = i === idx;
        if (i !== idx) return;
        c.root.position.set(crowning ? 1.2 : 1.15, STAGE_Y, BACK + 1.35);
        c.root.rotation.y = crowning ? 0 : -0.25;
        pose(c, crowning ? 'cheer' : 'present', t);
        if (crowning) {
          if (trophy.parent !== c.handR) c.handR.add(trophy);
          trophy.visible = true;
        }
      });
      if (!crowning) trophy.visible = false;
      spot.target.position.set(crowning ? 1.2 : 1.4, 0, BACK + 1.3);
      spot.intensity = crowning ? 60 : 30;
      judges.forEach((j, i) => {
        const txt = f.cards[i] ?? null;
        const up = txt !== null && !crowning;
        pose(j.c, up ? 'cheer' : crowning ? 'clap' : 'sit', t, { seat: 0.45, phase: i });
        if (!up && !crowning) {
          j.c.body.position.y = 0.45 - 0.82 + 0.04;
        }
        if (up) {
          // One arm up holding the card.
          j.c.body.position.y = 0.45 - 0.82 + 0.04;
          j.c.thighL.rotation.x = j.c.thighR.rotation.x = -Math.PI / 2 + 0.08;
          j.c.shinL.rotation.x = j.c.shinR.rotation.x = Math.PI / 2 - 0.08;
          if (txt !== j.text) {
            j.text = txt;
            const m = j.card.material as THREE.SpriteMaterial;
            m.map?.dispose();
            m.map = cardTexture(txt);
            m.needsUpdate = true;
          }
        }
        j.card.visible = up;
        j.card.position.set(j.x, 1.75 + Math.sin(t * 3 + i) * 0.03, 1.15);
      });
      audience.forEach((c, n) =>
        pose(
          c,
          crowning || (f.cards.length > 0 && f.cards.every((x) => x !== null)) ? 'clap' : 'sit',
          t,
          {
            seat: 0.48,
            phase: n,
          },
        ),
      );
      audience.forEach((c) => {
        c.body.position.y = 0.48 - 0.82 + 0.04;
        c.thighL.rotation.x = c.thighR.rotation.x = -Math.PI / 2 + 0.08;
        c.shinL.rotation.x = c.shinR.rotation.x = Math.PI / 2 - 0.08;
      });
      if (crowning) {
        for (let i = 0; i < 4; i++)
          if (rnd() < dt * 18)
            particles.emit(new THREE.Vector3((rnd() - 0.5) * 7, 4.2, BACK + 1 + rnd() * 4), {
              vel: new THREE.Vector3((rnd() - 0.5) * 0.6, -1.4 - rnd(), 0),
              life: 3,
              size: 0.09,
              grow: 1,
              color: CONFETTI[Math.floor(rnd() * CONFETTI.length)]!,
              alpha: 1,
            });
        fx.sparkle(
          particles,
          new THREE.Vector3(1.2, STAGE_Y + 2.0, BACK + 1.35),
          dt,
          '#fde047',
          10,
        );
      }
      particles.update(dt);
      return true;
    });
    const offG = gestures(canvas, {
      tap: () => {},
      orbit: (dx, dy) => stage.orbit(dx, dy),
      zoom: (f) => stage.zoomBy(f),
    });
    return () => {
      off();
      offG();
      ro.disconnect();
      slideTex.dispose();
      disposeTree(stage.scene);
      stage.dispose();
    };
  }, []);
  return <canvas ref={canvasRef} className="room-3d" aria-hidden="true" data-competition-3d="" />;
}

function root(stage: Stage, g: THREE.Object3D) {
  stage.scene.add(g);
  return g;
}
