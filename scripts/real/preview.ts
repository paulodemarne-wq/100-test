// Preview of the realistic animals, rendered in a browser page (Playwright) to check them before the app.
// Build: npx esbuild scripts/real/preview.ts --bundle --format=iife --outfile=<dir>/real.js
import * as THREE from 'three';
import { addNatureLights, setupRenderer, shadowFloor } from '../../src/creatures/real/lights';
import { buildSnake, SnakeLook } from '../../src/creatures/real/snake';
import { buildQuadruped, QuadLook } from '../../src/creatures/real/quadruped';
import { buildBird, BirdLook } from '../../src/creatures/real/bird';
import { STAGE_NAMES, type Animal, type Stage } from '../../src/creatures/real/types';
import { buildNatureIsland } from '../../src/world/real/nature';
import { buildAnimal } from '../../src/creatures/real/index';
import { buildCreature } from '../../src/creatures/build';
import { REAL_SPECIES } from '../../src/creatures/real/catalog';

const SIZE = 330;
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setSize(SIZE, SIZE);
renderer.setPixelRatio(1);
setupRenderer(renderer);

const python: SnakeLook = {
  pattern: 'python',
  base: '#9A7A4A',
  dark: '#3B2A1A',
  light: '#D8C28E',
  belly: '#EDE3C8',
  iris: '#B8862E',
  majestic: { base: '#C99A3A', dark: '#2A1A0E', light: '#F2D58A', iris: '#E8B23A' },
  element: 'fire',
};

type Shot = { label: string; make: () => Animal; yaw?: number };
const wolf: QuadLook = {
  coat: 'wolf',
  base: '#8C8478',
  back: '#4A433C',
  belly: '#E8E1D4',
  accent: '#2E2925',
  iris: '#C9902E',
  majestic: { base: '#B9B7B4', back: '#5E6070', belly: '#F6F5F2', iris: '#8FD8FF' },
  element: 'ice',
  mane: 'majestic',
};
const eagle: BirdLook = {
  head: '#F4F1EA',
  body: '#3D2A1C',
  wing: '#35251A',
  tail: '#F2EEE6',
  chest: '#4A3322',
  chick: '#B9B2A8',
  beak: '#F2B21B',
  legs: '#E8B526',
  iris: '#F0D24A',
  majestic: { body: '#2A1A10', wing: '#24170E', chest: '#3A2416', iris: '#FFD84A', beak: '#FFC21A', head: '#FFFFFF' },
  element: 'lightning',
};
const ages = [0, 1, 2, 3, 4] as Stage[];
const AGE_NAMES = STAGE_NAMES.map((n, i) => (i === 4 ? `${n} (niveau max)` : n));
const which = (location.hash || '#snake,wolf').slice(1).split(',');
const shots: Shot[] = [
  ...(which.includes('snake') ? ages.map((age) => ({ label: `Python · ${AGE_NAMES[age]}`, make: () => buildSnake(python, age, 3) })) : []),
  ...(which.includes('wolf') ? ages.map((age) => ({ label: `Loup · ${AGE_NAMES[age]}`, make: () => buildQuadruped(wolf, age, 5) })) : []),
  ...(which.filter((w) => w.startsWith('cat')).flatMap((w) => {
    // #cat2:0-19 = every animal from 0 to 19 at stage 2.
    const [st, range] = w.slice(3).split(':');
    const [a, b] = (range ?? '0-39').split('-').map(Number);
    return REAL_SPECIES.filter((sp) => sp.id >= a && sp.id <= b).map((sp) => ({ label: `${sp.id} ${sp.name}`, make: () => buildAnimal(sp.id, Number(st) as Stage) }));
  })),
  ...(which.includes('acc')
    ? [
        [6, 20, { head: 'crown', neck: 'scarf' }],
        [0, 20, { head: 'cap', eyes: 'shades' }],
        [22, 20, { head: 'wizard', back: 'backpack' }],
        [16, 20, { head: 'beanie', eyes: 'glasses', neck: 'bowtie' }],
        [9, 30, { head: 'viking', back: 'cape' }],
      ].map(([sp, lv, eq]) => ({ label: `acc ${sp}`, make: () => {
        const c = buildCreature({ species: sp as number, level: lv as number, equipped: eq as Record<string, string> });
        return { group: c.group, height: 1, update: c.update, dispose: c.dispose };
      } }))
    : []),
  ...(which.includes('eagle') ? ages.map((age) => ({ label: `Aigle · ${AGE_NAMES[age]}`, make: () => buildBird(eagle, age, 8) })) : []),
];

function render(s: Shot): string {
  const scene = new THREE.Scene();
  addNatureLights(scene);
  const a = s.make();
  a.update(1.2);
  scene.add(a.group);
  scene.add(shadowFloor());
  const cam = new THREE.PerspectiveCamera(32, 1, 0.05, 50);
  cam.position.set(0, 1.5, 4.8);
  cam.lookAt(0, 0.7, 0);
  renderer.setClearColor('#E9EEF3', 1);
  renderer.render(scene, cam);
  const url = renderer.domElement.toDataURL('image/png');
  a.dispose();
  return url;
}

function renderIsland(): string {
  const W = 1674;
  const H = 1000;
  renderer.setSize(W, H);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#BFDDF2');
  scene.fog = new THREE.Fog('#BFDDF2', 16, 34);
  const sun = addNatureLights(scene, 9);
  sun.position.set(6, 10, 5);
  sun.shadow.mapSize.set(2048, 2048);
  const island = buildNatureIsland(8, 3);
  island.update(2);
  scene.add(island.group);
  const put = (a: Animal, x: number, z: number, s: number, ry: number) => {
    a.update(1);
    a.group.scale.multiplyScalar(s);
    a.group.position.set(x, island.height(x, z), z);
    a.group.rotation.y += ry;
    scene.add(a.group);
  };
  put(buildQuadruped(wolf, 2, 5), 0.6, 1.2, 0.9, 0.3);
  put(buildSnake(python, 2, 3), -1.4, 0.6, 0.7, 0.5);
  put(buildBird(eagle, 2, 8), 1.8, -1.0, 0.8, -0.2);
  put(buildQuadruped(wolf, 0, 6), -0.3, 1.8, 0.9, 1.2);
  const cam = new THREE.PerspectiveCamera(38, W / H, 0.1, 100);
  cam.position.set(7, 6.5, 9.5);
  cam.lookAt(0, 0, 0);
  renderer.render(scene, cam);
  const url = renderer.domElement.toDataURL('image/png');
  renderer.setSize(SIZE, SIZE);
  return url;
}

const wrap = document.createElement('div');
wrap.style.cssText = 'display:grid;grid-template-columns:repeat(5,330px);gap:6px;font:600 15px -apple-system,Helvetica,sans-serif;color:#333;padding:6px;background:#fff';
document.body.appendChild(wrap);
if (which.includes('island')) {
  const img = document.createElement('img');
  img.src = renderIsland();
  img.style.gridColumn = '1 / span 5';
  img.style.width = '1674px';
  wrap.appendChild(img);
}
for (const s of shots) {
  const cell = document.createElement('div');
  const img = document.createElement('img');
  img.src = render(s);
  img.width = SIZE;
  cell.appendChild(img);
  cell.appendChild(document.createElement('br'));
  cell.appendChild(document.createTextNode(s.label));
  wrap.appendChild(cell);
}
(window as unknown as { done: boolean }).done = true;
