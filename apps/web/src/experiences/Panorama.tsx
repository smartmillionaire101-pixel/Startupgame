import { useEffect, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { loadGeo, OSM_CREDIT, type GeoData } from '../city/geo';
import { panoramaLandmark } from '../city/three/landmarks';
import { citySun } from '../city/solar';
import { CITY_GEO } from '../city/coordinates';
import { disposeTree } from '../interiors3d/kit';
const LONDON = [
  {
    name: 'Palace of Westminster',
    lat: 51.4995,
    lon: -0.1248,
    height: 96,
    detail: 'The Houses of Parliament and Elizabeth Tower beside the Thames.',
  },
  {
    name: 'The Shard',
    lat: 51.5045,
    lon: -0.0865,
    height: 310,
    detail: 'Look east for the glass spire above London Bridge.',
  },
  {
    name: 'St Paul’s Cathedral',
    lat: 51.5138,
    lon: -0.0984,
    height: 111,
    detail: 'The cathedral dome rises above the City of London.',
  },
  {
    name: 'Tower Bridge',
    lat: 51.5055,
    lon: -0.0754,
    height: 65,
    detail: 'Two towers carry the high walkways over the river.',
  },
  {
    name: 'The Gherkin',
    lat: 51.5145,
    lon: -0.0803,
    height: 180,
    detail: 'The curved tower at 30 St Mary Axe.',
  },
  {
    name: 'Canary Wharf',
    lat: 51.5049,
    lon: -0.0195,
    height: 235,
    detail: 'The docklands skyline in the east.',
  },
];
const point = (data: GeoData, lat: number, lon: number) =>
  new THREE.Vector3(
    (lon - data.origin[0]) * 111320 * Math.cos((data.origin[1] * Math.PI) / 180),
    0,
    -(lat - data.origin[1]) * 111320,
  );
export default function Panorama({
  city,
  kind,
  holdingHands,
  onClose,
  children,
}: {
  city: string;
  kind: 'london-eye' | 'cable-car' | 'rooftop';
  holdingHands: boolean;
  onClose: () => void;
  children?: ReactNode;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const control = useRef({ yaw: 0, pitch: -0.12, zoom: 65, holdingHands });
  const [error, setError] = useState('');
  const [focus, setFocus] = useState('');
  const [paused, setPaused] = useState(false);
  const pauseRef = useRef(false);
  useEffect(() => {
    control.current.holdingHands = holdingHands;
    pauseRef.current = paused;
  }, [holdingHands, paused]);
  const target = useRef<(name: string) => void>(() => {});
  useEffect(() => {
    const node = mount.current!;
    let disposed = false;
    let renderer: THREE.WebGLRenderer | undefined;
    let frame = 0;
    let cleanup = () => {};
    void loadGeo(city)
      .then((data) => {
        if (disposed) return;
        if (!data) {
          setError('The city map is unavailable. Reconnect and open the view again.');
          return;
        }
        try {
          renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        } catch {
          setError(
            'This view needs WebGL. Enable 3D in Settings, or use a browser with hardware acceleration.',
          );
          return;
        }
        const render = renderer;
        render.setPixelRatio(Math.min(devicePixelRatio, 1.5));
        render.outputColorSpace = THREE.SRGBColorSpace;
        node.appendChild(render.domElement);
        const scene = new THREE.Scene();
        const sun = citySun(city);
        const night = sun.night;
        scene.background = new THREE.Color(night ? '#071327' : sun.dusk ? '#dd9d76' : '#8fc4df');
        scene.fog = new THREE.Fog(scene.background, 5500, 18000);
        const ambient = new THREE.HemisphereLight(
          night ? '#9fb8dc' : '#dbeffd',
          '#6c7057',
          night ? 1.6 : 2,
        );
        scene.add(ambient);
        const light = new THREE.DirectionalLight(
          sun.dusk ? '#ffc78a' : '#fff6e2',
          night ? 0.8 : 2.8,
        );
        light.position.set(
          Math.sin(sun.azimuth) * 1000,
          Math.max(100, Math.sin(sun.altitude) * 1500),
          -Math.cos(sun.azimuth) * 1000,
        );
        scene.add(light);
        const ground = new THREE.Mesh(
          new THREE.PlaneGeometry(40000, 40000),
          new THREE.MeshStandardMaterial({ color: night ? '#18242d' : '#b1ad95', roughness: 1 }),
        );
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -2;
        scene.add(ground);
        function polygon(points: number[], color: string, h: number) {
          if (points.length < 6) return;
          const shape = new THREE.Shape();
          shape.moveTo(points[0]!, points[1]!);
          for (let i = 2; i < points.length; i += 2) shape.lineTo(points[i]!, points[i + 1]!);
          const geo = new THREE.ShapeGeometry(shape);
          geo.rotateX(Math.PI / 2);
          const mesh = new THREE.Mesh(
            geo,
            new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.8 }),
          );
          mesh.position.y = h;
          scene.add(mesh);
        }
        data.water.forEach((p) => polygon(p, night ? '#103553' : '#36849a', -0.5));
        data.parks.forEach((p) => polygon(p, night ? '#193f2b' : '#668354', 0));
        const roadVertices: number[] = [];
        for (const roads of Object.values(data.roads))
          for (const road of roads) {
            for (let i = 2; i < road.l.length; i += 2)
              roadVertices.push(
                road.l[i - 2]!,
                0.2,
                road.l[i - 1]!,
                road.l[i]!,
                0.2,
                road.l[i + 1]!,
              );
          }
        const roadGeometry = new THREE.BufferGeometry();
        roadGeometry.setAttribute('position', new THREE.Float32BufferAttribute(roadVertices, 3));
        const roadMaterial = new THREE.LineBasicMaterial({
          color: night ? '#ba9564' : '#8a8175',
          transparent: true,
          opacity: night ? 0.65 : 0.5,
        });
        scene.add(new THREE.LineSegments(roadGeometry, roadMaterial));
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 128;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#222b34';
        ctx.fillRect(0, 0, 64, 128);
        for (let y = 4; y < 128; y += 12)
          for (let x = 5; x < 64; x += 12) {
            ctx.fillStyle = (x + y) % 5 === 0 ? '#313f4c' : '#ddbc78';
            ctx.fillRect(x, y, 5, 6);
          }
        const windows = new THREE.CanvasTexture(canvas);
        windows.colorSpace = THREE.SRGBColorSpace;
        const buildingMaterial = new THREE.MeshStandardMaterial({
          color: '#bfc5ce',
          roughness: 0.82,
          emissive: '#ffd395',
          emissiveMap: windows,
          emissiveIntensity: night ? 0.65 : 0,
        });
        const buildings = data.buildings.slice(0, 18000);
        const blocks = new THREE.InstancedMesh(
          new THREE.BoxGeometry(1, 1, 1),
          buildingMaterial,
          buildings.length,
        );
        const matrix = new THREE.Matrix4();
        buildings.forEach((b, i) => {
          const xs = b.p.filter((_, j) => j % 2 === 0),
            ys = b.p.filter((_, j) => j % 2 === 1);
          const minX = Math.min(...xs),
            maxX = Math.max(...xs),
            minZ = Math.min(...ys),
            maxZ = Math.max(...ys);
          const height = Math.max(8, (b.h ?? 4) * 3.25 + 0.8);
          matrix.compose(
            new THREE.Vector3((minX + maxX) / 2, height / 2, (minZ + maxZ) / 2),
            new THREE.Quaternion(),
            new THREE.Vector3(Math.max(4, maxX - minX), height, Math.max(4, maxZ - minZ)),
          );
          blocks.setMatrixAt(i, matrix);
          blocks.setColorAt(
            i,
            new THREE.Color().setHSL(0.08 + (i % 5) * 0.025, 0.1, 0.47 + (i % 5) * 0.05),
          );
        });
        scene.add(blocks);
        const points =
          city === 'london'
            ? LONDON.map((l) => ({ ...l, position: point(data, l.lat, l.lon) }))
            : data.landmarks.slice(0, 12).map((l) => ({
                name: l.n,
                height: 50,
                detail: `${l.n}, seen from above ${city}.`,
                position: new THREE.Vector3(l.x, 0, l.y),
              }));
        points.forEach((l, i) => {
          const kinds: Record<string, string> = {
            'The Shard': 'shard',
            'The Gherkin': 'gherkin',
            'Palace of Westminster': 'big-ben',
            'Tower Bridge': 'bascule',
          };
          const group = panoramaLandmark(kinds[l.name] ?? '', l.name) ?? new THREE.Group();
          const stone = new THREE.MeshStandardMaterial({
            color: i % 2 ? '#b8c6d2' : '#d8c7a5',
            roughness: 0.65,
            emissive: '#dfbb7c',
            emissiveIntensity: night ? 0.2 : 0,
          });
          const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0) => {
            const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stone);
            m.position.set(x, y + h / 2, z);
            group.add(m);
          };
          if (l.name === 'Palace of Westminster') {
            box(40, 30, 230, 0, 0, 90);
            for (let z = -15; z < 205; z += 22) {
              box(46, 5, 4, 0, 30, z);
              box(4, 42, 4, -23, 0, z);
              box(4, 42, 4, 23, 0, z);
            }
            group.rotation.y = 0.15;
          } else if (l.name.includes('Cathedral')) {
            box(60, 35, 140);
            const drum = new THREE.Mesh(new THREE.CylinderGeometry(24, 24, 35, 24), stone);
            drum.position.y = 52;
            group.add(drum);
            const dome = new THREE.Mesh(
              new THREE.SphereGeometry(25, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
              stone,
            );
            dome.position.y = 70;
            group.add(dome);
            box(3, 16, 3, 0, 95);
          } else if (!group.children.length) {
            box(40, l.height, 40);
            box(65, l.height * 0.65, 40, 50);
            box(35, l.height * 0.8, 35, -45);
          }
          group.position.copy(l.position);
          group.traverse((o) => {
            if (o instanceof THREE.Mesh) {
              const materials = Array.isArray(o.material) ? o.material : [o.material];
              for (const m of materials)
                if (m instanceof THREE.MeshStandardMaterial) {
                  m.emissive.set('#bfae8e');
                  m.emissiveIntensity = night ? 0.2 : 0;
                }
            }
          });
          scene.add(group);
        });
        const origin =
          city === 'london' && kind === 'london-eye'
            ? point(data, 51.5033, -0.1196)
            : new THREE.Vector3(
                (data.core[0] + data.core[2]) / 2,
                0,
                (data.core[1] + data.core[3]) / 2,
              );
        const cabin = new THREE.Group();
        scene.add(cabin);
        const floor = new THREE.Mesh(
          new THREE.CylinderGeometry(4.5, 4.5, 0.15, 32),
          new THREE.MeshStandardMaterial({ color: '#263840' }),
        );
        cabin.add(floor);
        const rail = new THREE.Mesh(
          new THREE.TorusGeometry(4.5, 0.05, 6, 64),
          new THREE.MeshStandardMaterial({ color: '#e1e8e7', metalness: 0.6, roughness: 0.3 }),
        );
        rail.rotation.x = Math.PI / 2;
        rail.position.y = 1.1;
        cabin.add(rail);
        for (let i = 0; i < 6; i++) {
          const post = new THREE.Mesh(
            new THREE.CylinderGeometry(0.06, 0.06, 3, 8),
            new THREE.MeshStandardMaterial({ color: '#d5dcd9' }),
          );
          post.position.set(
            Math.sin((i * Math.PI) / 3) * 4.5,
            1.5,
            Math.cos((i * Math.PI) / 3) * 4.5,
          );
          cabin.add(post);
        }
        const couple = new THREE.Group();
        couple.position.set(0, 0.1, -2.8);
        cabin.add(couple);
        for (let i = 0; i < 2; i++) {
          const body = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.22, 0.55, 4, 8),
            new THREE.MeshStandardMaterial({ color: i ? '#c98680' : '#4d806b' }),
          );
          body.position.set(i ? 0.42 : -0.42, 0.85, 0);
          couple.add(body);
          const head = new THREE.Mesh(
            new THREE.SphereGeometry(0.2, 12, 8),
            new THREE.MeshStandardMaterial({ color: i ? '#b97d53' : '#81583e' }),
          );
          head.position.set(i ? 0.42 : -0.42, 1.48, 0);
          couple.add(head);
        }
        const hands = new THREE.Mesh(
          new THREE.CylinderGeometry(0.065, 0.065, 0.6, 8),
          new THREE.MeshStandardMaterial({ color: '#b8896b' }),
        );
        hands.rotation.z = Math.PI / 2;
        hands.position.y = 0.8;
        couple.add(hands);
        const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 30000);
        const size = () => {
          const r = node.getBoundingClientRect();
          render.setSize(r.width, r.height);
          camera.aspect = r.width / r.height;
          camera.updateProjectionMatrix();
        };
        const observer = new ResizeObserver(size);
        observer.observe(node);
        size();
        let drag: { x: number; y: number } | null = null;
        const down = (e: PointerEvent) => {
          drag = { x: e.clientX, y: e.clientY };
          render.domElement.setPointerCapture(e.pointerId);
        };
        const move = (e: PointerEvent) => {
          if (!drag) return;
          control.current.yaw -= (e.clientX - drag.x) * 0.004;
          control.current.pitch = Math.max(
            -1.1,
            Math.min(0.8, control.current.pitch + (e.clientY - drag.y) * 0.003),
          );
          drag = { x: e.clientX, y: e.clientY };
        };
        const up = () => {
          drag = null;
        };
        render.domElement.addEventListener('pointerdown', down);
        render.domElement.addEventListener('pointermove', move);
        render.domElement.addEventListener('pointerup', up);
        render.domElement.style.touchAction = 'none';
        target.current = (name) => {
          const l = points.find((p) => p.name === name);
          if (l) {
            control.current.yaw = Math.atan2(
              l.position.x - camera.position.x,
              -(l.position.z - camera.position.z),
            );
            control.current.pitch = Math.atan2(
              l.height / 2 - camera.position.y,
              l.position.distanceTo(camera.position),
            );
            setFocus(`${l.name} · ${l.detail}`);
          }
        };
        let elapsed = 0,
          last = performance.now(),
          lastLight = last;
        const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
        const draw = (t: number) => {
          if (disposed) return;
          const dt = Math.min(0.05, (t - last) / 1000);
          last = t;
          if (!pauseRef.current && !document.hidden && !reduced) elapsed += dt;
          cabin.position.copy(origin);
          cabin.position.y =
            kind === 'london-eye'
              ? 85 + 45 * Math.sin(elapsed * 0.014)
              : kind === 'cable-car'
                ? 90 + 15 * Math.sin(elapsed * 0.015)
                : 150;
          if (kind === 'cable-car') cabin.position.x += Math.sin(elapsed * 0.01) * 1000;
          camera.position.copy(cabin.position).add(new THREE.Vector3(0, 1.8, 1));
          const c = control.current;
          camera.lookAt(
            camera.position.x + Math.sin(c.yaw) * Math.cos(c.pitch) * 100,
            camera.position.y + Math.sin(c.pitch) * 100,
            camera.position.z - Math.cos(c.yaw) * Math.cos(c.pitch) * 100,
          );
          camera.fov = c.zoom;
          camera.updateProjectionMatrix();
          hands.visible = c.holdingHands;
          if (t - lastLight > 30_000) {
            lastLight = t;
            const sun = citySun(city);
            scene.background = new THREE.Color(
              sun.night ? '#071327' : sun.dusk ? '#dd9d76' : '#8fc4df',
            );
            if (scene.fog) scene.fog.color.copy(scene.background);
            light.intensity = sun.night ? 0.8 : 2.8;
            ambient.intensity = sun.night ? 1.6 : 2;
            buildingMaterial.emissiveIntensity = sun.night ? 0.65 : 0;
            roadMaterial.color.set(sun.night ? '#ba9564' : '#8a8175');
            light.position.set(
              Math.sin(sun.azimuth) * 1000,
              Math.max(100, Math.sin(sun.altitude) * 1500),
              -Math.cos(sun.azimuth) * 1000,
            );
          }
          if (!document.hidden) render.render(scene, camera);
          frame = requestAnimationFrame(draw);
        };
        frame = requestAnimationFrame(draw);
        cleanup = () => {
          observer.disconnect();
          render.domElement.removeEventListener('pointerdown', down);
          render.domElement.removeEventListener('pointermove', move);
          render.domElement.removeEventListener('pointerup', up);
          windows.dispose();
          disposeTree(scene);
          render.dispose();
          render.domElement.remove();
        };
      })
      .catch(() => {
        if (!disposed) setError('Unable to load the skyline. Please try again.');
      });
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      cleanup();
    };
  }, [city, kind]);
  const landmarks = city === 'london' ? LONDON : [];
  const sun = citySun(city);
  const time = (at: number) =>
    new Intl.DateTimeFormat('en-GB', {
      timeZone: CITY_GEO[city]?.tz,
      hour: '2-digit',
      minute: '2-digit',
    }).format(at);
  return (
    <section className="panorama" role="dialog" aria-modal="true" aria-label="City panorama">
      <div className="panorama-canvas" ref={mount} />
      <header>
        <div>
          <small>TAKE IT ALL IN</small>
          <h2>
            {kind === 'london-eye'
              ? 'Above London, together.'
              : kind === 'cable-car'
                ? 'A city beneath your feet.'
                : 'The skyline is yours.'}
          </h2>
          <p>
            {city} · Sunrise {time(sun.sunrise)} · Sunset {time(sun.sunset)}
          </p>
        </div>
        <button onClick={onClose} aria-label="Close panorama">
          ×
        </button>
      </header>
      {error && (
        <p className="panorama-error" role="alert">
          {error}
        </p>
      )}
      <footer>
        {children}
        <p>{focus || 'Drag to look around. Pick a landmark to find it on the skyline.'}</p>
        <div>
          {landmarks.map((l) => (
            <button key={l.name} onClick={() => target.current(l.name)}>
              {l.name}
            </button>
          ))}
        </div>
        <div className="panorama-controls">
          <button
            onClick={() => {
              control.current.yaw -= 0.3;
            }}
          >
            Look left
          </button>
          <button
            onClick={() => {
              control.current.yaw += 0.3;
            }}
          >
            Look right
          </button>
          <button
            onClick={() => {
              control.current.zoom = Math.max(30, control.current.zoom - 10);
            }}
          >
            Zoom in
          </button>
          <button
            onClick={() => {
              control.current.zoom = Math.min(90, control.current.zoom + 10);
            }}
          >
            Zoom out
          </button>
          <button onClick={() => setPaused(!paused)}>
            {paused ? 'Resume ride' : 'Pause ride'}
          </button>
        </div>
        <small>
          {OSM_CREDIT} · Stylised city model · {holdingHands ? 'Holding hands ♥' : 'Enjoy the view'}
        </small>
      </footer>
    </section>
  );
}
